import { doc, runTransaction, getDocFromServer } from "firebase/firestore";
import { validateLoan, projectShare } from "./core.js";

export async function commitLoan(
  db,
  candidate,
  expectedVersion,
  { remove = false } = {},
) {
  validateLoan(candidate, { allowFuture: true });
  try {
    return await runTransaction(db, async (tx) => {
      const ref = doc(db, "loans", candidate.id),
        snap = await tx.get(ref);
      const old = snap.exists() ? snap.data() : null,
        version = old?.version ?? 0;
      if (
        (expectedVersion === null && old) ||
        (expectedVersion !== null && (!old || version !== expectedVersion))
      )
        throw Error(
          "這筆帳目已在其他裝置更新。請重新開啟後再修改，避免覆蓋資料。",
        );
      const previousToken = old?.shareToken;
      if (remove) {
        tx.delete(ref);
        if (previousToken) tx.delete(doc(db, "shares", previousToken));
        return;
      }
      const next = { ...candidate, version: version + 1 };
      tx.set(ref, next);
      if (
        previousToken &&
        (previousToken !== next.shareToken || next.deletedAt)
      )
        tx.delete(doc(db, "shares", previousToken));
      if (next.shareToken && !next.deletedAt)
        tx.set(doc(db, "shares", next.shareToken), projectShare(next));
      return next;
    });
  } catch (error) {
    // Concurrent web transactions can hit the version rule before the SDK's
    // update-time precondition. Verify the latest version before reporting an
    // actual authorization error; never retry a stale user's edit automatically.
    if (error.code === "permission-denied") {
      let conflict = false;
      try {
        const current = await getDocFromServer(doc(db, "loans", candidate.id));
        conflict =
          expectedVersion === null
            ? current.exists()
            : !current.exists() ||
              (current.data().version ?? 0) !== expectedVersion;
      } catch {
        /* A genuine permission failure must remain a permission error. */
      }
      if (conflict)
        throw Error(
          "這筆帳目已在其他裝置更新。請重新開啟後再修改，避免覆蓋資料。",
        );
    }
    throw error;
  }
}
