#!/usr/bin/env node
/* 建立一間學校的第一位管理者（只跑一次，手動執行；不會部署成 Function）。
   需要有權限的服務帳號憑證：
     set GOOGLE_APPLICATION_CREDENTIALS=C:\路徑\service-account.json   （PowerShell：$env:GOOGLE_APPLICATION_CREDENTIALS="..."）
     node functions/scripts/bootstrap-admin.js --sid banqiao --email leader@gmail.com --name "新北市立板橋國中" [--teacher-id r1] [--project special-exam-rooms]
   這個人要先用 Google 登入過新版一次（Auth 裡才有帳號）。
   會做的事：建立 schools/{sid}（若沒有）、寫 members/{uid}、設 custom claims {sid, role:'admin', teacherId?}、寫一筆 auditLogs。
   已經有管理者時會停下來，除非加 --force。 */
'use strict';
const admin = require('firebase-admin');

function args() {
  const o = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[k] = v;
  }
  return o;
}

async function main() {
  const o = args();
  const sid = String(o.sid || '').trim();
  const email = String(o.email || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(sid) || !email.includes('@')) {
    console.error('用法：node bootstrap-admin.js --sid <學校代碼，英數> --email <管理者 Gmail> [--name 學校名稱] [--teacher-id 名冊老師id] [--project 專案] [--force]');
    process.exit(2);
  }
  admin.initializeApp(o.project ? { projectId: String(o.project) } : undefined);
  const db = admin.firestore();

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error('找不到 ' + email + ' 的帳號：請這個人先用 Google 登入新版一次，再重跑。');
    process.exit(1);
  }

  const members = db.collection(`schools/${sid}/members`);
  const admins = await members.where('role', '==', 'admin').where('active', '==', true).get();
  if (!admins.empty && !o.force) {
    console.error(`schools/${sid} 已經有 ${admins.size} 位管理者，不需要 bootstrap。要強制加入請加 --force。`);
    process.exit(1);
  }

  const school = db.doc(`schools/${sid}`);
  if (!(await school.get()).exists) await school.set({ name: String(o.name || sid), createdAt: admin.firestore.FieldValue.serverTimestamp() });

  const claims = { sid, role: 'admin' };
  if (o['teacher-id']) claims.teacherId = String(o['teacher-id']);
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await members.doc(user.uid).set(
    {
      email,
      role: 'admin',
      teacherId: claims.teacherId || null,
      active: true,
      updatedBy: 'bootstrap',
      claimsAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection('auditLogs').add({
    sid,
    by: 'bootstrap-admin.js',
    action: 'bootstrapAdmin',
    target: email,
    detail: { teacherId: claims.teacherId || null, force: !!o.force },
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`完成：${email} 是 schools/${sid} 的管理者。請他登出再登入（或重新整理）讓新權限生效。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
