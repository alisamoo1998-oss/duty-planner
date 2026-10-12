// الإعدادات + فحص الاتصال بـ Firebase.
import { PROJECT_ID, auth } from "../firebase.js";
import { peopleApi, settingsApi } from "../db.js";
import { SEED_MARKER_KEY } from "../seed-data.js";
import { logout } from "../auth.js";
import { escapeHtml, describeError } from "../ui.js";

const ICON = { ok: "🟢", warn: "🟡", bad: "🔴" };
const row = (level, label, value) =>
  `<li class="check check-${level}"><span class="check-icon">${ICON[level]}</span>
   <span class="check-label">${escapeHtml(label)}</span>
   <span class="check-value">${escapeHtml(value)}</span></li>`;

export async function render(root) {
  root.innerHTML = `
    <section class="sheet">
      <header class="sheet-head">
        <h2>فحص الاتصال</h2>
        <button class="btn" id="recheck" type="button">إعادة الفحص</button>
      </header>
      <ul class="checks" id="diag"></ul>
    </section>
    <section class="sheet">
      <header class="sheet-head"><h2>الحساب</h2></header>
      <div class="pad"><button class="btn btn-danger" id="settings-logout" type="button">تسجيل الخروج</button></div>
    </section>`;

  root.querySelector("#recheck").addEventListener("click", () => runChecks(root));
  root.querySelector("#settings-logout").addEventListener("click", () => logout());
  await runChecks(root);
}

async function runChecks(root) {
  const box = root.querySelector("#diag");
  box.innerHTML = '<li class="muted pad">جارٍ الفحص…</li>';
  const rows = [];

  rows.push(row("ok", "مشروع Firebase", PROJECT_ID));
  const user = auth.currentUser;
  rows.push(row(user ? "ok" : "bad", "المستخدم", user ? user.email : "غير مسجّل الدخول"));

  try {
    const people = await peopleApi.list();
    rows.push(row("ok", "قراءة Firestore", `ناجحة — ${people.length} فردًا`));
    const marker = await settingsApi.get(SEED_MARKER_KEY);
    rows.push(row(marker ? "ok" : "warn", "التهيئة الأولية للأفراد", marker ? "تمت مرة واحدة" : "لم تتم بعد"));
  } catch (err) {
    rows.push(row("bad", "قراءة Firestore", describeError(err)));
  }

  box.innerHTML = rows.join("");
}
