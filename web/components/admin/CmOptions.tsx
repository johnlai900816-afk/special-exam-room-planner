/* 個管老師的下拉選項：資源班老師在前面，其他收在「其他」（舊 cmOpts） */
import { cmChoices } from "@/lib/nx/admin";

export function CmOptions({ D, none = "（未指定）" }: { D: Parameters<typeof cmChoices>[0]; none?: string }) {
  const { main, other } = cmChoices(D);
  return (
    <>
      <option value="">{none}</option>
      {main.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
      {other.length > 0 && (
        <optgroup label="其他">
          {other.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
