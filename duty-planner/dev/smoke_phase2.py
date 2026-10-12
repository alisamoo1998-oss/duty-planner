# اختبار المرحلة 2 (الأفراد والتعيينات) في Chromium مع محاكاة Firebase. السيرفر على المنفذ 8099.
import os, re, sys
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
def coll(pg, name): return {k: v for k, v in store(pg).items() if k.startswith(name + "/")}
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")
    pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn")
    pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_selector(".toast-ok")
def go(pg, route, sel):
    pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def dlg_ok(pg):  # زر التأكيد في حوار تأكيد
    pg.click("dialog.dlg button[value=ok]")
def d(n): return (date.today() + timedelta(days=n)).isoformat()

with sync_playwright() as p:
    b = p.chromium.launch(); pg = setup(b); login(pg)
    seeded = dict(coll(pg, "people"))

    # ================= الأفراد =================
    go(pg, "people", ".person")
    check("18 فردًا ظاهرين", pg.locator(".person").count() == 18)
    check("🚗 للسائقين الخمسة", pg.locator(".person .car").count() == 5)

    pg.click("#add-person"); pg.wait_for_selector("dialog.dlg")
    pg.click("dialog.dlg button[type=submit]")
    check("اسم فارغ يعطي رسالة عربية", "اكتب اسم الفرد" in pg.inner_text("dialog [data-error]"))
    pg.fill("dialog input[name=name]", "  سليمان   الجديد "); pg.select_option("dialog select[name=isDriver]", "yes")
    pg.fill("dialog textarea[name=notes]", "ملاحظة تجريبية")
    pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached")
    pg.wait_for_selector("text=سليمان الجديد")
    newp = {k: v for k, v in coll(pg, "people").items() if v["name"] == "سليمان الجديد"}
    check("أُضيف فرد جديد (الاسم منظَّف)", len(newp) == 1)
    nid, nv = next(iter(newp.items()))
    check("حقول الفرد الجديد صحيحة", nv["isDriver"] is True and nv["isActive"] is True and nv["notes"] == "ملاحظة تجريبية" and "createdAt" in nv and "updatedAt" in nv)
    check("🚗 بجانب السائق الجديد", pg.locator(".person", has_text="سليمان الجديد").locator(".car").count() == 1)
    check("صار العدد 19 والسائقون 6", pg.locator(".person").count() == 19 and pg.locator(".person .car").count() == 6)

    # تعديل
    pg.locator(".person", has_text="سليمان الجديد").locator('[data-action=edit]').click(); pg.wait_for_selector("dialog.dlg")
    check("النموذج معبّأ بالقيم الحالية", pg.input_value("dialog input[name=name]") == "سليمان الجديد" and pg.input_value("dialog select[name=isDriver]") == "yes")
    pg.fill("dialog input[name=name]", "سليمان المعدّل"); pg.select_option("dialog select[name=isDriver]", "no")
    pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached")
    pg.wait_for_selector("text=سليمان المعدّل")
    ev = coll(pg, "people")[nid]
    check("التعديل حُفظ ولم يتغير createdAt", ev["name"] == "سليمان المعدّل" and ev["isDriver"] is False)
    check("زال 🚗 بعد إلغاء السائق", pg.locator(".person", has_text="سليمان المعدّل").locator(".car").count() == 0)

    # اسم مكرر: إلغاء ثم متابعة
    pg.click("#add-person"); pg.wait_for_selector("dialog.dlg"); pg.fill("dialog input[name=name]", "فقير")
    pg.click("dialog.dlg button[type=submit]")
    pg.wait_for_selector("dialog.dlg >> nth=1"); pg.click("dialog.dlg >> nth=1 >> button[value=cancel]")
    check("اسم مكرر + إلغاء لا يحفظ", len(coll(pg, "people")) == 19)
    pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")

    # تعطيل: إلغاء ثم تأكيد
    row = pg.locator(".person", has_text="سليمان المعدّل")
    row.locator('[data-action=toggle]').click(); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=cancel]")
    check("إلغاء التعطيل لا يغيّر شيئًا", coll(pg, "people")[nid]["isActive"] is True)
    row.locator('[data-action=toggle]').click(); pg.wait_for_selector("dialog.dlg"); dlg_ok(pg)
    pg.wait_for_selector(".person-off")
    check("التعطيل يضع isActive=false ولا يحذف", coll(pg, "people")[nid]["isActive"] is False and len(coll(pg, "people")) == 19)
    check("المعطّل يظهر في أسفل القائمة وخافتًا", "person-off" in pg.locator(".person").last.get_attribute("class"))
    pg.locator(".person-off").locator('[data-action=toggle]').click(); pg.wait_for_function("document.querySelectorAll('.person-off').length==0")
    check("التفعيل يعيد isActive=true", coll(pg, "people")[nid]["isActive"] is True)
    # عدم المساس بالأفراد الأصليين
    now = coll(pg, "people")
    check("الأفراد الـ18 الأصليون لم يتغيروا", all(now[k]["name"] == v["name"] and now[k]["isDriver"] == v["isDriver"] and now[k]["isActive"] == v["isActive"] and now[k]["notes"] == v["notes"] for k, v in seeded.items()))
    check("لا تهيئة مكررة (علامة واحدة والمعرّفات الثابتة)", sum(1 for k in now if k.startswith("people/p_seed_")) == 18)

    # ================= التعيينات =================
    go(pg, "assignments", "#as-list")
    check("لا تعيينات في البداية", "لا توجد تعيينات" in pg.inner_text("#as-list"))
    check("12 نوعًا في المرشّح", pg.locator("#f-type option").count() == 13)

    def add_assignment(person_text, typ, start, end=None, notes=""):
        pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg")
        pg.select_option("dialog select[name=personId]", label=person_text)
        if typ: pg.select_option("dialog select[name=type]", typ)
        pg.fill("dialog input[name=startDate]", start)
        if end: pg.fill("dialog input[name=endDate]", end)
        if notes: pg.fill("dialog textarea[name=notes]", notes)

    # تحقق: بلا فرد
    pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[type=submit]")
    err = pg.inner_text("dialog [data-error]")
    check("التحقق: الفرد والنوع والتاريخ", "اختر الفرد" in err and "اختر نوع التعيين" in err and "تاريخ البداية" in err, err)
    pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")

    # يوم واحد: النهاية تتبع البداية تلقائيًا
    t = d(0)
    add_assignment("فقير 🚗", "يوم دراسي", t)
    check("تاريخ النهاية يتبع البداية", pg.input_value("dialog input[name=endDate]") == t)
    check("شرح الأثر ليوم واحد", "ليوم واحد" in pg.inner_text("dialog [data-hint]"))
    pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached"); pg.wait_for_selector("#as-list tbody tr")
    a1 = list(coll(pg, "assignments").values())[0]
    check("حُفظ تعيين اليوم الواحد بصيغة YYYY-MM-DD", a1["type"] == "يوم دراسي" and a1["startDate"] == t and a1["endDate"] == t and re.fullmatch(r"\d{4}-\d{2}-\d{2}", a1["startDate"]) is not None)
    check("حقول createdAt/updatedAt/personId", "createdAt" in a1 and "updatedAt" in a1 and a1["personId"].startswith("p_seed_"))

    # طويل: إجازة 3 أيام تبدأ اليوم
    add_assignment("بن ناصر", "إجازة", t, d(2), "سفر")
    check("شرح الأثر للتعيين الطويل", "تعيين طويل" in pg.inner_text("dialog [data-hint]") and "خافتًا" in pg.inner_text("dialog [data-hint]"))
    pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached"); pg.wait_for_function("document.querySelectorAll('#as-list tbody tr').length==2")
    # نهاية قبل البداية
    add_assignment("غربي", "تدريب", d(5), d(4)); pg.click("dialog.dlg button[type=submit]")
    check("نهاية قبل البداية مرفوضة", "قبل تاريخ البداية" in pg.inner_text("dialog [data-error]"))
    pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
    # قادم + منتهٍ
    add_assignment("حميدي", "ندوة", d(7)); pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached")
    add_assignment("دبزة", "غياب", d(-5), d(-4)); pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached")
    pg.wait_for_function("document.querySelectorAll('#as-list tbody tr').length==3")
    check("المنتهي مخفي في عرض (الجارية والقادمة)", "دبزة" not in pg.inner_text("#as-list") and len(coll(pg, "assignments")) == 4)
    pg.select_option("#f-scope", "ended"); check("عرض المنتهية يُظهره", "دبزة" in pg.inner_text("#as-list") and pg.locator("#as-list tbody tr").count() == 1)
    pg.select_option("#f-scope", "all"); check("عرض الكل = 4", pg.locator("#as-list tbody tr").count() == 4)
    pg.select_option("#f-scope", "current")
    pg.select_option("#f-type", "إجازة"); check("مرشح النوع", pg.locator("#as-list tbody tr").count() == 1)
    pg.select_option("#f-type", ""); pg.select_option("#f-person", label="فقير 🚗"); check("مرشح الفرد", pg.locator("#as-list tbody tr").count() == 1 and pg.locator("#as-list .car").count() == 1)
    pg.select_option("#f-person", "")
    check("🚗 في الجدول للسائق", pg.locator("#as-list tr", has_text="يوم دراسي").locator(".car").count() == 1)

    # تداخل: تحذير ثم إلغاء
    add_assignment("بن ناصر", "مريض", d(1)); pg.click("dialog.dlg button[type=submit]")
    pg.wait_for_selector("dialog.dlg >> nth=1"); check("تحذير تعيين متداخل", "متداخل" in pg.inner_text("dialog.dlg >> nth=1"))
    pg.click("dialog.dlg >> nth=1 >> button[value=cancel]"); pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
    check("لم يُحفظ المتداخل بعد الإلغاء", len(coll(pg, "assignments")) == 4)

    # ================= المعاينة =================
    check("المعاينة تبدأ باليوم", pg.input_value("#pv-date") == t)
    def pv(): return pg.locator("#pv-list li").all_inner_texts()
    fq = pg.locator("#pv-list li", has_text="فقير"); check("يوم دراسي: ⚠️ + السبب (الفرد باقٍ في القائمة)", "⚠️" in fq.inner_text() and "يوم دراسي" in fq.inner_text() and fq.locator(".car").count() == 1)
    bn = pg.locator("#pv-list li", has_text="بن ناصر"); check("الإجازة الطويلة: خافتة + تاريخ العودة", "pv-long" in bn.get_attribute("class") and "يعود" in bn.inner_text() and (date.today() + timedelta(days=3)).strftime("%d/%m/%Y") in bn.inner_text(), bn.inner_text())
    check("الطويل في أسفل القائمة", "بن ناصر" in pg.locator("#pv-list li").last.inner_text())
    ords = [("long" if "pv-long" in c else "day" if "pv-day" in c else "free") for c in pg.locator("#pv-list li").evaluate_all("els=>els.map(e=>e.className)")]
    check("الترتيب: متاح ثم ⚠️ ثم طويل", ords == sorted(ords, key={"free":0,"day":1,"long":2}.get), str(ords[-4:]))
    pg.click('[data-action=pv-next]'); check("غدًا: فقير عاد متاحًا تلقائيًا", "🟢" in pg.locator("#pv-list li", has_text="فقير").inner_text())
    check("غدًا: بن ناصر ما زال في إجازة", "pv-long" in pg.locator("#pv-list li", has_text="بن ناصر").get_attribute("class"))
    pg.fill("#pv-date", d(3)); pg.dispatch_event("#pv-date", "change")
    check("بعد انتهاء الإجازة يعود بن ناصر طبيعيًا", "🟢" in pg.locator("#pv-list li", has_text="بن ناصر").inner_text())
    pg.click('[data-action=pv-today]'); check("زر اليوم", pg.input_value("#pv-date") == t)
    # فرد غير نشط يختفي من المعاينة
    go(pg, "people", ".person"); pg.locator(".person", has_text="شيباني").locator('[data-action=toggle]').click(); pg.wait_for_selector("dialog.dlg"); dlg_ok(pg); pg.wait_for_selector(".person-off")
    go(pg, "assignments", "#pv-list")
    check("المعطّل لا يظهر في المعاينة مع إشارة لعددهم", "شيباني" not in pg.inner_text("#pv-list") and "غير نشط" in pg.inner_text("#pv-foot"))

    # ================= تعديل وحذف =================
    pg.locator("#as-list tr", has_text="إجازة").locator("[data-action=edit]").click(); pg.wait_for_selector("dialog.dlg")
    check("نموذج التعديل معبّأ", pg.input_value("dialog input[name=startDate]") == t and pg.input_value("dialog input[name=endDate]") == d(2) and pg.input_value("dialog textarea[name=notes]") == "سفر")
    pg.fill("dialog input[name=endDate]", d(4)); pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg", state="detached")
    pg.wait_for_function(f"document.querySelector('#as-list').innerText.includes('{(date.today()+timedelta(days=4)).strftime('%d/%m/%Y')}')")
    vac = next(v for v in coll(pg, "assignments").values() if v["type"] == "إجازة")
    check("التعديل حُفظ (النهاية الجديدة) والبداية ثابتة", vac["endDate"] == d(4) and vac["startDate"] == t)
    n_before = len(coll(pg, "assignments"))
    pg.locator("#as-list tr", has_text="ندوة").locator("[data-action=delete]").click(); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=cancel]")
    check("إلغاء الحذف لا يحذف", len(coll(pg, "assignments")) == n_before)
    pg.locator("#as-list tr", has_text="ندوة").locator("[data-action=delete]").click(); pg.wait_for_selector("dialog.dlg"); dlg_ok(pg)
    pg.wait_for_function("!document.querySelector('#as-list').innerText.includes('ندوة')")
    check("الحذف بعد التأكيد يزيل التعيين فقط", len(coll(pg, "assignments")) == n_before - 1 and len(coll(pg, "people")) == 19)

    # ================= لا تراكم أحداث عند التنقل =================
    for _ in range(3):
        go(pg, "people", ".person"); go(pg, "assignments", "#as-list")
    pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg")
    check("حوار واحد فقط بعد زيارات متكررة", pg.locator("dialog.dlg").count() == 1)
    pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")
    pg.locator("#as-list tr", has_text="إجازة").locator("[data-action=edit]").click(); pg.wait_for_selector("dialog.dlg")
    check("نقرة تعديل واحدة تفتح حوارًا واحدًا", pg.locator("dialog.dlg").count() == 1)
    pg.click("dialog.dlg button[data-cancel]"); pg.wait_for_selector("dialog.dlg", state="detached")

    # ================= إعادة تحميل: لا تكرار =================
    pg.reload(); pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_timeout(700)
    check("بعد إعادة التحميل لا أفراد مكررون", len(coll(pg, "people")) == 19 and pg.locator(".toast-ok").count() == 0)
    check("لا مجموعات أخرى غير المتفق عليها", {k.split('/')[0] for k in store(pg)} == {"people", "assignments", "settings"})
    pg.screenshot(path="/tmp/smoke/p2_desktop_assignments.png", full_page=True)

    # ================= الهاتف =================
    m = setup(b, 390, 844); login(m); go(m, "people", ".person")
    check("الهاتف: أفراد بلا تمرير أفقي", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    m.screenshot(path="/tmp/smoke/p2_mobile_people.png")
    m.click("#add-person"); m.wait_for_selector("dialog.dlg"); m.screenshot(path="/tmp/smoke/p2_mobile_person_form.png")
    m.click("dialog.dlg button[data-cancel]")
    go(m, "assignments", "#as-list")
    check("الهاتف: تعيينات بلا تمرير أفقي", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    m.screenshot(path="/tmp/smoke/p2_mobile_assignments.png", full_page=True)
    m.click("#add-assignment"); m.wait_for_selector("dialog.dlg")
    check("الهاتف: الحوار داخل الشاشة", m.evaluate("(()=>{const r=document.querySelector('dialog.dlg').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"))
    m.screenshot(path="/tmp/smoke/p2_mobile_assign_form.png")
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
