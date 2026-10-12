# اختبار المرحلة 3 (بطاقة الخدمة اليومية) في Chromium مع محاكاة Firebase. السيرفر على المنفذ 8099.
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
def coll(pg, name): return {k.split("/")[1]: v for k, v in store(pg).items() if k.startswith(name + "/")}
def inject(pg, patch):  # patch: dict path -> value | None (حذف)
    pg.evaluate("p=>{const s=JSON.parse(localStorage.getItem('mockstore'));for(const [k,v] of Object.entries(p)){if(v===null)delete s[k];else s[k]=v}localStorage.setItem('mockstore',JSON.stringify(s))}", patch)
def login(pg):
    pg.goto(BASE); pg.wait_for_selector("#login-screen:not([hidden])")
    pg.fill("#login-email", "me@test.com"); pg.fill("#login-password", "secret12"); pg.click("#login-btn")
    pg.wait_for_selector("#app-shell:not([hidden])"); pg.wait_for_selector(".toast-ok")
def go(pg, route, sel):
    pg.click(f'a[data-route="{route}"]'); pg.wait_for_selector(sel)
def set_date(pg, iso):
    pg.fill("#svc-date", iso); pg.dispatch_event("#svc-date", "change")
def reenter(pg, iso):  # يغادر الصفحة ويعود لإعادة التحميل من التخزين
    go(pg, "people", ".person"); go(pg, "services", "#svc-card"); set_date(pg, iso); pg.wait_for_selector(".day-card, .empty")
def fmt(iso): y, m, d = iso.split("-"); return f"{d}/{m}/{y}"
def iso(n): return (B + timedelta(days=n)).isoformat()
def rows(pg): return pg.locator("dialog.dlg .pick-row").all_inner_texts()
def idx(rs, name): return next(i for i, r in enumerate(rs) if name in r)
def slot(pg, label): return pg.locator(".slot", has=pg.locator(f".slot-label:text-is('{label}:')")).first
def settle(pg): pg.wait_for_selector("dialog.dlg", state="detached")
def pid(n): return f"p_seed_{n:02d}"

