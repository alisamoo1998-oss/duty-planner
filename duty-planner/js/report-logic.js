// كشف الخدمات اليومية — دوال نقية (بلا Firebase ولا DOM). للقراءة فقط: لا تكتب ولا تعدّل أي بيانات.
// يستعمل منطق المشروع كما هو: effectiveDay (البديل المخزَّن أو المشتق) و coversDate للتكليفات، دون تغييرهما.
//
// أسماء الحقول في الكود: parmano = الخفارة، gard = الحراسة (تُعرض في الواجهة بالعربية فقط).
import { diffDays, formatDisplay, isValidDateStr, weekdayName } from "./dates.js";
import { effectiveDay, dateRange, STATUS } from "./services-logic.js";
import { coversDate, isOpenEnded, daysText } from "./assignments-logic.js";

export const MAX_DAYS = 366; // حد أقصى لطول الفترة حمايةً للصفحة والملف المُصدَّر من الفترات العشوائية الضخمة

// أنواع الخدمة (أعمدة الكشف) وخيارات التصفية
export const COLUMNS = Object.freeze({ parmano: "الخفارة", gard: "الحراسة", rest: "الراحة", tasks: "المهام" });
export const COLUMN_ORDER = ["parmano", "gard", "rest", "tasks"];
export const TYPE_OPTIONS = [{ id: "all", label: "جميع الخدمات" }, ...COLUMN_ORDER.map((id) => ({ id, label: COLUMNS[id] }))];

// حالات اليوم (للتمييز البصري). النص يكفي وحده للتمييز (طباعة أبيض وأسود)، واللون مساعد فقط.
//   done     : يوم مضى وحالته معتمدة (final) = منفذ
//   pending  : يوم مضى وحالته مسودة = غير محسوم (لا نفترض أنه نُفّذ)
//   missing  : لا وثيقة لهذا اليوم = غير مُعدّ
//   upcoming : يوم لم يحن بعد = قادم (مخطط، قابل للتعديل) — لا يُوصف بأنه منفذ ولو كان معتمدًا مسبقًا
//   today    : اليوم الحالي
export const KIND_LABEL = Object.freeze({
  done: "منفذ",
  pending: "مسودة غير محسومة",
  missing: "غير مُعدّ",
  upcoming: "قادم",
  today: "اليوم",
});
export const LEGEND = [
  { kind: "done", text: "منفذ — يوم مضى وحالته معتمدة (final)" },
  { kind: "upcoming", text: "قادم — يوم مخطط لم يحن بعد (قابل للتعديل)" },
  { kind: "today", text: "اليوم الحالي" },
  { kind: "pending", text: "مسودة غير محسومة — يوم مضى ولم يُعتمد" },
  { kind: "missing", text: "غير مُعدّ — لا سجل لهذا اليوم" },
];

export function validatePeriod(from, to) {
  if (!isValidDateStr(from) || !isValidDateStr(to)) return { ok: false, message: "حدّد تاريخ البداية وتاريخ النهاية بصيغة صحيحة." };
  if (from > to) return { ok: false, message: "تاريخ البداية بعد تاريخ النهاية. صحّح الفترة." };
  const n = diffDays(to, from) + 1;
  if (n > MAX_DAYS) return { ok: false, message: `الفترة (${n} يومًا) تتجاوز الحد الأقصى ${MAX_DAYS} يومًا. اختر فترة أقصر.` };
  return { ok: true, days: n };
}

// تطبيع بسيط للبحث: إزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة، وتجاهل حالة الأحرف اللاتينية
export const normalizeName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

// حالة يوم. state: 'final' | 'draft' | 'none' (لا وثيقة). أي حالة غير final تُعامل كمسودة.
export function dayStatus(date, doc, today) {
  const state = !doc ? "none" : doc.status === STATUS.FINAL ? "final" : "draft";
  const subText = { final: "معتمد", draft: "مسودة", none: "غير مُعدّ" }[state];
  let kind;
  if (date === today) kind = "today";
  else if (date > today) kind = "upcoming";
  else if (state === "final") kind = "done";
  else if (state === "draft") kind = "pending";
  else kind = "missing";
  // sub: تفصيل الحالة المخزنة لأيام اليوم والقادمة (لا يُكرَّر لما تدل عليه التسمية نفسها)
  const sub = kind === "today" || kind === "upcoming" ? subText : null;
  return { kind, label: KIND_LABEL[kind], sub, state };
}

// التكليف: detail = نوعه، و span = مدته في سطر مستقل (بلا أقواس لتفادي اختلاط الأرقام بالنص العربي عند التفاف السطر)
function assignmentDetail(a) {
  if (isOpenEnded(a)) return { detail: a.type, span: `من ${formatDisplay(a.startDate)} — بلا تاريخ نهاية` };
  return a.endDate !== a.startDate
    ? { detail: a.type, span: `من ${formatDisplay(a.startDate)} إلى ${formatDisplay(a.endDate)}` }
    : { detail: a.type, span: null };
}

