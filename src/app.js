import {
  today,
  uid,
  money,
  parseMoney,
  validDate,
  calculate,
  validateLoan,
  normalizeLoan,
  legacyDifference,
  createBackup,
  parseBackup,
  csv,
  TYPES,
  sortedEvents,
} from "./core.js";
const reviewOnly = () =>
  document.documentElement.dataset.preview === "review" && !state.demo;
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const rateText = (rate) =>
  (rate * 100).toLocaleString("zh-TW", { maximumFractionDigits: 4 });
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  down: "M12 4v16 M6 14l6 6 6-6",
  up: "M12 20V4 M6 10l6-6 6 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  wallet: "M3 6h16v14H3z M3 6V3h13v3 M15 11h6v5h-6z",
  chart: "M4 20h17 M7 16v-4 M12 16V8 M17 16V4",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3",
  leaf: "M20 3C8 2 2 8 5 15s15 5 15-12z M5 20L16 8",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  download: "M12 3v12 M6 9l6 6 6-6 M4 16v5h16v-5",
  upload: "M12 16V4 M6 10l6-6 6 6 M4 17v4h16v-4",
  edit: "M16 3l5 5L8 21H3v-5z M14 5l5 5",
  share:
    "M9 12l6-7 M9 12l6 7 M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  check: "M5 12l4 4L19 6",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  lock: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3",
  book: "M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 1-3 M8 3v18 M12 8h5 M12 12h5",
  logout: "M9 4H4v16h5 M9 12h12 M16 7l5 5-5 5",
  copy: "M9 9h12v12H9z M15 9V3H3v12h6",
  restore: "M3 11a9 9 0 1 1 2 7 M3 4v7h7",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.book}"/></svg>`;
const brand = () =>
  `<div class="brand"><span class="brand-mark">${icon("leaf")}</span><div><strong>禾帳</strong><small>HEZHANG · LEDGER</small></div></div>`;
const state = {
  demo: false,
  user: null,
  owner: false,
  loans: [],
  raw: [],
  errors: [],
  connectionError: "",
  selected: null,
  view: "overview",
  filter: "active",
  sort: "updated",
  search: "",
  asOf: today(),
  online: navigator.onLine,
  synced: false,
  shared: null,
  loading: true,
};
let store = null,
  authUnsubscribe = null,
  unsubscribe = null,
  busy = false,
  modalOpener = null,
  toastTimer,
  imported = null,
  importDifferences = [],
  authError = "";
const sample = [
  {
    id: "demo-chen",
    name: "陳先生・資金週轉",
    annualRate: 0.023,
    events: [
      ["2026-01-05", "borrow", 10000000, "初始週轉款"],
      ["2026-02-18", "repay", 2000000, "收到轉帳"],
      ["2026-03-12", "borrow", 1500000, "追加借款"],
    ],
  },
  {
    id: "demo-lin",
    name: "林小姐・創業計畫",
    annualRate: 0.03,
    events: [
      ["2026-01-15", "borrow", 20000000, "開店資金"],
      ["2026-02-20", "repay", 5000000, "第一期還款"],
    ],
  },
  {
    id: "demo-home",
    name: "家人・購車借款",
    annualRate: 0,
    events: [
      ["2026-01-10", "borrow", 8000000, ""],
      ["2026-03-01", "repay", 3000000, ""],
    ],
  },
  {
    id: "demo-wang",
    name: "王先生・短期借款",
    annualRate: 0.02,
    events: [
      ["2026-01-01", "borrow", 3000000, ""],
      ["2026-01-31", "repay", 3000000, "本金已收清"],
    ],
  },
].map((l) => ({
  ...l,
  schemaVersion: 2,
  status: "active",
  version: 1,
  shareToken: null,
  deletedAt: null,
  events: l.events
    .filter((e) => e[0] <= today())
    .map((e, i) => ({
      id: `${l.id}-${i}`,
      date: e[0],
      type: e[1],
      amountCents: e[2],
      note: e[3],
      order: i,
    })),
}));
function toast(message) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("visible"), 5500);
}
function errorMessage(e) {
  const map = {
    "auth/popup-blocked": "瀏覽器封鎖了登入視窗，請允許此網站開啟彈出式視窗。",
    "auth/popup-closed-by-user": "登入視窗已關閉，你可以再試一次。",
    "auth/operation-not-allowed":
      "請先在 Firebase Authentication 啟用 Google 登入。",
    "auth/unauthorized-domain":
      "請將目前網站網域加入 Firebase Authentication 的授權網域。",
    "permission-denied":
      "沒有資料存取權。請確認管理者 UID 與 Firebase 安全規則已完成設定。",
    unavailable: "目前無法連線，資料尚未儲存。請確認網路後再試。",
  };
  return map[e.code] || e.message || "操作失敗，請稍後再試。";
}
function getLoan() {
  return state.loans.find((l) => l.id === state.selected);
}
function showModal(title, body) {
  modalOpener = document.activeElement;
  modal.innerHTML = `<div class="modal-heading"><h2 id="modal-title">${esc(title)}</h2><button class="close" data-action="close-modal" aria-label="關閉">×</button></div>${body}`;
  modal.showModal();
}
function closeModal() {
  if (busy) return;
  modal.close();
  modal.innerHTML = "";
  modalOpener?.focus?.();
}
modal.addEventListener("cancel", (e) => {
  if (busy) e.preventDefault();
});
function field(label, name, type = "text", value = "", extra = "") {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
}
const formEnd = (label = "預覽變更") =>
  `<div id="form-preview" aria-live="polite"></div><p class="error-text" id="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">${label}</button></div>`;
