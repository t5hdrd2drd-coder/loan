# 禾帳 · 借貸記帳本 v2

延續原本的 GitHub Pages + Firebase Firestore，使用 Vite 建置的靜態網頁。以繁體中文和手機操作為主，沒有付費後端或額外主機。

## 快速預覽

```bash
npm ci
npm run dev
```

開啟終端顯示的網址，按「先體驗示範帳本」，或在網址後加入 `?demo=1`。示範模式的資料只存在當次頁面記憶體，不連接正式 Firestore，也不會保存或真的建立分享連結。

另可執行 `npm run preview:file` 產生可直接用瀏覽器開啟的 `artifacts/禾帳-互動示範.html`，僅含虛構資料。

正式帳本預設鎖定；請先完成 [部署步驟](docs/DEPLOY.md)。不要直接將原始 index.html 上傳取代舊站：本版需建置，發布的是 `dist/`。

## 功能

- 借出／還本金分開選，輸入正數；儲存前預覽本金與利息。
- 實際天數／365 單利、每日自動試算、歷史日期與未來日期查詢。
- 歷史紀錄編輯／刪除與後續重算，同日維持原順序。
- 本金清零停止新增利息；累計利息可收取或免收，全部處理後結清。
- Google 登入長期保留；僅指定管理者能讀寫完整帳本。
- 每筆帳目可產生、輪替、停用免登入的唯讀分享連結；私人備註不分享。
- JSON 完整備份／驗證／預覽還原，重複帳目預設略過；CSV 明細匯出。
- 回收區還原、永久刪除前備份、交易版本檢查與離線儲存阻擋。
- 舊版 records 格式可唯讀查看；核對差異並下載原始備份後才升級。

## 驗證

```bash
npm test                  # 計息、資料轉換、備份及分享投影
npx playwright install chromium
npm run test:ui           # 瀏覽器操作、手機版及錯誤情境
npm run test:rules        # Firestore 模擬器；需 Java 21+，不碰正式資料
npm run build
npm run check:deploy      # 管理者 UID 設定完成後才能通過
```

所有測試使用虛構帳目，規則測試固定使用 `demo-loan-ledger`。正式 Firebase 設定不會作為測試目標。

## 結構與資料

- `src/core.js`：純計息、驗證、資料轉換、備份與匯出。
- `src/app.js` / `src/style.css`：畫面與操作。
- `src/store.js`：Firebase Authentication 與 Firestore 交易。
- `firestore.rules`：權限規則；必須與前端管理者 UID 一致。

詳見 [資料與權限設計](docs/DATA.md)。Google 字型失敗時會使用裝置內建字型。網站本身不支援離線寫入，也不宣稱備份已自動保存到雲端。
