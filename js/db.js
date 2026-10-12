// طبقة التعامل مع Firestore — كل قراءة/كتابة للبيانات تمر من هنا.
// لا تُنشأ المجموعات يدويًا: Firestore ينشئها عند أول حفظ.
import {
  db, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, runTransaction, serverTimestamp,
} from "./firebase.js";
import { newDayDoc } from "./services-logic.js";

export const COL = Object.freeze({
  PEOPLE: "people",
  ASSIGNMENTS: "assignments",
  DAILY: "daily_services",
  SETTINGS: "settings",
});

const withId = (snap) => ({ id: snap.id, ...snap.data() });

async function listAll(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(withId);
}

async function getById(name, id) {
  const snap = await getDoc(doc(db, name, id));
  return snap.exists() ? withId(snap) : null;
}

async function create(name, data, id = null) {
  const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (id) {
    await setDoc(doc(db, name, id), payload);
    return id;
  }
  const ref = await addDoc(collection(db, name), payload);
  return ref.id;
}

async function patch(name, id, data) {
  await updateDoc(doc(db, name, id), { ...data, updatedAt: serverTimestamp() });
}

async function remove(name, id) {
  await deleteDoc(doc(db, name, id));
}

// ---------- الأفراد ----------
// لا حذف للأفراد: التعطيل فقط (isActive=false) حفاظًا على السجل التاريخي.
export const peopleApi = {
  list: () => listAll(COL.PEOPLE),
  get: (id) => getById(COL.PEOPLE, id),
  add: (p) =>
    create(COL.PEOPLE, {
      name: String(p.name).trim(),
      isDriver: !!p.isDriver,
      isActive: p.isActive !== false,
      notes: p.notes || "",
    }),
  update: (id, data) => patch(COL.PEOPLE, id, data),
  setActive: (id, isActive) => patch(COL.PEOPLE, id, { isActive: !!isActive }),
};

// ---------- التعيينات ----------
// ملاحظة: التصفية حسب المدة (startDate/endDate) تتم في المتصفح لأن Firestore
// لا يسمح بشرطي مدى على حقلين مختلفين. حجم البيانات الشخصية صغير فلا مشكلة.
export const assignmentsApi = {
  list: () => listAll(COL.ASSIGNMENTS),
  get: (id) => getById(COL.ASSIGNMENTS, id),
  add: (a) => create(COL.ASSIGNMENTS, a),
  update: (id, data) => patch(COL.ASSIGNMENTS, id, data),
  remove: (id) => remove(COL.ASSIGNMENTS, id),
};

// ---------- الأيام (وثيقة واحدة لكل يوم، المعرّف = YYYY-MM-DD) ----------
export const dailyApi = {
  get: (date) => getById(COL.DAILY, date),
  // كل الأيام المحفوظة (بيانات شخصية صغيرة؛ تُستخدم لحساب ترتيب المرشحين من السجل)
  list: () => listAll(COL.DAILY),
  // ينشئ مسودات للتواريخ المعطاة فقط إن لم تكن موجودة. لا يستبدل ولا يمسّ أي يوم موجود.
  createDrafts: (dates) =>
    runTransaction(db, async (tx) => {
      const refs = dates.map((d) => doc(db, COL.DAILY, d));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const created = [];
      snaps.forEach((snap, i) => {
        if (snap.exists()) return;
        tx.set(refs[i], { ...newDayDoc(dates[i]), updatedAt: serverTimestamp() });
        created.push(dates[i]);
      });
      return { created, skipped: dates.length - created.length };
    }),
  // يُنشئ الوثيقة عند أول حفظ ويدمج الحقول لاحقًا
  save: (date, data) =>
    setDoc(doc(db, COL.DAILY, date), { ...data, date, updatedAt: serverTimestamp() }, { merge: true }),
  listRange: async (fromDate, toDate) => {
    const q = query(
      collection(db, COL.DAILY),
      where("date", ">=", fromDate),
      where("date", "<=", toDate),
      orderBy("date")
    );
    const snap = await getDocs(q);
    return snap.docs.map(withId);
  },
  remove: (date) => remove(COL.DAILY, date),
};

// ---------- الإعدادات (وثيقة لكل مفتاح) ----------
export const settingsApi = {
  get: (key) => getById(COL.SETTINGS, key),
  set: (key, value) =>
    setDoc(doc(db, COL.SETTINGS, key), { ...value, updatedAt: serverTimestamp() }, { merge: true }),
};
