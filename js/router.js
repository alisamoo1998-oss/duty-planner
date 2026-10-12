// موجّه بسيط يعتمد على hash:  #/services  #/people  #/assignments  #/stats  #/settings
const ROUTES = {
  services:    { title: "برنامج الخدمات", load: () => import("./views/services.js") },
  people:      { title: "الأفراد",         load: () => import("./views/people.js") },
  assignments: { title: "التعيينات",       load: () => import("./views/assignments.js") },
  stats:       { title: "الإحصائيات",      load: () => import("./views/stats.js") },
  settings:    { title: "الإعدادات",       load: () => import("./views/settings.js") },
};
const DEFAULT_ROUTE = "services";

let running = false;
let listening = false;
let renderToken = 0;

export function startRouter() {
  running = true;
  if (!listening) {
    window.addEventListener("hashchange", handle);
    listening = true;
  }
  if (!location.hash) history.replaceState(null, "", `#/${DEFAULT_ROUTE}`);
  handle();
}

export function stopRouter() {
  running = false;
  renderToken++;
}

async function handle() {
  if (!running) return;
  const key = location.hash.replace(/^#\/?/, "").split("/")[0] || DEFAULT_ROUTE;
  const route = ROUTES[key];
  if (!route) {
    location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }

  document.querySelectorAll("[data-route]").forEach((a) => {
    const on = a.dataset.route === key;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.getElementById("page-title").textContent = route.title;
  document.title = `${route.title} — Duty Planner`;

  const view = document.getElementById("view");
  const token = ++renderToken;
  view.innerHTML = '<p class="muted pad">جارٍ التحميل…</p>';
  try {
    const mod = await route.load();
    if (token !== renderToken) return; // تم الانتقال لصفحة أخرى أثناء التحميل
    view.innerHTML = "";
    await mod.render(view);
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    view.innerHTML = '<div class="notice notice-bad">تعذّر عرض هذه الصفحة. افتح الإعدادات للفحص.</div>';
  }
}
