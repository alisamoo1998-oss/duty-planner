// أدوات واجهة مشتركة صغيرة.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// اسم الفرد مع 🚗 إن كان سائقًا — استخدمه في كل مكان يظهر فيه الاسم.
export function personLabel(person) {
  const name = escapeHtml(person.name);
  return person.isDriver ? `${name} <span class="car" title="سائق">🚗</span>` : name;
}

export function toast(message, kind = "info") {
  const host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// رسالة عربية مفهومة لأخطاء Firestore الشائعة
export function describeError(err) {
  const code = err && err.code ? String(err.code) : "";
  if (code.includes("permission-denied"))
    return "مرفوض: قواعد Firestore لا تسمح لهذا الحساب بالوصول. تأكد أنك دخلت بحساب المالك (لا تغيّر القواعد دون مراجعة).";
  if (code.includes("unauthenticated")) return "يجب تسجيل الدخول أولًا.";
  if (code.includes("unavailable")) return "تعذّر الاتصال بالإنترنت أو بخادم Firebase.";
  if (code.includes("failed-precondition")) return "قاعدة بيانات Firestore غير مهيأة بعد في هذا المشروع.";
  return (err && err.message) || "خطأ غير معروف.";
}

// نص عادي للاسم (للقوائم المنسدلة التي لا تقبل HTML) مع 🚗 للسائق.
export const personText = (person) => (person.isDriver ? `${person.name} 🚗` : person.name);

export const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ar");
