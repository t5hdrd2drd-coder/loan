import test from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  validateLoan,
  normalizeLoan,
  legacyDifference,
  projectShare,
  createBackup,
  parseBackup,
  csv,
  parseMoney,
  days,
} from "../src/core.js";
const event = (date, type, amountCents, order = 0) => ({
  id: `e${order}`,
  date,
  type,
  amountCents,
  order,
  note: "私人：不應分享",
});
const loan = (events, annualRate = 0.023) => ({
  schemaVersion: 2,
  id: "test",
  name: "測試帳目",
  annualRate,
  status: "active",
  version: 1,
  deletedAt: null,
  shareToken: null,
  events,
});
test("100,000 at 2.3% for 30 days is 189.04; queries do not mutate data", () => {
  const l = loan([event("2026-01-01", "borrow", 10000000)]),
    before = JSON.stringify(l);
  assert.equal(calculate(l, "2026-01-31").interest, 18904);
  assert.equal(JSON.stringify(l), before);
});
test("partial repayment splits periods; zero principal stops new interest but preserves prior interest", () => {
  const l = loan([
    event("2026-01-01", "borrow", 10000000),
    event("2026-01-31", "repay", 5000000, 1),
    event("2026-03-02", "repay", 5000000, 2),
  ]);
  const r = calculate(l, "2026-03-02");
  assert.equal(r.principal, 0);
  assert.equal(r.interest, 28356);
  assert.equal(calculate(l, "2030-01-01").interest, 28356);
  l.events.push(
    event("2026-03-05", "interest", 10000, 3),
    event("2026-03-06", "waive", 18356, 4),
  );
  l.status = "closed";
  assert.doesNotThrow(() => validateLoan(l));
  assert.equal(calculate(l, "2030-01-01").total, 0);
});
test("same-day order is stable; new borrowing takes effect after prior period interest", () => {
  const l = loan(
    [
      event("2026-01-01", "borrow", 100000),
      event("2026-01-01", "repay", 50000, 1),
      event("2026-01-02", "borrow", 50000, 2),
    ],
    0.365,
  );
  assert.equal(calculate(l, "2026-01-02").interest, 50);
  assert.equal(calculate(l, "2026-01-03").interest, 150);
});
test("editing early history recomputes later interest and rejects overpayment", () => {
  const l = loan(
    [
      event("2026-01-01", "borrow", 100000),
      event("2026-01-11", "repay", 50000, 1),
    ],
    0.365,
  );
  assert.equal(calculate(l, "2026-01-21").interest, 1500);
  l.events[0].amountCents = 200000;
  assert.equal(calculate(l, "2026-01-21").interest, 3500);
  l.events[0].amountCents = 40000;
  assert.throws(() => validateLoan(l), /超過當時餘額/);
});
test("query dates before lending, zero rate, leap day, cross year use actual days / 365", () => {
  assert.equal(days("2024-02-28", "2024-03-01"), 2);
  assert.equal(days("2025-12-31", "2026-01-01"), 1);
  const l = loan([event("2024-02-28", "borrow", 100000)], 0.365);
  assert.equal(calculate(l, "2024-03-01").interest, 200);
  assert.equal(calculate(l, "2024-02-27").total, 0);
  l.annualRate = 0;
  assert.equal(calculate(l, "2030-01-01").interest, 0);
});
test("checkpoint segmentation does not compound or accumulate rounding error", () => {
  const a = loan([event("2026-01-01", "borrow", 12345)]),
    b = structuredClone(a);
  for (let i = 2; i <= 30; i++)
    b.events.push(
      event(`2026-01-${String(i).padStart(2, "0")}`, "checkpoint", 0, i),
    );
  assert.equal(
    calculate(a, "2026-01-31").interest,
    calculate(b, "2026-01-31").interest,
  );
});
test("reject invalid dates, excessive precision, future actual events, invalid types and duplicate order", () => {
  assert.throws(() => parseMoney("-1"));
  assert.throws(() => parseMoney("1.001"));
  assert.equal(parseMoney("1000.10"), 100010);
  for (const e of [
    event("2026-02-30", "borrow", 100),
    event("2999-01-01", "borrow", 100),
    event("2026-01-01", "toString", 100),
    event("2026-01-01", "borrow", 0),
  ])
    assert.throws(() => validateLoan(loan([e])));
  assert.throws(
    () =>
      validateLoan(
        loan([
          event("2026-01-01", "borrow", 100),
          { ...event("2026-01-02", "borrow", 100), id: "other" },
        ]),
      ),
    /順序/,
  );
});
test("interest settlement cannot exceed accrued amount or be invalidated by a historical edit", () => {
  const l = loan(
    [
      event("2026-01-01", "borrow", 100000),
      event("2026-01-11", "interest", 1001, 1),
    ],
    0.365,
  );
  assert.throws(() => validateLoan(l), /超過未收利息/);
  l.events[1].amountCents = 1000;
  assert.doesNotThrow(() => validateLoan(l));
  l.events[0].amountCents = 50000;
  assert.throws(() => validateLoan(l));
});
test("legacy conversion preserves checkpoints, order, principal and original interest calculation", () => {
  const raw = {
    id: "loan_1",
    name: "舊帳",
    annualRate: 0.023,
    totalInterest: ((100000 * 0.023) / 365) * 30,
    records: [
      { date: "2026-01-01", change: 100000, principalAfter: 100000 },
      { date: "2026-01-31", change: 0, principalAfter: 100000 },
    ],
  };
  const l = normalizeLoan(raw);
  assert.equal(l.events[1].type, "checkpoint");
  assert.deepEqual(legacyDifference(raw, l), {
    principalCents: 0,
    interestCents: 0,
    date: "2026-01-31",
  });
  raw.totalInterest = 0;
  assert.equal(legacyDifference(raw, l).interestCents, 18904);
});
test("public projections exclude private notes, identifiers and share credentials; backups revoke tokens", () => {
  const l = loan([event("2026-01-01", "borrow", 10000)]);
  l.shareToken = "a".repeat(48);
  const p = projectShare(l);
  assert.equal(p.events[0].note, "");
  assert.ok(!("id" in p));
  assert.ok(!("shareToken" in p));
  assert.ok(!JSON.stringify(p).includes("私人"));
  const restored = parseBackup(JSON.stringify(createBackup([l])));
  assert.equal(restored[0].shareToken, null);
  assert.equal(restored[0].events[0].note, l.events[0].note);
  assert.throws(
    () => parseBackup(JSON.stringify(createBackup([l, l]))),
    /重複/,
  );
});
test("CSV is UTF-8 with BOM, has escaped formula cells, excludes private notes", () => {
  const l = loan([event("2026-01-01", "borrow", 10000)]);
  l.name = '  =HYPERLINK("x")';
  const text = csv(l, "2026-01-02");
  assert.ok(text.startsWith("\ufeff"));
  assert.ok(text.includes("'  =HYPERLINK"));
  assert.ok(!text.includes("私人"));
  assert.ok(text.includes("未還本金"));
});
