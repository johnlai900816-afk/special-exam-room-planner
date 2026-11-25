# Gemini 與 AI 代理

這份文件說明資源班管理系統怎麼接 Google Gemini：前端有哪些檔案、伺服器代理的介面規格、怎麼部署。

## 檔案

| 檔案 | 內容 |
|---|---|
| `gemini.js` | 連線（不碰畫面）。兩種連線方式：`proxy`（學校的 AI 服務，建議）、`browser`（自己的金鑰，個人試用）。模型清單、錯誤訊息、使用紀錄。 |
| `ai.js` | 題目、回覆格式與檢查（不連網）。去識別化、AI 排法的裁判、文字調整、說明問題、看圖核對課表。 |
| `app.js` 最後的 Gemini 區塊 | 畫面。AI 的文字只用 `textContent` 放進畫面。 |
| `tt.js` | 讀全校課表（設定 › 學校資料 › 全校課表）。每頁轉成約 1600px 的 JPEG，一頁一次請求（用途 `ttgrid`，`responseSchema` 限定格式），同時兩頁、失敗等一下再試。要勾選「可以送出老師姓名」才送；每次開網頁第一次送出前先給老師看內容。檢查與存檔在 core.js 最後的「全校課表：整張格子」區塊。 |
| `functions/ai.js` | Cloud Functions：`aiGenerate`、`aiListModels`（asia-east1，Vertex AI）。 |
| `test-gemini.js`、`test-tt.js`、`functions/test-ai.js` | 用假的 fetch、Firestore、Vertex 測試，不需要金鑰：`node test-gemini.js`、`node functions/test-ai.js`。 |

## 原則

- 本機的排課程式是裁判。AI 的排法只是候選，會用 `evaluate` 和 `assignLocks` 檢查。衝突沒有變多，而且比現在好（待安排的學生變少、衝突變少，或分數變好），才讓老師套用。不然就說明為什麼不採用。
- 送出前先去識別化。學生姓名一律換成 S 代號。老師姓名預設換成 T 代號，老師在「AI 設定」勾選後才送出。伺服器會再換一次。
- 每一種功能第一次送出前，先給老師看完整內容。
- 每次呼叫都記在這台瀏覽器的使用紀錄（`rc-gemini-log`），包括送出的內容、回覆、最後套用了什麼。套用前會自動保留一份快照，紀錄裡可以按「回到這次之前」。
- 金鑰、模型和使用紀錄只放在 localStorage 的 `rc-gemini-*`。不寫進名冊資料，不跟著雲端同步、備份檔或程式碼出去。

## 代理的介面規格

前端預設的網址是 `https://asia-east1-<Firebase 專案>.cloudfunctions.net`，可以在 `school.js` 用 `window.GEMINI_PROXY_URL` 改掉。

所有請求都用 `POST`，並帶上這兩個標頭：

```
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

### `POST {base}/aiListModels`

請求：`{"refresh": false}`。`refresh: true` 會略過伺服器快取。

回覆：

```json
{"models":[{"name":"models/gemini-3-flash","displayName":"Gemini 3 Flash","description":"","inputTokenLimit":0,"outputTokenLimit":0,"supportedGenerationMethods":["generateContent"]}],"cachedAt":1760000000000}
```

格式和 Gemini API 的 `models.list` 一樣，前端用同一套過濾和排序。伺服器把清單快取一天，放在記憶體和 Firestore 的 `aiCache/models`。

### `POST {base}/aiGenerate`

請求：

```json
{"model":"gemini-3-flash","purpose":"sched|adj|explain|tt|ttgrid","allowTeacherNames":false,
 "request":{"contents":[{"role":"user","parts":[{"text":"…"},{"inlineData":{"mimeType":"image/jpeg","data":"…"}}]}],
            "systemInstruction":{"parts":[{"text":"…"}]},
            "generationConfig":{"responseMimeType":"application/json","responseSchema":{},"temperature":0.2}}}
