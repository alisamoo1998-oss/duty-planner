// تواريخ اليوم فقط (Date-only) بصيغة YYYY-MM-DD.
// كل الحسابات تتم بالتوقيت العالمي (UTC) على أيام كاملة، فلا يتأثر اليوم بفرق التوقيت.
const DAY_MS = 86400000;
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const pad = (n) => String(n).padStart(2, "0");

export function isValidDateStr(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtcMs(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// تاريخ اليوم حسب ساعة جهاز المستخدم (وليس UTC)
export function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export const addDays = (s, n) => fromUtcMs(toUtcMs(s) + n * DAY_MS);
export const diffDays = (a, b) => Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS); // a - b
export const weekdayIndex = (s) => new Date(toUtcMs(s)).getUTCDay(); // 0 = الأحد
export const weekdayName = (s) => DAY_NAMES[weekdayIndex(s)];
export const isFriday = (s) => weekdayIndex(s) === 5;

// 2026-10-11 → 11/10/2026
export function formatDisplay(s) {
  if (!isValidDateStr(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

// 2026-10-11 → "يوم الأحد : 11/10/2026"
export const formatLong = (s) => `يوم ${weekdayName(s)} : ${formatDisplay(s)}`;
