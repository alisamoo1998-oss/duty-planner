// 🔎 فحص اليوم — دوال نقية (بلا Firebase ولا DOM). المرحلة 4 (+ تعديلات المنطق: مهام بلا نهاية، راحة الجمعة، وضوح التنبيهات).
// الفحص للقراءة فقط: يولّد تنبيهات ولا يعدّل أي بيانات ولا يمنع أي حفظ. القرار النهائي للمستخدم.
// لا يغيّر منطق الخدمات أو البديل؛ يستعمل effectiveDay / derivedSubstitutes / rolesByPerson كما هي.
//
// المستويات: ok 🟢 | info ℹ️ (لا يؤثر على النتيجة) | warn 🟡 | bad 🔴
// نوع البند (kind): conflict = تعارض مؤكد من بيانات معروفة | unverified = تعذّر التحقق (مهمة بلا تاريخ نهاية) | exception = استثناء متعمَّد.
// صيغة رسائل التعارض: «الفرد (الدور) — التاريخ: السبب».
import { addDays, formatDisplay, isFriday } from "./dates.js";
import { coversDate, endOf, isLongAssignment, isOpenEnded } from "./assignments-logic.js";
import { effectiveDay, derivedSubstitutes, rolesByPerson, MAX_REST, STATUS } from "./services-logic.js";

export const ICON = { ok: "🟢", info: "ℹ️", warn: "🟡", bad: "🔴" };
export const TAGS = { conflict: "تعارض مؤكد", unverified: "تعذّر التحقق", exception: "استثناء" };
const RANK = { ok: 0, info: 0, warn: 1, bad: 2 };
export const VERDICT = {
  ok: "🟢 سليم",
  warn: "🟡 توجد ملاحظات أو تنبيهات",
  bad: "🔴 توجد مشكلة مهمة تحتاج إلى الانتباه",
};

// قاعدة الفصل: بعد خدمة 48 ساعة (يومان) يلزم يوم كامل قبل البدء بالدور الآخر،
// أي يُرفض أن تبعد بدايتا الدورين بأقل من 3 أيام (الفارق 0 أو 1 أو 2).
export const SEPARATION_WINDOW = 2;

const ROLE_NOUN = { "الخفير": "خفير", "الحارس": "حارس" };
const ROLE_ACC = { "الخفير": "خفيرًا", "الحارس": "حارسًا" };
const worst = (items) => items.reduce((m, i) => (RANK[i.level] > RANK[m] ? i.level : m), "ok");

