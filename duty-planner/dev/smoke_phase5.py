# اختبار المرحلة 5 (طباعة بطاقة اليوم) في Chromium مع محاكاة Firebase + توليد PDF حقيقي بحجم A4.
# السيرفر على المنفذ 8099. لا يختبر نافذة الطباعة نفسها (نافذة نظام التشغيل) بل ناتج الطباعة الذي ينتجه المتصفح.
import os, re, sys, subprocess, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from mockfb import APP, AUTH, FS

BASE = "http://localhost:8099/"; V = "https://www.gstatic.com/firebasejs/10.14.1/"; OUT = "/tmp/smoke"
errors, results = [], []
def check(name, cond, extra=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
def setup(b, w=1280, h=900):
    ctx = b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" else None)
    for n, body in (("firebase-app.js", APP), ("firebase-auth.js", AUTH), ("firebase-firestore.js", FS)):
        pg.route(V + n, lambda r, _q, body=body: r.fulfill(status=200, content_type="application/javascript", body=body))
    pg.route(re.compile(r"https://fonts\..*"), lambda r, _q: r.fulfill(status=200, content_type="text/css", body=""))
    return pg
def store(pg): return pg.evaluate("JSON.parse(localStorage.getItem('mockstore')||'{}')")
def raw(pg): return pg.evaluate("localStorage.getItem('mockstore')")
def inject(pg, patch):
    pg.evaluate("p=>{const s=JSON.parse(localStorage.getItem('mockstore'));for(const [k,v] of Object.entries(p)){if(v===null)delete s[k];else s[k]=v}localStorage.setItem('mockstore',JSON.stringify(s))}", patch)
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")
    pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn")
    pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_selector(".toast-ok")
def go(pg, route, sel): pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def view(pg, iso):
    go(pg, "people", ".person"); go(pg, "services", "#svc-card")
    pg.fill("#svc-date", iso); pg.dispatch_event("#svc-date", "change"); pg.wait_for_selector(".day-card")
def iso(n): return (B + timedelta(days=n)).isoformat()
def fmt(i): y, m, d = i.split("-"); return f"{d}/{m}/{y}"
def pid(n): return f"p_seed_{n:02d}"
def D(d, **o): return {"date": d, "status": "draft", "parmanoPersonId": None, "gardPersonId": None, "restPersonIds": [], "otherTasks": [], **o}
def pdf(pg, name):
    path = f"{OUT}/{name}.pdf"; pg.pdf(path=path, prefer_css_page_size=True, print_background=False); return path
def pages(path): return len(PdfReader(path).pages)
def raster(path, prefix):
    subprocess.run(["pdftoppm", "-r", "70", "-gray", "-png", path, f"{OUT}/{prefix}"], check=True)
def ptext(path, n): return unicodedata.normalize("NFKC", subprocess.run(["pdftotext", "-f", str(n), "-l", str(n), "-layout", path, "-"], capture_output=True, text=True).stdout)

HIDDEN = [".side", ".topbar", ".toasts", ".day-toolbar", ".day-strip"]
LUM_JS = """() => {
  const lum = c => { const m = c.match(/[\\d.]+/g).map(Number); if (m.length >= 4 && m[3] === 0) return null;
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const bad = [];
  document.querySelectorAll('.day-card, .day-card *').forEach(el => {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.getClientRects().length === 0) return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { const l = lum(cs.color); if (l !== null && l > 0.2) bad.push(['نص فاتح', el.className, cs.color]); if (+cs.opacity < 1) bad.push(['شفافية', el.className, cs.opacity]); }
    const bg = lum(cs.backgroundColor); if (bg !== null && bg < 0.9) bad.push(['خلفية ملوّنة', el.className, cs.backgroundColor]);
  });
  return bad; }"""

today = date.today(); B = today + timedelta((6 - today.weekday()) % 7)   # أقرب أحد
with sync_playwright() as p:
    b = p.chromium.launch(); pg = setup(b); login(pg); go(pg, "services", "#svc-card")
    tasks = [{"personId": pid(11), "task": "حراسة المخزن"}]
    inject(pg, {
        f"daily_services/{iso(-1)}": D(iso(-1), parmanoPersonId=pid(4), gardPersonId=pid(13)),
        f"daily_services/{iso(0)}": D(iso(0), parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3), pid(7), pid(8)], otherTasks=tasks),
        "assignments/a_long": {"personId": pid(5), "type": "مهمة طويلة", "startDate": iso(-1), "endDate": iso(5), "notes": ""},
        "assignments/a_day": {"personId": pid(6), "type": "يوم دراسي", "startDate": iso(0), "endDate": iso(0), "notes": ""},
    })
    view(pg, iso(0))

    # ===== الزر =====
    btn = pg.locator("[data-action=print-day]")
    check("زر «🖨️ طباعة بطاقة اليوم» موجود وواضح", btn.count() == 1 and btn.inner_text().strip() == "🖨️ طباعة بطاقة اليوم")
    check("الزر بجانب زر الفحص في رأس البطاقة", pg.locator(".day-head [data-action=check-day]").count() == 1 and pg.locator(".day-head [data-action=print-day]").count() == 1)
    pg.evaluate("""()=>{window.__p={n:0,title:null};window.print=()=>{window.__p.n++;window.__p.title=document.title;window.dispatchEvent(new Event('afterprint'))}}""")
    title0 = pg.title(); before = raw(pg)
    btn.click()
    st = pg.evaluate("window.__p")
    check("الضغط يستدعي نافذة الطباعة مرة واحدة", st["n"] == 1)
    check("عنوان الصفحة أثناء الطباعة يحمل تاريخ اليوم (اسم ملف PDF)", st["title"] == f"خدمة {iso(0)}", st["title"])
    check("العنوان يُستعاد بعد الطباعة", pg.title() == title0)
    check("الطباعة لا تكتب شيئًا في Firestore ولا تغيّر الصفحة", raw(pg) == before and pg.locator(".day-card").count() == 1)
    check("اليوم غير المُعدّ: لا زر طباعة", (lambda: (pg.fill("#svc-date", iso(80)), pg.dispatch_event("#svc-date", "change"), pg.locator("[data-action=print-day]").count() == 0)[-1])())
    view(pg, iso(0))

    # ===== أثر @media print على الشاشة =====
    check("على الشاشة: التنقل والأدوات ظاهرة كما كانت", all(pg.is_visible(s) for s in (".side", ".topbar", ".day-toolbar", ".day-strip")) and pg.is_visible("[data-action=pick-parmano]"))

    # ===== وضع الطباعة (عرض A4 ≈ 794px) =====
    pg.set_viewport_size({"width": 794, "height": 1123}); pg.emulate_media(media="print")
    check("في الطباعة: التنقل والشريط والأدوات والإشعارات مخفية", not any(pg.is_visible(s) for s in HIDDEN))
    check("كل عنصر no-print مخفي (بما فيها خلايا الجدول)", pg.evaluate("[...document.querySelectorAll('.no-print')].every(e=>getComputedStyle(e).display==='none')") and pg.locator(".no-print").count() >= 8)
    check("البطاقة ظاهرة", pg.is_visible(".day-card"))
    vis = pg.inner_text(".day-card")
    need = [f"خدمة يوم", fmt(iso(0)), "الخفير:", "الحارس:", "البديل:", "بديل الحارس:", "الراحة:", "الأفراد المتاحون", "المهام والتعيينات", "الفرد", "المهمة", "من تاريخ", "إلى تاريخ",
            "بن ناصر", "عقون", "فقير", "بوثلجة", "حميدي", "دبزة", "حراسة المخزن", "مهمة طويلة", "يوم دراسي", "مسودة"]
    miss = [t for t in need if t not in vis]
    check("كل بيانات اليوم المهمة تظهر في الطباعة", not miss, str(miss))
    check("اسم يوم الأسبوع مع التاريخ: «خدمة يوم الأحد : dd/mm/yyyy»", f"خدمة يوم الأحد : {fmt(iso(0))}" in vis.replace("\n", " "))
    gone = [t for t in ("فحص اليوم", "طباعة", "تعديل", "تغيير", "اختيار", "تلقائي من اليوم السابق", "اعتماد اليوم", "حذف المسودة", "إضافة مهمة", "من صفحة التعيينات") if t in vis]
    check("لا أزرار ولا نصوص واجهة في الطباعة", not gone, str(gone))
    check("البديل (فقير) يظهر في خانته وليس بين المتاحين", "فقير" in pg.inner_text(".roles") and "فقير" not in pg.inner_text(".avail"))
    cols = lambda sel: pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).gridTemplateColumns.trim().split(/\\s+/).length")
    check("الخانات عمودان والمتاحون عمودان (لا تحويل للهاتف)", cols(".roles") == 2 and cols(".avail") == 2)
    check("المهام جدول حقيقي برأس مكرر عند تعدد الصفحات", pg.evaluate("[getComputedStyle(document.querySelector('.tbl')).display,getComputedStyle(document.querySelector('.tbl thead')).display,getComputedStyle(document.querySelector('.tbl tr:nth-child(1) td')).display]") == ["table", "table-header-group", "table-cell"])
    check("لا تسميات data-label بطاقات الهاتف في الجدول", pg.evaluate("getComputedStyle(document.querySelector('.tbl td'),'::before').content") in ("none", "normal"))
    check("منع انقسام الصفوف والعناصر بين الصفحتين", pg.evaluate("['.avail-item','.tbl tr','.slot','.roles'].every(s=>getComputedStyle(document.querySelector(s)).breakInside==='avoid')"))
    check("الرأس والعناوين لا تنفصل عما بعدها", pg.evaluate("['.day-head','.divider','.day-tasks .sheet-head'].every(s=>getComputedStyle(document.querySelector(s)).breakAfter==='avoid')"))
    bad = pg.evaluate(LUM_JS)
    check("أبيض وأسود: كل النصوص داكنة وبلا خلفيات ملوّنة أو شفافية", not bad, str(bad[:4]))
    stat = pg.evaluate("[...document.querySelectorAll('.avail-item')].map(e=>e.innerText.trim())")
    check("الحالات مكتوبة نصًّا لا بالألوان فقط (متاح / سبب ⚠️ / طويلة بتاريخ العودة)", any("متاح" in s for s in stat) and any("يوم دراسي" in s for s in stat) and any("يعود" in s and "مهمة طويلة" in s for s in stat) and any("راحة" in s for s in stat))
    check("لا تمرير أفقي في الطباعة", not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))

    # ===== PDF حقيقي A4 =====
    f1 = pdf(pg, "p5_day"); rd = PdfReader(f1); w, h = [float(x) for x in rd.pages[0].mediabox[2:]]
    check("PDF: صفحة A4 عمودية", abs(w - 595.3) < 2 and abs(h - 841.9) < 2, f"{w:.1f}x{h:.1f}")
    check("PDF: اليوم المعتاد في صفحة واحدة", len(rd.pages) == 1, str(len(rd.pages)))
    t1 = ptext(f1, 1)
    check("PDF: يحتوي التاريخ وحقول الخدمة", fmt(iso(0)) in t1 and "TASK" not in t1 and len(t1.strip()) > 200)
    check("PDF: لا نص من عناصر التطبيق (أزرار/تنقل)", not any(x in t1 for x in ("فحص اليوم", "Duty Planner", "me@test.com")))
    raster(f1, "p5_day")

    # ===== يوم طويل: صفحة ثانية عند الضرورة =====
    many = [{"personId": pid(1 + i % 18), "task": f"TASK-{i:02d}"} for i in range(30)]
    inject(pg, {f"daily_services/{iso(1)}": D(iso(1), parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3)], otherTasks=many)})
    pg.emulate_media(media="screen"); pg.set_viewport_size({"width": 1280, "height": 900}); view(pg, iso(1)); pg.emulate_media(media="print")
    f2 = pdf(pg, "p5_long"); n2 = pages(f2)
    check("اليوم الطويل (30 مهمة) يمتد إلى صفحة ثانية", n2 == 2, str(n2))
    tt = [ptext(f2, i) for i in range(1, n2 + 1)]
    day_str = fmt(iso(1))
    rowpages = lambda tok: [k for k, t in enumerate(tt) if sum(1 for ln in t.splitlines() if tok in ln and day_str in ln) == 1]
    where = {f"TASK-{i:02d}": rowpages(f"TASK-{i:02d}") for i in range(30)}
    check("كل صف مهمة في الجدول يظهر مرة واحدة تمامًا في صفحة واحدة (لا ينقسم)", all(len(v) == 1 for v in where.values()))
    seq = [v[0] for _, v in sorted(where.items())]
    check("ترتيب المهام محفوظ عبر الصفحتين (1 ثم 2)", seq == sorted(seq) and seq[0] == 0 and seq[-1] == 1)
    check("رأس جدول المهام يتكرر في الصفحة الثانية", "من تاريخ"[::-1] in tt[1] or "من تاريخ" in tt[1] or "ﺦﻳﺭﺎﺗ" in tt[1] or "تاريخ"[::-1] in tt[1] or "تاريخ" in tt[1])
    raster(f2, "p5_long")

    # ===== الشاشة والهاتف لا تتأثران =====
    pg.emulate_media(media="screen"); pg.set_viewport_size({"width": 1280, "height": 900}); view(pg, iso(0))
    check("العودة إلى الشاشة: الواجهة سليمة كما كانت", pg.is_visible(".side") and pg.is_visible(".day-toolbar") and pg.is_visible("[data-action=print-day]"))
    m = setup(b, 390, 844); login(m); go(m, "services", "#svc-card")
    inject(m, {f"daily_services/{iso(0)}": D(iso(0), parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3)])}); view(m, iso(0))
    check("الهاتف: زر الطباعة ظاهر داخل الشاشة", m.is_visible("[data-action=print-day]") and m.evaluate("(()=>{const r=document.querySelector('[data-action=print-day]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"))
    check("الهاتف: لا تمرير أفقي والخانات في عمود واحد", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth") and m.evaluate("getComputedStyle(document.querySelector('.roles')).gridTemplateColumns.trim().split(/\\s+/).length") == 1)
    m.screenshot(path=f"{OUT}/p5_mobile.png", full_page=False)
    check("الهاتف: الجدول والتنقل ظاهران كما كانا", m.is_visible(".side") and m.is_visible(".day-strip"))
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
