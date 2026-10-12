import assert from "node:assert/strict";
import { checkDay, VERDICT } from "../js/day-check.js";
import { newDayDoc } from "../js/services-logic.js";

// أفراد: 5 سائقين بالأسماء الحقيقية + آخرون
const P=(id,name,isDriver=false,isActive=true)=>({id,name,isDriver,isActive});
const people=[P("fq","فقير",true),P("kd","خدام",true),P("mz","مرزوقي",true),P("ed","عيدة",true),P("fl","فلاح",true),
  P("a","أحمد"),P("b","بلال"),P("c","جمال"),P("d","داود"),P("e","هشام"),P("g","غسان"),P("z","زيد",false,false)];
const D="2026-10-12"; // الاثنين (غير جمعة)
const day=(date,o={})=>({...newDayDoc(date),status:"draft",...o});
const A=(id,personId,type,s,e)=>({id,personId,type,startDate:s,endDate:e});
const run=(days,asg=[],date=D)=>checkDay({date,people,assignments:asg,days});
const sec=(r,k)=>r.sections.find(s=>s.key===k);
const texts=(r,k)=>sec(r,k).items.map(i=>`${i.level}:${i.text}`);

// ===== يوم سليم تمامًا =====
let days={[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c","d","e"]})};
// أمس غير مُعدّ → info فقط
let r=run(days);
assert.equal(r.level,"ok"); assert.equal(r.verdict,"🟢 سليم");
assert.equal(sec(r,"subs").items[0].level,"info");
assert.equal(r.availableDrivers,5); assert.equal(sec(r,"drivers").okText,"السائقون المتاحون: 5");
assert.equal(sec(r,"rest").okText,"3 أفراد");
// مع يوم سابق فارغ الأدوار: لا بديل مطلوب
days["2026-10-11"]=day("2026-10-11");
r=run(days); assert.equal(r.level,"ok"); assert.equal(sec(r,"subs").items.length,0);

// ===== نقص الخفير والحارس: مسودة 🟡 ومعتمد 🔴 =====
days={[D]:day(D,{restPersonIds:["c"]}),"2026-10-11":day("2026-10-11")};
r=run(days); assert.equal(r.level,"warn"); assert.equal(sec(r,"parmano").level,"warn"); assert.equal(sec(r,"gard").level,"warn");
days[D].status="final"; r=run(days); assert.equal(r.level,"bad"); assert.match(texts(r,"parmano")[0],/غير محدد في يوم معتمد/);

// ===== قاعدة 48 ساعة =====
// أحمد خفير أمس → هو بديل اليوم تلقائيًا؛ إن اختير خفيرًا اليوم: 🔴
days={"2026-10-11":day("2026-10-11",{parmanoPersonId:"a"}),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})};
r=run(days); assert.equal(r.level,"bad");
assert.ok(texts(r,"parmano").some(t=>t.startsWith("bad:")&&t.includes("ستُحسب مرتين")));
// اختياره للراحة أو مهمة أو حارسًا اليوم 🔴
days[D]={...day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["a"],otherTasks:[{personId:"a",task:"حراسة"}]})};
r=run(days);
assert.ok(texts(r,"rest").some(t=>t.startsWith("bad:")&&t.includes("للراحة")));
assert.ok(texts(r,"assignments").some(t=>t.startsWith("bad:")&&t.includes("لمهمة")));
// بديل مخزَّن مختلف عن خفير الأمس: 🟡 ، وخفير الأمس يبقى ممنوعًا (48 ساعة)
days[D]=day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["d"],parmanoSubstituteId:"e"});
r=run(days); assert.equal(r.level,"warn"); assert.match(texts(r,"subs")[0],/ليس خفير الأمس/);
days[D].restPersonIds=["a"]; r=run(days); assert.ok(texts(r,"rest").some(t=>t.startsWith("bad:")), "خفير الأمس ممنوع حتى لو غُيّر البديل");
// بلا بديل صراحةً بينما كان هناك خفير أمس → 🟡
days[D]=day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["d"],parmanoSubstituteId:null});
r=run(days); assert.match(texts(r,"subs")[0],/لا يوجد البديل رغم أن أحمد/);
// بديل مختار بينما لا خفير في اليوم السابق
days={"2026-10-11":day("2026-10-11"),[D]:day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["d"],parmanoSubstituteId:"e"})};
r=run(days); assert.match(texts(r,"subs")[0],/لا يوجد خفير في اليوم السابق/);
// اليوم التالي: الخفير مسجَّل مرة أخرى أو في الراحة → 🔴
days={[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]}),
      "2026-10-13":day("2026-10-13",{parmanoPersonId:"a",restPersonIds:["b"]})};
