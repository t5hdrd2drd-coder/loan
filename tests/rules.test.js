import test, { before, after } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import { projectShare } from "../src/core.js";
import { OWNER_UID } from "../src/config.js";
let env;
const token = "a".repeat(48),
  loan = {
    schemaVersion: 2,
    id: "test",
    name: "私帳",
    annualRate: 0.023,
    status: "active",
    version: 1,
    deletedAt: null,
    shareToken: token,
    events: [
      {
        id: "e",
        date: "2026-01-01",
        type: "borrow",
        amountCents: 100000,
        order: 0,
        note: "私人",
      },
    ],
  };
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-loan-ledger",
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: readFileSync("firestore.rules", "utf8").replaceAll(
        OWNER_UID || "REPLACE_WITH_OWNER_UID",
        "owner",
      ),
    },
  });
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "loans", "test"), loan);
    await setDoc(doc(c.firestore(), "shares", token), projectShare(loan));
  });
});
after(async () => env?.cleanup());
test("anonymous and unrelated signed-in users cannot read/list/write private loans", async () => {
  for (const ctx of [
    env.unauthenticatedContext(),
    env.authenticatedContext("borrower"),
  ]) {
    const db = ctx.firestore();
    await assertFails(getDoc(doc(db, "loans", "test")));
    await assertFails(getDocs(collection(db, "loans")));
    await assertFails(
      setDoc(doc(db, "loans", "evil"), { ...loan, id: "evil" }),
    );
    await assertFails(deleteDoc(doc(db, "loans", "test")));
  }
});
test("borrower can only get a known active share and cannot list or mutate shares", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "shares", token)));
  await assertFails(getDocs(collection(db, "shares")));
  await assertFails(updateDoc(doc(db, "shares", token), { name: "改名" }));
  await assertFails(deleteDoc(doc(db, "shares", token)));
  await assertFails(getDoc(doc(db, "shares", "guess")));
});
test("owner can list and update loans only with the next version, atomically syncing public projection", async () => {
  const db = env.authenticatedContext("owner").firestore();
  await assertSucceeds(getDocs(collection(db, "loans")));
  await assertFails(updateDoc(doc(db, "loans", "test"), { name: "stale" }));
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      const ref = doc(db, "loans", "test"),
        s = await tx.get(ref);
      const next = { ...s.data(), version: 2, name: "更新" };
      tx.set(ref, next);
      tx.set(doc(db, "shares", token), projectShare(next));
    }),
  );
  await assertFails(updateDoc(doc(db, "loans", "test"), { version: 2 }));
});
test("disabled and removed shares are no longer readable; owner can migrate legacy loans", async () => {
  const db = env.authenticatedContext("owner").firestore(),
    anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(updateDoc(doc(db, "shares", token), { active: false }));
  await assertFails(getDoc(doc(anon, "shares", token)));
  await assertSucceeds(deleteDoc(doc(db, "shares", token)));
  await assertFails(getDoc(doc(anon, "shares", token)));
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "loans", "legacy"), {
      records: [],
      name: "舊版",
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, "loans", "legacy"), { ...loan, id: "legacy", version: 1 }),
  );
});

test("application transaction rejects concurrent edits, synchronizes redacted shares, rotates and revokes links", async () => {
  const { commitLoan } = await import("../src/repository.js");
  const { default: assert } = await import("node:assert/strict");
  const db = env.authenticatedContext("owner").firestore();
  const anon = env.unauthenticatedContext().firestore();
  const token1 = "b".repeat(48),
    token2 = "c".repeat(48);
  const original = { ...loan, id: "lifecycle", version: 0, shareToken: token1 };
  const created = await commitLoan(db, original, null);
  assert.equal(created.version, 1);
  const shared = await getDoc(doc(anon, "shares", token1));
  assert.equal(shared.data().events[0].note, "");
  assert.ok(!JSON.stringify(shared.data()).includes("私人"));
  const results = await Promise.allSettled([
    commitLoan(db, { ...created, name: "第一台裝置" }, 1),
    commitLoan(db, { ...created, name: "第二台裝置" }, 1),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /其他裝置更新/,
  );
  const latest = (await getDoc(doc(db, "loans", "lifecycle"))).data();
  assert.equal(latest.version, 2);
  assert.equal(
    (await getDoc(doc(anon, "shares", token1))).data().name,
    latest.name,
  );
  const rotated = await commitLoan(db, { ...latest, shareToken: token2 }, 2);
  await assertFails(getDoc(doc(anon, "shares", token1)));
  await assertSucceeds(getDoc(doc(anon, "shares", token2)));
  const deleted = await commitLoan(
    db,
    { ...rotated, deletedAt: new Date().toISOString(), shareToken: null },
    3,
  );
  await assertFails(getDoc(doc(anon, "shares", token2)));
  await commitLoan(db, deleted, 4, { remove: true });
  assert.equal((await getDoc(doc(db, "loans", "lifecycle"))).exists(), false);
});

test("owner-only writes still enforce required fields, bounds, types, ids and public projection whitelist", async () => {
  const db = env.authenticatedContext("owner").firestore();
  for (const patch of [
    { name: 7 },
    { name: "x".repeat(101) },
    { annualRate: -1 },
    { status: "admin" },
    { events: [] },
    { extraData: "pollution" },
    { id: "other" },
    { events: [{ ...loan.events[0], amountCents: -1 }] },
  ]) {
    await assertFails(
      setDoc(doc(db, "loans", "test"), { ...loan, version: 3, ...patch }),
    );
  }
  const missing = { ...loan, id: "missing" };
  delete missing.name;
  await assertFails(setDoc(doc(db, "loans", "missing"), missing));
  const projected = projectShare(loan);
  await assertFails(
    setDoc(doc(db, "shares", "d".repeat(48)), {
      ...projected,
      privateNote: "leak",
    }),
  );
  await assertFails(
    setDoc(doc(db, "shares", "d".repeat(48)), {
      ...projected,
      events: loan.events,
    }),
  );
  await assertFails(
    setDoc(
      doc(
        env.authenticatedContext("borrower").firestore(),
        "roles",
        "borrower",
      ),
      { admin: true },
    ),
  );
});
