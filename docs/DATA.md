# 資料、計息與權限設計

## 私人帳目 `loans/{id}`

v2 欄位：`schemaVersion: 2`、`id`、`name`、`annualRate`（小數年利率）、`status`（active / closed）、`version`（交易遞增整數）、`deletedAt`（ISO 時間或 null）、`shareToken`（48 字元隨機十六進位字串或 null）、`events`。

每筆 event 含 `id`、`date`（YYYY-MM-DD）、`type`（borrow / repay / interest / waive / checkpoint）、`amountCents`（整數分）、`order`（同日排序的唯一整數）、`note`（私人備註）。金額輸入最多兩位小數，年利率輸入最多四位百分點小數；每筆帳目最多 1500 個事件，完整 JSON 最多 850 KB，避免超出 Firestore 單文件限制。借出或還本後未還本金上限為 NT$10 億。

同一日期依 order 排列，跨日期依日期排列。新增事件分配最大 order + 1；編輯保留 order。更新採 `runTransaction`，比較實際版本與使用者開啟表單時版本，拒絕覆蓋過期資料。私人帳目與分享投影在同一交易更新／刪除，避免分享頁殘留舊金額。

## 計息

上一事件日期到本次事件日期的天數 × 上期本金 × 年利率 ÷ 365。先結算區間，再執行當日異動；還本金當日不再以償還前本金新增一天利息。時區以日期字串及 UTC 日界計算天數，預設今天採使用者裝置的本地日期，避免夏令時間造成一天誤差。

本金以整數分儲存；計息以 BigInt 分子及固定分母 365,000,000 累加，保留完整分段精度；顯示或收取時才四捨五入到分。利息不併入本金。零元 checkpoint 是舊版查詢紀錄，不改變本金或累計利息。

收取／免收不能超過該事件當天的未收利息。修改歷史後，若造成某次本金或利息超收，拒絕儲存並要求先調整相關紀錄。本金為零時不增加新利息；之後再次借出，才對新增本金繼續計息。結清要求本金、未收利息皆為零，結清後先重新開啟才能編輯。

查詢日期之前的事件才納入計算；未來試算假設沒有其他新增異動。實際新增或修改的事件日期不能在未來；舊資料若已有未來事件則保留，編輯該事件時必須改成有效日期。

## 分享 `shares/{token}`

token 使用 `crypto.getRandomValues` 產生 192 位元亂數；放在網址 hash 中，網頁設定 no-referrer。伺服器僅允許匿名直接讀取已知且 active 的單筆投影，禁止列出集合，也禁止非管理者寫入。投影只含名稱、利率、狀態、版本與清除 note 後的事件，不含私人帳目 ID 或其他帳目資料。

分享頁不需要 Google 登入，透過一次 getDoc 讀取，使用者可按「重新整理資料」更新。停用連結會刪除投影；之後再次讀取會被拒絕。無法撤回已讀取、截圖、下載或瀏覽器記憶體中的內容。重新整理時若讀取失敗，不顯示舊內容。

Firebase web API key 與專案設定本身是公開用的設定，保護依賴伺服器端 Firestore 規則。管理者 UID 公開不等於能冒用登入，仍需由 Firebase 驗證登入 token。

## 備份與遷移

JSON 格式為 `{format:'loan-ledger-backup', schemaVersion:2, exportedAt, loans:[...]}`。完整備份包括回收區與私人備註；備份屬敏感檔案，請自行妥善保存。還原驗證整份檔案後才允許寫入，重複 ID 預設略過；覆蓋需再次勾選並先下載現況備份。還原一律清除分享 token，舊連結不會恢復。

還原與舊版升級逐筆交易執行，不宣稱多帳目全有全無。中斷時已成功部分保留，剩餘可重試；交易版本避免覆蓋別處新資料。舊格式先核對至最後紀錄日期的本金、利息差異，再由管理者確認並備份後轉換，不在讀取時自動覆寫。CSV 使用 UTF-8 BOM、標準引號轉義並處理試算表公式前綴，不包含私人備註。

## 規則驗證範圍

安全規則為原型，已以模擬器驗證權限、版本、必要欄位、型別、大小及分享存取。Firestore 規則無法迴圈驗證長度任意的事件陣列，因此伺服器限制整體筆數並驗證首尾事件；完整歷史與所有私人備註的清除由僅管理者可寫入的應用程式逐筆驗證。若未來增加其他編輯者，需先改為逐筆文件或加入可信任後端驗證，不能直接放寬規則。正式公開分享前應再次審閱。

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for a single fixed administrator, with private collections denied to other users and bearer-link projections limited to single-document reads. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
