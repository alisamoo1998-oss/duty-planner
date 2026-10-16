# اختبار التجاوب: أربعة أحجام (هاتفان، لوحي، حاسوب) × صفحات التطبيق والحوارات. محاكاة Firebase. السيرفر 8099.
# يتحقق من: عدم وجود تمرير أفقي للصفحة، أهداف لمس ≥ 44px على الهاتف، تخطيط الهاتف المخصص، وأن الحاسوب بقي على تخطيطه.
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
from mockfb import APP, AUTH, FS

BASE = "http://localhost:8099/"; V = "https://www.gstatic.com/firebasejs/10.14.1/"; OUT = "/tmp/smoke"
errors, results = [], []
def check(name, cond, extra=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
def setup(b, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    for n, body in (("firebase-app.js", APP), ("firebase-auth.js", AUTH), ("firebase-firestore.js", FS)):
        pg.route(V + n, lambda r, _q, body=body: r.fulfill(status=200, content_type="application/javascript", body=body))
    pg.route(re.compile(r"https://fonts\..*"), lambda r, _q: r.fulfill(status=200, content_type="text/css", body=""))
    return pg
def inject(pg, patch):
    pg.evaluate("p=>{const s=JSON.parse(localStorage.getItem('mockstore'));for(const [k,v] of Object.entries(p)){if(v===null)delete s[k];else s[k]=v}localStorage.setItem('mockstore',JSON.stringify(s))}", patch)
def go(pg, route, sel): pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def pid(n): return f"p_seed_{n:02d}"
def D(d, **o): return {"date": d, "status": "draft", "parmanoPersonId": None, "gardPersonId": None, "restPersonIds": [], "otherTasks": [], **o}
T = date.today()
def iso(n): return (T + timedelta(days=n)).isoformat()
def overflow(pg): return pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
def rect(pg, sel): return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}}", sel)
def css(pg, sel, prop): return pg.evaluate("([s,p])=>getComputedStyle(document.querySelector(s))[p]", [sel, prop])
TAP_JS = """() => { const bad = [];
  document.querySelectorAll('button, a[href], input, select, textarea').forEach(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return;
    let h = r.height, w = r.width;
    if (el.type === 'checkbox') { const lab = el.closest('label'); if (lab) { const lr = lab.getBoundingClientRect(); h = lr.height; w = lr.width; } }
    const min = el.matches('a.rp-link') ? 38 : 44;
    if (h < min - 0.6 || w < 40) bad.push([el.tagName, String(el.className).slice(0, 28), Math.round(w) + 'x' + Math.round(h), (el.innerText || el.value || '').slice(0, 18)]);
  }); return bad; }"""

def seed(pg):
    inject(pg, {
        f"daily_services/{iso(-1)}": D(iso(-1), status="final", parmanoPersonId=pid(4), gardPersonId=pid(5)),
        f"daily_services/{iso(0)}": D(iso(0), parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3), pid(7), pid(8), pid(10)], otherTasks=[{"personId": pid(11), "task": "حراسة المخزن"}]),
        "assignments/a1": {"personId": pid(6), "type": "إجازة", "startDate": iso(-1), "endDate": iso(3), "notes": "سفر عائلي"},
        "assignments/a2": {"personId": pid(13), "type": "مهمة أخرى", "startDate": iso(-2), "endDate": None, "notes": ""},
        "assignments/a3": {"personId": pid(9), "type": "يوم دراسي", "startDate": iso(0), "endDate": iso(0), "notes": ""},
    })
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")