r=run(days); assert.ok(texts(r,"parmano").some(t=>t.startsWith("bad:")&&t.includes("خفيرًا")&&t.includes("13/10/2026")));
assert.ok(texts(r,"gard").some(t=>t.startsWith("bad:")&&t.includes("في الراحة")));
// اليوم الثالث يعود متاحًا: لا خطأ
days={[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]}),"2026-10-13":day("2026-10-13",{parmanoPersonId:"c"}),"2026-10-14":day("2026-10-14",{parmanoPersonId:"a"})};
r=run(days); assert.ok(!texts(r,"parmano").some(t=>t.startsWith("bad:")));

// ===== الفصل بين الخفير والحارس (±2) =====
const sepDays=(pDate,gDate)=>({[pDate]:day(pDate,{parmanoPersonId:"a"}),[gDate]:{...(pDate===gDate?{}:{}),...day(gDate,{gardPersonId:"a"})}});
const sepLevel=(off)=>{ // أحمد خفير يوم D، وحارس بعد off أيام
  const g=new Date(Date.parse(D+"T00:00:00Z")+off*86400000).toISOString().slice(0,10);
  const dd={[D]:day(D,{parmanoPersonId:"a",gardPersonId:off===0?"a":"b",restPersonIds:["c"]})};
  if(off!==0) dd[g]=day(g,{gardPersonId:"a"});
  return sec(run(dd),"separation").level;
};
assert.equal(sepLevel(0),"bad"); assert.equal(sepLevel(1),"bad"); assert.equal(sepLevel(2),"bad");
assert.equal(sepLevel(3),"ok"); assert.equal(sepLevel(-1),"bad"); assert.equal(sepLevel(-2),"bad"); assert.equal(sepLevel(-3),"ok");
// الصياغة المعتمدة
{ const dd={[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]}),"2026-10-14":day("2026-10-14",{gardPersonId:"a"})};
  const t=texts(run(dd),"separation")[0]; assert.match(t,/تعارض مع قاعدة الفصل بين الخفير والحارس/); assert.match(t,/أحمد خفير في 12\/10\/2026 وحارس في 14\/10\/2026/); }
// العكس: حارس 10 و11 ثم خفير يبدأ 12 → 🔴 ، 13 → سليم
{ const g="2026-10-10";
  let dd={[g]:day(g,{gardPersonId:"a"}),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})};
  assert.equal(sec(run(dd),"separation").level,"bad");
  dd={["2026-10-09"]:day("2026-10-09",{gardPersonId:"a"}),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})};
  assert.equal(sec(run(dd),"separation").level,"ok"); }
// تعارض بين يومين لا يخص هذا اليوم لا يظهر هنا
{ const dd={[D]:day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["d"]}),"2026-10-10":day("2026-10-10",{parmanoPersonId:"a"}),"2026-10-11":day("2026-10-11",{gardPersonId:"a"})};
  assert.equal(sec(run(dd),"separation").level,"ok"); }

