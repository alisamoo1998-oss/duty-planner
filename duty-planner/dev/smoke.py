import json, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099/"
V = "https://www.gstatic.com/firebasejs/10.14.1/"

import os; sys.path.insert(0, os.path.dirname(__file__))
from mockfb import APP, AUTH, FS

errors = []
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

def store(page):
    return page.evaluate("JSON.parse(localStorage.getItem('mockstore')||'{}')")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width":1280,"height":800})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type=="error" else None)
    for name, body in (("firebase-app.js",APP),("firebase-auth.js",AUTH),("firebase-firestore.js",FS)):
        page.route(V+name, lambda r, _q, body=body: r.fulfill(status=200, content_type="application/javascript", body=body))
    page.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r, _q: r.fulfill(status=200, content_type="text/css", body=""))

    page.goto(BASE)
    page.wait_for_selector("#login-screen:not([hidden])")
    check("تظهر شاشة تسجيل الدخول", page.is_visible("#login-form"))
    check("اتجاه الصفحة RTL", page.evaluate("document.documentElement.dir")=="rtl")

    page.fill("#login-email","me@test.com"); page.fill("#login-password","wrong")
    page.click("#login-btn"); page.wait_for_selector("#login-error:not([hidden])")
    check("رسالة خطأ عند كلمة مرور خاطئة", "غير صحيحة" in page.inner_text("#login-error"))

    page.fill("#login-password","secret12"); page.click("#login-btn")
    page.wait_for_selector("#app-shell:not([hidden])")
    page.wait_for_selector(".toast-ok")
    check("إشعار التهيئة الأولية ظهر", "18" in page.inner_text(".toast-ok"), page.inner_text(".toast-ok"))
    page.wait_for_selector(".empty")
    s = store(page); people = {k:v for k,v in s.items() if k.startswith("people/")}
    check("أُنشئ 18 فردًا", len(people)==18, str(len(people)))
    check("كلهم نشطون وnotes فارغة", all(v["isActive"] is True and v["notes"]=="" for v in people.values()))
    check("5 سائقين فقط", sum(1 for v in people.values() if v["isDriver"])==5)
    check("علامة التهيئة موجودة", "settings/initialSeed" in s)
    check("لا مجموعات أخرى (لا بيانات وهمية)", {k.split('/')[0] for k in s} == {"people","settings"}, str({k.split('/')[0] for k in s}))
    check("الصفحة الافتراضية: برنامج الخدمات", page.inner_text("#page-title")=="برنامج الخدمات")

    page.click('a[data-route="people"]'); page.wait_for_selector(".person")
    check("صفحة الأفراد تعرض 18 صفًا", page.locator(".person").count()==18)
    check("🚗 يظهر 5 مرات", page.locator(".person .car").count()==5)
    page.screenshot(path="/tmp/smoke/desktop_people.png")

    for route, title in (("assignments","التعيينات"),("stats","الإحصائيات"),("services","برنامج الخدمات")):
        page.click(f'a[data-route="{route}"]'); page.wait_for_function(f"document.getElementById('page-title').textContent=='{title}'")
        page.wait_for_selector("#view .sheet")
        check(f"التنقل إلى {title}", page.locator('a.active').get_attribute("data-route")==route)
    page.screenshot(path="/tmp/smoke/desktop_services.png")

    page.click('a[data-route="settings"]'); page.wait_for_selector(".check")
    page.wait_for_function("document.querySelectorAll('.check').length>=4")
    txt = page.inner_text("#diag")
    check("فحص الاتصال: كله أخضر", "🔴" not in txt and "🟡" not in txt and txt.count("🟢")==4, txt.replace("\n"," | "))
    page.screenshot(path="/tmp/smoke/desktop_settings.png")

    # إعادة تحميل: لا تكرار
    page.reload(); page.wait_for_selector("#app-shell:not([hidden])"); page.wait_for_timeout(600)
    s2 = store(page)
    check("بعد إعادة التحميل ما زال الدخول قائمًا", page.is_visible("#app-shell"))
    check("بعد إعادة التحميل ما زال 18 فردًا", len([k for k in s2 if k.startswith('people/')])==18)
    check("لا إشعار تهيئة ثانٍ", page.locator(".toast-ok").count()==0)

    # حماية: تعديل فرد + حذف العلامة + إضافة فرد جديد ثم إعادة التحميل
    page.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('mockstore'));
      s['people/p_seed_01'].name='اسم معدّل'; s['people/p_seed_01'].isActive=false; s['people/p_seed_03'].notes='ملاحظة';
      s['people/newone']={name:'جديد',isDriver:true,isActive:true,notes:''};
      delete s['settings/initialSeed']; localStorage.setItem('mockstore',JSON.stringify(s));}""")
    page.reload(); page.wait_for_selector("#app-shell:not([hidden])"); page.wait_for_timeout(600)
    s3 = store(page)
    check("لم يُستبدل الفرد المعدّل", s3["people/p_seed_01"]["name"]=="اسم معدّل" and s3["people/p_seed_01"]["isActive"] is False)
    check("لم تُستبدل ملاحظات فرد آخر", s3["people/p_seed_03"]["notes"]=="ملاحظة")
    check("الفرد المضاف لاحقًا باقٍ ولا تكرار", len([k for k in s3 if k.startswith('people/')])==19)
    check("أُعيدت العلامة دون إنشاء أي فرد", s3["settings/initialSeed"]["peopleCreated"]==0)

    # الأفراد: غير النشط في الأسفل وخافت
    page.click('a[data-route="people"]'); page.wait_for_selector(".person")
    check("غير النشط يظهر في الأسفل وخافتًا", "person-off" in page.locator(".person").last.get_attribute("class"))

    # الهاتف
    mctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2)
    mp = mctx.new_page()
    mp.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    for name, body in (("firebase-app.js",APP),("firebase-auth.js",AUTH),("firebase-firestore.js",FS)):
        mp.route(V+name, lambda r, _q, body=body: r.fulfill(status=200, content_type="application/javascript", body=body))
    mp.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r, _q: r.fulfill(status=200, content_type="text/css", body=""))
    mp.goto(BASE); mp.wait_for_selector("#login-screen:not([hidden])")
    mp.screenshot(path="/tmp/smoke/mobile_login.png")
    mp.fill("#login-email","me@test.com"); mp.fill("#login-password","secret12"); mp.click("#login-btn")
    mp.wait_for_selector("#app-shell:not([hidden])"); mp.click('a[data-route="people"]'); mp.wait_for_selector(".person")
    mp.wait_for_timeout(300)
    overflow = mp.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    check("لا تمرير أفقي على الهاتف", not overflow)
    nav = mp.locator(".side").bounding_box()
    check("شريط التنقل أسفل الشاشة على الهاتف", nav and nav["y"]+nav["height"] >= 799, str(nav))
    mp.screenshot(path="/tmp/smoke/mobile_people.png")

    # تسجيل الخروج
    page.click("#logout-btn"); page.wait_for_selector("#login-screen:not([hidden])")
    check("تسجيل الخروج يعيد شاشة الدخول", page.is_visible("#login-form") and not page.is_visible("#app-shell"))
    b.close()

print("\n--- أخطاء المتصفح ---"); print("\n".join(errors) if errors else "لا توجد أخطاء JavaScript")
fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} نجحت"); sys.exit(1 if fails or errors else 0)
