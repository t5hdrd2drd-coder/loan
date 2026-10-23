import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDocFromServer,
} from "firebase/firestore";
import { firebaseConfig, OWNER_UID } from "./config.js";
import { normalizeLoan } from "./core.js";
import { commitLoan } from "./repository.js";
const app = initializeApp(firebaseConfig),
  auth = getAuth(app),
  db = getFirestore(app);
const persistence = setPersistence(auth, browserLocalPersistence);
export const ready = !!OWNER_UID;
export const ownerUid = OWNER_UID;
export const observeAuth = (fn) =>
  onAuthStateChanged(auth, (user) =>
    fn(user, !!user && !!OWNER_UID && user.uid === OWNER_UID),
  );
export async function login() {
  await persistence;
  await signInWithPopup(auth, new GoogleAuthProvider());
}
export const logout = () => signOut(auth);
export const subscribe = (fn, error) =>
  onSnapshot(
    collection(db, "loans"),
    { includeMetadataChanges: true },
    (snap) =>
      fn(
        snap.docs.map((d) => ({ ...d.data(), id: d.id })),
        { fromCache: snap.metadata.fromCache },
      ),
    error,
  );
export async function readShare(token) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw Error("分享連結無效");
  const snap = await getDocFromServer(doc(db, "shares", token));
  if (!snap.exists() || !snap.data().active)
    throw Error("此分享連結已停用或不存在");
  const data = snap.data();
  return normalizeLoan({
    ...data,
    id: "shared",
    deletedAt: null,
    shareToken: null,
  });
}
export const saveLoan = (candidate, expectedVersion, options) =>
  commitLoan(db, candidate, expectedVersion, options);
