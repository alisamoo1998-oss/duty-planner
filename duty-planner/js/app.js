// نقطة البداية: تراقب تسجيل الدخول ثم تُظهر الشاشة المناسبة وتشغّل التهيئة والموجّه.
import { observeAuth, login, logout, authErrorMessage } from "./auth.js";
import { ensureInitialPeople } from "./seed.js";
import { startRouter, stopRouter } from "./router.js";
import { toast, describeError } from "./ui.js";

const $ = (id) => document.getElementById(id);
let activeUid = null;

function showLogin() {
  $("boot").hidden = true;
  $("app-shell").hidden = true;
  $("login-screen").hidden = false;
}

function showApp(user) {
  $("boot").hidden = true;
  $("login-screen").hidden = true;
  $("app-shell").hidden = false;
  $("user-email").textContent = user.email || "";
}

async function runInitialSetup() {
  try {
    const result = await ensureInitialPeople();
    if (result.seeded) toast(`تمت تهيئة قائمة الأفراد (${result.created} فردًا).`, "ok");
  } catch (err) {
    console.error("initial setup failed", err);
    toast(`تعذّرت التهيئة الأولية: ${describeError(err)}`, "bad");
  }
}

observeAuth(async (user) => {
  if (!user) {
    activeUid = null;
    stopRouter();
    showLogin();
    return;
  }
  if (activeUid === user.uid) return;
  activeUid = user.uid;
  showApp(user);
  await runInitialSetup();
  if (activeUid === user.uid) startRouter();
});

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = $("login-error");
  const btn = $("login-btn");
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "جارٍ الدخول…";
  try {
    await login($("login-email").value, $("login-password").value);
    $("login-password").value = "";
  } catch (err) {
    errBox.textContent = authErrorMessage(err);
    errBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "دخول";
  }
});

$("logout-btn").addEventListener("click", () => logout());
