// ============================================================
// إعداد Firebase — هذا هو الملف الوحيد الذي يحتوي الإعداد ونسخة SDK.
// بقية الملفات تستورد من هنا فقط ولا تتعامل مع روابط Firebase مباشرة.
// المشروع: duty-planner-e9fdc  (Authentication + Firestore فقط)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdV2ZZOY_lPwVy7WIdny4SrPcs54XQP_U",
  authDomain: "duty-planner-e9fdc.firebaseapp.com",
  projectId: "duty-planner-e9fdc",
  storageBucket: "duty-planner-e9fdc.firebasestorage.app",
  messagingSenderId: "381609590309",
  appId: "1:381609590309:web:a71ebc77e99f9151fc09cc",
};

export const PROJECT_ID = firebaseConfig.projectId;
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
  serverTimestamp,
};
