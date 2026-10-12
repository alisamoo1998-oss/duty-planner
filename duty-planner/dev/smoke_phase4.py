# اختبار المرحلة 4 (🔎 فحص اليوم) في Chromium مع محاكاة Firebase. السيرفر على المنفذ 8099.
import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
from mockfb import APP, AUTH, FS

BASE = "http://localhost:8099/"; V = "https://www.gstatic.com/firebasejs/10.14.1/"
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
def coll(pg, name): return {k.split("/")[1]: v for k, v in store(pg).items() if k.startswith(name + "/")}
def inject(pg, patch):
    pg.evaluate("p=>{const s=JSON.parse(localStorage.getItem('mockstore'));for(const [k,v] of Object.entries(p)){if(v===null)delete s[k];else s[k]=v}localStorage.setItem('mockstore',JSON.stringify(s))}", patch)
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")
    pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn")
    pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_selector(".toast-ok")
def go(pg, route, sel): pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def set_date(pg, iso): pg.fill("#svc-date", iso); pg.dispatch_event("#svc-date", "change")
def view(pg, iso):  # يفتح اليوم بعد إعادة تحميل البيانات من التخزين
    go(pg, "people", ".person"); go(pg, "services", "#svc-card"); set_date(pg, iso); pg.wait_for_selector(".day-card")
def fmt(iso): y, m, d = iso.split("-"); return f"{d}/{m}/{y}"
def iso(n): return (B + timedelta(days=n)).isoformat()
def pid(n): return f"p_seed_{n:02d}"
def D(d, **o): return {"date": d, "status": "draft", "parmanoPersonId": None, "gardPersonId": None, "restPersonIds": [], "otherTasks": [], **o}
def settle(pg): pg.wait_for_selector("dialog.dlg", state="detached")
def run_check(pg): pg.click("[data-action=check-day]"); pg.wait_for_selector("#dc-panel"); return pg.inner_text("#dc-panel")
def lvl(pg): return re.search(r"dc-(ok|warn|bad)", pg.get_attribute("#dc-panel", "class")).group(1)
def line(pg, title): return pg.locator(".dc-sec", has_text=title).first

