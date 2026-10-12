// منطق التعيينات — دوال نقية (بلا Firebase) لسهولة الاختبار وإعادة الاستخدام في المراحل القادمة.
// التواريخ كلها YYYY-MM-DD، والمقارنة النصية بينها صحيحة زمنيًا.
import { addDays, diffDays, formatDisplay, isValidDateStr } from "./dates.js";

// الأنواع المبدئية. لا تفترض أن لها كلها نفس التأثير؛ الخصائص هنا هي مكان التوسعة:
//   longByNature    : يُعامل دائمًا كتعيين طويل حتى لو كان ليوم واحد.
//   pausesWorkDays  : فترته لا تُحسب أيام عمل (تُستخدم في مرحلة الراحة وأيام العمل المتواصلة).
// يُخزَّن اسم النوع العربي نفسه في الحقل type. نوع غير معروف يُعامل كنوع عادي.
export const ASSIGNMENT_TYPES = [
  { id: "مريض" },
  { id: "عطلة", pausesWorkDays: true },
  { id: "إجازة", pausesWorkDays: true },
  { id: "ندوة" },
  { id: "تعيين" },
  { id: "يوم دراسي" },
  { id: "مهمة طويلة", longByNature: true },
  { id: "نقاهة", pausesWorkDays: true },
  { id: "تدريب" },
  { id: "غياب" },
  { id: "تأخر" },
  { id: "مهمة أخرى" },
];

export const typeInfo = (type) => ASSIGNMENT_TYPES.find((t) => t.id === type) || { id: type };

// ---------- خصائص التعيين ----------
// تاريخ النهاية اختياري. التعيين بلا endDate (null أو غائب) = «مستمر بلا نهاية محددة»: لا يُعدّ منتهيًا تلقائيًا أبدًا.
// نمثّله داخليًا بتاريخ بعيد (OPEN_END) كي تعمل كل المقارنات النصية بين التواريخ، ولا يُعرض هذا التاريخ للمستخدم أبدًا:
// استعمل endLabel(a) للعرض. لا حقل لتاريخ رجوع (متوقع أو فعلي) عمدًا.
export const OPEN_END = "9999-12-31";
export const isOpenEnded = (a) => !a.endDate;
export const endOf = (a) => a.endDate || OPEN_END;
export const endLabel = (a) => (isOpenEnded(a) ? "غير محددة" : formatDisplay(a.endDate));
export const coversDate = (a, date) => a.startDate <= date && date <= endOf(a);
// null للمهمة المستمرة (مدتها غير معروفة)
export const durationDays = (a) => (isOpenEnded(a) ? null : diffDays(endOf(a), a.startDate) + 1);

// طويل = أكثر من يوم، أو نوع طويل بطبيعته (مهمة طويلة).
export const isLongAssignment = (a) => !!typeInfo(a.type).longByNature || endOf(a) > a.startDate;

// 'ongoing' جارٍ اليوم | 'upcoming' لم يبدأ | 'ended' انتهى
export function phaseOf(a, today) {
  if (endOf(a) < today) return "ended";
  if (a.startDate > today) return "upcoming";
  return "ongoing";
}

