// تهيئة الأفراد الأولية — تُنفَّذ مرة واحدة فقط وآمنة من التكرار:
//  1) إن وُجدت علامة settings/initialSeed لا يحدث أي شيء إطلاقًا.
//  2) المعرّفات ثابتة (p_seed_01 ...) فلا يمكن أن يتكرر الفرد حتى لو فُتح التطبيق من تبويبين.
//  3) لا يُستبدل أي سجل موجود: يُنشأ فقط ما هو غير موجود.
//  4) كل شيء داخل Transaction واحدة.
import { db, doc, runTransaction, serverTimestamp } from "./firebase.js";
import { COL } from "./db.js";
import { SEED_PEOPLE, SEED_MARKER_KEY, seedPersonId } from "./seed-data.js";

export async function ensureInitialPeople() {
  const markerRef = doc(db, COL.SETTINGS, SEED_MARKER_KEY);
  const personRefs = SEED_PEOPLE.map((_, i) => doc(db, COL.PEOPLE, seedPersonId(i)));

  return runTransaction(db, async (tx) => {
    // كل القراءات أولًا ثم الكتابات (شرط Firestore Transactions)
    const marker = await tx.get(markerRef);
    if (marker.exists()) return { seeded: false, created: 0 };

    const snaps = await Promise.all(personRefs.map((ref) => tx.get(ref)));
    let created = 0;
    snaps.forEach((snap, i) => {
      if (snap.exists()) return; // لا نستبدل سجلًا موجودًا
      tx.set(personRefs[i], {
        name: SEED_PEOPLE[i].name,
        isDriver: SEED_PEOPLE[i].isDriver,
        isActive: true,
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created += 1;
    });

    tx.set(markerRef, {
      version: 1,
      peopleCreated: created,
      completedAt: serverTimestamp(),
    });
    return { seeded: true, created };
  });
}