today = date.today(); B = today + timedelta((6 - today.weekday()) % 7)   # أقرب أحد
with sync_playwright() as p:
    b = p.chromium.launch(); pg = setup(b); login(pg)
    go(pg, "services", "#svc-card")
    A, Bp, C = pid(1), pid(2), pid(3)
    inject(pg, {
        # سليم
        f"daily_services/{iso(0)}": D(iso(0), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C, pid(7), pid(8)]),
        # ناقص الراحة (أصفر)، ومعه يوم سابق فارغ
        f"daily_services/{iso(9)}": D(iso(9)),
        f"daily_services/{iso(10)}": D(iso(10), parmanoPersonId=A, gardPersonId=Bp),
        # 48 ساعة: خفير الأمس يُسجَّل خفيرًا
        f"daily_services/{iso(20)}": D(iso(20), parmanoPersonId=A),
        f"daily_services/{iso(21)}": D(iso(21), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C]),
        # الفصل
        f"daily_services/{iso(29)}": D(iso(29)),
        f"daily_services/{iso(30)}": D(iso(30), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C]),
        f"daily_services/{iso(32)}": D(iso(32), gardPersonId=A),
        # الجمعة (B أحد → +5 جمعة) مع راحة
        f"daily_services/{iso(5)}": D(iso(5), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C]),
        # لا سائق
        f"daily_services/{iso(39)}": D(iso(39)),
        f"daily_services/{iso(40)}": D(iso(40), parmanoPersonId=pid(4), gardPersonId=pid(5), restPersonIds=[pid(11), pid(13)], otherTasks=[{"personId": pid(15), "task": "حراسة"}]),
        # سائق واحد
        f"daily_services/{iso(49)}": D(iso(49)),
        f"daily_services/{iso(50)}": D(iso(50), parmanoPersonId=pid(4), gardPersonId=A, restPersonIds=[pid(5), pid(11)], otherTasks=[{"personId": pid(13), "task": "حراسة"}]),
        # راحة 5
        f"daily_services/{iso(59)}": D(iso(59)),
        f"daily_services/{iso(60)}": D(iso(60), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C, pid(7), pid(8), pid(9), pid(10)]),
        # تكليف طويل لخفير اليوم
        f"daily_services/{iso(69)}": D(iso(69)),
        f"daily_services/{iso(70)}": D(iso(70), parmanoPersonId=A, gardPersonId=Bp, restPersonIds=[C]),
        "assignments/a_long": {"personId": A, "type": "مهمة طويلة", "startDate": iso(68), "endDate": iso(72), "notes": ""},
        "assignments/a_day": {"personId": Bp, "type": "يوم دراسي", "startDate": iso(70), "endDate": iso(70), "notes": ""},
    })

    # ===== الزر والقراءة فقط =====
    view(pg, iso(0))
    check("الزر «🔎 فحص اليوم» ظاهر وواضح", pg.locator("[data-action=check-day]").inner_text().strip() == "🔎 فحص اليوم")
    check("لا نتيجة قبل الضغط", pg.locator("#dc-panel").count() == 0)
    before = raw(pg)
    txt = run_check(pg)
    check("الفحص لا يكتب شيئًا في Firestore", raw(pg) == before)

    # ===== سليم =====
    check("النتيجة العامة: 🟢 سليم", lvl(pg) == "ok" and "🟢 سليم" in pg.inner_text(".dc-verdict"), pg.inner_text(".dc-verdict"))
    check("بنود سليمة بصيغة المواصفات", all(t in txt for t in ("الخفير: مكتمل", "الحارس: مكتمل", "الراحة: 3 أفراد", "السائقون المتاحون: 5")), txt.replace("\n", " | ")[:240])
    check("الواجهة بلا مصطلحات تقنية", not re.search(r"khifara|parmano|gard", txt, re.I))
    check("🚗 للسائقين في تفاصيل السائقين", pg.locator(".dc-drivers .car").count() == 5)
    pg.click("[data-action=close-check]"); check("زر الإخفاء", pg.locator("#dc-panel").count() == 0)

    # ===== أصفر + تحديث تلقائي بعد تعديل =====
    view(pg, iso(10)); run_check(pg)
    check("بلا راحة: 🟡 توجد ملاحظات أو تنبيهات", lvl(pg) == "warn" and "🟡 توجد ملاحظات أو تنبيهات" in pg.inner_text(".dc-verdict"))
    check("سبب التنبيه مذكور", "لم يُحدَّد أي فرد للراحة" in pg.inner_text("#dc-panel"))
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row")
    pg.locator("dialog.dlg .pick-row", has_text="شيتور").locator("input").check(); pg.click("dialog.dlg [data-save]"); settle(pg)
    pg.wait_for_function("document.querySelector('#dc-panel').className.includes('dc-ok')")
    check("اللوحة المفتوحة تتحدّث بعد التعديل (🟢)", lvl(pg) == "ok" and "الراحة: فرد واحد" in pg.inner_text("#dc-panel"))
    check("التعديل حُفظ فعلًا", coll(pg, "daily_services")[iso(10)]["restPersonIds"] == [pid(10)])

    # ===== 48 ساعة =====
    view(pg, iso(21)); run_check(pg)
    check("48 ساعة: خفير الأمس كخفير اليوم = 🔴", lvl(pg) == "bad" and "ستُحسب مرتين" in pg.inner_text("#dc-panel") and "🔴 توجد مشكلة مهمة تحتاج إلى الانتباه" in pg.inner_text(".dc-verdict"))
    d21 = coll(pg, "daily_services")[iso(21)]
    check("الفحص لم يثبّت البديل ولم يغيّر الآلية", "parmanoSubstituteId" not in d21 and "أحمد" not in "" and "تلقائي" in pg.locator(".slot", has_text="البديل").first.inner_text())

    # ===== الفصل =====
    view(pg, iso(30)); t = run_check(pg)
    check("الفصل: رسالة التعارض المعتمدة 🔴", lvl(pg) == "bad" and "تعارض مع قاعدة الفصل بين الخفير والحارس" in t and fmt(iso(30)) in t and fmt(iso(32)) in t)
    check("بند الفصل أحمر", "dc-bad" in line(pg, "الفصل").get_attribute("class"))
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-ok")
    check("التنبيه لا يمنع الاعتماد", coll(pg, "daily_services")[iso(30)]["status"] == "final" and lvl(pg) == "bad")
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-warn")

    # ===== الجمعة والراحة =====
    view(pg, iso(5)); t = run_check(pg)
    check("الراحة يوم الجمعة = استثناء 🟡 (سلوك محدَّث: كانت 🔴)", lvl(pg) == "warn" and "لا توجد راحة يوم الجمعة" in t and "استثناء" in t and "dc-warn" in line(pg, "الراحة").get_attribute("class"))
    view(pg, iso(60)); t = run_check(pg)
    check("الراحة 5 أفراد = 🔴 (الحد 4)", "يتجاوز الحد الأقصى (4)" in t and lvl(pg) == "bad")

    # ===== التكليفات =====
    view(pg, iso(70)); t = run_check(pg)
    check("تكليف طويل لخفير اليوم 🔴 مع تاريخ الانتهاء", lvl(pg) == "bad" and "لديه تكليف طويل" in t and fmt(iso(72)) in t)
    check("تكليف ليوم واحد للحارس 🟡 ضمن البند", "لديه تكليف في هذا اليوم: يوم دراسي" in t)
    check("بند التكليفات أحمر", "dc-bad" in line(pg, "التكليفات").get_attribute("class"))

    # ===== السائقون =====
    view(pg, iso(40)); t = run_check(pg)
    check("لا سائق: 🔴 لا يوجد سائق متاح في هذا اليوم", "لا يوجد سائق متاح في هذا اليوم" in t and "dc-bad" in line(pg, "لا يوجد سائق").get_attribute("class") and lvl(pg) == "bad")
    check("تفاصيل أسباب عدم توفر كل سائق", pg.locator(".dc-drivers .dc-item").count() == 5 and "الخفير" in pg.locator(".dc-drivers .dc-item", has_text="فقير").inner_text() and "راحة" in pg.locator(".dc-drivers .dc-item", has_text="مرزوقي").inner_text() and "مهمة" in pg.locator(".dc-drivers .dc-item", has_text="فلاح").inner_text())
    pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row")
    pg.locator("dialog.dlg .pick-row", has_text="غنانوة").click(); settle(pg)
    pg.wait_for_function("document.querySelector('#dc-panel').innerText.includes('السائقون المتاحون: 1')")
    check("التنبيه الأحمر لا يمنع الحفظ، واللوحة تتحدّث", coll(pg, "daily_services")[iso(40)]["gardPersonId"] == pid(12) and "dc-ok" in line(pg, "السائقون المتاحون").get_attribute("class"))
    view(pg, iso(50)); t = run_check(pg)
    check("سائق واحد: 🟢 السائقون المتاحون: 1 (فلاح)", "السائقون المتاحون: 1" in t and "dc-ok" in line(pg, "السائقون المتاحون").get_attribute("class") and "🟢 متاح" in pg.locator(".dc-drivers .dc-item", has_text="فلاح").inner_text())

    # ===== إخفاء عند تغيير اليوم، وسلامة عامة =====
    pg.click("[data-action=nav-next]"); check("تغيير اليوم يُخفي اللوحة", pg.locator("#dc-panel").count() == 0)
    pg.click("[data-action=nav-prev]"); check("والعودة لا تُظهرها تلقائيًا", pg.locator("#dc-panel").count() == 0)
    check("لا مجموعات جديدة", {k.split("/")[0] for k in store(pg)} == {"people", "assignments", "daily_services", "settings"})
    check("الأفراد والتعيينات لم تُمسّ", len(coll(pg, "people")) == 18 and len(coll(pg, "assignments")) == 2)
    for _ in range(3): go(pg, "people", ".person"); go(pg, "services", "#svc-card")
    set_date(pg, iso(0)); pg.wait_for_selector(".day-card"); pg.click("[data-action=check-day]")
    check("لا تراكم أحداث: لوحة واحدة بعد زيارات متكررة", pg.locator("#dc-panel").count() == 1)
    pg.click("[data-action=close-check]")
    # الفحص بعد تحويل اليوم إلى معتمد
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-ok"); pg.click("[data-action=check-day]"); pg.wait_for_selector("#dc-panel")
    check("الفحص يعمل على اليوم المعتمد أيضًا", lvl(pg) == "ok")
    # اليوم غير المُعدّ لا زر فحص
    set_date(pg, iso(100)); pg.wait_for_selector(".empty")
    check("اليوم غير المُعدّ: لا زر فحص", pg.locator("[data-action=check-day]").count() == 0)

    # ===== الهاتف =====
    m = setup(b, 390, 844); login(m); go(m, "services", "#svc-card")
    inject(m, {f"daily_services/{iso(39)}": D(iso(39)), f"daily_services/{iso(40)}": D(iso(40), parmanoPersonId=pid(4), gardPersonId=pid(5), restPersonIds=[pid(11), pid(13)], otherTasks=[{"personId": pid(15), "task": "حراسة"}])})
    view(m, iso(40)); run_check(m)
    check("الهاتف: لا تمرير أفقي مع اللوحة", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    check("الهاتف: اللوحة داخل الشاشة", m.evaluate("(()=>{const r=document.querySelector('#dc-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"))
    m.locator("#dc-panel").screenshot(path="/tmp/smoke/p4_mobile_panel.png")
    pg.click("[data-action=check-day]") if False else None
    view(pg, iso(30)); run_check(pg); pg.locator(".day-card").screenshot(path="/tmp/smoke/p4_desktop_card.png")
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
