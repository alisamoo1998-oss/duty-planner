// منطق الخدمات اليومية — دوال نقية (بلا Firebase ولا DOM) لسهولة الاختبار.
// المرحلة 3 فقط: بنية اليوم، ترتيب المرشحين، التكملة التلقائية للبديل.
// قواعد المرحلة 4 (فحص 48 ساعة، الفصل بين الخفير والحارس، السائقون المتاحون) غير منفّذة هنا.
//
// أسماء الحقول: parmano = الخفير، gard = الحارس (تُعرض في الواجهة بالعربية فقط).
//
// شكل وثيقة اليوم daily_services/{YYYY-MM-DD}:
//   date, status('draft'|'final'),
//   parmanoPersonId, parmanoSubstituteId, gardPersonId, gardSubstituteId,
//   restPersonIds[], otherTasks[{personId, task}], updatedAt
// حقل البديل: غائب = "يُشتق تلقائيًا من خفير/حارس اليوم السابق"، و null = "بلا بديل" اختاره المستخدم صراحةً.
import { addDays, diffDays, isFriday } from "./dates.js";
import { personDayStatus, typeInfo, endOf } from "./assignments-logic.js";

export const MAX_REST = 4;
export const STATUS = Object.freeze({ DRAFT: "draft", FINAL: "final" });

// وثيقة يوم جديدة (مسودة). لا مفتاح للبديلين عمدًا: يُشتقان من اليوم السابق حتى يختار المستخدم.
export const newDayDoc = (date) => ({
  date,
  status: STATUS.DRAFT,
  parmanoPersonId: null,
  gardPersonId: null,
  restPersonIds: [],
  otherTasks: [],
});

export function dateRange(start, count) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

// ---------- البديل ----------
// ملاحظة افتراضية (تحتاج تأكيدًا): من كان خفيرًا أمس فهو «البديل» اليوم (اليوم الثاني من خدمته 48 ساعة)،
// وكذلك الحارس. هذه الدالة هي المكان الوحيد الذي يُعدَّل إن تغيّر الفهم.
export function derivedSubstitutes(date, days) {
  const prev = days[addDays(date, -1)];
  return { parmano: (prev && prev.parmanoPersonId) || null, gard: (prev && prev.gardPersonId) || null };
}

// اليوم مع البديلين الفعليين (المخزَّن إن وُجد، وإلا المشتق). يعيد null إن لم تكن الوثيقة موجودة.
export function effectiveDay(date, days) {
  const day = days[date];
  if (!day) return null;
  const d = derivedSubstitutes(date, days);
  const pStored = day.parmanoSubstituteId;
  const gStored = day.gardSubstituteId;
  return {
    ...day,
    restPersonIds: day.restPersonIds || [],
    otherTasks: day.otherTasks || [],
    parmanoSubstituteId: pStored !== undefined ? pStored : d.parmano,
    gardSubstituteId: gStored !== undefined ? gStored : d.gard,
    parmanoSubstituteDerived: pStored === undefined && !!d.parmano,
    gardSubstituteDerived: gStored === undefined && !!d.gard,
  };
}

// الحقول التي يجب تثبيتها عند أي حفظ حتى لا يتغير البديل لاحقًا بتغيّر اليوم السابق.
export function substitutesToPersist(eff) {
  const out = {};
  if (eff.parmanoSubstituteDerived) out.parmanoSubstituteId = eff.parmanoSubstituteId;
  if (eff.gardSubstituteDerived) out.gardSubstituteId = eff.gardSubstituteId;
  return out;
}

export const directSubstituteIds = (eff) =>
  new Set([eff.parmanoSubstituteId, eff.gardSubstituteId].filter(Boolean));

// من يشغل أي دور في اليوم: Map(personId → ['الخفير', ...])
export function rolesByPerson(eff) {
  const map = new Map();
  const add = (id, label) => {
    if (!id) return;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(label);
  };
  add(eff.parmanoPersonId, "الخفير");
  add(eff.gardPersonId, "الحارس");
  add(eff.parmanoSubstituteId, "البديل");
  add(eff.gardSubstituteId, "بديل الحارس");
  eff.restPersonIds.forEach((id) => add(id, "راحة"));
  eff.otherTasks.forEach((t) => add(t.personId, t.task ? `مهمة: ${t.task}` : "مهمة"));
  return map;
}

// ---------- السجل التاريخي (للترتيب) ----------
// يشمل الأيام المعتمدة والمسودات السابقة لتاريخ اليوم (لأن التخطيط يتم تسلسليًا)، مع وسم المسودة.
// الإحصائيات الفعلية (final فقط) تُحسب لاحقًا في صفحة الإحصائيات ولا تتأثر بهذا.
function lastBefore(date, days, matches) {
  let best = null;
  for (const [d, day] of Object.entries(days)) {
    if (d < date && matches(day) && (!best || d > best.date)) {
      best = { date: d, isDraft: day.status !== STATUS.FINAL };
    }
  }
  return best;
}

export function serviceMetrics(field, personId, date, days) {
  const last = lastBefore(date, days, (day) => day[field] === personId);
  return { last, since: last ? diffDays(date, last.date) : null };
}