```

`request` 就是 Gemini `generateContent` 的 request body。

回覆格式也和 `generateContent` 一樣：`{"candidates":[…],"promptFeedback":…,"usageMetadata":{…},"modelVersion":"…"}`。

錯誤時回 HTTP 狀態碼，body 是 `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"…","details":[…]}}`：

- 401：沒登入、登入過期，或信箱沒有驗證。
- 403：不在共用名單、是檢視權限，或請求來自別的網站。
- 400：模型名稱或 request 不對、模型不在白名單，或資料太大。
- 429：超過使用次數。`details` 會附上 `google.rpc.RetryInfo.retryDelay`（例如 `"37s"`）。每日上限另外附 `QuotaFailure`，其中 `quotaId` 含 `PerDay`。
- 404：找不到這個模型。
- 503：Vertex 出錯。不會洩漏內部訊息。

### 伺服器端依序做的事

1. CORS：只接受 `AI_ALLOWED_ORIGINS` 裡的網站。
2. 驗證 Firebase ID token（`email_verified` 必須是 true）。
3. 讀取 `config/access`：信箱要在 `emails` 裡。`viewers`（檢視權限）預設不能用。規則和 `firestore.rules` 的 member／editor 相同。
4. 檢查使用次數：每人每分鐘 `AI_PER_MINUTE` 次、每天 `AI_PER_DAY` 次。計數器放在 Firestore 的 `aiRate/{uid}`，用交易更新。
5. 去識別化，這是第二道防線：從 `rc/main` 讀名冊，把文字部分的學生姓名換成 S 代號。`allowTeacherNames` 是 false 時，老師姓名和「王老師」這類只有一位同姓老師的叫法也會換掉。圖片不會更動。
6. 模型白名單：只接受 Vertex 自動查到的清單裡 flash、flash-lite、pro 三個系列（`gemini-版本-flash…`，不含圖片、語音、即時等特殊模型），或 `AI_ALLOWED_MODELS` 另外列的。`generationConfig` 只轉送 `temperature`、`topP`、`topK`、`maxOutputTokens`、`responseMimeType`、`responseSchema`，`candidateCount` 固定 1；`tools`、`safetySettings` 等其他欄位一律丟掉。
7. 用 Functions 的服務帳號，經 `@google/genai`（Vertex 模式）呼叫 Gemini。
8. 寫一筆 `auditLogs`：uid、email、角色、時間、用途、模型、token 數、換掉的姓名數、成功或錯誤碼，以及題目的 SHA-256。只記雜湊，不記題目內容。這些紀錄只有主持人讀得到，網頁不能寫入（見 `firestore.rules`）。

### 環境變數（都有預設值，可以放在 `functions/.env`）

| 變數 | 預設 | 用途 |
|---|---|---|
| `AI_ALLOWED_ORIGINS` | `https://johnlai900816-afk.github.io,http://localhost:5000,…` | 允許呼叫的網站，用逗號分隔 |
| `AI_VERTEX_LOCATION` | `global` | Vertex 的位置；新模型多半先出現在 global |
| `AI_PER_MINUTE` / `AI_PER_DAY` | `10` / `200` | 每人的使用次數上限 |
| `AI_SERVER_DEID` | `true` | 伺服器端是否再去識別化一次 |
| `AI_ALLOW_VIEWERS` | `false` | 檢視權限能不能用 |
| `AI_MODELS` | （空） | Vertex 列不出模型時的備用清單，例如 `gemini-2.5-flash,gemini-2.5-pro`（一樣要符合白名單） |
| `AI_ALLOWED_MODELS` | （空） | 白名單以外另外開放的模型，用逗號分隔 |

## 部署（還沒有部署；以下由管理者執行）

1. Firebase 專案（`.firebaserc` 裡的 `special-exam-rooms`）要使用 Blaze 方案。
2. 在 Google Cloud Console 啟用 API：
   ```
   gcloud services enable aiplatform.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project special-exam-rooms
   ```
3. 給 Functions 的服務帳號 Vertex AI 權限。v2 函式預設用 Compute Engine 預設服務帳號 `<專案編號>-compute@developer.gserviceaccount.com`：
   ```
   gcloud projects add-iam-policy-binding special-exam-rooms --member="serviceAccount:624322262257-compute@developer.gserviceaccount.com" --role="roles/aiplatform.user"
   ```
   這個帳號本來就能讀寫 Firestore、驗證 Firebase token；如果改用專用的服務帳號，還要再給它 `roles/datastore.user`。
4. 安裝套件並部署：
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   firebase deploy --only firestore:rules
   ```
5. 部署完，用登入雲端的帳號打開網站，到側邊欄「AI 設定」，選「學校的 AI 服務」，按「測試連線」。

本機測試：`node functions/test-ai.js` 不需要安裝套件。若要用模擬器，執行 `firebase emulators:start --only functions,firestore`，用完一定要按 Ctrl+C 關掉。