function footer() {
  return `<footer class="footer"><span>禾帳 HEZHANG · 讓每筆往來，都清楚有序</span><span>單利計息 · 每年 365 天</span></footer>`;
}
function statusBadge(l, r = calculate(l)) {
  return l.deletedAt
    ? '<span class="badge closed">回收區</span>'
    : l.status === "closed"
      ? '<span class="badge closed">已結清</span>'
      : r.principal === 0
        ? '<span class="badge pending">本金已還清</span>'
        : '<span class="badge">進行中</span>';
}
function loginPage() {
  return `<div class="login-page"><section class="login-art">${brand()}<h1>每一筆往來，<br>都值得好好記下。</h1><p>本金、利息與每次還款，一目了然。<br>讓人情有溫度，也讓帳目有依據。</p></section><section class="login-form"><div class="eyebrow">YOUR PERSONAL LEDGER</div><h2>歡迎回到你的帳本</h2><p>使用你的 Google 帳號管理借貸。<br>登入狀態會保留，下次打開即可繼續。</p><button class="btn btn-primary" data-action="login">${icon("lock")} 使用 Google 登入</button><button class="btn btn-secondary" data-action="demo">先體驗示範帳本 ${icon("arrow")}</button>${authError ? `<p class="error-text" role="alert">${esc(authError)}</p>` : ""}${state.user ? `<div class="notice error">這個帳號尚未取得管理權限。${!store?.ready ? "請依部署說明設定管理者 UID。" : ""}</div><div class="uid">你的 Firebase UID：<br>${esc(state.user.uid)}</div><button class="text-button" data-action="logout">登出並更換帳號</button>` : ""}${!store?.ready ? '<div class="notice info">新版已備妥。正式使用前，需設定管理者帳號與 Firebase 安全規則。<button class="btn btn-small btn-secondary" data-action="setup">查看設定步驟</button></div>' : ""}<div class="login-note">${icon("lock")} 僅指定的管理者能編輯帳目。<br>借款人透過專屬連結查看，不需要登入。</div></section></div>`;
}
function shell(body) {
  return `<div class="shell"><aside class="sidebar">${brand()}<div class="nav-title">WORKSPACE</div><nav><button class="nav-button ${state.view === "overview" ? "active" : ""}" data-action="overview">${icon("grid")} 帳本總覽 <small>${state.loans.filter((l) => !l.deletedAt).length}</small></button><button class="nav-button ${state.view === "trash" ? "active" : ""}" data-action="trash">${icon("trash")} 回收區</button><button class="nav-button" data-action="backup">${icon("download")} ${reviewOnly() ? "帳目備份" : "備份與還原"}</button></nav><div class="sidebar-bottom"><p>把帳記清楚，<br>把心留給重要的事。</p><p class="mini">每一筆，都安心。</p></div></aside><main class="main"><header class="topbar"><div class="topbar-left"><span class="status-dot ${!state.online ? "off" : ""}"></span><span>${state.demo ? "示範帳本 · 不會修改正式資料" : !state.online ? "目前離線 · 暫停儲存" : state.synced ? "雲端同步已連線" : "正在連接雲端…"}</span></div><div class="top-actions"><span class="top-date">${today().replaceAll("-", " / ")}</span><span class="avatar">${esc(state.demo ? "示" : (state.user?.displayName || "我").slice(0, 1))}</span><button class="text-button" data-action="logout">${state.demo ? "離開示範" : "登出"}</button></div></header>${state.demo ? '<div class="notice info">目前是示範模式，所有修改僅在本次頁面中生效，不會寫入你的雲端帳目。</div>' : ""}${reviewOnly() ? '<div class="notice info">這是上線前的唯讀預覽，可查看、試算與備份。原始紀錄不會被修改；正式發布後才開放編輯。<button class="btn btn-small btn-secondary" data-action="export-json">下載原始備份</button></div>' : ""}${state.connectionError ? `<div class="notice error" role="alert">${esc(state.connectionError)}</div>` : ""}${state.errors.length ? `<div class="notice error">${state.errors.length} 筆帳目格式有問題，未載入畫面；原始資料仍保留，請先下載完整備份。<button class="btn btn-small btn-secondary" data-action="export-json">下載原始備份</button></div>` : ""}${state.raw.some((l) => l.schemaVersion !== 2) ? '<div class="notice">偵測到舊版帳目。預覽金額依新版方式試算；請先備份，正式使用前再核對升級結果。<button class="btn btn-small btn-secondary" data-action="migrate">核對舊資料</button></div>' : ""}${body}${footer()}</main></div>`;
}
function stats(loans, date = today(), detail = false) {
  const sums = loans.reduce(
    (s, l) => {
      const r = calculate(l, date);
      s.principal += r.principal;
      s.interest += r.interest;
      s.count += l.status === "active" ? 1 : 0;
      return s;
    },
    { principal: 0, interest: 0, count: 0 },
  );
  return `<div class="stats"><div class="stat"><div class="stat-label">${icon("wallet")} ${detail ? "未還本金" : "未還本金總額"}</div><div class="stat-value"><small>NT$</small>${money(sums.principal)}</div><div class="stat-foot">${detail ? "借出金額扣除已還本金" : "每一筆尚待收回的本金"}</div></div><div class="stat"><div class="stat-label">${icon("chart")} ${detail ? "未收利息" : "未收利息總額"}</div><div class="stat-value"><small>NT$</small>${money(sums.interest)}</div><div class="stat-foot">計算至 ${date.replaceAll("-", " / ")}</div></div><div class="stat accent"><div class="stat-label">${icon(detail ? "book" : "people")} ${detail ? "本金與利息合計" : "進行中的帳目"}</div><div class="stat-value">${detail ? `<small>NT$</small>${money(sums.principal + sums.interest)}` : `${sums.count}<small style="display:inline;margin-left:8px">筆</small>`}</div><div class="stat-foot">${detail ? "未還本金 ＋ 未收利息" : "清楚記下每一次信任"}</div></div></div>`;
}
function loanCard(l, i) {
  const r = calculate(l),
    last = sortedEvents(l).at(-1);
  return `<button class="loan-card" data-action="open" data-id="${esc(l.id)}" aria-label="查看 ${esc(l.name)}"><div class="loan-head"><span class="person-avatar ${i % 2 ? "alt" : ""}">${esc(l.name.slice(0, 1))}</span><div><h3>${esc(l.name)}</h3><p>年利率 ${rateText(l.annualRate)}%</p></div>${statusBadge(l, r)}</div><div class="amount-caption">本金與未收利息合計</div><div class="loan-amount"><small>NT$</small>${money(r.total)}</div><div class="loan-breakdown"><div><span>未還本金</span><strong>$ ${money(r.principal)}</strong></div><div><span>未收利息</span><strong>$ ${money(r.interest)}</strong></div></div><div class="loan-footer"><span>最近異動 ${last.date.replaceAll("-", " / ")}</span><span>查看明細 ${icon("arrow")}</span></div></button>`;
}
function overview() {
  const isTrash = state.view === "trash",
    all = state.loans.filter((l) => (isTrash ? l.deletedAt : !l.deletedAt));
  let shown = all.filter(
    (l) =>
      (isTrash ||
        state.filter === "all" ||
        (state.filter === "active"
          ? l.status === "active"
          : l.status === "closed")) &&
      l.name.toLowerCase().includes(state.search.toLowerCase()),
  );
  shown.sort((a, b) =>
    state.sort === "name"
      ? a.name.localeCompare(b.name, "zh-TW")
      : state.sort === "amount"
        ? calculate(b).total - calculate(a).total
        : sortedEvents(b)
            .at(-1)
            .date.localeCompare(sortedEvents(a).at(-1).date),
  );
  return `<div class="page-heading"><div><div class="eyebrow">${isTrash ? "RECYCLE BIN" : "A LITTLE CLARITY, EVERY DAY"}</div><h1>${isTrash ? "回收區" : "我的借貸帳本"}</h1><p>${isTrash ? "刪除的帳目暫存在這裡，隨時可以還原。" : "好好記帳，讓每一次往來都心裡有數。"}</p></div>${!isTrash && !reviewOnly() ? `<button class="btn btn-primary" data-action="new">${icon("plus")} 新增借貸</button>` : ""}</div>${!isTrash ? `<section class="welcome"><div><h2>每一筆往來，<br>清楚有序，安心在心。</h2><p>今天的本金與利息，已為你整理好了。</p></div><div class="welcome-art" aria-hidden="true"><div class="art-line">${icon("leaf")}</div><div class="art-dot">${icon("check")}</div></div></section>${stats(all)}` : ""}<div class="section-head"><h2>${isTrash ? "已刪除帳目" : "借貸對象"} <span class="count">${all.length}</span></h2><p>${isTrash ? "永久刪除後無法復原" : "金額隨日期自動試算"}</p></div><div class="tools">${
    !isTrash
      ? `<div class="tabs" aria-label="帳目篩選">${[
          ["active", "進行中"],
          ["closed", "已結清"],
          ["all", "全部帳目"],
        ]
          .map(
            ([v, label]) =>
              `<button class="tab ${state.filter === v ? "active" : ""}" data-action="filter" data-value="${v}" aria-pressed="${state.filter === v}">${label}</button>`,
          )
          .join("")}</div>`
      : ""
  }<div class="search-tools"><label class="search">${icon("search")}<input id="search" type="search" placeholder="搜尋姓名或項目" aria-label="搜尋帳目" value="${esc(state.search)}"></label><select id="sort" class="select-small" aria-label="排序方式">${[
    ["updated", "最近異動"],
    ["amount", "金額由大到小"],
    ["name", "依名稱排序"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${state.sort === v ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></div></div><div class="loan-grid">${shown.length ? shown.map(loanCard).join("") : `<div class="empty">${icon("book")}<h3>${state.loading && !state.demo ? "正在載入帳目…" : state.search ? "沒有符合的帳目" : isTrash ? "回收區是空的" : "這裡等著你的第一筆紀錄"}</h3><p>${state.loading && !state.demo ? "正在連接你的雲端帳本。" : state.search ? "試試其他關鍵字。" : isTrash ? "你的帳目都好好保存著。" : "新增借貸對象，開始清楚記錄每次往來。"}</p>${!isTrash && !state.search && !state.loading && !reviewOnly() ? '<button class="btn btn-primary" data-action="new">新增借貸</button>' : ""}</div>`}</div>`;
}
function historyHtml(l, asOf, readOnly = false) {
  const r = calculate(l, asOf),
    events = [...r.history].reverse();
  return `<section class="panel"><div class="section-head"><h2>往來紀錄 <span class="count">${events.length}</span></h2><p>最新紀錄在上方</p></div>${events.length ? `<ol class="records">${events.map((e) => `<li class="record"><span class="record-icon ${e.type}">${icon(e.type === "borrow" ? "up" : e.type === "repay" ? "down" : e.type === "checkpoint" ? "clock" : "check")}</span><div><div class="record-title">${TYPES[e.type]} <span class="record-date">${e.date.replaceAll("-", " / ")}</span></div><div class="record-meta">本金 $${money(e.principalAfter)} · 前期利息 $${money(e.periodInterest)}／${e.days} 天</div>${!readOnly && e.note ? `<p class="record-note">${esc(e.note)}</p>` : ""}</div><div class="record-right">${e.type === "checkpoint" ? "—" : `${e.type === "borrow" ? "+" : e.type === "repay" ? "−" : ""}$${money(e.amountCents)}`}${!readOnly && !reviewOnly() && !l.deletedAt && l.status !== "closed" ? `<div class="record-controls"><button class="icon-button" data-action="edit-event" data-event="${esc(e.id)}" aria-label="修改 ${e.date} ${TYPES[e.type]}">${icon("edit")}</button><button class="icon-button" data-action="delete-event" data-event="${esc(e.id)}" aria-label="刪除 ${e.date} ${TYPES[e.type]}">${icon("trash")}</button></div>` : ""}</div></li>`).join("")}</ol>` : '<p class="panel-sub">選擇的日期尚未有借貸紀錄。</p>'}</section>`;
}
function detail(l, readOnly = false) {
  const r = calculate(l, state.asOf),
    current = calculate(l);
  return `${!readOnly ? `<button class="back" data-action="${l.deletedAt ? "trash" : "overview"}">${icon("back")} 返回${l.deletedAt ? "回收區" : "所有帳目"}</button>` : ""}<div class="page-heading"><div><div class="eyebrow">${readOnly ? "YOUR LOAN STATEMENT" : "LOAN DETAILS"}</div><h1>${esc(l.name)}</h1><p>年利率 ${rateText(l.annualRate)}% · ${l.annualRate === 0 ? "無息借款" : "按實際天數計算單利"}</p></div>${statusBadge(l, current)}</div>${stats([l], state.asOf, true)}${reviewOnly() && !readOnly ? `<div class="detail-actions"><button class="btn btn-secondary" data-action="export-csv">${icon("download")} 匯出 CSV</button></div>` : !readOnly ? `<div class="detail-actions">${l.deletedAt ? `<button class="btn btn-primary" data-action="restore">${icon("restore")} 還原帳目</button><button class="btn btn-danger" data-action="permanent-delete">永久刪除</button>` : l.status === "closed" ? '<button class="btn btn-secondary" data-action="reopen">重新開啟帳目</button>' : `<button class="btn btn-primary" data-action="new-event">${icon("plus")} 借出／還本金</button><button class="btn btn-secondary" data-action="interest">處理利息</button><button class="btn btn-secondary" data-action="close-loan">${icon("check")} 結清帳目</button>`}${!l.deletedAt ? `<button class="btn btn-secondary" data-action="share">${icon("share")} 分享明細</button><button class="btn btn-secondary" data-action="rename">${icon("edit")} 修改名稱</button>` : ""}<button class="btn btn-secondary" data-action="export-csv">${icon("download")} 匯出 CSV</button>${!l.deletedAt ? '<button class="btn btn-secondary danger-text" data-action="soft-delete">移至回收區</button>' : ""}</div>` : `<div class="notice info">${icon("lock")} 這是專屬唯讀明細，你可以查詢與匯出，但無法修改帳目。<button class="btn btn-small btn-secondary" data-action="export-csv">${icon("download")} 匯出 CSV</button></div>`}${current.principal === 0 && current.interest > 0 ? '<div class="notice">本金已還清，不再產生新利息。先前累計的未收利息仍保留，待收取或免收後即可結清。</div>' : ""}<div class="detail-grid"><div>${historyHtml(l, state.asOf, readOnly)}</div><aside class="aside"><section class="panel query-box"><h3>${icon("clock")} 日期試算</h3><label for="query-date">計算至哪一天？</label><input id="query-date" type="date" value="${state.asOf}" min="1900-01-01" max="2100-12-31"><p class="help">只供試算，不會新增或修改任何紀錄。未來試算假設本金不再變動。</p></section><section class="panel"><h3>利息摘要</h3><div class="summary-line"><span>累計產生利息</span><strong>$${money(r.accruedInterest)}</strong></div><div class="summary-line"><span>已收利息</span><strong>$${money(r.paid)}</strong></div><div class="summary-line"><span>已免收利息</span><strong>$${money(r.waived)}</strong></div><div class="summary-line total"><span>尚未收取</span><strong>$${money(r.interest)}</strong></div><p class="help">本金 × 年利率 ÷ 365 × 天數。利息不併入本金計息。</p></section></aside></div>`;
}
function render() {
  if (state.shared) {
    app.innerHTML = `<main class="public-shell"><header class="public-header">${brand()}<span>專屬借貸明細 · 唯讀</span></header>${detail(state.shared, true)}<p class="refresh-note">資料於 ${new Date().toLocaleTimeString("zh-TW")} 載入。<button class="text-button" data-action="refresh-share">重新整理資料</button></p>${footer()}</main>`;
    return;
  }
  if (!state.demo && !state.owner) {
    app.innerHTML = loginPage();
    return;
  }
  const l = getLoan();
  app.innerHTML = shell(l ? detail(l) : overview());
}
function loadRaw(raw, metadata = {}) {
  state.raw = raw;
  state.errors = [];
  state.loans = raw.flatMap((r) => {
    try {
      return [normalizeLoan(r, r.id)];
    } catch (e) {
      state.errors.push({ id: r.id, error: e.message });
      return [];
    }
  });
  state.loading = false;
  state.synced = !metadata.fromCache;
  state.connectionError = "";
  if (state.selected && !getLoan()) state.selected = null;
  render();
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportJSON() {
  if (!state.demo && (state.loading || !state.synced))
    throw Error("請等雲端帳目載入完成後再下載備份，避免備份不完整。");
  download(
    `禾帳-完整備份-${today()}.json`,
    JSON.stringify(createBackup(state.demo ? state.loans : state.raw), null, 2),
    "application/json",
  );
}
async function persist(candidate, expectedVersion, { remove = false } = {}) {
  if (reviewOnly())
    throw Error("目前為唯讀預覽，請先備份；正式發布後才開放修改。");
  if (!state.online && !state.demo)
    throw Error("目前離線，請恢復連線後再儲存。");
  validateLoan(candidate, { allowFuture: true });
  if (state.demo) {
    const old = state.loans.find((l) => l.id === candidate.id);
    if (
      (expectedVersion === null && old) ||
      (expectedVersion !== null && (!old || old.version !== expectedVersion))
    )
      throw Error("帳目已更新，請重新開啟後再修改。");
    let next = state.loans.filter((l) => l.id !== candidate.id);
    if (!remove) next.push({ ...candidate, version: (old?.version ?? 0) + 1 });
    loadRaw(next);
    return;
  }
  await store.saveLoan(candidate, expectedVersion, { remove });
}
async function run(task) {
  if (busy) return;
  busy = true;
  modal.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const submit = modal.querySelector('[type="submit"]'),
    oldText = submit?.textContent;
  if (submit) submit.textContent = "儲存中…";
  try {
    await task();
    busy = false;
    closeModal();
    render();
    toast("已儲存" + (state.demo ? "（示範模式）" : "並同步至雲端"));
  } catch (e) {
    const el = modal.querySelector("#form-error");
    if (el) el.textContent = errorMessage(e);
    else toast(errorMessage(e));
  } finally {
    busy = false;
    modal.querySelectorAll("button").forEach((b) => (b.disabled = false));
    if (submit?.isConnected) submit.textContent = oldText;
  }
}
function requireMigrated(l) {
  if (
    state.demo ||
    !state.raw.some((r) => r.id === l.id && r.schemaVersion !== 2)
  )
    return true;
  openMigration();
  return false;
}
function watchPreview(form, build, describe, commit) {
  let staged = null;
  form.addEventListener("input", () => {
    staged = null;
    form.querySelector("#form-preview").innerHTML = "";
    form.querySelector('[type="submit"]').textContent = "預覽變更";
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const error = form.querySelector("#form-error");
    error.textContent = "";
    if (staged) {
      run(() => commit(staged));
      return;
    }
    try {
      staged = build(new FormData(form));
      form.querySelector("#form-preview").innerHTML =
        `<div class="preview">${describe(staged)}</div>`;
      form.querySelector('[type="submit"]').textContent = "確認並儲存";
    } catch (err) {
      staged = null;
      error.textContent = errorMessage(err);
    }
  });
}
function newLoan() {
  showModal(
    "新增借貸",
    `<p class="help">為每一份信任，開一本清楚的帳。</p><form id="editor">${field("借款人／項目名稱", "name", "text", "", 'maxlength="100" required placeholder="例如：小明・資金週轉"')}${field("初次借出金額（元）", "amount", "number", "", 'min="0.01" max="1000000000" step="0.01" required inputmode="decimal" placeholder="請輸入金額"')}<div class="field-row">${field("年利率（%）", "rate", "number", "2.3", 'min="0" max="1000" step="0.0001" required')}${field("借出日期", "date", "date", today(), `max="${today()}" min="1900-01-01" required`)}</div><div class="field"><label for="f-note">私人備註（選填）</label><textarea id="f-note" name="note" maxlength="500" placeholder="備註不會出現在分享明細中"></textarea></div>${formEnd()}</form>`,
  );
  watchPreview(
    modal.querySelector("form"),
    (f) => {
      const amount = parseMoney(f.get("amount")),
        date = f.get("date");
      const l = {
        schemaVersion: 2,
        id: uid(),
        name: String(f.get("name")).trim(),
        annualRate: Number(f.get("rate")) / 100,
        status: "active",
        version: 0,
        deletedAt: null,
        shareToken: null,
        events: [
          {
            id: uid(),
            date,
            type: "borrow",
            amountCents: amount,
            order: 0,
            note: String(f.get("note")).trim(),
          },
        ],
      };
      return validateLoan(l);
    },
    (l) =>
      `建立「${esc(l.name)}」<br>借出 <strong>$${money(l.events[0].amountCents)}</strong> · 年利率 ${(l.annualRate * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}%<br>自 ${l.events[0].date} 起計息。`,
    async (l) => {
      await persist(l, null);
      state.selected = l.id;
      state.asOf = today();
    },
  );
}
function eventEditor(existing = null, interestMode = false) {
  const loan = getLoan();
  if (
    !loan ||
    !requireMigrated(loan) ||
    loan.deletedAt ||
    loan.status === "closed"
  )
    return;
  const type = existing?.type ?? (interestMode ? "interest" : "borrow"),
    isCheckpoint = type === "checkpoint",
    types = isCheckpoint
      ? ["checkpoint"]
      : interestMode || ["interest", "waive"].includes(type)
        ? ["interest", "waive"]
        : ["borrow", "repay"];
  showModal(
    existing
      ? "修改往來紀錄"
      : interestMode
        ? "處理累計利息"
        : "記錄借出與還款",
    `<p class="help">${esc(loan.name)} · 目前本金 $${money(calculate(loan).principal)}</p><form id="editor">${isCheckpoint ? '<p class="notice info">這是舊版的零元查詢紀錄，可以保留或刪除，不影響本金。</p><input type="hidden" name="type" value="checkpoint">' : `<div class="type-picker">${types.map((t) => `<label class="${t}"><input type="radio" name="type" value="${t}" ${t === type ? "checked" : ""}>${icon(t === "borrow" ? "up" : t === "repay" ? "down" : "check")}${TYPES[t]}</label>`).join("")}</div>`}${!isCheckpoint ? field("金額（元）", "amount", "number", existing ? existing.amountCents / 100 : "", 'min="0.01" step="0.01" required inputmode="decimal" placeholder="輸入正數金額即可"') : '<input type="hidden" name="amount" value="0">'}${field("異動日期", "date", "date", existing?.date ?? today(), `max="${today()}" min="1900-01-01" required`)}<div class="field"><label for="f-note">私人備註（選填）</label><textarea id="f-note" name="note" maxlength="500">${esc(existing?.note ?? "")}</textarea><small>備註僅你可見，不會分享給借款人。</small></div>${existing ? '<p class="help">修改歷史紀錄會重新計算後續本金與利息。建議先<button type="button" class="text-button" data-action="export-json">下載備份</button>。</p>' : ""}${formEnd()}</form>`,
  );
  watchPreview(
    modal.querySelector("form"),
    (f) => {
      const ev = {
        id: existing?.id ?? uid(),
        type: String(f.get("type")),
        date: String(f.get("date")),
        amountCents: parseMoney(f.get("amount")),
        note: String(f.get("note")).trim(),
        order:
          existing?.order ?? Math.max(...loan.events.map((e) => e.order)) + 1,
      };
      if (!validDate(ev.date) || ev.date > today())
        throw Error("請選擇今天或過去的有效日期");
      const next = {
        ...loan,
        events: existing
          ? loan.events.map((e) => (e.id === existing.id ? ev : e))
          : [...loan.events, ev],
      };
      validateLoan(next, { allowFuture: true });
      return next;
    },
    (next) => {
      const ev = existing
          ? next.events.find((e) => e.id === existing.id)
          : next.events.at(-1),
        r = calculate(next),
        before = calculate(loan);
      return `${ev.date} · ${TYPES[ev.type]} <strong>$${money(ev.amountCents)}</strong><br>截至今天，剩餘本金 <strong>$${money(r.principal)}</strong><br>未收利息 $${money(before.interest)} → <strong>$${money(r.interest)}</strong>${existing ? "<br>後續紀錄將一併重算。" : ""}`;
    },
    (next) => persist(next, loan.version),
  );
}
function confirmMutation(title, loan, next, message, { remove = false } = {}) {
  showModal(
    title,
    `<p class="help">${message}</p><p class="help">操作前可先<button class="text-button" data-action="export-json">下載完整備份</button>。</p><form>${formEnd("確認" + title)}</form>`,
  );
  modal.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    run(() => persist(next, loan.version, { remove }));
  });
}
function deleteEvent(id) {
  const l = getLoan();
  if (!l || !requireMigrated(l)) return;
  const e = l.events.find((e) => e.id === id);
  if (!e) return;
  const next = { ...l, events: l.events.filter((e) => e.id !== id) };
  try {
    validateLoan(next, { allowFuture: true });
    const r = calculate(next);
    confirmMutation(
      "刪除紀錄",
      l,
      next,
      `刪除 ${esc(e.date)} 的「${TYPES[e.type]} $${money(e.amountCents)}」後，將重算所有後續紀錄。<br>截至今天：本金 $${money(r.principal)}、未收利息 $${money(r.interest)}。`,
    );
  } catch (e) {
    toast(errorMessage(e));
  }
}
function backupDialog() {
  if (reviewOnly()) {
    showModal(
      "下載原始帳目備份",
      `<p class="help">備份包含原始紀錄、私人備註及回收區。此檔案尚未套用新版轉換，請妥善保存。確認已下載後，再回到對話告訴助理。</p><div class="field"><button class="btn btn-primary" data-action="export-json">${icon("download")} 下載完整 JSON 備份</button></div>`,
    );
    return;
  }
  showModal(
    "備份與還原",
    `<p class="help">備份包含所有帳目、私人備註與回收區。請妥善保存檔案。</p><div class="field"><button class="btn btn-primary" data-action="export-json">${icon("download")} 下載完整 JSON 備份</button></div><p class="help">CSV 適合用 Excel 核對；請在個別帳目中匯出。還原僅接受完整 JSON 備份，分享連結不會從備份恢復，需重新產生。</p><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h3 style="font-size:14px">從備份還原</h3><p class="help">先檢查內容，再決定如何處理重複帳目，不會直接覆蓋。</p><label class="file-label field">${icon("upload")} 選擇 JSON 備份檔<input type="file" id="import-file" accept=".json,application/json"></label><div id="import-preview"></div><p id="form-error" class="error-text" role="alert"></p>`,
  );
  modal.querySelector("#import-file").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) throw Error("備份檔案超過 20 MB");
      const text = await file.text();
      imported = parseBackup(text);
      const originals = JSON.parse(text).loans;
      importDifferences = originals
        .filter((x) => x.schemaVersion !== 2)
        .map((raw) => ({
          name: raw.name,
          ...legacyDifference(
            raw,
            imported.find((l) => l.id === raw.id),
          ),
        }))
        .filter((d) => d.principalCents || d.interestCents);
      const preview = modal.querySelector("#import-preview");
      preview.innerHTML = `${importDifferences.length ? `<div class="notice">舊版帳目重算有差異：${importDifferences.map((d) => `${esc(d.name)}（本金差 $${money(d.principalCents)}、利息差 $${money(d.interestCents)}）`).join("；")}</div><label class="checkbox"><input type="checkbox" id="import-diff-ack">我已核對並接受以上重算差異。</label>` : ""}<ul class="import-list">${imported.map((l) => `<li class="${state.raw.some((x) => x.id === l.id) ? "duplicate" : ""}">${esc(l.name)} · ${l.events.length} 筆紀錄${state.raw.some((x) => x.id === l.id) ? "（已存在）" : ""}</li>`).join("")}</ul><div class="field"><label for="import-policy">重複帳目處理方式</label><select id="import-policy"><option value="skip">略過重複帳目（預設）</option><option value="overwrite">覆蓋重複帳目，停用現有分享連結</option></select></div><p class="help">還原前將下載一份目前帳本的備份。逐筆儲存，如途中失敗可重試；未成功項目會保留在清單。</p><button class="btn btn-primary field" data-action="import-confirm">確認還原 ${imported.length} 筆帳目</button>`;
      modal.querySelector("#form-error").textContent = "";
    } catch (err) {
      imported = null;
      modal.querySelector("#import-preview").innerHTML = "";
      modal.querySelector("#form-error").textContent = errorMessage(err);
    }
  });
}
async function importConfirm() {
  if (!imported) return;
  if (
    importDifferences.length &&
    !modal.querySelector("#import-diff-ack")?.checked
  ) {
    toast("請先核對舊版帳目的重算差異");
    return;
  }
  const overwrite = modal.querySelector("#import-policy").value === "overwrite";
  if (overwrite && !modal.querySelector("#overwrite-confirmed")) {
    const p = document.createElement("label");
    p.className = "checkbox";
    p.innerHTML =
      '<input type="checkbox" id="overwrite-confirmed">我了解重複帳目會被覆蓋，現有分享連結也會停用。';
    modal.querySelector("#import-preview").append(p);
    return;
  }
  if (overwrite && !modal.querySelector("#overwrite-confirmed").checked) {
    toast("請確認你了解覆蓋的影響");
    return;
  }
  const pending = imported.filter(
    (l) => overwrite || !state.raw.some((x) => x.id === l.id),
  );
  if (!pending.length) {
    toast("所有帳目都已存在，沒有需要還原的項目");
    return;
  }
  exportJSON();
  await run(async () => {
    let count = 0;
    for (const l of [...pending]) {
      const old = state.raw.find((x) => x.id === l.id);
      try {
        await persist(l, old ? (old.version ?? 0) : null);
        imported = imported.filter((x) => x.id !== l.id);
        count++;
      } catch (e) {
        throw Error(
          `已還原 ${count} 筆；「${l.name}」未成功：${errorMessage(e)}。可再次按確認重試剩餘項目。`,
        );
      }
    }
  });
}
function openMigration() {
  if (reviewOnly()) {
    toast("請先下載原始備份；正式發布後才能核對並升級舊帳目。");
    return;
  }
  const pairs = state.raw
    .filter((r) => r.schemaVersion !== 2)
    .map((raw) => {
      try {
        const next = normalizeLoan(raw),
          diff = legacyDifference(raw, next);
        return { raw, next, diff };
      } catch (e) {
        return { raw, error: e.message };
      }
    });
  showModal(
    "核對與升級舊帳目",
    `<p class="help">舊版的借出、還本金及零元查詢紀錄都會保留。升級前會先下載完整原始備份；以下金額比對至各帳目最後紀錄日期。</p><ul class="import-list">${pairs.map((p) => `<li>${esc(p.raw.name)}${p.error ? `：無法升級，${esc(p.error)}` : `：本金差 $${money(p.diff.principalCents)}、利息差 $${money(p.diff.interestCents)}（${p.diff.date}）`}</li>`).join("")}</ul><label class="checkbox"><input type="checkbox" id="migration-ack">我已核對以上差異，同意升級可處理的帳目；有問題的帳目保留原狀。</label><form>${formEnd("備份並升級")}</form>`,
  );
  modal.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!modal.querySelector("#migration-ack").checked) {
      modal.querySelector("#form-error").textContent = "請先核對並勾選確認。";
      return;
    }
    exportJSON();
    run(async () => {
      for (const p of pairs.filter((p) => p.next)) {
        const current = state.raw.find((r) => r.id === p.raw.id);
        if (current?.schemaVersion === 2) continue;
        await persist(p.next, current?.version ?? 0);
      }
    });
  });
}
function shareToken() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function shareDialog() {
  const l = getLoan();
  if (!l || l.deletedAt || !requireMigrated(l)) return;
  const r = calculate(l),
    url = l.shareToken
      ? `${location.origin}${location.pathname}#share=${l.shareToken}`
      : "";
  showModal(
    "分享專屬明細",
    `<p class="help">借款人免登入，只能查看這一筆帳目，無法新增、修改或刪除。連結被轉傳後，持有者也能查看。</p><div class="share-preview"><h3>借款人會看到的內容</h3><p>${esc(l.name)} · 年利率 ${rateText(l.annualRate)}%<br>本金 $${money(r.principal)} · 未收利息 $${money(r.interest)}</p><ul><li>借出、還本金、利息收取與免收明細</li><li>日期試算與 CSV 匯出</li><li>不包含私人備註或其他借款人資料</li></ul></div>${url ? `<input class="share-url" readonly aria-label="專屬分享連結" value="${esc(url)}"><div class="modal-actions"><button class="btn btn-primary" data-action="copy-share">${icon("copy")} 複製連結</button><button class="btn btn-secondary" data-action="rotate-share">重新產生</button></div><button class="text-button danger-text field" data-action="disable-share">停用目前連結</button>` : `<div class="modal-actions"><button class="btn btn-primary" data-action="enable-share">產生專屬連結</button></div>`}<p class="help">停用或重建連結後，舊網址無法再讀取資料，但無法收回已下載或截圖的內容。${state.demo ? "示範模式的連結不會在雲端建立，無法分享給他人。" : ""}</p><p class="error-text" id="form-error" role="alert"></p>`,
  );
}
async function changeShare(action) {
  const l = getLoan();
  if (!l) return;
  const next = {
    ...l,
    shareToken: action === "disable-share" ? null : shareToken(),
  };
  await run(() => persist(next, l.version));
  if (!modal.open) {
    if (state.demo) shareDialog();
    else {
      state.loans = state.loans.map((x) =>
        x.id === l.id ? { ...next, version: l.version + 1 } : x,
      );
      shareDialog();
    }
  }
}
function setupDialog() {
  showModal(
    "正式啟用前的設定",
    `<p class="help">帳本預設鎖定，不會把第一位登入的人自動設為管理者。</p><ol class="setup-steps"><li>在 Firebase Authentication 啟用 Google 登入，加入網站的授權網域。</li><li>登入後複製你的 Firebase UID。</li><li>將 UID 填入 <code>src/config.js</code> 與 <code>firestore.rules</code>。</li><li>依部署說明備份舊資料，發布安全規則與新版網站。</li></ol><p class="help">完整步驟見專案的 <code>docs/DEPLOY.md</code>。若未設定安全規則，單靠登入畫面無法保護資料。</p><div class="modal-actions"><button class="btn btn-primary" data-action="close-modal">了解</button></div>`,
  );
}
async function refreshShare(token) {
  app.innerHTML = '<div class="boot">禾帳<span>正在讀取專屬明細…</span></div>';
  try {
    if (!store) store = await import("./store.js");
    state.shared = await store.readShare(token);
    state.selected = null;
    render();
  } catch (e) {
    state.shared = null;
    app.innerHTML = `<main class="public-shell"><header class="public-header">${brand()}</header><div class="empty" style="margin-top:40px">${icon("lock")}<h3>無法開啟這份明細</h3><p>分享連結可能已停用、已失效，或目前無法連線。<br>請向借出人確認連結，或稍後再試。</p><button class="btn btn-primary" data-action="refresh-share">重新嘗試</button></div></main>`;
  }
}
async function handleAction(action, el) {
  const l = getLoan();
  switch (action) {
    case "login":
      try {
        if (!store) store = await import("./store.js");
        await store.login();
      } catch (e) {
        authError = errorMessage(e);
        render();
      }
      break;
    case "logout":
      unsubscribe?.();
      unsubscribe = null;
      if (state.demo) {
        state.demo = false;
        state.owner = false;
        state.loans = [];
        state.raw = [];
        state.selected = null;
        state.loading = false;
        history.replaceState(null, "", location.pathname);
        render();
        if (store) connectAuth();
        else init();
      } else {
        await store?.logout();
        state.owner = false;
        state.raw = [];
        state.loans = [];
        state.selected = null;
        render();
      }
      break;
    case "demo":
      unsubscribe?.();
      unsubscribe = null;
      state.demo = true;
      state.owner = false;
      state.loading = false;
      state.selected = null;
      state.asOf = today();
      loadRaw(structuredClone(sample));
      break;
    case "setup":
      setupDialog();
      break;
    case "overview":
    case "trash":
      state.view = action;
      state.selected = null;
      state.search = "";
      render();
      break;
    case "filter":
      state.filter = el.dataset.value;
      render();
      break;
    case "open":
      state.selected = el.dataset.id;
      state.asOf = today();
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      break;
    case "new":
      newLoan();
      break;
    case "new-event":
      eventEditor();
      break;
    case "interest":
      eventEditor(null, true);
      break;
    case "edit-event": {
      const ev = l?.events.find((e) => e.id === el.dataset.event);
      if (ev) eventEditor(ev);
      break;
    }
    case "delete-event":
      deleteEvent(el.dataset.event);
      break;
    case "close-modal":
      closeModal();
      break;
    case "export-json":
      exportJSON();
      toast("備份檔案已準備下載，請確認瀏覽器已保存");
      break;
    case "export-csv": {
      const loan = state.shared ?? l;
      if (loan)
        download(
          `禾帳-${loan.name.replace(/[\\/:*?"<>|]/g, "_")}-${state.asOf}.csv`,
          csv(loan, state.asOf),
          "text/csv;charset=utf-8",
        );
      break;
    }
    case "backup":
      backupDialog();
      break;
    case "import-confirm":
      await importConfirm();
      break;
    case "migrate":
      openMigration();
      break;
    case "share":
      shareDialog();
      break;
    case "enable-share":
    case "rotate-share":
    case "disable-share":
      await changeShare(action);
      break;
    case "copy-share":
      try {
        await navigator.clipboard.writeText(
          modal.querySelector(".share-url").value,
        );
        toast("已複製專屬連結");
      } catch {
        modal.querySelector(".share-url").select();
        toast("請長按或使用複製指令複製連結");
      }
      break;
    case "refresh-share":
      await refreshShare(
        new URLSearchParams(location.hash.slice(1)).get("share"),
      );
      break;
    case "rename":
      if (!l || !requireMigrated(l)) break;
      showModal(
        "修改帳目名稱",
        `<form>${field("名稱", "name", "text", l.name, 'required maxlength="100"')}${formEnd()}</form>`,
      );
      watchPreview(
        modal.querySelector("form"),
        (f) =>
          validateLoan(
            { ...l, name: String(f.get("name")).trim() },
            { allowFuture: true },
          ),
        (n) => `名稱將改為「${esc(n.name)}」，分享明細也會同步更新。`,
        (n) => persist(n, l.version),
      );
      break;
    case "soft-delete":
      if (l && requireMigrated(l))
        confirmMutation(
          "移至回收區",
          l,
          { ...l, deletedAt: new Date().toISOString(), shareToken: null },
          `「${esc(l.name)}」將移至回收區，分享連結會停用。你可以稍後還原帳目。`,
        );
      break;
    case "restore":
      if (l)
        confirmMutation(
          "還原帳目",
          l,
          { ...l, deletedAt: null, shareToken: null },
          "帳目將回到總覽；分享連結需重新產生。",
        );
      break;
    case "permanent-delete":
      if (l) {
        showModal(
          "永久刪除帳目",
          `<p class="help">此操作無法復原。請輸入帳目名稱「${esc(l.name)}」確認；繼續前會先下載完整備份。</p><form>${field("輸入帳目名稱", "confirm", "text", "", "required")}<p class="error-text" id="form-error" role="alert"></p><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="close-modal">取消</button><button class="btn btn-danger" type="submit">備份並永久刪除</button></div></form>`,
        );
        modal.querySelector("form").addEventListener("submit", (e) => {
          e.preventDefault();
          if (new FormData(e.target).get("confirm") !== l.name) {
            modal.querySelector("#form-error").textContent = "名稱不相符。";
            return;
          }
          exportJSON();
          run(() => persist(l, l.version, { remove: true }));
        });
      }
      break;
    case "close-loan":
      if (l && requireMigrated(l)) {
        const r = calculate(l);
        if (r.principal || r.interest)
          toast(
            "本金與未收利息都為零時，才能結清。請先記錄還本、收取或免收利息。",
          );
        else
          confirmMutation(
            "結清帳目",
            l,
            { ...l, status: "closed" },
            "結清後將保留所有歷史紀錄，並暫停編輯。需要修改時可重新開啟。",
          );
      }
      break;
    case "reopen":
      if (l && requireMigrated(l))
        confirmMutation(
          "重新開啟帳目",
          l,
          { ...l, status: "active" },
          "重新開啟後可以繼續記錄借出、還款或修正歷史紀錄。",
        );
      break;
  }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || busy) return;
  handleAction(el.dataset.action, el).catch((err) => toast(errorMessage(err)));
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    state.search = e.target.value;
    render();
    const input = document.querySelector("#search");
    input.focus();
    try {
      input.setSelectionRange(pos, pos);
    } catch {}
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "sort") {
    state.sort = e.target.value;
    render();
  }
  if (e.target.id === "query-date") {
    if (validDate(e.target.value)) {
      state.asOf = e.target.value;
      render();
    } else toast("請選擇有效日期");
  }
});
window.addEventListener("online", () => {
  state.online = true;
  render();
});
window.addEventListener("offline", () => {
  state.online = false;
  render();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
let lastToday = today();
function refreshDay() {
  if (today() !== lastToday) {
    if (state.asOf === lastToday) state.asOf = today();
    lastToday = today();
    render();
  }
}
setInterval(refreshDay, 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDay();
});
function connectAuth() {
  authUnsubscribe?.();
  authUnsubscribe = store.observeAuth((user, isOwner) => {
    if (state.demo) return;
    state.user = user;
    state.owner = isOwner;
    unsubscribe?.();
    unsubscribe = null;
    if (isOwner) {
      state.loading = true;
      state.synced = false;
      unsubscribe = store.subscribe(loadRaw, (e) => {
        state.loading = false;
        state.synced = false;
        state.connectionError = errorMessage(e);
        render();
        toast(errorMessage(e));
      });
    } else {
      state.raw = [];
      state.loans = [];
    }
    render();
  });
}
async function init() {
  const token = new URLSearchParams(location.hash.slice(1)).get("share");
  if (token) {
    await refreshShare(token);
    return;
  }
  if (
    new URLSearchParams(location.search).get("demo") === "1" ||
    document.documentElement.dataset.preview === "demo"
  ) {
    state.demo = true;
    state.loading = false;
    loadRaw(structuredClone(sample));
    return;
  }
  render();
  try {
    store = await import("./store.js");
    connectAuth();
    render();
  } catch (e) {
    authError = "雲端連線暫時無法啟動。請重新整理，或先體驗示範帳本。";
    render();
  }
}
window.addEventListener("hashchange", () => location.reload());
init();
