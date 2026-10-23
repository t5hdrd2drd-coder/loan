# 發布到原本的 GitHub Pages

原網址保留： https://t5hdrd2drd-coder.github.io/loan/

## 目前交付狀態

程式可本地預覽與建置。`src/config.js` 的 OWNER_UID 留空，`firestore.rules` 的管理者 UID 為佔位值，正式發布檢查會刻意失敗，避免未設定權限就上線。新版準備於 codex/loan-ledger-v2 分支與草稿 PR 供審閱；GitHub 專案授權已確認生效。Firebase 管理權限與管理者 UID 尚未提供，未修改正式網站與雲端帳目。

## GitHub 連線授權

如由助理協助推送，請先到 GitHub → Settings → Applications → Installed GitHub Apps，找到這個 ChatGPT／Codex GitHub 連線，將 `t5hdrd2drd-coder/loan` 加入 Repository access。若組織或帳戶政策要求批准，需由管理者完成。也可以由你自行使用 Git 推送本地分支。無須提供私人 access token。

## 1. 先預覽並啟用 Google 登入

1. 本機使用 Node.js 22.12+（或 24）與 npm，執行 `npm ci`、`npm run dev`。
2. 開啟顯示的 localhost 網址。按「先體驗示範帳本」可安全體驗，重新整理後示範修改會消失。
3. 到 Firebase 專案 `my-loans-c739b` → Authentication → Sign-in method，啟用 Google，選擇支援電子郵件。
4. Authentication → Settings → Authorized domains，加入 `localhost` 與 `t5hdrd2drd-coder.github.io`（只填網域，不加 /loan）。
5. 在本機新版按「使用 Google 登入」。目前沒有管理者設定，登入後會顯示「尚未取得管理權限」與你的 Firebase UID；也可到 Firebase Authentication → Users 查 UID。
6. 將 UID 填入 `src/config.js` 的 OWNER_UID，並替換 `firestore.rules` 的 `REPLACE_WITH_OWNER_UID`。兩處必須一致，無需把密碼或登入 token 放進程式。

登入使用 browserLocalPersistence，通常關閉分頁或重開手機仍保留；無痕、清除資料、主動登出或 Google 安全要求會需要重新登入。

## 2. 在本機先下載原始帳目備份

以管理者登入本機新版。若現有 Firestore 規則允許這個帳號讀取，就能看到原有帳目；點「備份與還原 → 下載完整 JSON 備份」。務必確認檔案確實已保存。

如果現有規則不允許讀取，先在 Firebase Firestore → Rules 編輯器中，僅將 `/loans/{loanId}` 設為上述 OWNER_UID 可讀寫，移除任何公開讀寫規則。不要為了匯出而把整個資料庫開放。之後登入本機新版下載備份。這會讓舊版未登入網站暫時無法載入，是權限切換期間的預期狀態。

可先在本機新版點「核對舊資料」，查看每筆差異；確認後才「備份並升級」。有格式問題的帳目不自動改寫，保留原始資料供修正。

## 3. 發布 Firebase 安全規則

本機執行：

```bash
npx firebase login
npm run check:deploy
npx firebase deploy --only firestore:rules --project my-loans-c739b
```

必須使用有此專案管理權限的 Google 帳號。不要分享登入 token 或密碼。也可以將 firestore.rules 全文貼到 Firebase Firestore Rules 編輯器發布。

規則發布後：未登入者與非指定帳號不能讀寫私人帳本；借款人僅能讀取已知的有效分享連結。舊站因沒有登入功能將無法讀取，請接著發布新版。

## 4. 發布 GitHub Pages

本版本需經 Vite 建置，不能沿用「直接發布原始 main/index.html」的方式。

1. 將本專案推送到原本 `t5hdrd2drd-coder/loan` 的 main 分支前，先到 GitHub → Settings → Pages → Build and deployment → Source，改成 **GitHub Actions**。避免把未建置的原始頁面直接發布。
2. 將完整程式（含 package-lock.json、.github/workflows/pages.yml）提交到該專案。
3. Actions → Publish loan ledger → 確認 build、deploy 都成功；必要時手動 Run workflow。
4. 開啟原網址並重新整理。若舊頁面被瀏覽器快取，強制重新載入一次。

工作流程會執行 npm ci、核心測試、管理者設定檢查及 Vite build，最後發布 dist/。設定不完整會停止部署，不會發布半設定的版本。

## 5. 上線驗收

- 你的 Google 帳號可看完整帳本，其他帳號不行。
- 登出後只看到登入頁，無法讀寫私帳。
- 新增一筆測試借貸，借出／還本金預覽正確，再移至回收區並還原。
- 核對原始本金及利息；升級前的差異須已確認。
- 產生分享連結，以無痕開啟，只能看到單筆明細，沒有私人備註或編輯按鈕。
- 停用分享後，無痕重新整理應無法讀取；重新產生後舊連結同樣失效。
- 手機開啟、JSON 備份及 CSV 下載正常。
- Firebase 控制台查看用量與錯誤；第一版不增加第三方追蹤。

## 回復方式

網站有問題時，可在 GitHub 還原至先前的新版部署或修正後重發。不要為了讓舊版 HTML 能讀資料而恢復公開資料庫規則。

若已升級資料，舊版 HTML 不相容 v2；不要只回復舊 HTML。以升級前 JSON 備份保留資料，使用新版還原功能或在完整核對後由專案管理者還原舊資料。回復前再次下載當前備份，避免丟失上線後新增紀錄。