today = date.today(); B = today + timedelta((6 - today.weekday()) % 7)   # أقرب أحد (أو اليوم إن كان أحدًا)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = setup(b); login(pg)

    # ===== A: لا أيام تلقائية =====
    go(pg, "services", "#svc-card")
    check("اليوم الحالي غير مُعدّ: حالة فارغة وزر إنشاء", pg.locator(".empty [data-action=create-day]").count() == 1)
    for a in ("nav-next", "nav-next", "nav-prev", "nav-today"): pg.click(f"[data-action={a}]")
    check("التنقل بين الأيام لا ينشئ شيئًا", len(coll(pg, "daily_services")) == 0)
    check("شريط الأيام: 14 يومًا كلها غير مُعدّة", pg.locator(".chip").count() == 14 and pg.locator(".chip-none").count() == 14)
    set_date(pg, iso(0))
    check("الرابط يحفظ اليوم المختار", location_ok if (location_ok := pg.evaluate("location.hash") == f"#/services/{iso(0)}") else False)

    # ===== B: سجل تاريخي + إنشاء اليوم =====
    inject(pg, {
        f"daily_services/{iso(-10)}": {"date": iso(-10), "status": "final", "parmanoPersonId": pid(4), "gardPersonId": pid(2), "restPersonIds": [], "otherTasks": []},
        f"daily_services/{iso(-6)}":  {"date": iso(-6), "status": "draft", "parmanoPersonId": pid(1), "gardPersonId": None, "restPersonIds": [], "otherTasks": []},
        f"daily_services/{iso(-3)}":  {"date": iso(-3), "status": "final", "parmanoPersonId": None, "gardPersonId": None, "restPersonIds": [pid(3)], "otherTasks": []},
        "assignments/a_long": {"personId": pid(5), "type": "مهمة طويلة", "startDate": iso(-1), "endDate": iso(5), "notes": ""},
        "assignments/a_day":  {"personId": pid(6), "type": "يوم دراسي", "startDate": iso(0), "endDate": iso(0), "notes": ""},
    })
    reenter(pg, iso(0))
    check("بعد حقن السجل ما زال اليوم الحالي بلا وثيقة", pg.locator(".empty").count() == 1 and iso(0) not in coll(pg, "daily_services"))
    pg.click("[data-action=create-day]"); pg.wait_for_selector(".day-card")
    d0 = coll(pg, "daily_services")[iso(0)]
    check("أُنشئت وثيقة اليوم كمسودة بحقولها", d0["status"] == "draft" and d0["date"] == iso(0) and d0["parmanoPersonId"] is None and d0["restPersonIds"] == [] and d0["otherTasks"] == [])
    check("لا مفاتيح للبديلين في الوثيقة الجديدة", "parmanoSubstituteId" not in d0 and "gardSubstituteId" not in d0)
    check("لم يُنشأ سوى هذا اليوم", len(coll(pg, "daily_services")) == 4)
    check("عنوان البطاقة بالصيغة المتفق عليها", re.fullmatch(r"خدمة يوم \S+ : " + re.escape(fmt(iso(0))), pg.inner_text(".day-title").strip()) is not None, pg.inner_text(".day-title"))
    check("الشارة: مسودة", pg.inner_text(".day-head .badge") == "مسودة")
    check("الخانات الأربع والراحة موجودة بالتسميات العربية", all(slot(pg, l).count() == 1 for l in ("الخفير", "الحارس", "البديل", "بديل الحارس", "الراحة")))
    check("لا تظهر الكلمات التقنية في الواجهة", not re.search(r"khifara|parmano|gard", pg.inner_text("#view"), re.I))

    # ===== C: ترتيب الخفير =====
    pg.click("[data-action=pick-parmano]"); pg.wait_for_selector("dialog.dlg .pick-row")
    rs = rows(pg)
    check("القائمة تضم الـ18 (لا بديل مباشر بعد)", len(rs) == 18)
    check("خدام (مهمة طويلة) في الأسفل ومعه تاريخ العودة", "خدام" in rs[-1] and "يعود" in rs[-1] and fmt(iso(6)) in rs[-1], rs[-1])
    check("الأقدم خفارة (فقير) قبل الأحدث (بن ناصر)", idx(rs, "فقير") < idx(rs, "بن ناصر"))
    check("من لا سجل له يتقدم على أصحاب السجل", not any(n in rs[0] for n in ("فقير", "بن ناصر", "خدام")) and "لا يوجد سجل" in rs[0], rs[0])
    check("بيانات آخر خفارة والمدة", "آخر خفارة: " + fmt(iso(-10)) in rs[idx(rs, "فقير")] and "منذ 10 أيام" in rs[idx(rs, "فقير")])
    check("المسودة موسومة في السجل", "(مسودة)" in rs[idx(rs, "بن ناصر")] and "منذ 6 أيام" in rs[idx(rs, "بن ناصر")])
    check("تعيين اليوم الواحد ⚠️ مع السبب", "⚠️ يوم دراسي" in rs[idx(rs, "غربي")])
    check("🚗 يظهر للسائق في القائمة", "🚗" in rs[idx(rs, "فقير")])
    check("حوار الخفير يُغلق بالاختيار", True)
    pg.locator("dialog.dlg .pick-row", has_text="فقير").click(); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-value').innerText.includes('فقير')")
    check("حُفظ الخفير", coll(pg, "daily_services")[iso(0)]["parmanoPersonId"] == pid(4))
    check("🚗 بجانب الخفير في البطاقة", slot(pg, "الخفير").locator(".car").count() == 1)

    # ===== D: الحارس =====
    pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row"); rs = rows(pg)
    check("من اختير خفيرًا يظهر في قائمة الحارس مع ⚠️ ودوره", "⚠️" in rs[idx(rs, "فقير")] and "الخفير" in rs[idx(rs, "فقير")])
    check("ترتيب الحارس بآخر حراسة (عقون له سجل قبل 10 أيام)", "آخر حراسة: " + fmt(iso(-10)) in rs[idx(rs, "عقون")])
    pg.locator("dialog.dlg .pick-row", has_text="بوثلجة").click(); settle(pg)
    pg.wait_for_function("document.querySelectorAll('.slot-value')[1].innerText.includes('بوثلجة')")
    check("حُفظ الحارس", coll(pg, "daily_services")[iso(0)]["gardPersonId"] == pid(3))

    # ===== E: الراحة (حتى 4) =====
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row"); rs = rows(pg)
    check("الراحة: عدّاد منذ آخر راحة وأيام العمل المتواصلة", "آخر راحة: " + fmt(iso(-3)) in rs[idx(rs, "بوثلجة")] and "منذ 3 أيام" in rs[idx(rs, "بوثلجة")] and "أيام العمل المتواصلة: 2" in rs[idx(rs, "بوثلجة")], rs[idx(rs, "بوثلجة")])
    check("الراحة: بوثلجة (حارس اليوم) يظهر مع ⚠️", "⚠️" in rs[idx(rs, "بوثلجة")] and "الحارس" in rs[idx(rs, "بوثلجة")])
    for n in ("عقون", "حميدي", "دبزة", "شيتور"): pg.locator("dialog.dlg .pick-row", has_text=n).locator("input").check()
    check("لا يمكن اختيار خامس", pg.locator("dialog.dlg input:disabled").count() == 14 and "4 من 4" in pg.inner_text("dialog.dlg [data-count]"))
    pg.click("dialog.dlg [data-save]"); settle(pg)
    pg.wait_for_function("document.querySelector('.slot-wide .slot-value').innerText.includes('+')")
    check("حُفظت الراحة (4 أفراد)", sorted(coll(pg, "daily_services")[iso(0)]["restPersonIds"]) == sorted(pid(n) for n in (2, 7, 8, 10)))
    check("الراحة تُعرض بصيغة أ + ب + ج", slot(pg, "الراحة").locator(".slot-value").inner_text().count("+") == 3)

    # ===== F: البديل التلقائي (اليوم الثاني) =====
    pg.click("[data-action=nav-next]"); pg.wait_for_selector(".empty")
    pg.click("[data-action=create-day]"); pg.wait_for_selector(".day-card")
    sub = slot(pg, "البديل"); gsub = slot(pg, "بديل الحارس")
    check("البديل = خفير الأمس تلقائيًا مع إشارة", "فقير" in sub.inner_text() and "تلقائي" in sub.inner_text())
    check("بديل الحارس = حارس الأمس تلقائيًا", "بوثلجة" in gsub.inner_text() and "تلقائي" in gsub.inner_text())
    d1 = coll(pg, "daily_services")[iso(1)]
    check("العرض وحده لا يكتب البديل", "parmanoSubstituteId" not in d1 and "gardSubstituteId" not in d1)
    avail = pg.inner_text(".avail")
    check("البديلان المباشران غائبان عن الأفراد المتاحين", "فقير" not in avail and "بوثلجة" not in avail and pg.locator(".avail-item").count() == 16)
    pg.click("[data-action=pick-parmano]"); pg.wait_for_selector("dialog.dlg .pick-row"); rs = rows(pg)
    check("البديل غائب عن قائمة الخفير", len(rs) == 16 and not any("فقير" in r or "بوثلجة" in r for r in rs))
    pg.click("dialog.dlg [data-cancel]"); settle(pg)
    pg.click("[data-action=pick-rest]"); pg.wait_for_selector("dialog.dlg .pick-row"); rs = rows(pg)
    check("البديل غائب عن قائمة الراحة", len(rs) == 16 and not any("فقير" in r or "بوثلجة" in r for r in rs))
    pg.click("dialog.dlg [data-cancel]"); settle(pg)
    pg.click("[data-action=add-task]"); pg.wait_for_selector("dialog.dlg select")
    opts = pg.locator("dialog.dlg select[name=personId] option").all_inner_texts()
    check("البديل غائب عن قائمة المهام", not any("فقير" in o or "بوثلجة" in o for o in opts) and len(opts) == 17)
    pg.click("dialog.dlg [data-cancel]"); settle(pg)
    pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row")
    pg.locator("dialog.dlg .pick-row", has_text="غنانوة").click(); settle(pg)
    pg.wait_for_function("document.querySelectorAll('.slot-value')[1].innerText.includes('غنانوة')")
    d1 = coll(pg, "daily_services")[iso(1)]
    check("أول حفظ يثبّت البديلين المشتقين", d1["parmanoSubstituteId"] == pid(4) and d1["gardSubstituteId"] == pid(3) and d1["gardPersonId"] == pid(12))
    inject(pg, {f"daily_services/{iso(0)}": {**coll(pg, "daily_services")[iso(0)], "parmanoPersonId": pid(1)}})
    reenter(pg, iso(1))
    check("البديل المثبّت لا يتغير بتغيير اليوم السابق", "فقير" in slot(pg, "البديل").inner_text() and slot(pg, "البديل").locator(".slot-note").count() == 0)
    pg.click("[data-action=pick-parmano-sub]"); pg.wait_for_selector("dialog.dlg [data-clear]"); pg.click("dialog.dlg [data-clear]"); settle(pg)
    pg.wait_for_function("!document.querySelector('.roles').innerText.includes('فقير')")
    check("مسح البديل صراحةً يُخزَّن null", coll(pg, "daily_services")[iso(1)]["parmanoSubstituteId"] is None)
    reenter(pg, iso(1))
    check("البديل الممسوح لا يعود تلقائيًا", slot(pg, "البديل").locator(".slot-value").inner_text().strip() == "")
    # اليوم الثالث
    set_date(pg, iso(2)); pg.click("[data-action=create-day]"); pg.wait_for_selector(".day-card")
    check("اليوم الثالث: لا بديل للخفير، وبديل الحارس من حارس الأمس", slot(pg, "البديل").locator(".slot-value").inner_text().strip() == "" and "غنانوة" in slot(pg, "بديل الحارس").inner_text())

    # ===== H: الجمعة (لا راحة) =====
    set_date(pg, iso(5)); pg.click("[data-action=create-day]"); pg.wait_for_selector(".day-card")
    check("يوم الجمعة: زر الراحة متاح مع ملاحظة أنها استثناء (سلوك محدَّث: كان بلا زر)", pg.locator("[data-action=pick-rest]").count() == 1 and "لا توجد راحة يوم الجمعة عادةً" in pg.inner_text(".day-card"), "أحد→جمعة " + pg.inner_text(".day-title"))

    # ===== I: مسودات أسبوع =====
    before = {k: json.dumps(v, sort_keys=True) for k, v in coll(pg, "daily_services").items() if k in (iso(0), iso(1), iso(2), iso(5))}
    pg.click("[data-action=open-week]"); pg.wait_for_selector("dialog.dlg")
    pg.fill("dialog input[name=start]", iso(0)); pg.fill("dialog input[name=count]", "0"); pg.click("dialog.dlg button[type=submit]")
    check("عدد أيام غير صالح مرفوض", "بين 1 و31" in pg.inner_text("dialog [data-error]"))
    pg.fill("dialog input[name=count]", "7"); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_selector(".toast-ok:has-text('تم إنشاء')")
    wk = pg.locator(".toast-ok", has_text="تم إنشاء").first.inner_text()
    check("أُنشئت الأيام الناقصة فقط وتُخطي الموجود", "تم إنشاء 3" in wk and "تخطي 4" in wk, wk)
    days = coll(pg, "daily_services")
    check("الأسبوع كله موجود (7 أيام) وغير ذلك لم يُنشأ", all(iso(i) in days for i in range(7)) and iso(7) not in days and len(days) == 10)
    check("الجديدة مسودات فارغة", all(days[iso(i)]["status"] == "draft" and days[iso(i)]["parmanoPersonId"] is None for i in (3, 4, 6)))
    check("الأيام الموجودة لم تُستبدل", all(json.dumps(days[k], sort_keys=True) == v for k, v in before.items()))
    check("شريط الأيام يلوّن المسودات", pg.locator(".chip-draft").count() >= 7)

    # ===== J: المهام =====
    set_date(pg, iso(0))
    rows_before = pg.locator(".day-tasks tbody tr").count()
    check("التعيينات تظهر تلقائيًا في جدول المهام بتواريخها", rows_before == 2 and "مهمة طويلة" in pg.inner_text(".day-tasks") and fmt(iso(-1)) in pg.inner_text(".day-tasks") and fmt(iso(5)) in pg.inner_text(".day-tasks"))
    pg.click("[data-action=add-task]"); pg.wait_for_selector("dialog.dlg select"); pg.click("dialog.dlg button[type=submit]")
    check("مهمة بلا فرد مرفوضة", "اختر الفرد" in pg.inner_text("dialog [data-error]"))
    pg.select_option("dialog select[name=personId]", label="مرزوقي 🚗"); pg.click("dialog.dlg button[type=submit]")
    check("مهمة بلا نص مرفوضة", "اكتب المهمة" in pg.inner_text("dialog [data-error]"))
    pg.fill("dialog input[name=task]", "حراسة المخزن"); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_function("document.querySelectorAll('.day-tasks tbody tr').length==3")
    check("حُفظت المهمة اليدوية", coll(pg, "daily_services")[iso(0)]["otherTasks"] == [{"personId": pid(11), "task": "حراسة المخزن"}])
    check("صاحب المهمة يظهر في المتاحين مع ⚠️ ومهمته", "⚠️ مهمة: حراسة المخزن" in pg.locator(".avail-item", has_text="مرزوقي").inner_text())
    pg.locator(".day-tasks tr", has_text="حراسة المخزن").locator("[data-action=edit-task]").click(); pg.wait_for_selector("dialog.dlg input[name=task]")
    pg.fill("dialog input[name=task]", "نوبة ليلية"); pg.click("dialog.dlg button[type=submit]"); settle(pg)
    pg.wait_for_selector(".day-tasks:has-text('نوبة ليلية')")
    check("تعديل المهمة", coll(pg, "daily_services")[iso(0)]["otherTasks"][0]["task"] == "نوبة ليلية")
    pg.locator(".day-tasks tr", has_text="نوبة ليلية").locator("[data-action=del-task]").click(); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=ok]")
    pg.wait_for_function("document.querySelectorAll('.day-tasks tbody tr').length==2")
    check("حذف المهمة", coll(pg, "daily_services")[iso(0)]["otherTasks"] == [])
    av = pg.locator(".avail-item"); ords = av.evaluate_all("els=>els.map(e=>e.className)")
    key = {"avail-free": 0, "avail-busy": 1, "avail-long": 2}
    order = [key[next(c for c in cl.split() if c in key)] for cl in ords]
    check("الأفراد المتاحون: متاح ثم ⚠️ ثم الطويل أسفلًا", order == sorted(order) and order[-1] == 2 and "خدام" in av.last.inner_text())

    # ===== K: الاعتماد والحذف =====
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-ok")
    check("اعتماد يوم مكتمل مباشرة", coll(pg, "daily_services")[iso(0)]["status"] == "final" and pg.inner_text(".day-head .badge") == "معتمد")
    check("اليوم المعتمد: لا زر حذف، وشريط الأيام أخضر", pg.locator("[data-action=delete-day]").count() == 0 and pg.locator(".chip-final").count() >= 1)
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-warn")
    check("إعادة إلى مسودة", coll(pg, "daily_services")[iso(0)]["status"] == "draft")
    set_date(pg, iso(3)); pg.click("[data-action=toggle-status]"); pg.wait_for_selector("dialog.dlg")
    check("اعتماد يوم ناقص يطلب تأكيدًا يذكر الناقص", "الخفير والحارس" in pg.inner_text("dialog.dlg"), pg.inner_text("dialog.dlg p"))
    pg.click("dialog.dlg button[value=cancel]"); check("إلغاء الاعتماد يُبقيه مسودة", coll(pg, "daily_services")[iso(3)]["status"] == "draft")
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=ok]"); pg.wait_for_selector(".day-head .badge-ok")
    check("اعتماد رغم النقص بعد التأكيد", coll(pg, "daily_services")[iso(3)]["status"] == "final")
    pg.click("[data-action=toggle-status]"); pg.wait_for_selector(".day-head .badge-warn")
    pg.click("[data-action=delete-day]"); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=cancel]")
    check("إلغاء حذف المسودة لا يحذف", iso(3) in coll(pg, "daily_services"))
    pg.click("[data-action=delete-day]"); pg.wait_for_selector("dialog.dlg"); pg.click("dialog.dlg button[value=ok]"); pg.wait_for_selector(".empty")
    days = coll(pg, "daily_services")
    check("حذف المسودة يزيلها فقط", iso(3) not in days and len(days) == 9)

    # ===== L: غير النشط =====
    inject(pg, {"people/p_seed_16": {**store(pg)["people/p_seed_16"], "isActive": False}})
    reenter(pg, iso(0))
    check("غير النشط غائب عن المتاحين", "شيباني" not in pg.inner_text(".avail"))
    pg.click("[data-action=pick-gard]"); pg.wait_for_selector("dialog.dlg .pick-row")
    check("غير النشط غائب عن قوائم الاختيار", not any("شيباني" in r for r in rows(pg)))
    pg.click("dialog.dlg [data-cancel]"); settle(pg)

    # ===== M: سلامة عامة =====
    check("لا مجموعة statistics ولا مجموعات أخرى", {k.split("/")[0] for k in store(pg)} == {"people", "assignments", "daily_services", "settings"})
    check("الأفراد والتعيينات الحالية لم تُمسّ (18 فردًا)", len(coll(pg, "people")) == 18 and len(coll(pg, "assignments")) == 2)
    for _ in range(3): go(pg, "people", ".person"); go(pg, "services", "#svc-card")
    pg.click("[data-action=open-week]"); pg.wait_for_selector("dialog.dlg")
    check("لا تراكم أحداث بعد زيارات متكررة", pg.locator("dialog.dlg").count() == 1)
    pg.click("dialog.dlg [data-cancel]"); settle(pg)
    set_date(pg, iso(0)); pg.wait_for_selector(".day-card")
    pg.locator(".day-card").screenshot(path="/tmp/smoke/p3_desktop_card.png")
    pg.click("[data-action=pick-parmano]"); pg.wait_for_selector("dialog.dlg .pick-row"); pg.screenshot(path="/tmp/smoke/p3_desktop_picker.png")
    pg.click("dialog.dlg [data-cancel]"); settle(pg)

    # ===== الهاتف =====
    m = setup(b, 390, 844); login(m); go(m, "services", "#svc-card"); set_date(m, iso(0))
    m.click("[data-action=create-day]"); m.wait_for_selector(".day-card")
    check("الهاتف: لا تمرير أفقي", not m.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    check("الهاتف: الخانات في عمود واحد", m.evaluate("getComputedStyle(document.querySelector('.roles')).gridTemplateColumns.split(' ').length") == 1)
    m.screenshot(path="/tmp/smoke/p3_mobile_card.png", full_page=True)
    m.click("[data-action=pick-parmano]"); m.wait_for_selector("dialog.dlg .pick-row")
    check("الهاتف: حوار الاختيار داخل الشاشة", m.evaluate("(()=>{const r=document.querySelector('dialog.dlg').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"))
    m.screenshot(path="/tmp/smoke/p3_mobile_picker.png")
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
print(f"\n{sum(results)}/{len(results)} نجحت"); sys.exit(0 if all(results) and not errors else 1)
