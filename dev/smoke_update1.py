# اختبار «تعديلات منطق الخدمات»: مهام بلا نهاية، راحة الجمعة، التنقل، وضوح التعارضات. محاكاة Firebase.
# السيرفر على المنفذ 8099.
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
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
def coll(pg, name): return {k.split("/")[1]: v for k, v in store(pg).items() if k.startswith(name + "/")}
def inject(pg, patch):
    pg.evaluate("p=>{const s=JSON.parse(localStorage.getItem('mockstore'));for(const [k,v] of Object.entries(p)){if(v===null)delete s[k];else s[k]=v}localStorage.setItem('mockstore',JSON.stringify(s))}", patch)
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")
    pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn")
    pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_selector(".toast-ok")
def go(pg, route, sel): pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def set_date(pg, iso_): pg.fill("#svc-date", iso_); pg.dispatch_event("#svc-date", "change")
def view(pg, iso_):
    go(pg, "people", ".person"); go(pg, "services", "#svc-card"); set_date(pg, iso_); pg.wait_for_selector(".day-card")
def settle(pg): pg.wait_for_selector("dialog.dlg", state="detached")
def fmt(i): y, m, d = i.split("-"); return f"{d}/{m}/{y}"
def iso(n): return (B + timedelta(days=n)).isoformat()
def pid(n): return f"p_seed_{n:02d}"
def D(d, **o): return {"date": d, "status": "draft", "parmanoPersonId": None, "gardPersonId": None, "restPersonIds": [], "otherTasks": [], **o}
def OA(personId, type_, start): return {"personId": personId, "type": type_, "startDate": start, "endDate": None, "notes": ""}
def run_check(pg): pg.click("[data-action=check-day]"); pg.wait_for_selector("#dc-panel"); return pg.inner_text("#dc-panel")
def lvl(pg): return re.search(r"dc-(ok|warn|bad)", pg.get_attribute("#dc-panel", "class")).group(1)
def sec(pg, title): return pg.locator(".dc-sec", has_text=title).first
def slot(pg, label): return pg.locator(".slot", has=pg.locator(f".slot-label:text-is('{label}:')")).first
def switch_date_behind_dialog(pg, iso_):  # يحاكي تغيّر اليوم المعروض أثناء بقاء حوار مفتوح
    pg.evaluate("v=>{const i=document.getElementById('svc-date');i.value=v;i.dispatchEvent(new Event('change'))}", iso_)

