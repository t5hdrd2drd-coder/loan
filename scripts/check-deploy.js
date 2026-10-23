import { readFileSync } from "node:fs";
import { OWNER_UID } from "../src/config.js";
const rules = readFileSync("firestore.rules", "utf8");
if (
  !OWNER_UID ||
  OWNER_UID === "REPLACE_WITH_OWNER_UID" ||
  !rules.includes(`request.auth.uid == '${OWNER_UID}'`) ||
  rules.includes("REPLACE_WITH_OWNER_UID")
) {
  console.error(
    "正式發布已阻止：請先在 src/config.js 與 firestore.rules 設定相同的管理者 Firebase UID。",
  );
  process.exit(1);
}
console.log(
  "管理者 UID 與規則設定一致。請確認 Firebase Google 登入與授權網域也已啟用。",
);