with sync_playwright() as p:
    b = p.chromium.launch()
    for (w, h, name) in ((360, 740, "هاتف 360"), (390, 844, "هاتف 390"), (768, 1024, "لوحي 768"), (1280, 900, "حاسوب 1280")):
        mobile = w <= 700
        pg = setup(b, w, h); login(pg)
        check(f"[{name}] الدخول: بلا تمرير أفقي والحقول داخل الشاشة", overflow(pg) <= 0 and rect(pg, "#login-email")["r"] <= w and (not mobile or rect(pg, "#login-email")["h"] >= 46), str(rect(pg, "#login-email")))
        pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn"); pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_timeout(700)
        go(pg, "people", ".person"); seed(pg)
        for route, sel in (("people", ".person"), ("assignments", "#as-list tbody tr"), ("services", "#svc-card"), ("settings", ".check"), ("stats", "#rp-table")):
            go(pg, "people", ".person"); go(pg, route, sel)
            if route == "services":
                pg.fill("#svc-date", iso(0)); pg.dispatch_event("#svc-date", "change"); pg.wait_for_selector(".day-card")
            if route == "stats":
                pg.fill("#rp-from", iso(-3)); pg.fill("#rp-to", iso(5)); pg.click("#rp-apply"); pg.wait_for_selector("#rp-table tbody tr")
            check(f"[{name}] {route}: بلا تمرير أفقي للصفحة", overflow(pg) <= 0, str(overflow(pg)))
            if mobile:
                bad = pg.evaluate(TAP_JS)
                check(f"[{name}] {route}: كل أهداف اللمس ≥ 44px", not bad, str(bad[:4]))

        if mobile:
            # ---- الشريط السفلي ----
            r = rect(pg, ".side")
            check(f"[{name}] الشريط السفلي ثابت أسفل الشاشة بخمسة عناصر عالية", abs(r["b"] - h) < 2 and r["w"] >= w - 1 and pg.locator(".nav a").count() == 5 and rect(pg, ".nav a")["h"] >= 56 and css(pg, ".brand", "display") == "none")
            # ---- الخدمات ----
            go(pg, "services", "#svc-card"); pg.fill("#svc-date", iso(0)); pg.dispatch_event("#svc-date", "change"); pg.wait_for_selector(".day-card")
            nv = [rect(pg, f'.day-toolbar [data-action="{a}"]') for a in ("nav-prev", "nav-next")]
            check(f"[{name}] الخدمات: شريط التنقل شبكة منظمة (السابق/التاريخ/التالي بارتفاع واحد وبلا التفاف)", css(pg, ".day-toolbar .date-nav", "display") == "grid" and abs(nv[0]["h"] - nv[1]["h"]) < 1 and nv[0]["h"] <= 50 and rect(pg, "#svc-date")["w"] > w * 0.35, str(nv))
            check(f"[{name}] الخدمات: خانات الأدوار عمود واحد بتسميات متراصة وأزرار لمس", css(pg, ".roles", "gridTemplateColumns").count("px") == 1 and css(pg, ".slot", "display") == "grid" and all(rect(pg, f"[data-action={a}]")["h"] >= 44 for a in ("pick-parmano", "pick-gard", "pick-rest")))
            lab = pg.evaluate("[...document.querySelectorAll('.slot .slot-label')].map(e=>Math.round(e.getBoundingClientRect().right))")
            check(f"[{name}] الخدمات: تسميات الأدوار على محاذاة واحدة", len(set(lab)) <= 2, str(lab))
            check(f"[{name}] الخدمات: أزرار الفحص والطباعة متساوية في صف واحد", abs(rect(pg, "[data-action=check-day]")["t"] - rect(pg, "[data-action=print-day]")["t"]) < 2 and rect(pg, "[data-action=print-day]")["r"] <= w)
            check(f"[{name}] الخدمات: قائمة المتاحين عمود واحد", css(pg, ".avail", "gridTemplateColumns").count("px") == 1)
            check(f"[{name}] الخدمات: جدول المهام بطاقات (الرأس مخفي)", css(pg, ".day-tasks .tbl thead", "display") == "none" and css(pg, ".day-tasks .tbl tr", "display") == "grid")
            # ---- حوار الاختيار كورقة سفلية ----
            pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row"); dr = rect(pg, "dialog.dlg")
            check(f"[{name}] حوار الاختيار ورقة سفلية بعرض الشاشة وداخلها", abs(dr["b"] - h) < 2 and abs(dr["w"] - w) < 2 and dr["t"] >= 0 and rect(pg, "dialog.dlg .pick-row")["h"] >= 56, str(dr))
            check(f"[{name}] أزرار الحوار ظاهرة داخل الشاشة وبعرض متقارب", all(rect(pg, f"dialog.dlg {s_}")["b"] <= h + 1 and rect(pg, f"dialog.dlg {s_}")["h"] >= 44 for s_ in ("[data-clear]", "[data-cancel]")))
            pg.click("dialog.dlg [data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
            # ---- الأفراد ----
            go(pg, "people", ".person"); pr = rect(pg, ".person")
            check(f"[{name}] الأفراد: صف مدمج بزرّين كبيرين بجانب الاسم", pr["h"] <= 92 and css(pg, ".person .row-actions", "display") == "flex" and rect(pg, ".person .row-actions .btn")["h"] >= 44 and rect(pg, ".person .row-actions")["r"] <= w, str(pr))
            check(f"[{name}] الأفراد: كل الصفوف الثمانية عشر متناسقة الارتفاع", max(pg.evaluate("[...document.querySelectorAll('.person')].map(e=>Math.round(e.getBoundingClientRect().height))")) <= 100)
            pg.click("[data-action=edit]"); pg.wait_for_selector("dialog.dlg"); dr = rect(pg, "dialog.dlg")
            check(f"[{name}] حوار تعديل الفرد ورقة سفلية وزر الحفظ ظاهر", abs(dr["b"] - h) < 2 and abs(dr["w"] - w) < 2 and rect(pg, "dialog.dlg button[type=submit]")["b"] <= h and rect(pg, "dialog.dlg input[name=name]")["h"] >= 46)
            pg.click("dialog.dlg [data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
            # ---- التعيينات ----
            go(pg, "assignments", "#as-list tbody tr")
            check(f"[{name}] التعيينات: بطاقات مدمجة (الرأس مخفي والصف شبكة)", css(pg, "#as-list .tbl thead", "display") == "none" and css(pg, "#as-list .tbl tr", "display") == "grid")
            cr = rect(pg, "#as-list .tbl tr")
            check(f"[{name}] التعيينات: ارتفاع البطاقة مدمج (≤ 190px) وأزرارها كبيرة داخل الشاشة", cr["h"] <= 190 and all(x["h"] >= 44 and x["r"] <= w for x in [rect(pg, "#as-list .td-actions .btn")]), str(cr))
            cells = pg.evaluate("[...document.querySelectorAll('#as-list .tbl tr:first-child td')].map(e=>e.dataset.label||'actions')")
            check(f"[{name}] التعيينات: الاسم والنوع في الصف الأول ثم الحقول الأربعة في صف", pg.evaluate("(()=>{const tds=[...document.querySelectorAll('#as-list .tbl tr:first-child td')];const top=tds.map(t=>Math.round(t.getBoundingClientRect().top));return top[0]===top[1]&&top[2]===top[3]&&top[3]===top[4]&&top[5]===top[2]&&top[2]>top[0]})()"), str(cells))
            pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg"); dr = rect(pg, "dialog.dlg")
            check(f"[{name}] حوار التعيين ورقة سفلية بحقول كبيرة وخيار «بلا نهاية» داخلها", abs(dr["b"] - h) < 2 and rect(pg, "dialog.dlg select[name=personId]")["h"] >= 46 and rect(pg, "dialog.dlg .check-inline")["h"] >= 44 and rect(pg, "dialog.dlg .check-inline")["r"] <= w)
            pg.click("dialog.dlg [data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
            # ---- الإحصائيات ----
            go(pg, "stats", "#rp-table"); pg.fill("#rp-from", iso(-3)); pg.fill("#rp-to", iso(5)); pg.click("#rp-apply"); pg.wait_for_selector("#rp-table tbody tr")
            check(f"[{name}] الكشف: زر «عرض الكشف» بعرض كامل وأزرار التصدير في صف واحد", rect(pg, "#rp-apply")["w"] >= w - 60 and len(set(pg.evaluate("[...document.querySelectorAll('.rp-actions .btn')].map(e=>Math.round(e.getBoundingClientRect().top))"))) == 1)
            check(f"[{name}] الكشف: خانات الأعمدة كبيرة اللمس", all(rect(pg, f"label.rp-chip:has(input[data-col={c}])")["h"] >= 44 for c in ("date", "parmano", "gard", "rest", "tasks")))
            pg.click("label.rp-chip:has(input[data-col=tasks])")
            wrap = pg.evaluate("(()=>{const e=document.querySelector('.rp-wrap');return [e.scrollWidth,e.clientWidth]})()")
            check(f"[{name}] الكشف بلا عمود المهام: تمرير أفقي طفيف فقط (≤ 80px) والصفحة نفسها بلا تمرير", wrap[0] - wrap[1] <= 80 and overflow(pg) <= 0, str(wrap))
            check(f"[{name}] الكشف بلا المهام: اسم اليوم والتاريخ في سطر واحد", pg.locator(".rp-dl").first.evaluate("e=>e.getBoundingClientRect().height") < 30)
            pg.click("label.rp-chip:has(input[data-col=tasks])")
            wrap = pg.evaluate("(()=>{const e=document.querySelector('.rp-wrap');return [e.scrollWidth,e.clientWidth]})()")
            check(f"[{name}] الكشف الكامل: يتمرر أفقيًا داخل حاويته فقط وعمود التاريخ ثابت", wrap[0] > wrap[1] and overflow(pg) <= 0 and css(pg, "#rp-table tbody td", "position") == "sticky")
            pg.screenshot(path=f"{OUT}/resp_{w}_stats.png", full_page=True)
        else:
            # ---- الحاسوب واللوحي: التخطيط المعروف ----
            go(pg, "services", "#svc-card"); pg.fill("#svc-date", iso(0)); pg.dispatch_event("#svc-date", "change"); pg.wait_for_selector(".day-card")
            if w > 860:
                check(f"[{name}] الشريط الجانبي ظاهر والتنقل ليس سفليًا", css(pg, ".side", "position") == "sticky" and rect(pg, ".side")["w"] > 200 and css(pg, ".brand", "display") != "none")
                check(f"[{name}] شريط الأيام أفقي كما كان (flex)", css(pg, ".day-toolbar", "display") == "flex" and css(pg, ".day-toolbar .date-nav", "display") == "flex")
                check(f"[{name}] بطاقة اليوم: عمودان للأدوار والمتاحين كما كانت", css(pg, ".roles", "gridTemplateColumns").count("px") == 2 and css(pg, ".avail", "gridTemplateColumns").count("px") == 2 and css(pg, ".slot", "display") == "flex")
                go(pg, "people", ".person")
                check(f"[{name}] الأفراد: شبكة بأربعة أعمدة كما كانت", css(pg, ".person", "gridTemplateColumns").count("px") == 4)
                go(pg, "assignments", "#as-list tbody tr")
                check(f"[{name}] التعيينات: جدول حقيقي برأسه", css(pg, "#as-list .tbl", "display") == "table" and css(pg, "#as-list .tbl thead", "display") != "none" and css(pg, "#as-list .tbl tr", "display") == "table-row")
                pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg"); dr = rect(pg, "dialog.dlg")
                check(f"[{name}] الحوار نافذة وسطية لا ورقة سفلية", dr["l"] > 100 and dr["b"] < h - 20 and dr["w"] <= 530, str(dr))
                pg.click("dialog.dlg [data-cancel]")
                go(pg, "stats", "#rp-table")
                check(f"[{name}] الكشف: نموذج الفترة صف أفقي (flex) كما كان", css(pg, ".rp-form", "display") == "flex")
            else:
                check(f"[{name}] اللوحي: شريط تنقل سفلي وبلا تمرير أفقي", abs(rect(pg, ".side")["b"] - h) < 2 and overflow(pg) <= 0)
                go(pg, "assignments", "#as-list tbody tr")
                check(f"[{name}] اللوحي: التعيينات جدول حقيقي داخل الشاشة", css(pg, "#as-list .tbl", "display") == "table" and rect(pg, "#as-list .tbl")["r"] <= w + 1)
        pg.close()
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
