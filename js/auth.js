// المصادقة: تسجيل الدخول والخروج ومراقبة حالة المستخدم (بريد + كلمة مرور).
import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "./firebase.js";

const MESSAGES = {
  "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة.",
  "auth/wrong-password": "البريد أو كلمة المرور غير صحيحة.",
  "auth/user-not-found": "البريد أو كلمة المرور غير صحيحة.",
  "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
  "auth/missing-password": "أدخل كلمة المرور.",
  "auth/user-disabled": "هذا الحساب معطّل.",
  "auth/too-many-requests": "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
  "auth/network-request-failed": "تعذّر الاتصال بالإنترنت.",
  "auth/operation-not-allowed": "تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase.",
};

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export function logout() {
  return signOut(auth);
}

export function authErrorMessage(err) {
  return MESSAGES[err && err.code] || "تعذّر تسجيل الدخول. حاول مرة أخرى.";
}