export function daysText(n) {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

// ---------- التحقق ----------
export function validateAssignment(a) {
  const errors = [];
  if (!a.personId) errors.push("اختر الفرد.");
  if (!a.type || !ASSIGNMENT_TYPES.some((t) => t.id === a.type)) errors.push("اختر نوع التعيين.");
  // تاريخ البداية إلزامي. تاريخ النهاية اختياري: إن وُجد وجب أن يكون صحيحًا وغير سابق للبداية.
  const startOk = isValidDateStr(a.startDate);
  if (!startOk) errors.push("تاريخ البداية غير صحيح.");
  if (a.endDate) {
    const endOk = isValidDateStr(a.endDate);
    if (!endOk) errors.push("تاريخ النهاية غير صحيح.");
    else if (startOk && a.endDate < a.startDate) errors.push("تاريخ النهاية قبل تاريخ البداية.");
  }
  return errors;
}

// تعيينات أخرى للفرد نفسه تتقاطع مدتها مع المرشَّح (تُعرض كتحذير فقط ولا تمنع الحفظ).
export function findOverlaps(assignments, candidate, ignoreId = null) {
  return assignments.filter(
    (a) =>
      a.id !== ignoreId &&
      a.personId === candidate.personId &&
      a.startDate <= endOf(candidate) &&
      candidate.startDate <= endOf(a)
  );
}

// نص يشرح للمستخدم كيف سيُعامل التعيين (يظهر أثناء الإدخال).
export function describeEffect({ type, startDate, endDate }) {
  if (!isValidDateStr(startDate)) return "";
  if (!endDate) {
    return (
      "مهمة بلا تاريخ نهاية: تُعدّ مستمرة ولا تنتهي تلقائيًا؛ يظهر الفرد خافتًا في أسفل القائمة ولا يُعدّ متاحًا حتى يُحدَّد تاريخ النهاية. " +
      "عند الفحص يتعذّر التأكد من انتهائها قبل أي يوم لاحق لبدايتها."
    );
  }
  const end = endDate;
  if (!isValidDateStr(end) || end < startDate) return "";
  const a = { type, startDate, endDate: end };
  if (!isLongAssignment(a)) return "تعيين ليوم واحد: يبقى الفرد في قائمة الأفراد مع ⚠️ وسبب التعيين.";
  return (
    `تعيين طويل (${daysText(durationDays(a))}): يظهر الفرد خافتًا في أسفل القائمة ولا يُعدّ متاحًا حتى ` +
    `${formatDisplay(end)}، ويعود تلقائيًا إلى حالته الطبيعية في ${formatDisplay(addDays(end, 1))}.`
  );
}

// ---------- حالة الفرد في يوم معيّن ----------
export const assignmentsOnDate = (assignments, date) => assignments.filter((a) => coversDate(a, date));

// يعيد: { state, assignments, long?, returnDate? }
//   inactive : غير نشط — ليس مرشحًا عاديًا
//   long     : لديه تعيين طويل في هذا اليوم — يظهر خافتًا في الأسفل وغير متاح
//   day      : لديه تعيين (أو أكثر) ليوم واحد — يظهر مع ⚠️ وسببه
//   free     : متاح
export function personDayStatus(person, date, assignments) {
  const mine = assignments.filter((a) => a.personId === person.id);
  const today = mine.filter((a) => coversDate(a, date));
  if (!person.isActive) return { state: "inactive", assignments: today };

  const longs = today.filter(isLongAssignment);
  if (longs.length) {
    // تاريخ العودة: اليوم التالي لآخر يوم من التعيينات الطويلة المتصلة ببعضها
    const allLong = mine.filter(isLongAssignment);
    let end = longs.reduce((m, a) => (endOf(a) > m ? endOf(a) : m), "");
    for (let changed = end !== OPEN_END; changed; ) {
      changed = false;
      for (const a of allLong) {
        if (a.startDate <= addDays(end, 1) && endOf(a) > end) {
          end = endOf(a);
          changed = end !== OPEN_END; // وصلنا لمهمة بلا نهاية: لا تاريخ عودة معروف
        }
      }
    }
    // returnDate = null يعني: نهاية غير محددة (لا يوجد تاريخ عودة نعرضه)
    return { state: "long", assignments: today, long: longs, returnDate: end === OPEN_END ? null : addDays(end, 1) };
  }
  if (today.length) return { state: "day", assignments: today };
  return { state: "free", assignments: [] };
}

const ORDER = { free: 0, day: 1, long: 2 };

// قائمة الأفراد لليوم: المتاحون ثم أصحاب ⚠️ ثم أصحاب المهام الطويلة في الأسفل.
// غير النشطين لا يدخلون القائمة (ليسوا مرشحين عاديين).
export function buildDayList(people, date, assignments) {
  return people
    .filter((p) => p.isActive)
    .map((person) => ({ person, status: personDayStatus(person, date, assignments) }))
    .sort(
      (x, y) =>
        ORDER[x.status.state] - ORDER[y.status.state] ||
        String(x.person.name).localeCompare(String(y.person.name), "ar")
    );
}