// الراحة: عدّاد منذ آخر راحة (تقويمي) وعدّاد أيام العمل المتواصلة (يبدأ بعد آخر راحة أو بعد انتهاء غياب
// من الأنواع التي لا تُحسب أيام عمل: عطلة/إجازة/نقاهة). لا علاقة لهما بعدّاد الخفارة/الحراسة.
export function restMetrics(personId, date, days, assignments) {
  const last = lastBefore(date, days, (day) => (day.restPersonIds || []).includes(personId));
  let anchor = last ? last.date : null;
  for (const a of assignments) {
    if (a.personId !== personId || !typeInfo(a.type).pausesWorkDays) continue;
    const end = endOf(a);
    if (end < date && (!anchor || end > anchor)) anchor = end;
  }
  return {
    last,
    since: last ? diffDays(date, last.date) : null,
    streak: anchor ? Math.max(0, diffDays(date, addDays(anchor, 1))) : null,
  };
}

// ---------- قوائم الأفراد ----------
const cmpDescNullFirst = (a, b) => {
  const x = a ?? Infinity, y = b ?? Infinity; // لا سجل سابق = أطول مدة
  return x === y ? 0 : x > y ? -1 : 1;
};
const byNameAr = (a, b) => String(a.name).localeCompare(String(b.name), "ar");

// إدخال موحّد لقائمة (مرشحين أو أفراد متاحين):
// { person, state:'free'|'busy'|'long', reasons:[..], returnDate?, metrics? }
function buildEntry(person, date, assignments, roles, ownRole) {
  const st = personDayStatus(person, date, assignments);
  const roleLabels = (roles.get(person.id) || []).filter((r) => r !== ownRole && !(ownRole === null && r.startsWith("مهمة")));
  if (st.state === "long") {
    return { person, state: "long", reasons: st.long.map((a) => a.type), returnDate: st.returnDate };
  }
  const reasons = [...(st.state === "day" ? st.assignments.map((a) => a.type) : []), ...roleLabels];
  return { person, state: reasons.length ? "busy" : "free", reasons };
}

// kind: 'parmano' | 'gard' | 'rest' | 'plain'(بديل/مهمة)
// يستبعد: غير النشطين، والبديلين المباشرين لليوم (إلا من في keepIds ليظهر اختياره الحالي).
export function candidateList({ kind, date, people, assignments, days, keepIds = [] }) {
  const eff = effectiveDay(date, days);
  if (!eff) return [];
  const subs = directSubstituteIds(eff);
  const roles = rolesByPerson(eff);
  const ownRole = { parmano: "الخفير", gard: "الحارس", rest: "راحة" }[kind] ?? null;

  const rows = people
    .filter((p) => p.isActive && (!subs.has(p.id) || keepIds.includes(p.id)))
    .map((person) => {
      const entry = buildEntry(person, date, assignments, roles, ownRole);
      if (kind === "parmano") entry.metrics = serviceMetrics("parmanoPersonId", person.id, date, days);
      else if (kind === "gard") entry.metrics = serviceMetrics("gardPersonId", person.id, date, days);
      else if (kind === "rest") entry.metrics = restMetrics(person.id, date, days, assignments);
      return entry;
    });

  return rows.sort((x, y) => {
    const longDiff = (x.state === "long") - (y.state === "long"); // أصحاب المهام الطويلة في الأسفل
    if (longDiff) return longDiff;
    if (kind === "parmano" || kind === "gard") {
      const c = cmpDescNullFirst(x.metrics.since, y.metrics.since);
      if (c) return c;
    } else if (kind === "rest") {
      const c = cmpDescNullFirst(x.metrics.streak, y.metrics.streak) || cmpDescNullFirst(x.metrics.since, y.metrics.since);
      if (c) return c;
    } else {
      const order = { free: 0, busy: 1, long: 2 };
      const c = order[x.state] - order[y.state];
      if (c) return c;
    }
    return byNameAr(x.person, y.person);
  });
}

// قسم «الأفراد المتاحون»: المتاحون ثم أصحاب ⚠️ ثم المهام الطويلة. البديلان المباشران لا يظهران.
// لا يُحذف أحد لمجرد وجود تعيين يومي أو دور في اليوم.
export function availablePeople({ date, people, assignments, days }) {
  const eff = effectiveDay(date, days);
  if (!eff) return [];
  const subs = directSubstituteIds(eff);
  const roles = rolesByPerson(eff);
  const order = { free: 0, busy: 1, long: 2 };
  return people
    .filter((p) => p.isActive && !subs.has(p.id))
    .map((person) => buildEntry(person, date, assignments, roles, undefined))
    .sort((x, y) => order[x.state] - order[y.state] || byNameAr(x.person, y.person));
}

// ما ينقص اليوم قبل اعتماده (فحص بسيط فقط؛ الفحص الكامل في المرحلة 4).
export function missingParts(eff) {
  const missing = [];
  if (!eff.parmanoPersonId) missing.push("الخفير");
  if (!eff.gardPersonId) missing.push("الحارس");
  return missing;
}

export const restAllowed = (date) => !isFriday(date);