// ===== الراحة =====
const restRes=(ids,date=D,extra={})=>run({[date]:day(date,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:ids,...extra})},[],date);
assert.equal(sec(restRes(["c"]),"rest").level,"ok");
assert.equal(sec(restRes(["c","d","e","g"]),"rest").level,"ok");                      // 4 مسموح
assert.equal(sec(restRes(["c","d","e","g","fl"]),"rest").level,"bad");                // 5 مرفوض
assert.match(texts(restRes(["c","d","e","g","fl"]),"rest")[0],/يتجاوز الحد الأقصى \(4\)/);
assert.equal(sec(restRes([]),"rest").level,"warn");                                    // لا راحة في يوم عادي
const FRI="2026-10-16";
assert.equal(sec(restRes([],FRI),"rest").level,"ok");                                  // الجمعة بلا راحة طبيعي
assert.equal(sec(restRes(["c"],FRI),"rest").level,"warn");                             // راحة الجمعة: استثناء 🟡 (كانت 🔴 قبل السماح بالاستثناء)
assert.equal(sec(restRes(["c"],FRI),"rest").items[0].kind,"exception");
assert.match(texts(restRes(["c"],FRI),"rest")[0],/لا توجد راحة يوم الجمعة/);
assert.equal(sec(restRes(["a"]),"rest").level,"bad");                                  // الخفير في الراحة
assert.equal(sec(restRes(["c","c"]),"rest").level,"warn");                             // تكرار
assert.equal(sec(restRes(["z"]),"rest").level,"warn");                                 // غير نشط
assert.equal(sec(restRes(["c"],D,{otherTasks:[{personId:"c",task:"x"}]}),"rest").level,"warn");

// ===== التكليفات =====
let asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})},
  [A(1,"a","مهمة طويلة","2026-10-10","2026-10-15")]);
assert.equal(sec(asgR,"assignments").level,"bad"); assert.match(texts(asgR,"assignments")[0],/لديه تكليف طويل.*حتى 15\/10\/2026/);
asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})},[A(1,"b","يوم دراسي",D,D)]);
assert.equal(sec(asgR,"assignments").level,"warn"); assert.equal(asgR.level,"warn");
asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})},[A(1,"c","إجازة","2026-10-10","2026-10-14")]);
assert.equal(sec(asgR,"assignments").level,"warn");                                    // راحة لمن في إجازة: ملاحظة فقط
// مهمة يدوية لمن لديه تكليف طويل 🔴
asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"],otherTasks:[{personId:"d",task:"حراسة"}]})},[A(1,"d","تدريب","2026-10-10","2026-10-14")]);
assert.equal(sec(asgR,"assignments").level,"bad");
// اليوم الثاني من الخدمة يصادف تكليفًا
asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})},[A(1,"a","يوم دراسي","2026-10-13","2026-10-13")]);
assert.ok(texts(asgR,"assignments").some(t=>t.startsWith("warn:")&&t.includes("13/10/2026")&&t.includes("اليوم الثاني")));
// تعيين لا يخص أحدًا في الأدوار لا يؤثر
asgR=run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})},[A(1,"g","مريض",D,D)]);
assert.equal(sec(asgR,"assignments").level,"ok");

// ===== السائقون =====
const drv=(o,asg=[])=>run({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"],...o})},asg);
assert.equal(drv({}).availableDrivers,5);
let dr=drv({parmanoPersonId:"fq",restPersonIds:["kd","mz"],otherTasks:[{personId:"ed",task:"x"}]});  // يبقى فلاح فقط
assert.equal(dr.availableDrivers,1); assert.equal(sec(dr,"drivers").okText,"السائقون المتاحون: 1"); assert.equal(sec(dr,"drivers").level,"ok");
assert.deepEqual(dr.drivers.filter(d=>d.available).map(d=>d.person.name),["فلاح"]);
assert.ok(dr.drivers.find(d=>d.person.id==="fq").reasons.includes("الخفير"));
// لا سائق: خفير + حارس + راحة + مهمة + تكليف
dr=drv({parmanoPersonId:"fq",gardPersonId:"kd",restPersonIds:["mz","ed"],otherTasks:[{personId:"fl",task:"x"}]});
assert.equal(dr.availableDrivers,0); assert.equal(sec(dr,"drivers").level,"bad"); assert.equal(dr.level,"bad");
assert.equal(sec(dr,"drivers").items[0].text,"لا يوجد سائق متاح في هذا اليوم");
// التكليف يخرج السائق من المتاح (يوم أو طويل)
dr=drv({parmanoPersonId:"a",restPersonIds:["c"]},[A(1,"fq","يوم دراسي",D,D),A(2,"kd","إجازة","2026-10-10","2026-10-20"),A(3,"mz","مهمة طويلة","2026-10-01","2026-10-30"),A(4,"ed","تدريب",D,D)]);
assert.equal(dr.availableDrivers,1);
// البديل المباشر ليس متاحًا كسائق
dr=run({"2026-10-11":day("2026-10-11",{parmanoPersonId:"fq"}),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})});
assert.equal(dr.availableDrivers,4); assert.ok(dr.drivers.find(d=>d.person.id==="fq").reasons.includes("البديل"));
// سائق غير نشط لا يُحسب
{ const ppl=people.map(p=>p.id==="fl"?{...p,isActive:false}:p);
  const x=checkDay({date:D,people:ppl,assignments:[],days:{[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})}}); assert.equal(x.drivers.length,4); }
