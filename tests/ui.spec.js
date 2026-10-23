import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { calculate } from "../src/core.js";
const demo = "/loan/?demo=1";
const dialog = (page) => page.getByRole("dialog");
async function createLoan(
  page,
  name = "測試・借貸",
  rate = "0",
  amount = "1000",
) {
  await page
    .getByRole("button", { name: "新增借貸", exact: true })
    .first()
    .click();
  await dialog(page).getByLabel("借款人／項目名稱").fill(name);
  await dialog(page).getByLabel("初次借出金額（元）").fill(amount);
  await dialog(page).getByLabel("年利率（%）").fill(rate);
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await expect(dialog(page).locator(".preview")).toContainText(name);
  await dialog(page).getByRole("button", { name: "確認並儲存" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function record(page, type, amount) {
  await page.getByRole("button", { name: "借出／還本金", exact: true }).click();
  await dialog(page).getByRole("radio", { name: type, exact: true }).check();
  await dialog(page).getByLabel("金額（元）").fill(amount);
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await dialog(page).getByRole("button", { name: "確認並儲存" }).click();
  await expect(dialog(page)).not.toBeVisible();
}
test("desktop overview and mobile layout are complete, responsive and free of page errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(demo);
  await expect(page.locator(".loan-card")).toHaveCount(4);
  await expect(
    page.getByText("示範模式，所有修改", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "查看 陳先生・資金週轉" }).click();
  await expect(page.locator(".record")).toHaveCount(3);
  await page.screenshot({
    path: "artifacts/detail-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "借出／還本金", exact: true }).click();
  await dialog(page)
    .getByRole("radio", { name: "還本金", exact: true })
    .check();
  await dialog(page).getByLabel("金額（元）").fill("1000");
  await page.screenshot({
    path: "artifacts/repayment-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("borrow/repay use positive amounts; preview and full payoff work; closure locks editing", async ({
  page,
}) => {
  await page.goto(demo);
  await createLoan(page);
  await record(page, "還本金", "400");
  await expect(page.locator(".record")).toHaveCount(2);
  await expect(page.locator(".stats").first()).toContainText("600");
  await record(page, "借出", "200");
  await expect(page.locator(".stats").first()).toContainText("800");
  await record(page, "還本金", "800");
  await page.getByRole("button", { name: "結清帳目", exact: true }).click();
  await dialog(page).getByRole("button", { name: "確認結清帳目" }).click();
  await expect(
    page.getByRole("button", { name: "重新開啟帳目" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "借出／還本金", exact: true }),
  ).toHaveCount(0);
});
test("date query does not append records and overpayment is rejected", async ({
  page,
}) => {
  await page.goto(demo);
  await createLoan(page);
  await page.getByLabel("計算至哪一天？").fill("2020-01-01");
  await expect(page.locator(".record")).toHaveCount(0);
  await page.getByLabel("計算至哪一天？").fill("2030-01-01");
  await expect(page.locator(".record")).toHaveCount(1);
  await page.getByRole("button", { name: "借出／還本金", exact: true }).click();
  await dialog(page)
    .getByRole("radio", { name: "還本金", exact: true })
    .check();
  await dialog(page).getByLabel("金額（元）").fill("1001");
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("超過當時餘額");
  await expect(
    dialog(page).getByRole("button", { name: "確認並儲存" }),
  ).toHaveCount(0);
});
test("edit preview recomputes; deleting an invalid foundational record is blocked", async ({
  page,
}) => {
  await page.goto(demo);
  await createLoan(page);
  await record(page, "還本金", "400");
  await page.getByRole("button", { name: /修改 .*借出/ }).click();
  await dialog(page).getByLabel("金額（元）").fill("2000");
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await expect(dialog(page).locator(".preview")).toContainText("1,600");
  await dialog(page).getByRole("button", { name: "確認並儲存" }).click();
  await expect(page.locator(".stats")).toContainText("1,600");
  await page.getByRole("button", { name: /刪除 .*借出/ }).click();
  await expect(page.locator("#toast")).toContainText("超過當時餘額");
  await expect(page.locator(".record")).toHaveCount(2);
});
test("backup downloads valid JSON; duplicate import skips by default; CSV exports", async ({
  page,
}) => {
  await page.goto(demo);
  await page.getByRole("button", { name: "備份與還原", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await dialog(page)
    .getByRole("button", { name: "下載完整 JSON 備份" })
    .click();
  const dl = await downloadPromise,
    raw = JSON.parse(await readFile(await dl.path(), "utf8"));
  expect(raw.loans.length).toBe(4);
  expect(raw.format).toBe("loan-ledger-backup");
  await dialog(page)
    .locator("#import-file")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(raw)),
    });
  await expect(dialog(page).locator(".import-list li")).toHaveCount(4);
  await dialog(page).getByRole("button", { name: "確認還原 4 筆帳目" }).click();
  await expect(page.locator("#toast")).toContainText("所有帳目都已存在");
  await dialog(page).getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "查看 陳先生・資金週轉" }).click();
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 CSV" }).click();
  expect((await csvPromise).suggestedFilename()).toMatch(/\.csv$/);
});
test("trash restores data; sharing preview excludes private notes and tokens rotate", async ({
  page,
}) => {
  await page.goto(demo);
  await createLoan(page);
  await page.getByRole("button", { name: "分享明細", exact: true }).click();
  await expect(dialog(page).locator(".share-preview")).toContainText(
    "不包含私人備註",
  );
  await dialog(page).getByRole("button", { name: "產生專屬連結" }).click();
  const first = await dialog(page).getByLabel("專屬分享連結").inputValue();
  expect(first).toMatch(/#share=[a-f0-9]{48}$/);
  await dialog(page)
    .getByRole("button", { name: "重新產生", exact: true })
    .click();
  await expect(dialog(page).getByLabel("專屬分享連結")).not.toHaveValue(first);
  await dialog(page).getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "移至回收區", exact: true }).click();
  await dialog(page).getByRole("button", { name: "確認移至回收區" }).click();
  await expect(
    page.getByRole("button", { name: "還原帳目", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "還原帳目", exact: true }).click();
  await dialog(page).getByRole("button", { name: "確認還原帳目" }).click();
  await expect(
    page.getByRole("button", { name: "借出／還本金", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "分享明細", exact: true }).click();
  await expect(
    dialog(page).getByRole("button", { name: "產生專屬連結" }),
  ).toBeVisible();
});
const fixture = {
  schemaVersion: 2,
  id: "shared",
  name: "唯讀借款人",
  annualRate: 0.023,
  status: "active",
  version: 1,
  deletedAt: null,
  shareToken: null,
  events: [
    {
      id: "e",
      date: "2026-01-01",
      type: "borrow",
      amountCents: 100000,
      order: 0,
      note: "",
    },
  ],
};
async function mockStore(page, extra = "") {
  await page.route("**/src/store.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const ready=true;export const ownerUid='owner';export const observeAuth=fn=>{fn({uid:'owner',displayName:'我'},true);return ()=>{};};export const subscribe=fn=>{fn([${JSON.stringify(fixture)}]);return ()=>{};};export const readShare=async()=>(${JSON.stringify(fixture)});export const login=async()=>{};export const logout=async()=>{};${extra || "export const saveLoan=async()=>{};"}`,
    }),
  );
}
test("public share is read-only and never exposes administrator actions", async ({
  page,
}) => {
  await mockStore(page);
  await page.goto("/loan/#share=" + "a".repeat(48));
  await expect(
    page.getByRole("heading", { name: "唯讀借款人", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("專屬唯讀明細", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "借出／還本金" })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-action="edit-event"]')).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "匯出 CSV" })).toBeVisible();
});
test("failed save and conflict preserve form values and do not show success", async ({
  page,
}) => {
  await mockStore(
    page,
    "export const saveLoan=async()=>{throw Error('這筆帳目已在其他裝置更新，請重新開啟');};",
  );
  await page.goto("/loan/");
  await page.getByRole("button", { name: "查看 唯讀借款人" }).click();
  await page.getByRole("button", { name: "借出／還本金", exact: true }).click();
  await dialog(page).getByLabel("金額（元）").fill("100");
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await dialog(page).getByRole("button", { name: "確認並儲存" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("其他裝置更新");
  await expect(dialog(page).getByLabel("金額（元）")).toHaveValue("100");
  await expect(
    dialog(page).getByRole("button", { name: "確認並儲存" }),
  ).toBeEnabled();
});

test("JSON restore adds validated data, malformed files are blocked, and private text cannot become HTML", async ({
  page,
}) => {
  await page.goto(demo);
  await page.getByRole("button", { name: "備份與還原", exact: true }).click();
  const file = dialog(page).locator("#import-file");
  await file.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"loans":[]}'),
  });
  await expect(dialog(page).getByRole("alert")).toContainText(
    "不是支援的帳本備份",
  );
  await expect(
    dialog(page).getByRole("button", { name: /確認還原/ }),
  ).toHaveCount(0);
  const name = "<img src=x onerror=alert(1)>";
  const backup = {
    format: "loan-ledger-backup",
    schemaVersion: 2,
    loans: [{ ...fixture, id: "restored", name }],
  };
  await file.setInputFiles({
    name: "good.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(dialog(page).locator(".import-list")).toContainText(name);
  await expect(dialog(page).locator("img")).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "確認還原 1 筆帳目" }).click();
  await expect(
    page.getByRole("button", { name: "查看 " + name }),
  ).toBeVisible();
  await expect(page.locator(".loan-card")).toHaveCount(5);
});

test("interest is retained after principal payoff, waiver permits closure, and reopening preserves history", async ({
  page,
}) => {
  await page.goto(demo);
  await page.getByRole("button", { name: "查看 王先生・短期借款" }).click();
  await page.getByRole("button", { name: "結清帳目", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("本金與未收利息都為零");
  await page.getByRole("button", { name: "處理利息", exact: true }).click();
  await dialog(page)
    .getByRole("radio", { name: "免收利息", exact: true })
    .check();
  await dialog(page).getByLabel("金額（元）").fill("49.32");
  await dialog(page).getByRole("button", { name: "預覽變更" }).click();
  await dialog(page).getByRole("button", { name: "確認並儲存" }).click();
  await page.getByRole("button", { name: "結清帳目", exact: true }).click();
  await dialog(page).getByRole("button", { name: "確認結清帳目" }).click();
  await page.getByRole("button", { name: "重新開啟帳目", exact: true }).click();
  await dialog(page).getByRole("button", { name: "確認重新開啟帳目" }).click();
  await expect(page.locator(".record")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "借出／還本金", exact: true }),
  ).toBeVisible();
});

test("legacy migration requires explicit review before writing and preserves checkpoint history", async ({
  page,
}) => {
  const legacy = {
    id: "old",
    name: "舊版帳目",
    annualRate: 0.023,
    totalInterest: 0,
    records: [
      { date: "2026-01-01", change: 1000, principalAfter: 1000 },
      { date: "2026-01-31", change: 0, principalAfter: 1000 },
    ],
  };
  await page.route("**/src/store.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `let callback, raw=${JSON.stringify(legacy)};export const ready=true;export const observeAuth=fn=>{fn({uid:'owner'},true);return ()=>{};};export const subscribe=fn=>{callback=fn;fn([raw]);return ()=>{};};export const saveLoan=async next=>{window.__writes=(window.__writes||0)+1;raw={...next,version:1};callback([raw]);};`,
    }),
  );
  await page.goto("/loan/");
  await page.getByRole("button", { name: "核對舊資料", exact: true }).click();
  await expect(dialog(page).locator(".import-list")).toContainText(
    "利息差 $1.89",
  );
  await dialog(page)
    .getByRole("button", { name: "備份並升級", exact: true })
    .click();
  await expect(dialog(page).getByRole("alert")).toContainText("請先核對");
  expect(await page.evaluate(() => window.__writes || 0)).toBe(0);
  await dialog(page).getByRole("checkbox").check();
  await dialog(page)
    .getByRole("button", { name: "備份並升級", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  expect(await page.evaluate(() => window.__writes)).toBe(1);
  await page.getByRole("button", { name: "查看 舊版帳目" }).click();
  await expect(page.locator(".record")).toHaveCount(2);
  await expect(page.locator(".records")).toContainText("歷史查詢");
});

test("rollout review can read and back up original data but does not expose mutations or imports", async ({
  page,
}) => {
  await mockStore(page);
  const { readFileSync } = await import("node:fs");
  const html = readFileSync("index.html", "utf8").replace(
    '<html lang="zh-Hant">',
    '<html lang="zh-Hant" data-preview="review">',
  );
  await page.route("**/loan/review/", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/loan/review/");
  await expect(
    page.getByText("這是上線前的唯讀預覽", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增借貸", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "查看 唯讀借款人" }).click();
  await expect(page.getByRole("button", { name: "借出／還本金" })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-action="edit-event"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "匯出 CSV" })).toBeVisible();
  await page.getByRole("button", { name: "帳目備份", exact: true }).click();
  await expect(dialog(page).locator("#import-file")).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await dialog(page)
    .getByRole("button", { name: "下載完整 JSON 備份" })
    .click();
  const dl = await pending,
    raw = JSON.parse(await readFile(await dl.path(), "utf8"));
  expect(raw.loans[0].id).toBe(fixture.id);
});