// يبني الكشف. today: تاريخ اليوم الحالي (YYYY-MM-DD) يُمرَّر من المستدعي (لسهولة الاختبار).
// search: نص بحث عن اسم فرد. type: 'all' أو أحد COLUMN_ORDER.
// المخرجات تشمل كل أيام الفترة (ولو لم تُعدّ)، بعد التصفية فقط إن طُلبت.
export function buildReport({ people, assignments, days, from, to, today, search = "", type = "all" }) {
  const check = validatePeriod(from, to);
  if (!check.ok) throw new Error(check.message);

  const byId = new Map(people.map((p) => [p.id, p]));
  const q = normalizeName(search);
  const columns = type === "all" || !COLUMNS[type] ? COLUMN_ORDER : [type];
  const entry = (personId, extra = {}) => {
    const p = byId.get(personId);
    return {
      personId,
      name: p ? p.name : "فرد غير موجود",
      driver: !!(p && p.isDriver),
      inactive: !!(p && !p.isActive),
      unknown: !p,
      hit: false,
      ...extra,
    };
  };

  const rows = [];
  for (const date of dateRange(from, check.days)) {
    const doc = days[date] || null;
    const eff = doc ? effectiveDay(date, days) : null;
    const cells = { parmano: [], gard: [], rest: [], tasks: [] };

    if (eff) {
      if (eff.parmanoPersonId) cells.parmano.push(entry(eff.parmanoPersonId));
      if (eff.parmanoSubstituteId) cells.parmano.push(entry(eff.parmanoSubstituteId, { note: "بديل" }));
      if (eff.gardPersonId) cells.gard.push(entry(eff.gardPersonId));
      if (eff.gardSubstituteId) cells.gard.push(entry(eff.gardSubstituteId, { note: "بديل" }));
      for (const id of new Set(eff.restPersonIds || [])) cells.rest.push(entry(id));
      for (const t of eff.otherTasks || []) cells.tasks.push(entry(t.personId, { detail: t.task || "مهمة", kind: "task" }));
    }
    // التكليفات المسجلة في صفحة التعيينات تظهر في عمود المهام حتى لو لم يُعدّ اليوم (كما في بطاقة اليوم)
    assignments
      .filter((a) => coversDate(a, date))
      .map((a) => entry(a.personId, { ...assignmentDetail(a), kind: "assignment" }))
      .sort((x, y) => String(x.name).localeCompare(String(y.name), "ar"))
      .forEach((e) => cells.tasks.push(e));

    // البحث: يطابق الأسماء في الأعمدة المعروضة فقط، ويُعلِّم المطابق
    let matched = !q;
    if (q) {
      for (const col of columns) {
        for (const e of cells[col]) {
          if (normalizeName(e.name).includes(q)) {
            e.hit = true;
            matched = true;
          }
        }
      }
    }
    if (!matched) continue;

    rows.push({ date, weekday: weekdayName(date), hasDoc: !!doc, status: dayStatus(date, doc, today), cells });
  }

  const counts = { done: 0, upcoming: 0, today: 0, pending: 0, missing: 0 };
  rows.forEach((r) => (counts[r.status.kind] += 1));
  return {
    from, to, today,
    daysCount: check.days,   // أيام الفترة كلها
    shown: rows.length,      // المعروضة بعد البحث
    columns, type, search: search.trim(),
    filtered: !!q || (type !== "all" && !!COLUMNS[type]),
    rows, counts,
  };
}

// سطر نصي لتوصيف التصفية الحالية (للترويسة في الشاشة والطباعة وWord)
export function filterNote(report) {
  const parts = [];
  if (report.type !== "all" && COLUMNS[report.type]) parts.push(`نوع الخدمة: ${COLUMNS[report.type]}`);
  if (report.search) parts.push(`بحث عن: «${report.search}»`);
  return parts.length ? `تصفية مطبّقة — ${parts.join("، ")}` : "";
}

// سطر التعداد: لا بطاقات إحصائية، سطر واحد فقط
export function countsText(report) {
  const c = report.counts;
  const bits = [];
  if (c.done) bits.push(`${c.done} منفذ`);
  if (c.today) bits.push(`${c.today} اليوم الحالي`);
  if (c.upcoming) bits.push(`${c.upcoming} قادم`);
  if (c.pending) bits.push(`${c.pending} مسودة غير محسومة`);
  if (c.missing) bits.push(`${c.missing} غير مُعدّ`);
  const shown = report.filtered && report.shown !== report.daysCount ? `المعروض ${report.shown} من ${daysText(report.daysCount)}` : daysText(report.daysCount);
  return `${shown}${bits.length ? ` — ${bits.join("، ")}` : ""}`;
}