// لا سائقين نشطين إطلاقًا
{ const ppl=people.map(p=>({...p,isDriver:false}));
  const x=checkDay({date:D,people:ppl,assignments:[],days:{[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})}}); assert.equal(x.level,"bad"); }

// ===== نقاط عامة =====
assert.equal(run({}),null);                                    // بلا وثيقة لا فحص
assert.equal(VERDICT.warn,"🟡 توجد ملاحظات أو تنبيهات");
// الفحص للقراءة فقط: لا يعدّل المدخلات
{ const dd={"2026-10-11":day("2026-10-11",{parmanoPersonId:"a"}),[D]:day(D,{parmanoPersonId:"c",gardPersonId:"b",restPersonIds:["d"]})};
  const snap=JSON.stringify(dd); run(dd); assert.equal(JSON.stringify(dd),snap); }

// ===== مهام بلا تاريخ نهاية: مؤكد مقابل تعذّر التحقق =====
const OA=(id,personId,type,s)=>({id,personId,type,startDate:s,endDate:null});
const kinds=(r,k)=>sec(r,k).items.map(i=>i.kind);
const base=()=>({[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]})});
// تبدأ في يوم الفحص نفسه: وجودها مؤكد → تعارض مؤكد 🔴
let o=run(base(),[OA(1,"a","مهمة أخرى",D)]);
assert.equal(sec(o,"assignments").level,"bad"); assert.deepEqual(kinds(o,"assignments"),["conflict","unverified"]);   // اليوم + اليوم الثاني من الخدمة (غير مؤكد)
assert.match(texts(o,"assignments")[0],/أحمد \(الخفير\) — 12\/10\/2026: لديه تكليف طويل في هذا اليوم: مهمة أخرى \(بلا تاريخ نهاية، بدأت في 12\/10\/2026\)/);
// بدأت قبل يوم الفحص: تُعدّ مستمرة لكن يتعذّر التأكد → 🟡 وسم «unverified» لا 🔴
o=run(base(),[OA(1,"a","مهمة أخرى","2026-10-01")]);
assert.equal(sec(o,"assignments").level,"warn"); assert.equal(o.level,"warn"); assert.deepEqual(kinds(o,"assignments"),["unverified","unverified"]);   // يوم الفحص + يومه الثاني
assert.match(texts(o,"assignments")[0],/أحمد \(الخفير\) — 12\/10\/2026: لديه مهمة «مهمة أخرى» بدأت في 01\/10\/2026 وبلا تاريخ نهاية؛ تُعدّ مستمرة، ويتعذّر التأكد من انتهائها قبل 12\/10\/2026/);
assert.ok(!texts(o,"assignments")[0].includes("9999"),"لا يظهر تاريخ وهمي أبدًا");
// تبدأ بعد يوم الفحص: لا أثر
o=run(base(),[OA(1,"a","مهمة أخرى","2026-10-20")]); assert.equal(sec(o,"assignments").level,"ok");
// حارس / بديل / راحة / مهمة يدوية: نفس التمييز، والراحة تبقى 🟡 حتى لو مؤكدة
o=run({...base(),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"],otherTasks:[{personId:"d",task:"حراسة"}]})},
  [OA(1,"b","تعيين","2026-10-01"),OA(2,"c","تعيين",D),OA(3,"d","تعيين","2026-09-01")]);
assert.deepEqual(sec(o,"assignments").items.map(i=>i.level+":"+i.kind),["warn:unverified","warn:conflict","warn:unverified","warn:unverified"]);   // b غير مؤكد، c راحة مؤكدة 🟡، d غير مؤكد، ثم يوم b الثاني
// مهمة معروفة النهاية مقابل مستمرة: الأولى «تعارض مؤكد»
o=run(base(),[A(1,"a","مهمة طويلة","2026-10-10","2026-10-15")]);
assert.ok(kinds(o,"assignments").every(k=>k==="conflict")); assert.match(texts(o,"assignments")[0],/\(حتى 15\/10\/2026\)/);   // معروفة النهاية: مؤكدة دائمًا
// اليوم الثاني من الخدمة (اليوم التالي): غير مؤكد + مؤكد
o=run(base(),[OA(1,"a","تعيين","2026-10-01")]);
assert.ok(sec(o,"assignments").items.some(i=>i.kind==="unverified"&&i.text.includes("وهو اليوم الثاني من خدمته")));
o=run(base(),[OA(1,"a","تعيين","2026-10-13")]);
assert.ok(sec(o,"assignments").items.some(i=>i.kind==="conflict"&&i.text.includes("13/10/2026")&&i.text.includes("وهو اليوم الثاني من خدمته")));
// السائقون: مهمة بلا نهاية تُخرج السائق من المتاح (تُعدّ مستمرة) وتُوضَّح كغير مؤكدة
o=run({[D]:day(D,{parmanoPersonId:"fq",gardPersonId:"kd",restPersonIds:["mz","ed"]})},[OA(1,"fl","تعيين","2026-10-01")]);
assert.equal(o.availableDrivers,0); assert.equal(sec(o,"drivers").level,"bad");
assert.ok(sec(o,"drivers").items.some(i=>i.level==="info"&&i.kind==="unverified"&&i.text.includes("فلاح")&&i.text.includes("مهمة بلا تاريخ نهاية")));
assert.ok(o.drivers.find(d=>d.person.id==="fl").reasons[0].includes("غير مؤكد"));
// لا بند «تعذّر التحقق» إن كان للسائق سبب مؤكد آخر
o=run({[D]:day(D,{parmanoPersonId:"fq",gardPersonId:"kd",restPersonIds:["mz","ed","fl"]})},[OA(1,"fl","تعيين","2026-10-01")]);
assert.ok(!sec(o,"drivers").items.some(i=>i.kind==="unverified"));
// ===== الوضوح: الفرد والتاريخ والدور والسبب في كل تنبيه تعارض =====
{ const d2={"2026-10-11":day("2026-10-11",{parmanoPersonId:"a"}),[D]:day(D,{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["a"]})};
  const r2=run(d2); const all=r2.sections.flatMap(s=>s.items).filter(i=>i.kind==="conflict");
  assert.ok(all.length>=2);
  for(const i of all){ assert.ok(i.text.includes("أحمد")||i.text.includes("تعارض مع قاعدة"),i.text); assert.ok(/\d{2}\/\d{2}\/2026/.test(i.text),"التاريخ مذكور: "+i.text); }
  assert.ok(texts(r2,"parmano").some(t=>t.includes("أحمد (الخفير) — 12/10/2026")&&t.includes("خفير الأمس (11/10/2026)")&&t.includes("ستُحسب مرتين"))); }
// راحة الجمعة: استثناء بتسمية الأفراد، ولا 🔴 بسببها وحدها
{ const r3=restRes(["c","d"],FRI); assert.equal(r3.level,"warn"); assert.match(texts(r3,"rest")[0],/لا توجد راحة يوم الجمعة عادةً؛ مُنحت هنا استثناءً \(جمال، داود\)/);
  assert.equal(restRes(["c","d","e","g","fl"],FRI).level,"bad"); }       // الحد الأقصى يبقى مطبقًا يوم الجمعة
assert.equal(sec(restRes(["a"],FRI),"rest").level,"bad");                // والتعارض مع الخفير يبقى 🔴 يوم الجمعة

console.log("فحص اليوم: كل الاختبارات نجحت");