today = date.today(); B = today + timedelta((6 - today.weekday()) % 7)   # أقرب أحد؛ B+5 جمعة
with sync_playwright() as p:
    b = p.chromium.launch(); pg = setup(b); login(pg)

    # =================== 1) مهمة بلا تاريخ نهاية: الإضافة من النموذج ===================
    go(pg, "assignments", "#as-list")
    pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg")
    check("حقل النهاية موسوم «اختياري» ويوجد خيار «لا أعرف موعد الانتهاء»", "اختياري" in pg.inner_text("dialog.dlg") and pg.locator("dialog input[name=openEnd]").count() == 1)
    check("لا حقل لتاريخ/وقت رجوع في النموذج", not re.search(r"رجوع|عودة|موعد العودة", pg.inner_text("dialog.dlg")) and pg.locator("dialog input[type=time], dialog input[name*=return i]").count() == 0)
    pg.select_option("dialog select[name=personId]", label="غربي"); pg.select_option("dialog select[name=type]", "مهمة أخرى")
    pg.fill("dialog input[name=startDate]", today.isoformat())
    check("النهاية تتبع البداية افتراضيًا (يوم واحد)", pg.input_value("dialog input[name=endDate]") == today.isoformat() and not pg.is_checked("dialog input[name=openEnd]"))
    pg.check("dialog input[name=openEnd]")
    check("«لا أعرف موعد الانتهاء» يفرّغ تاريخ النهاية", pg.input_value("dialog input[name=endDate]") == "")
    check("الشرح يوضح أنها مستمرة ولا تنتهي تلقائيًا ويتعذّر التأكد", "بلا تاريخ نهاية" in pg.inner_text("dialog [data-hint]") and "لا تنتهي تلقائيًا" in pg.inner_text("dialog [data-hint]") and "يتعذّر التأكد" in pg.inner_text("dialog [data-hint]"))
    pg.fill("dialog input[name=startDate]", (today + timedelta(days=1)).isoformat())
    check("تغيير البداية لا يعيد ملء النهاية عند اختيار «بلا نهاية»", pg.input_value("dialog input[name=endDate]") == "")
    pg.fill("dialog input[name=startDate]", today.isoformat())
    pg.fill("dialog input[name=endDate]", ""); pg.dispatch_event("dialog input[name=endDate]", "input")
    check("تفريغ التاريخ يدويًا يفعّل الخيار تلقائيًا", pg.is_checked("dialog input[name=openEnd]"))
    pg.fill("dialog input[name=endDate]", (today + timedelta(days=2)).isoformat()); pg.dispatch_event("dialog input[name=endDate]", "input")
    check("كتابة تاريخ تلغي الخيار", not pg.is_checked("dialog input[name=openEnd]"))
    pg.check("dialog input[name=openEnd]")
    # البداية إلزامية
    pg.fill("dialog input[name=startDate]", ""); pg.click("dialog.dlg button[type=submit]")
    check("تاريخ البداية إلزامي حتى لمهمة بلا نهاية", "تاريخ البداية غير صحيح" in pg.inner_text("dialog [data-error]") and not [k for k in store(pg) if k.startswith("assignments/")])
    pg.fill("dialog input[name=startDate]", today.isoformat()); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_selector("#as-list tbody tr")
    a = list(coll(pg, "assignments").values())[0]
    check("حُفظت بلا تاريخ نهاية (endDate = null) وبداية صحيحة", a["endDate"] is None and a["startDate"] == today.isoformat() and a["type"] == "مهمة أخرى")
    check("الحقول المخزَّنة هي المعتادة فقط: لا تاريخ/وقت رجوع", set(a) == {"personId", "type", "startDate", "endDate", "notes", "createdAt", "updatedAt"}, str(sorted(a)))
    row = pg.locator("#as-list tbody tr").first
    check("الجدول: «إلى تاريخ» غير محددة والمدة مستمرة والحالة جارٍ", "غير محددة" in row.locator("td[data-label='إلى تاريخ']").inner_text() and row.locator("td[data-label='المدة']").inner_text().strip() == "مستمرة" and row.locator("td[data-label='الحالة']").inner_text().strip() == "جارٍ")
    check("لا يظهر تاريخ وهمي (9999) في الصفحة", "9999" not in pg.inner_text("#view"))
    pg.select_option("#f-scope", "ended"); check("لا تُعدّ منتهية: غائبة عن «المنتهية»", pg.locator("#as-list tbody tr").count() == 0)
    pg.select_option("#f-scope", "current"); check("وتظهر في «الجارية والقادمة»", pg.locator("#as-list tbody tr").count() == 1)
    # المعاينة: لا تنتهي مهما بَعُد التاريخ
    far = (today + timedelta(days=400)).isoformat(); pg.fill("#pv-date", far); pg.dispatch_event("#pv-date", "change")
    li = pg.locator("#pv-list li", has_text="غربي")
    check("المعاينة بعد 400 يوم: ما زالت مستمرة (خافتة، نهاية غير محددة، بلا «يعود»)", "pv-long" in li.get_attribute("class") and "نهاية غير محددة" in li.inner_text() and "يعود" not in li.inner_text(), li.inner_text())
    check("وهي في أسفل القائمة", "غربي" in pg.locator("#pv-list li").last.inner_text())
    pg.fill("#pv-date", (today - timedelta(days=1)).isoformat()); pg.dispatch_event("#pv-date", "change")
    check("قبل تاريخ البداية: متاح (لا أثر رجعي)", "🟢" in pg.locator("#pv-list li", has_text="غربي").inner_text())
    # التعديل: بلا نهاية ← نهاية ← بلا نهاية
    pg.locator("#as-list tr", has_text="غربي").locator("[data-action=edit]").click(); pg.wait_for_selector("dialog.dlg")
    check("التعديل: الخيار مفعّل والنهاية فارغة", pg.is_checked("dialog input[name=openEnd]") and pg.input_value("dialog input[name=endDate]") == "")
    pg.uncheck("dialog input[name=openEnd]"); pg.fill("dialog input[name=endDate]", (today + timedelta(days=3)).isoformat()); pg.dispatch_event("dialog input[name=endDate]", "input")
    pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_function(f"document.querySelector('#as-list').innerText.includes('{fmt((today + timedelta(days=3)).isoformat())}')")
    check("تحديد نهاية لاحقًا يُحفظ ويظهر", list(coll(pg, "assignments").values())[0]["endDate"] == (today + timedelta(days=3)).isoformat())
    pg.locator("#as-list tr", has_text="غربي").locator("[data-action=edit]").click(); pg.wait_for_selector("dialog.dlg")
    pg.check("dialog input[name=openEnd]"); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_function("document.querySelector('#as-list').innerText.includes('غير محددة')")
    check("العودة إلى «بلا نهاية» تُخزَّن null", list(coll(pg, "assignments").values())[0]["endDate"] is None)
    # تداخل مع مهمة بلا نهاية: تنبيه يوضح السبب
    pg.click("#add-assignment"); pg.wait_for_selector("dialog.dlg")
    pg.select_option("dialog select[name=personId]", label="غربي"); pg.select_option("dialog select[name=type]", "ندوة"); pg.fill("dialog input[name=startDate]", (today + timedelta(days=30)).isoformat())
    pg.click("dialog.dlg button[type=submit]"); pg.wait_for_selector("dialog.dlg >> nth=1")
    check("التداخل مع مهمة بلا نهاية: تنبيه يذكر ذلك ويعرض «غير محددة»", "بلا تاريخ نهاية" in pg.inner_text("dialog.dlg >> nth=1") and "غير محددة" in pg.inner_text("dialog.dlg >> nth=1") and "9999" not in pg.inner_text("dialog.dlg >> nth=1"))
    pg.click("dialog.dlg >> nth=1 >> button[value=cancel]"); pg.click("dialog.dlg button[data-cancel]"); settle(pg)
    check("إلغاء التداخل لم يحفظ شيئًا", len(coll(pg, "assignments")) == 1)
    pg.locator("#as-list tr", has_text="غربي").locator("[data-action=delete]").click(); pg.wait_for_selector("dialog.dlg")
    check("رسالة الحذف تعرض «غير محددة»", "غير محددة" in pg.inner_text("dialog.dlg") and "9999" not in pg.inner_text("dialog.dlg"))
    pg.click("dialog.dlg button[value=cancel]")

    # =================== 2) مهمة بلا نهاية في الخدمات والفحص ===================
    S1, S2, S3 = iso(1), iso(10), iso(20)
    inject(pg, {
        f"daily_services/{S1}": D(S1), f"daily_services/{S2}": D(S2, parmanoPersonId=pid(1), gardPersonId=pid(7), restPersonIds=[pid(3)]),
        f"daily_services/{S3}": D(S3, parmanoPersonId=pid(4), gardPersonId=pid(5), restPersonIds=[pid(11), pid(13)]),
        "assignments/a_open_before": OA(pid(6), "مهمة أخرى", iso(-5)),        # غربي: بدأت قبل S1 بلا نهاية
        "assignments/a_open_on_day": OA(pid(7), "تعيين", S2),                  # حميدي: تبدأ في يوم S2 نفسه
        "assignments/a_open_driver": OA(pid(15), "تعيين", iso(-30)),           # فلاح (سائق): مستمرة قبل S3
    })
    for k in [k for k in store(pg) if k.startswith("assignments/") and k.split("/")[1] not in ("a_open_before", "a_open_on_day", "a_open_driver")]:
        inject(pg, {k: None})
    view(pg, S1)
    pg.click("[data-action=pick-parmano]"); pg.wait_for_selector("dialog.dlg .pick-row")
    rs = pg.locator("dialog.dlg .pick-row").all_inner_texts(); ghr = next(r for r in rs if "غربي" in r)
    check("قائمة الخفير: صاحب المهمة بلا نهاية في الأسفل خافتًا مع «نهاية غير محددة» (بلا «يعود»)", "غربي" in rs[-1] and "نهاية غير محددة" in ghr and "يعود" not in ghr and "dim" in pg.locator("dialog.dlg .pick-row", has_text="غربي").get_attribute("class") or "pick-dim" in pg.locator("dialog.dlg .pick-row", has_text="غربي").get_attribute("class"), ghr)
    pg.locator("dialog.dlg .pick-row", has_text="غربي").click(); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-value').innerText.includes('غربي')")
    check("الاختيار قرار المستخدم: لم يُمنع", coll(pg, "daily_services")[S1]["parmanoPersonId"] == pid(6))
    check("الأفراد المتاحون: «نهاية غير محددة» دون تاريخ عودة", "نهاية غير محددة" in pg.locator(".avail-item", has_text="غربي").inner_text() and "يعود" not in pg.locator(".avail-item", has_text="غربي").inner_text())
    trow = pg.locator(".day-tasks tbody tr", has_text="مهمة أخرى")
    check("جدول المهام: «إلى تاريخ» = غير محددة وبداية صحيحة", "غير محددة" in trow.inner_text() and fmt(iso(-5)) in trow.inner_text() and "9999" not in pg.inner_text(".day-card"), trow.inner_text())
    pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row"); pg.locator("dialog.dlg .pick-row", has_text="عقون").click(); settle(pg)
    pg.wait_for_function("document.querySelectorAll('.slot-value')[1].innerText.includes('عقون')")
    t = run_check(pg)
    check("الفحص: مهمة بلا نهاية = 🟡 «تعذّر التحقق» وليست 🔴", lvl(pg) == "warn" and "dc-warn" in sec(pg, "التكليفات").get_attribute("class"))
    check("الوسم «تعذّر التحقق» ظاهر في البند", pg.locator("#dc-panel .dc-tag-unverified").count() >= 1 and "تعذّر التحقق" in pg.locator("#dc-panel .dc-tag-unverified").first.inner_text())
    check("التنبيه يوضح الفرد والدور والتاريخ والمهمة والسبب", all(x in t for x in ("غربي (الخفير) — " + fmt(S1), "مهمة «مهمة أخرى»", "بدأت في " + fmt(iso(-5)), "وبلا تاريخ نهاية", "يتعذّر التأكد من انتهائها")), t[t.find("غربي"):t.find("غربي") + 220])
    check("لا تاريخ وهمي في نتيجة الفحص", "9999" not in t)
    pg.click("[data-action=close-check]")
    # تعارض مؤكد: تبدأ في اليوم نفسه
    view(pg, S2); t = run_check(pg)
    check("تبدأ في يوم الفحص نفسه = تعارض مؤكد 🔴 (حميدي حارس)", lvl(pg) == "bad" and pg.locator("#dc-panel .dc-tag-conflict").count() >= 1 and "حميدي (الحارس) — " + fmt(S2) in t and "بلا تاريخ نهاية، بدأت في " + fmt(S2) in t, t[t.find("حميدي"):t.find("حميدي") + 200])
    check("الوسمان مختلفان: «تعارض مؤكد» مقابل «تعذّر التحقق» (اليوم الثاني من الخدمة)", "تعارض مؤكد" in pg.inner_text("#dc-panel") and pg.locator("#dc-panel .dc-tag-unverified").count() >= 1)
    pg.click("[data-action=close-check]")
    # سائقون
    view(pg, S3); t = run_check(pg)
    check("السائقون: لا سائق متاح 🔴 مع توضيح أن فلاح غير مؤكد", "لا يوجد سائق متاح في هذا اليوم" in t and "فلاح" in t and "تعذّر التحقق" in t and "مهمة بلا تاريخ نهاية" in t, t[-300:])
    check("سبب فلاح مكتوب «بلا تاريخ نهاية — غير مؤكد»", "غير مؤكد" in pg.locator(".dc-drivers .dc-item", has_text="فلاح").inner_text())

    # =================== 3) راحة الجمعة ===================
    F = iso(5)
    inject(pg, {f"daily_services/{F}": D(F, parmanoPersonId=pid(1), gardPersonId=pid(2))})
    for k in [k for k in store(pg) if k.startswith("assignments/")]: inject(pg, {k: None})
    view(pg, F)
    check("الجمعة: زر الراحة متاح والملاحظة تشرح أنها استثناء", pg.locator("[data-action=pick-rest]").count() == 1 and "يمكن منحها استثناءً" in slot(pg, "الراحة").inner_text())
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row")
    check("حوار الاختيار يحذّر من أنه يوم الجمعة", "الجمعة" in pg.inner_text("dialog.dlg h2") and "اليوم الجمعة" in pg.inner_text("dialog.dlg") and "تحتاج تأكيدك" in pg.inner_text("dialog.dlg"))
    pg.locator("dialog.dlg .pick-row", has_text="بوثلجة").locator("input").check()
    before = raw(pg); pg.click("dialog.dlg [data-save]")
    pg.wait_for_selector("dialog.dlg"); ct = pg.inner_text("dialog.dlg")
    check("تحذير واضح: اليوم الجمعة ومنح الراحة مخالف للقاعدة المعتادة مع اسم المستفيد", all(x in ct for x in ("اليوم هو الجمعة", fmt(F), "مخالف للقاعدة المعتادة", "بوثلجة")), ct)
    check("خياران واضحان: إلغاء / متابعة كاستثناء", pg.locator("dialog.dlg button[value=cancel]").inner_text().strip() == "إلغاء" and pg.locator("dialog.dlg button[value=ok]").inner_text().strip() == "متابعة كاستثناء")
    pg.click("dialog.dlg button[value=cancel]"); settle(pg)
    check("الإلغاء: لا يُحفظ أي تغيير (التخزين متطابق)", raw(pg) == before and coll(pg, "daily_services")[F]["restPersonIds"] == [])
    check("الإلغاء: البطاقة كما كانت (لا راحة)", slot(pg, "الراحة").locator(".slot-value").inner_text().strip() == "")
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row"); pg.locator("dialog.dlg .pick-row", has_text="بوثلجة").locator("input").check(); pg.click("dialog.dlg [data-save]")
    pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=ok]"); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-wide .slot-value').innerText.includes('بوثلجة')")
    check("المتابعة: مُنحت الراحة وحُفظت", coll(pg, "daily_services")[F]["restPersonIds"] == [pid(3)])
    check("الملاحظة تُظهر أنها استثناء", "استثناء: راحة يوم الجمعة" in slot(pg, "الراحة").inner_text())
    check("إشعار نجاح الاستثناء", pg.locator(".toast-ok:has-text('كاستثناء')").count() >= 1)
    t = run_check(pg)
    check("الفحص بعد الاستثناء: 🟡 بوسم «استثناء» لا 🔴", lvl(pg) == "warn" and pg.locator("#dc-panel .dc-tag-exception").count() == 1 and "لا توجد راحة يوم الجمعة عادةً" in t and "بوثلجة" in t)
    # التحقق من بقية التعارضات يستمر يوم الجمعة
    pg.click("[data-action=close-check]")
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row"); pg.locator("dialog.dlg .pick-row", has_text="بن ناصر").locator("input").check(); pg.click("dialog.dlg [data-save]")
    pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=ok]"); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-wide .slot-value').innerText.includes('بن ناصر')")
    t = run_check(pg)
    check("الجمعة: بن ناصر خفير ومعه راحة = تعارض مؤكد 🔴 (التحقق يستمر)", lvl(pg) == "bad" and "بن ناصر (الراحة) — " + fmt(F) in t and "الخفير في اليوم نفسه" in t and pg.locator("#dc-panel .dc-tag-conflict").count() >= 1)
    pg.click("[data-action=close-check]")
    # إزالة فرد لا تطلب تأكيدًا
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row"); pg.locator("dialog.dlg .pick-row", has_text="بن ناصر").locator("input").uncheck(); pg.click("dialog.dlg [data-save]"); settle(pg)
    pg.wait_for_function("!document.querySelector('.slot-wide .slot-value').innerText.includes('بن ناصر')")
    check("إزالة فرد من راحة الجمعة لا تطلب تأكيدًا", coll(pg, "daily_services")[F]["restPersonIds"] == [pid(3)])
    # الحد الأقصى 4 يبقى يوم الجمعة
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row")
    for n in ("حميدي", "دبزة", "شيتور"): pg.locator("dialog.dlg .pick-row", has_text=n).locator("input").check()
    check("الحد الأقصى (4) مطبّق يوم الجمعة أيضًا", "4 من 4" in pg.inner_text("dialog.dlg [data-count]") and pg.locator("dialog.dlg input:disabled").count() == 14)
    pg.click("dialog.dlg [data-cancel]"); settle(pg)
    # يوم عادي: لا تأكيد
    N = iso(1); inject(pg, {f"daily_services/{N}": {**coll(pg, "daily_services")[N], "restPersonIds": []}})
    view(pg, N); pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row")
    check("يوم عادي: لا تحذير جمعة في الحوار", "اليوم الجمعة" not in pg.inner_text("dialog.dlg"))
    pg.locator("dialog.dlg .pick-row", has_text="عقون").locator("input").check(); pg.click("dialog.dlg [data-save]"); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-wide .slot-value').innerText.includes('عقون')")
    check("يوم عادي: تُحفظ الراحة مباشرة دون تأكيد", coll(pg, "daily_services")[N]["restPersonIds"] == [pid(2)])

    # =================== 4) التنقل وعدم اختلاط الأيام ===================
    go(pg, "people", ".person"); go(pg, "services", "#svc-card"); pg.wait_for_selector(".empty, .day-card")
    check("الافتتاح: اليوم الحالي مع وسم «اليوم الحالي» والرابط", pg.input_value("#svc-date") == today.isoformat() and "اليوم الحالي" in pg.inner_text("#svc-dayinfo") and pg.evaluate("location.hash") == f"#/services/{today.isoformat()}")
    check("شريط الأيام: خانة اليوم موسومة «اليوم»", pg.locator(".chip-today span").inner_text() == "اليوم")
    before = raw(pg)
    pg.click("[data-action=nav-next]"); check("اليوم التالي", pg.input_value("#svc-date") == (today + timedelta(days=1)).isoformat() and "بعد يوم واحد" in pg.inner_text("#svc-dayinfo"))
    pg.click("[data-action=nav-next]"); check("اليوم التالي مرة ثانية (بعد يومين)", "بعد يومين" in pg.inner_text("#svc-dayinfo"))
    pg.click("[data-action=nav-prev]"); pg.click("[data-action=nav-prev]"); pg.click("[data-action=nav-prev]")
    check("اليوم السابق (قبل يوم واحد)", pg.input_value("#svc-date") == (today - timedelta(days=1)).isoformat() and "قبل يوم واحد" in pg.inner_text("#svc-dayinfo"))
    pg.click("[data-action=nav-today]"); check("العودة إلى اليوم الحالي", pg.input_value("#svc-date") == today.isoformat())
    set_date(pg, iso(40)); check("اختيار تاريخ محدد", pg.input_value("#svc-date") == iso(40) and fmt(iso(40)) in pg.inner_text("#svc-card"))
    pg.fill("#svc-date", ""); pg.dispatch_event("#svc-date", "change")
    check("تاريخ فارغ/غير صالح: يرجع الحقل لليوم المعروض ولا يتغير شيء", pg.input_value("#svc-date") == iso(40) and fmt(iso(40)) in pg.inner_text("#svc-card") and pg.evaluate("location.hash") == f"#/services/{iso(40)}")
    pg.locator(".chip", has=pg.locator(f"strong:text-is('{fmt(iso(41))[:5]}')")).first.click(); check("النقر على خانة في الشريط", pg.input_value("#svc-date") == iso(41))
    check("التنقل وحده لا يكتب شيئًا ولا ينشئ أيامًا", raw(pg) == before and len(coll(pg, "daily_services")) == 4)
    # عدم الخلط
    P1, P2 = iso(60), iso(61)
    inject(pg, {f"daily_services/{P1}": D(P1, parmanoPersonId=pid(1)), f"daily_services/{P2}": D(P2, parmanoPersonId=pid(2))})
    view(pg, P1)
    check("كل يوم يعرض بياناته: P1 خفيره بن ناصر", "بن ناصر" in slot(pg, "الخفير").inner_text() and fmt(P1) in pg.inner_text(".day-title"))
    set_date(pg, P2); check("P2 خفيره عقون (لا اختلاط)", "عقون" in slot(pg, "الخفير").inner_text() and "بن ناصر" not in slot(pg, "الخفير").inner_text() and fmt(P2) in pg.inner_text(".day-title"))
    # تغيير اليوم أثناء فتح حوار اختيار: يُحفظ في يوم فتح الحوار لا في اليوم الحالي
    view(pg, P1); pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row")
    switch_date_behind_dialog(pg, P2); pg.locator("dialog.dlg .pick-row", has_text="جريدي").click(); settle(pg)
    pg.wait_for_function(f"document.querySelector('.day-title').innerText.includes('{fmt(P2)}')")
    d = coll(pg, "daily_services")
    check("الحارس حُفظ في اليوم الذي فُتح له الحوار (P1) لا في اليوم الحالي (P2)", d[P1]["gardPersonId"] == pid(17) and d[P2]["gardPersonId"] is None)
    check("والشاشة تعرض P2 دون تلوّث", "جريدي" not in slot(pg, "الحارس").inner_text())
    # الراحة والمهام والاعتماد
    view(pg, P1); pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row")
    switch_date_behind_dialog(pg, P2); pg.locator("dialog.dlg .pick-row", has_text="سيش").locator("input").check(); pg.click("dialog.dlg [data-save]"); settle(pg)
    d = coll(pg, "daily_services"); check("الراحة حُفظت في P1 فقط", d[P1]["restPersonIds"] == [pid(14)] and d[P2]["restPersonIds"] == [])
    view(pg, P1); pg.click("[data-action=add-task]"); pg.wait_for_selector("dialog.dlg select")
    pg.select_option("dialog select[name=personId]", label="رويسي"); pg.fill("dialog input[name=task]", "حراسة الباب")
    switch_date_behind_dialog(pg, P2); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    d = coll(pg, "daily_services"); check("المهمة حُفظت في P1 فقط", d[P1]["otherTasks"] == [{"personId": pid(18), "task": "حراسة الباب"}] and d[P2]["otherTasks"] == [])
    view(pg, P1); pg.click("[data-action=toggle-status]")
    pg.wait_for_function("document.querySelector('.day-head .badge-ok')"); d = coll(pg, "daily_services")
    check("اعتماد P1 لا يمسّ P2", d[P1]["status"] == "final" and d[P2]["status"] == "draft")
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-warn")
    # الفحص يُغلق عند الانتقال
    pg.click("[data-action=check-day]"); pg.wait_for_selector("#dc-panel"); pg.click("[data-action=nav-next]")
    check("لوحة الفحص تُغلق عند تغيير اليوم", pg.locator("#dc-panel").count() == 0)

    # =================== 5) قواعد التعارض الحالية ما زالت تعمل بصياغة أوضح ===================
    Y0, Y1 = iso(80), iso(81)
    inject(pg, {f"daily_services/{Y0}": D(Y0, parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3)]),
                f"daily_services/{Y1}": D(Y1, parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3)])})
    view(pg, Y1); t = run_check(pg)
    check("48 ساعة ما زالت 🔴 بصياغة: الفرد (الدور) — التاريخ: السبب مع تاريخ الأمس", lvl(pg) == "bad" and "بن ناصر (الخفير) — " + fmt(Y1) in t and "خفير الأمس (" + fmt(Y0) + ")" in t and "ستُحسب مرتين" in t)
    check("وسم «تعارض مؤكد» ظاهر على تعارضات البيانات المعروفة", pg.locator("#dc-panel .dc-tag-conflict").count() >= 2)
    SEP = iso(90); inject(pg, {f"daily_services/{SEP}": D(SEP, parmanoPersonId=pid(1), gardPersonId=pid(2), restPersonIds=[pid(3)]), f"daily_services/{iso(92)}": D(iso(92), gardPersonId=pid(1))})
    view(pg, SEP); t = run_check(pg)
    check("الفصل ما زال 🔴 بالأسماء والتواريخ", "تعارض مع قاعدة الفصل بين الخفير والحارس" in t and fmt(SEP) in t and fmt(iso(92)) in t and "بن ناصر" in t)
    pg.click("[data-action=close-check]")
    check("لا مجموعات جديدة (لا شيء خارج الأربع المتفق عليها)", {k.split("/")[0] for k in store(pg)} <= {"people", "assignments", "daily_services", "settings"}, str(sorted({k.split("/")[0] for k in store(pg)})))
    check("الأفراد الـ18 لم يُمسّوا", len(coll(pg, "people")) == 18 and all(v["isActive"] for v in coll(pg, "people").values()))

    # =================== الهاتف ===================
    m = setup(b, 390, 844); login(m); go(m, "assignments", "#as-list")
    m.click("#add-assignment"); m.wait_for_selector("dialog.dlg")
    check("الهاتف: خيار «بلا نهاية» ظاهر داخل الحوار", m.evaluate("(()=>{const r=document.querySelector('dialog.dlg .check-inline').getBoundingClientRect();const d=document.querySelector('dialog.dlg').getBoundingClientRect();return r.left>=d.left&&r.right<=d.right&&r.width>0})()"))
    m.screenshot(path=f"{OUT}/u1_mobile_form.png"); m.click("dialog.dlg [data-cancel]"); settle(m)
    inject(m, {f"daily_services/{iso(5)}": D(iso(5), parmanoPersonId=pid(1), gardPersonId=pid(2))}); view(m, iso(5))
    check("الهاتف: شريط التنقل ومعلومات اليوم بلا تمرير أفقي", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth") and m.is_visible("#svc-dayinfo"))
    m.screenshot(path=f"{OUT}/u1_mobile_services.png")
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
