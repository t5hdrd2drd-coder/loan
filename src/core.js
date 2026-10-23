export const SCHEMA = 2;
export const DENOMINATOR = 365000000n;
export const TYPES = {
  borrow: "借出",
  repay: "還本金",
  interest: "收取利息",
  waive: "免收利息",
  checkpoint: "歷史查詢",
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const uid = () => crypto.randomUUID();
export function money(cents) {
  return (cents / 100).toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
export function parseMoney(value) {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error("請輸入正確金額，最多兩位小數");
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100000000000)
    throw Error("金額過大");
  return cents;
}
export function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return (
    Number.isFinite(+d) &&
    d.toISOString().slice(0, 10) === s &&
    s >= "1900-01-01"
  );
}
export function days(a, b) {
  return (
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000
  );
}
const round = (n) => Number((n + DENOMINATOR / 2n) / DENOMINATOR);
export const sortedEvents = (loan) =>
  [...loan.events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order,
  );
export function calculate(loan, asOf = today()) {
  if (!validDate(asOf)) throw Error("請選擇有效的查詢日期");
  let principal = 0,
    numerator = 0n,
    paid = 0,
    waived = 0,
    previous = null;
  const history = [],
    rate = BigInt(Math.round(loan.annualRate * 1000000));
  for (const e of sortedEvents(loan)) {
    if (e.date > asOf) break;
    const elapsed = previous ? days(previous, e.date) : 0;
    const before = round(numerator);
    numerator += BigInt(principal) * rate * BigInt(elapsed);
    const accrued = round(numerator);
    if (e.type === "borrow") principal += e.amountCents;
    if (e.type === "repay") principal -= e.amountCents;
    if (principal > 100000000000) throw Error("未還本金超過可處理上限");
    if (principal < 0) throw Error(`${e.date} 的還本金金額超過當時餘額`);
    if (e.type === "interest" || e.type === "waive") {
      if (e.amountCents > accrued - paid - waived)
        throw Error(`${e.date} 的利息處理金額超過未收利息`);
      if (e.type === "interest") paid += e.amountCents;
      else waived += e.amountCents;
    }
    history.push({
      ...e,
      principalAfter: principal,
      periodInterest: accrued - before,
      days: elapsed,
      outstandingInterest: accrued - paid - waived,
    });
    previous = e.date;
  }
  if (previous)
    numerator += BigInt(principal) * rate * BigInt(days(previous, asOf));
  const accruedInterest = round(numerator);
  if (!Number.isSafeInteger(accruedInterest))
    throw Error("累計利息超過可處理上限");
  const interest = Math.max(0, accruedInterest - paid - waived);
  return {
    principal,
    interest,
    total: principal + interest,
    accruedInterest,
    paid,
    waived,
    history,
    asOf,
  };
}
export function validateLoan(loan, { allowFuture = false } = {}) {
  if (!loan || typeof loan !== "object" || loan.schemaVersion !== SCHEMA)
    throw Error("帳目版本不支援");
  if (typeof loan.id !== "string" || !/^[\w-]{1,100}$/.test(loan.id))
    throw Error("帳目識別碼無效");
  if (
    typeof loan.name !== "string" ||
    !loan.name.trim() ||
    loan.name.length > 100
  )
    throw Error("名稱需為 1–100 個字");
  if (
    typeof loan.annualRate !== "number" ||
    !Number.isFinite(loan.annualRate) ||
    loan.annualRate < 0 ||
    loan.annualRate > 10
  )
    throw Error("年利率需介於 0–1000%");
  if (
    Math.abs(
      loan.annualRate * 1000000 - Math.round(loan.annualRate * 1000000),
    ) > 0.000001
  )
    throw Error("年利率最多四位小數");
  if (!["active", "closed"].includes(loan.status)) throw Error("帳目狀態無效");
  if (!Number.isSafeInteger(loan.version) || loan.version < 0)
    throw Error("資料版本無效");
  if (!(
    loan.deletedAt === null ||
    (typeof loan.deletedAt === "string" &&
      Number.isFinite(Date.parse(loan.deletedAt)))
  ))
    throw Error("回收狀態無效");
  if (!(
    loan.shareToken === null ||
    (typeof loan.shareToken === "string" &&
      /^[a-f0-9]{48}$/.test(loan.shareToken))
  ))
    throw Error("分享識別碼無效");
  if (
    !Array.isArray(loan.events) ||
    !loan.events.length ||
    loan.events.length > 1500
  )
    throw Error("每筆帳目需有 1–1500 筆紀錄");
  const ids = new Set(),
    orders = new Set();
  for (const e of loan.events) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      e.id.length > 100 ||
      ids.has(e.id)
    )
      throw Error("紀錄識別碼重複或無效");
    ids.add(e.id);
    if (!Number.isSafeInteger(e.order) || e.order < 0 || orders.has(e.order))
      throw Error("紀錄順序重複或無效");
    orders.add(e.order);
    if (!validDate(e.date) || (!allowFuture && e.date > today()))
      throw Error("異動日期需為今天或過去的有效日期");
    if (!Object.hasOwn(TYPES, e.type)) throw Error("紀錄類型無效");
    if (
      !Number.isSafeInteger(e.amountCents) ||
      e.amountCents < 0 ||
      e.amountCents > 100000000000 ||
      (e.type !== "checkpoint" && e.amountCents === 0) ||
      (e.type === "checkpoint" && e.amountCents !== 0)
    )
      throw Error("異動金額無效");
    if (typeof e.note !== "string" || e.note.length > 500)
      throw Error("備註最多 500 個字");
  }
  const result = calculate(loan, sortedEvents(loan).at(-1).date);
  if (!result.history.some((e) => e.type === "borrow"))
    throw Error("帳目至少需要一筆借出紀錄");
  if (loan.status === "closed" && (result.principal || result.interest))
    throw Error("本金及未收利息需皆為零才能結清");
  if (new TextEncoder().encode(JSON.stringify(loan)).length > 850000)
    throw Error("帳目內容過大，請減少備註或紀錄");
  return loan;
}
export function normalizeLoan(raw, id = raw?.id) {
  if (raw?.schemaVersion === SCHEMA) {
    const safe = {
      schemaVersion: SCHEMA,
      id,
      name: raw.name,
      annualRate: raw.annualRate,
      status: raw.status,
      version: raw.version,
      deletedAt: raw.deletedAt ?? null,
      shareToken: raw.shareToken ?? null,
      events: Array.isArray(raw.events)
        ? raw.events.map((e) => ({
            id: e.id,
            date: e.date,
            type: e.type,
            amountCents: e.amountCents,
            order: e.order,
            note: e.note ?? "",
          }))
        : null,
    };
    return validateLoan(safe, { allowFuture: true });
  }
  if (raw?.schemaVersion != null) throw Error("帳目版本不支援");
  if (
    !raw ||
    !Array.isArray(raw.records) ||
    !raw.records.length ||
    raw.records.length > 1500
  )
    throw Error("舊帳目格式無效");
  if (
    !Number.isFinite(raw.totalInterest) ||
    raw.totalInterest < 0 ||
    raw.records.some(
      (r) => !Number.isFinite(r.change) || !Number.isFinite(r.principalAfter),
    )
  )
    throw Error("舊帳目金額不完整，請保留原始備份後核對");
  const loan = {
    schemaVersion: SCHEMA,
    id,
    name: raw.name,
    annualRate: raw.annualRate,
    status: "active",
    version: 0,
    deletedAt: null,
    shareToken: null,
    events: raw.records.map((r, i) => ({
      id: `legacy-${i}`,
      date: r.date,
      type: r.change > 0 ? "borrow" : r.change < 0 ? "repay" : "checkpoint",
      amountCents: Math.round(Math.abs(r.change) * 100),
      order: i,
      note: "",
    })),
  };
  return validateLoan(loan, { allowFuture: true });
}
export function legacyDifference(raw, loan) {
  if (raw.schemaVersion === SCHEMA) return null;
  const last = raw.records.at(-1),
    result = calculate(loan, last.date);
  return {
    principalCents: result.principal - Math.round(last.principalAfter * 100),
    interestCents: result.interest - Math.round(raw.totalInterest * 100),
    date: last.date,
  };
}
export function projectShare(loan) {
  return {
    schemaVersion: SCHEMA,
    name: loan.name,
    annualRate: loan.annualRate,
    status: loan.status,
    version: loan.version,
    active: !loan.deletedAt && !!loan.shareToken,
    events: loan.events.map(({ id, date, type, amountCents, order }) => ({
      id,
      date,
      type,
      amountCents,
      order,
      note: "",
    })),
  };
}
export function createBackup(loans) {
  return {
    format: "loan-ledger-backup",
    schemaVersion: SCHEMA,
    exportedAt: new Date().toISOString(),
    loans,
  };
}
export function parseBackup(text) {
  if (text.length > 20 * 1024 * 1024) throw Error("備份檔案超過 20 MB");
  const data = JSON.parse(text);
  if (
    data.format !== "loan-ledger-backup" ||
    data.schemaVersion !== SCHEMA ||
    !Array.isArray(data.loans) ||
    data.loans.length > 1000
  )
    throw Error("不是支援的帳本備份");
  const ids = new Set();
  return data.loans.map((raw) => {
    const loan = normalizeLoan(raw);
    if (ids.has(loan.id)) throw Error("備份內有重複帳目");
    ids.add(loan.id);
    // Never restore a public capability URL from a backup.
    return { ...loan, shareToken: null };
  });
}
export function csv(loan, asOf = today()) {
  const r = calculate(loan, asOf);
  const cell = (v) =>
    '"' +
    String(v)
      .replace(/^(?:\s*[=+\-@]|[\t\r])/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    ["帳目", loan.name],
    ["年利率 (%)", loan.annualRate * 100],
    ["查詢日期", asOf],
    ["未還本金", r.principal / 100],
    ["未收利息", r.interest / 100],
    [],
    ["日期", "類型", "金額", "剩餘本金", "當期利息", "天數"],
  ];
  for (const e of r.history)
    rows.push([
      e.date,
      TYPES[e.type],
      e.amountCents / 100,
      e.principalAfter / 100,
      e.periodInterest / 100,
      e.days,
    ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
