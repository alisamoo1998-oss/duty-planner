// منطق الوثائق والمهام — دوال نقية (بلا Firebase ولا DOM).
// الحالات: pending | returned | completed
// التواريخ YYYY-MM-DD. العرض عبر formatDisplay من dates.js.
import { diffDays, formatDisplay, isValidDateStr } from "./dates.js";

export const DOC_STATUS = Object.freeze({
  PENDING: "pending",
  RETURNED: "returned",
  COMPLETED: "completed",
});

export const DOC_STATUS_LABEL = Object.freeze({
  pending: "جديدة (عالقة)",
  returned: "معادة للاستكمال",
  completed: "منجزة",
});

// الأنواع الافتراضية عند أول استخدام (تُنشأ في Firestore مرة واحدة)
export const DEFAULT_DOC_TYPES = [
  "قطعة «ق»",
  "قطعة «ع»",
  "تحقيق إداري",
  "تحقيق اجتماعي",
  "كونديدا",
  "أخرى",
];

export function isOpenDoc(d) {
  return d.status === DOC_STATUS.PENDING || d.status === DOC_STATUS.RETURNED;
}

/** بداية فترة العالقة الحالية: آخر إرجاع إن وُجد، وإلا تاريخ المنح */
export function pendingStart(doc) {
  const returns = (doc.history || []).filter((h) => h.type === "return");
  if (returns.length) return returns[returns.length - 1].date;
  return doc.grantDate;
}

export function pendingDays(doc, today) {
  if (!isOpenDoc(doc)) return 0;
  const start = pendingStart(doc);
  if (!isValidDateStr(start) || !isValidDateStr(today)) return 0;
  return Math.max(0, diffDays(today, start));
}

/** مدة الإنجاز (أيام) لوثيقة منجزة — من آخر بداية عالقة حتى آخر تحرير */
export function completionDays(doc) {
  if (doc.status !== DOC_STATUS.COMPLETED) return null;
  const completes = (doc.history || []).filter((h) => h.type === "complete");
  if (!completes.length) return null;
  const last = completes[completes.length - 1];
  const returns = (doc.history || []).filter(
    (h) => h.type === "return" && h.date <= last.date
  );
  const start = returns.length ? returns[returns.length - 1].date : doc.grantDate;
  if (!isValidDateStr(start) || !isValidDateStr(last.date)) return null;
  return Math.max(0, diffDays(last.date, start));
}

export function validateDocument(d) {
  const errors = [];
  if (!d.personId) errors.push("اختر الفرد.");
  if (!d.typeName || !String(d.typeName).trim()) errors.push("اختر نوع الوثيقة.");
  if (!d.ownerName || !String(d.ownerName).trim()) errors.push("أدخل اسم صاحب الوثيقة.");
  if (!isValidDateStr(d.grantDate)) errors.push("تاريخ المنح غير صحيح.");
  return errors;
}

/**
 * ترتيب التوزيع العادل لنوع معيّن.
 * يعدّ كل حدث grant أو return لهذا النوع لكل فرد.
 * الأولوية: الأقل عددًا، ثم الأقدم منحًا، ثم الاسم.
 */
export function fairRanking(typeName, people, documents) {
  const counts = {};
  const lastDates = {};
  for (const p of people) {
    counts[p.id] = 0;
    lastDates[p.id] = null;
  }
  for (const d of documents) {
    if (d.typeName !== typeName) continue;
    for (const h of d.history || []) {
      if (h.type !== "grant" && h.type !== "return") continue;
      const pid = h.personId || d.personId;
      if (!pid || !(pid in counts)) continue;
      counts[pid] += 1;
      if (!lastDates[pid] || h.date > lastDates[pid]) lastDates[pid] = h.date;
    }
  }
  return people
    .map((p) => ({
      id: p.id,
      name: p.name,
      isActive: p.isActive !== false,
      count: counts[p.id] || 0,
      lastDate: lastDates[p.id],
    }))
    .sort((a, b) => {
      // النشطون أولًا في الترتيب العملي
      if (!!a.isActive !== !!b.isActive) return a.isActive ? -1 : 1;
      if (a.count !== b.count) return a.count - b.count;
      if (!a.lastDate && !b.lastDate) return String(a.name).localeCompare(String(b.name), "ar");
      if (!a.lastDate) return -1;
      if (!b.lastDate) return 1;
      return a.lastDate.localeCompare(b.lastDate) || String(a.name).localeCompare(String(b.name), "ar");
    });
}

export function eventTitle(h) {
  switch (h.type) {
    case "grant":
      return `منح الوثيقة ← ${h.personName || ""}`;
    case "complete":
      return "تسجيل التحرير";
    case "return":
      return `إرجاع للاستكمال ← ${h.personName || ""}`;
    case "note":
      return "ملاحظة متابعة";
    default:
      return h.type || "";
  }
}

/** يبني سجل events مرتبًا زمنيًا */
export function sortedHistory(doc) {
  return [...(doc.history || [])].sort((a, b) =>
    `${a.date}${a.createdAt || ""}`.localeCompare(`${b.date}${b.createdAt || ""}`)
  );
}

export function ageClass(days) {
  if (days >= 21) return "doc-old-21";
  if (days >= 14) return "doc-old-14";
  if (days >= 7) return "doc-old-7";
  return "";
}

export function durationClass(days) {
  if (days >= 14) return "doc-dur-danger";
  if (days >= 7) return "doc-dur-warn";
  return "";
}