export function checkDay({ date, people, assignments, days }) {
  const eff = effectiveDay(date, days);
  if (!eff) return null;

  const byId = new Map(people.map((p) => [p.id, p]));
  const nm = (id) => (byId.has(id) ? byId.get(id).name : "فرد غير موجود");
  const prev = days[addDays(date, -1)];
  const next = days[addDays(date, 1)];
  const derived = derivedSubstitutes(date, days);
  const isFinal = eff.status === STATUS.FINAL;
  const fmt = formatDisplay;
  const at = fmt(date);
  const prevAt = fmt(addDays(date, -1));
  const who = (id, role) => `${nm(id)} (${role}) — ${at}`;

  // من هو في اليوم الثاني من خدمة 48 ساعة (خفير/حارس الأمس) أو بديل مخزَّن اليوم: لا يجوز أي دور عادي له.
  const secondDay = new Map(); // id → وصف
  if (derived.parmano) secondDay.set(derived.parmano, `خفير الأمس (${prevAt}) واليوم هو اليوم الثاني من خدمته`);
  if (derived.gard) secondDay.set(derived.gard, `حارس الأمس (${prevAt}) واليوم هو اليوم الثاني من خدمته`);
  for (const [id, label] of [[eff.parmanoSubstituteId, "بديل الخفير اليوم"], [eff.gardSubstituteId, "بديل الحارس اليوم"]]) {
    if (id && !secondDay.has(id)) secondDay.set(id, label);
  }

  const sections = [];
  const section = (key, title, okText) => {
    const s = { key, title, okText, items: [] };
    sections.push(s);
    return s;
  };
  const add = (s, level, text, kind = null) => s.items.push({ level, text, kind });

  // ---------- تعيينات الفرد في تاريخ معيّن ----------
  // long       : تكليف طويل بتاريخ نهاية معروف، أو مهمة بلا نهاية تبدأ في هذا اليوم نفسه (وجودها يومئذٍ مؤكد)
  // day        : تكليف ليوم واحد
  // unverified : مهمة بلا تاريخ نهاية بدأت قبل هذا اليوم: تُعدّ مستمرة، لكن يتعذّر التأكد أنها لم تنتهِ قبله
  const assignmentsOf = (id, d) => {
    const mine = assignments.filter((a) => a.personId === id && coversDate(a, d));
    const open = mine.filter(isOpenEnded);
    return {
      long: mine.filter((a) => isLongAssignment(a) && !isOpenEnded(a)).concat(open.filter((a) => a.startDate === d)),
      day: mine.filter((a) => !isLongAssignment(a)),
      unverified: open.filter((a) => a.startDate !== d),
    };
  };
  const longText = (a) => `${a.type} (${isOpenEnded(a) ? `بلا تاريخ نهاية، بدأت في ${fmt(a.startDate)}` : `حتى ${fmt(endOf(a))}`})`;
  const assignText = ({ long, day }) => {
    const parts = [];
    if (long.length) parts.push(long.map(longText).join(" + "));
    if (day.length) parts.push(day.map((a) => a.type).join(" + "));
    return parts.join(" و");
  };
  const unverifiedText = (a) => `مهمة «${a.type}» بدأت في ${fmt(a.startDate)} وبلا تاريخ نهاية`;
  // يضيف بنود التعارض مع التكليفات لفرد في يوم d (secondOf: وصف إضافي لليوم الثاني من الخدمة)
  const addAssignmentFindings = (s, id, role, d, { rest = false, second = false } = {}) => {
    const a = assignmentsOf(id, d);
    const head = second ? `${nm(id)} (${role}) — ${fmt(d)}` : who(id, role);
    const tail = second ? " وهو اليوم الثاني من خدمته" : "";
    if (a.long.length) {
      add(s, rest ? "warn" : "bad", `${head}: لديه تكليف طويل في ${second ? fmt(d) : "هذا اليوم"}${tail}: ${assignText(a)}.`, "conflict");
    } else if (a.day.length) {
      add(s, "warn", `${head}: لديه تكليف في ${second ? fmt(d) : "هذا اليوم"}${tail}: ${assignText(a)}.`, "conflict");
    }
    if (a.unverified.length) {
      add(s, "warn", `${head}: لديه ${a.unverified.map(unverifiedText).join(" و")}؛ تُعدّ مستمرة، ويتعذّر التأكد من انتهائها قبل ${fmt(d)}${tail}.`, "unverified");
    }
  };

  // ---------- 1) الخفير ----------
  const sP = section("parmano", "الخفير", `مكتمل (${eff.parmanoPersonId ? nm(eff.parmanoPersonId) : ""})`);
  // ---------- 2) الحارس ----------
  const sG = section("gard", "الحارس", `مكتمل (${eff.gardPersonId ? nm(eff.gardPersonId) : ""})`);

  for (const [s, id, role] of [
    [sP, eff.parmanoPersonId, "الخفير"],
    [sG, eff.gardPersonId, "الحارس"],
  ]) {
    if (!id) {
      add(s, isFinal ? "bad" : "warn", `${role} غير محدد${isFinal ? " في يوم معتمد" : ""} — ${at}.`);
      continue;
    }
    const person = byId.get(id);
    if (!person) add(s, "bad", `${role} المختار غير موجود في قائمة الأفراد — ${at}.`);
    else if (!person.isActive) add(s, "warn", `${nm(id)} (${role}) — ${at}: غير نشط.`);

    // قاعدة 48 ساعة: من أدّى الخدمة أمس هو اليوم في يومها الثاني ولا تُسجَّل له خدمة جديدة
    if (secondDay.has(id) && (id === derived.parmano || id === derived.gard)) {
      add(s, "bad", `${who(id, role)}: هو ${secondDay.get(id)}، فلا تُسجَّل له خدمة ${ROLE_NOUN[role]} جديدة (ستُحسب مرتين).`, "conflict");
    } else if (secondDay.has(id)) {
      add(s, "bad", `${who(id, role)}: هو ${secondDay.get(id)}، ولا يجوز اختياره ${ROLE_ACC[role]}.`, "conflict");
    }

    // اليوم التالي هو اليوم الثاني من خدمة هذا الفرد
    if (next) {
      const again = [];
      if (next.parmanoPersonId === id) again.push("خفيرًا");
      if (next.gardPersonId === id) again.push("حارسًا");
      if ((next.restPersonIds || []).includes(id)) again.push("في الراحة");
      if ((next.otherTasks || []).some((t) => t.personId === id)) again.push("في مهمة");
      if (again.length) {
        add(s, "bad", `${who(id, role)}: مسجَّل ${again.join(" و")} في ${fmt(addDays(date, 1))} وهو اليوم الثاني من خدمته (48 ساعة).`, "conflict");
      }
    }
  }

  // ---------- 3) البديلان ----------
  const sS = section("subs", "البديلان", "لا ملاحظات");
  if (!prev) {
    add(sS, "info", `اليوم السابق (${prevAt}) غير مُعدّ، لذلك لا يمكن التحقق من البديلين.`);
  }
  for (const [label, subId, derivedId, mainLabel, dateOk] of [
    ["البديل", eff.parmanoSubstituteId, derived.parmano, "خفير", prev],
    ["بديل الحارس", eff.gardSubstituteId, derived.gard, "حارس", prev],
  ]) {
    if (!dateOk) continue;
    if (derivedId && !subId) {
      add(sS, "warn", `${label} — ${at}: لا يوجد ${label} رغم أن ${nm(derivedId)} كان ${mainLabel} أمس (${prevAt}).`);
    } else if (subId && subId !== derivedId) {
      add(sS, "warn", derivedId
        ? `${label} (${nm(subId)}) — ${at}: ليس ${mainLabel} الأمس (${nm(derivedId)}، ${prevAt}).`
        : `${label} (${nm(subId)}) — ${at}: تم اختياره بينما لا يوجد ${mainLabel} في اليوم السابق (${prevAt}).`);
    }
    if (subId && byId.has(subId) && !byId.get(subId).isActive) add(sS, "warn", `${label} (${nm(subId)}) — ${at}: غير نشط.`);
    if (subId && !byId.has(subId)) add(sS, "bad", `${label} المختار غير موجود في قائمة الأفراد — ${at}.`);
  }
  if (eff.parmanoSubstituteId && eff.parmanoSubstituteId === eff.gardSubstituteId) {
    add(sS, "warn", `${nm(eff.parmanoSubstituteId)} — ${at}: مسجَّل بديلًا للخفير وللحارس معًا.`);
  }

  // ---------- 4) الفصل بين الخفير والحارس ----------
  const sSep = section("separation", "الفصل بين الخفير والحارس", "لا تعارض");
  const dateWindow = Array.from({ length: SEPARATION_WINDOW * 2 + 1 }, (_, i) => addDays(date, i - SEPARATION_WINDOW));
  const docOf = (d) => (d === date ? eff : days[d]);
  const seen = new Set();
  for (const id of new Set([eff.parmanoPersonId, eff.gardPersonId].filter(Boolean))) {
    const pDates = dateWindow.filter((d) => docOf(d) && docOf(d).parmanoPersonId === id);
    const gDates = dateWindow.filter((d) => docOf(d) && docOf(d).gardPersonId === id);
    for (const p of pDates) {
      for (const g of gDates) {
        if (p !== date && g !== date) continue; // نعرض فقط ما يخص هذا اليوم
        const key = `${id}|${p}|${g}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(sSep, "bad", `تعارض مع قاعدة الفصل بين الخفير والحارس: ${nm(id)} خفير في ${fmt(p)} وحارس في ${fmt(g)} (يلزم يوم كامل يفصل بين الدورين).`, "conflict");
      }
    }
  }

  // ---------- 5) الراحة ----------
  const rest = eff.restPersonIds;
  const friday = isFriday(date);
  const sR = section("rest", "الراحة", rest.length ? (rest.length === 1 ? "فرد واحد" : rest.length === 2 ? "فردان" : `${rest.length} أفراد`) : "لا راحة يوم الجمعة (طبيعي)");
  if (rest.length > MAX_REST) add(sR, "bad", `الراحة — ${at}: عدد أفرادها ${rest.length} وهو يتجاوز الحد الأقصى (${MAX_REST}).`);
  // الجمعة: القاعدة المعتادة «لا راحة»، وتُمنح استثناءً بتأكيد المستخدم عند الحفظ → تنبيه 🟡 لا خطأ
  if (friday && rest.length) {
    add(sR, "warn", `الراحة — ${at}: لا توجد راحة يوم الجمعة عادةً؛ مُنحت هنا استثناءً (${[...new Set(rest)].map(nm).join("، ")}).`, "exception");
  }
  if (!friday && !rest.length) add(sR, "warn", `الراحة — ${at}: لم يُحدَّد أي فرد للراحة.`);
  if (new Set(rest).size !== rest.length) add(sR, "warn", `الراحة — ${at}: فرد مكرر في القائمة.`);
  for (const id of new Set(rest)) {
    const person = byId.get(id);
    if (!person) add(sR, "warn", `الراحة — ${at}: أحد أفرادها غير موجود في قائمة الأفراد.`);
    else if (!person.isActive) add(sR, "warn", `${nm(id)} (الراحة) — ${at}: غير نشط.`);
    if (secondDay.has(id)) add(sR, "bad", `${who(id, "الراحة")}: هو ${secondDay.get(id)}، ولا يجوز اختياره للراحة.`, "conflict");
    if (id === eff.parmanoPersonId || id === eff.gardPersonId) {
      add(sR, "bad", `${who(id, "الراحة")}: في الراحة وهو ${id === eff.parmanoPersonId ? "الخفير" : "الحارس"} في اليوم نفسه.`, "conflict");
    }
    if (eff.otherTasks.some((t) => t.personId === id)) add(sR, "warn", `${who(id, "الراحة")}: في الراحة وله مهمة في اليوم نفسه.`, "conflict");
  }

  // ---------- 6) التكليفات والمهام ----------
  const sA = section("assignments", "التكليفات والمهام", eff.otherTasks.length ? "لا تعارض" : "لا تعارض (لا مهام يدوية)");
  const roles = [
    ["الخفير", eff.parmanoPersonId, "duty"],
    ["الحارس", eff.gardPersonId, "duty"],
    ["البديل", eff.parmanoSubstituteId, "duty"],
    ["بديل الحارس", eff.gardSubstituteId, "duty"],
    ...rest.map((id) => ["الراحة", id, "rest"]),
    ...eff.otherTasks.map((t) => [t.task ? `مهمة (${t.task})` : "مهمة", t.personId, "duty"]),
  ];
  for (const [role, id, kind] of roles) {
    if (!id) continue;
    addAssignmentFindings(sA, id, role, date, { rest: kind === "rest" });
  }
  for (const t of eff.otherTasks) {
    if (t.personId && secondDay.has(t.personId)) add(sA, "bad", `${who(t.personId, "مهمة")}: هو ${secondDay.get(t.personId)}، ولا يجوز اختياره لمهمة.`, "conflict");
    if (t.personId && !byId.has(t.personId)) add(sA, "warn", `مهمة مسندة إلى فرد غير موجود في قائمة الأفراد — ${at}.`);
  }
  // اليوم الثاني من الخدمة (48 ساعة) يجب ألا يصادف تكليفًا
  for (const [role, id] of [["الخفير", eff.parmanoPersonId], ["الحارس", eff.gardPersonId]]) {
    if (!id) continue;
    addAssignmentFindings(sA, id, role, addDays(date, 1), { second: true });
  }

  // ---------- 7) السائقون ----------
  // السائق متاح = نشط، وليس له أي دور في اليوم (خدمة/بديل/راحة/مهمة) ولا أي تكليف (يشمل مهمة بلا نهاية: تُعدّ مستمرة).
  // هذا يطابق قسم «الأفراد المتاحون» في البطاقة. وجود شخص سائقًا لا يمنعه من الراحة؛ نحسب من بقي.
  const roleMap = rolesByPerson(eff);
  const drivers = people
    .filter((p) => p.isDriver && p.isActive)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"))
    .map((person) => {
      const reasons = [...(roleMap.get(person.id) || [])];
      const a = assignmentsOf(person.id, date);
      if (a.long.length || a.day.length) reasons.push(`تكليف: ${assignText(a)}`);
      if (a.unverified.length) reasons.push(`تكليف: ${a.unverified.map((x) => `${x.type} (بلا تاريخ نهاية — غير مؤكد)`).join(" + ")}`);
      const onlyUnverified = reasons.length > 0 && !(roleMap.get(person.id) || []).length && !a.long.length && !a.day.length;
      return { person, available: reasons.length === 0, reasons, onlyUnverified };
    });
  const availableDrivers = drivers.filter((d) => d.available).length;
  const sD = section("drivers", "السائقون", "");
  sD.drivers = drivers;
  sD.availableCount = availableDrivers;
  if (availableDrivers > 0) {
    sD.okText = `السائقون المتاحون: ${availableDrivers}`;
  } else {
    add(sD, "bad", drivers.length ? "لا يوجد سائق متاح في هذا اليوم" : "لا يوجد أي سائق نشط في قائمة الأفراد");
    const unsure = drivers.filter((d) => d.onlyUnverified);
    if (unsure.length) {
      add(sD, "info", `تعذّر التحقق: ${unsure.map((d) => d.person.name).join("، ")} غير متاح فقط بسبب مهمة بلا تاريخ نهاية (تُعدّ مستمرة وقد تكون انتهت) — حدّد تاريخ نهايتها في صفحة التعيينات إن انتهت.`, "unverified");
    }
  }

  // ---------- النتيجة ----------
  for (const s of sections) s.level = worst(s.items);
  const level = worst(sections.map((s) => ({ level: s.level })));
  return { date, level, verdict: VERDICT[level], sections, drivers, availableDrivers };
}
