import assert from "node:assert/strict";
import * as R from "../js/report-logic.js";
const P=(id,name,isDriver=false,isActive=true)=>({id,name,isDriver,isActive});
const people=[P("fq","فقير",true),P("a","أحمد"),P("b","بلال"),P("c","جمال"),P("d","داود"),P("old","قديم",false,false)];
const day=(date,o={})=>({date,status:"draft",parmanoPersonId:null,gardPersonId:null,restPersonIds:[],otherTasks:[],...o});
const mk=(...ds)=>Object.fromEntries(ds.map(d=>[d.date,d]));
const A=(id,personId,type,s,e)=>({id,personId,type,startDate:s,endDate:e});
const TODAY="2026-10-12";
const rep=(o={})=>R.buildReport({people,assignments:[],days:{},from:"2026-10-10",to:"2026-10-15",today:TODAY,...o});

// ===== التحقق من الفترة =====
assert.deepEqual(R.validatePeriod("2026-10-01","2026-10-31"),{ok:true,days:31});
assert.equal(R.validatePeriod("2026-10-05","2026-10-05").days,1);
assert.match(R.validatePeriod("2026-10-20","2026-10-10").message,/تاريخ البداية بعد تاريخ النهاية/);
assert.equal(R.validatePeriod("","2026-10-10").ok,false); assert.equal(R.validatePeriod("2026-02-30","2026-03-05").ok,false);
assert.equal(R.validatePeriod("2026-01-01","2026-12-31").ok,true);           // 365
assert.equal(R.validatePeriod("2026-01-01","2027-01-01").ok,true);           // 366 يومًا بالضبط: مسموح
assert.equal(R.validatePeriod("2026-01-01","2027-01-02").ok,false);          // 367: مرفوض
assert.match(R.validatePeriod("2026-01-01","2027-01-02").message,/367 يومًا.*الحد الأقصى 366/);
assert.equal(R.validatePeriod("2028-01-01","2028-12-31").ok,true);           // 366 (كبيسة) مسموح
assert.throws(()=>rep({from:"2026-10-20",to:"2026-10-10"}),/بعد تاريخ النهاية/);

// ===== صف لكل يوم بترتيب زمني، يشمل الأيام غير المُعدّة =====
let r=rep();
assert.equal(r.daysCount,6); assert.equal(r.shown,6); assert.deepEqual(r.rows.map(x=>x.date),["2026-10-10","2026-10-11","2026-10-12","2026-10-13","2026-10-14","2026-10-15"]);
assert.deepEqual(r.rows.map(x=>x.weekday),["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس"]);
assert.ok(r.rows.every(x=>R.COLUMN_ORDER.every(c=>x.cells[c].length===0)));
assert.deepEqual(r.columns,["parmano","gard","rest","tasks"]);

// ===== حالات الأيام: لا نعدّ الماضي منفذًا إلا إذا كان معتمدًا =====
const days=mk(
  day("2026-10-10",{status:"final",parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c","d"]}),   // ماضٍ + final = منفذ
  day("2026-10-11",{status:"draft",parmanoPersonId:"c"}),                                           // ماضٍ + مسودة = غير محسوم
  /* 12 اليوم: بلا وثيقة */
  day("2026-10-13",{status:"final",parmanoPersonId:"a"}),                                           // مستقبلي معتمد مسبقًا = قادم (لا منفذ)
  day("2026-10-14",{status:"draft"}),                                                               // مستقبلي مسودة
  /* 15: بلا وثيقة مستقبلي */
);
r=rep({days});
const k=Object.fromEntries(r.rows.map(x=>[x.date,x.status]));
assert.equal(k["2026-10-10"].kind,"done"); assert.equal(k["2026-10-10"].label,"منفذ");
assert.equal(k["2026-10-11"].kind,"pending"); assert.equal(k["2026-10-11"].label,"مسودة غير محسومة");
assert.equal(k["2026-10-12"].kind,"today"); assert.equal(k["2026-10-12"].sub,"غير مُعدّ");
assert.equal(k["2026-10-13"].kind,"upcoming"); assert.equal(k["2026-10-13"].sub,"معتمد");
assert.equal(k["2026-10-14"].kind,"upcoming"); assert.equal(k["2026-10-14"].sub,"مسودة");
assert.equal(k["2026-10-15"].kind,"upcoming"); assert.equal(k["2026-10-15"].sub,"غير مُعدّ");
assert.ok(!Object.values(k).some(s=>s.kind==="upcoming"&&s.label==="منفذ"),"لا يوصف أي يوم قادم بأنه منفذ");
assert.deepEqual(r.counts,{done:1,upcoming:3,today:1,pending:1,missing:0});
// يوم ماضٍ بلا وثيقة = غير مُعدّ ؛ حالة غير معروفة تُعامل كمسودة
assert.equal(R.dayStatus("2026-10-01",null,TODAY).kind,"missing");
assert.equal(R.dayStatus("2026-10-01",{status:"weird"},TODAY).kind,"pending");
assert.equal(R.dayStatus("2026-10-12",day("2026-10-12",{status:"final"}),TODAY).sub,"معتمد");
// الماضي وحده ليس دليل تنفيذ: مسودة قديمة جدًا
assert.equal(R.dayStatus("2020-01-01",day("2020-01-01"),TODAY).kind,"pending");

// ===== الأعمدة والأسماء =====
const c10=r.rows[0].cells;
assert.deepEqual(c10.parmano.map(e=>e.name),["أحمد"]); assert.deepEqual(c10.gard.map(e=>e.name),["بلال"]);
assert.deepEqual(c10.rest.map(e=>e.name),["جمال","داود"]); assert.deepEqual(c10.tasks,[]);
// يوم 11: خفير جمال؛ البديل المشتق من اليوم السابق (أحمد خفير أمس، بلال حارس أمس) يظهر بنوعه فقط
const c11=r.rows[1].cells;
assert.deepEqual(c11.parmano.map(e=>e.name+(e.note?":"+e.note:"")),["جمال","أحمد:بديل"]);
assert.deepEqual(c11.gard.map(e=>e.name+(e.note?":"+e.note:"")),["بلال:بديل"]);   // الحراسة: البديل فقط (لا حارس رئيسي)
assert.equal(c11.rest.length,0);
// لا خلط: اسم الخفير لا يظهر في عمود الحراسة وبالعكس
assert.ok(!c11.gard.some(e=>e.name==="جمال")); assert.ok(!c10.parmano.some(e=>e.name==="بلال"));
// السائق يحمل علامته، والغير نشط يُعلَّم، وفرد غير موجود يحتفظ بوصف صريح
let r2=rep({days:mk(day("2026-10-10",{parmanoPersonId:"fq",gardPersonId:"old",restPersonIds:["ghost"]}))});
assert.equal(r2.rows[0].cells.parmano[0].driver,true); assert.equal(r2.rows[0].cells.gard[0].inactive,true);
assert.deepEqual([r2.rows[0].cells.rest[0].name,r2.rows[0].cells.rest[0].unknown],["فرد غير موجود",true]);
// أعداد كبيرة: كل الأسماء تبقى (لا اختصار ولا قصّ)
const many=people.concat(Array.from({length:30},(_,i)=>P("x"+i,"فرد"+i)));
const big=R.buildReport({people:many,assignments:[],days:mk(day("2026-10-10",{restPersonIds:many.map(p=>p.id)})),from:"2026-10-10",to:"2026-10-10",today:TODAY});
assert.equal(big.rows[0].cells.rest.length,36);
// تكرار الفرد في الراحة يُعرض مرة واحدة
assert.equal(rep({days:mk(day("2026-10-10",{restPersonIds:["a","a","b"]}))}).rows[0].cells.rest.length,2);

// ===== المهام: يدوية + تكليفات مسجلة =====
r=rep({days:mk(day("2026-10-11",{otherTasks:[{personId:"d",task:"حراسة المخزن"},{personId:"a",task:""}]})),
  assignments:[A(1,"b","إجازة","2026-10-10","2026-10-12"),A(2,"c","يوم دراسي","2026-10-11","2026-10-11"),{id:3,personId:"a",type:"مهمة أخرى",startDate:"2026-10-14",endDate:null}]});
const t11=r.rows[1].cells.tasks.map(e=>`${e.name}|${e.detail}|${e.span||""}|${e.kind}`);
assert.deepEqual(t11,["داود|حراسة المخزن||task","أحمد|مهمة||task","بلال|إجازة|من 10/10/2026 إلى 12/10/2026|assignment","جمال|يوم دراسي||assignment"]);
assert.deepEqual(r.rows[0].cells.tasks.map(e=>e.detail+"/"+e.span),["إجازة/من 10/10/2026 إلى 12/10/2026"]);       // تكليف في يوم بلا وثيقة يظهر
assert.equal(r.rows[3].cells.tasks.length,0);
assert.deepEqual(r.rows[4].cells.tasks.map(e=>e.detail+"/"+e.span),["مهمة أخرى/من 14/10/2026 — بلا تاريخ نهاية"]);   // مستمرة بدءًا من 14
assert.deepEqual(r.rows[5].cells.tasks.map(e=>e.detail+"/"+e.span),["مهمة أخرى/من 14/10/2026 — بلا تاريخ نهاية"]);
assert.ok(!JSON.stringify(r).includes("9999"));

// ===== البحث =====
const sd=mk(day("2026-10-10",{parmanoPersonId:"a",gardPersonId:"b",restPersonIds:["c"]}),day("2026-10-11",{parmanoPersonId:"d",gardPersonId:"a"}),day("2026-10-12",{restPersonIds:["b"]}));
r=rep({days:sd,search:"أحمد"});
// أحمد: خفير يوم 10، حارس يوم 11 (وبديل الخفير فيه)، ثم بديل الحارس يوم 12 (اليوم الثاني من خدمته)
assert.deepEqual(r.rows.map(x=>x.date),["2026-10-10","2026-10-11","2026-10-12"]); assert.equal(r.shown,3); assert.equal(r.daysCount,6); assert.equal(r.filtered,true);
assert.deepEqual(r.rows[2].cells.gard.map(e=>e.name+":"+e.note+":"+e.hit),["أحمد:بديل:true"]);
assert.deepEqual(r.rows[0].cells.parmano.map(e=>e.hit),[true]); assert.deepEqual(r.rows[0].cells.gard.map(e=>e.hit),[false]);   // المطابق فقط معلَّم
assert.equal(r.rows[0].cells.gard[0].name,"بلال");                                     // بقية أسماء اليوم تبقى ظاهرة
assert.deepEqual(rep({days:sd,search:"احمد"}).rows.map(x=>x.date),["2026-10-10","2026-10-11","2026-10-12"]);   // بلا همزة
assert.deepEqual(rep({days:sd,search:"  جمال "}).rows.map(x=>x.date),["2026-10-10"]);
assert.equal(rep({days:sd,search:"غير موجود البتة"}).shown,0);
assert.equal(R.normalizeName("أَحْمَد"),R.normalizeName("احمد")); assert.equal(R.normalizeName("ـبـلالـ"),"بلال");
// تصفية النوع: أعمدة الخدمة المحددة فقط، وكل الأيام تبقى
r=rep({days:sd,type:"parmano"}); assert.deepEqual(r.columns,["parmano"]); assert.equal(r.shown,6); assert.equal(r.filtered,true);
r=rep({days:sd,type:"gard",search:"أحمد"}); assert.deepEqual(r.rows.map(x=>x.date),["2026-10-11","2026-10-12"]); assert.deepEqual(r.columns,["gard"]);   // يوم 10 أحمد خفير لا حارس فلا يظهر
assert.equal(rep({days:sd,type:"rest",search:"أحمد"}).shown,0);
assert.deepEqual(rep({days:sd,type:"rest",search:"بلال"}).rows.map(x=>x.date),["2026-10-12"]);    // بلال في الراحة يوم 12 فقط ضمن عمود الراحة
assert.equal(rep({days:sd,type:"unknown-type"}).columns.length,4);                              // نوع غير معروف = الكل
// إعادة العرض الكامل
r=rep({days:sd,type:"all",search:""}); assert.equal(r.shown,6); assert.equal(r.filtered,false); assert.equal(R.filterNote(r),"");
assert.equal(R.filterNote(rep({days:sd,type:"parmano",search:"أحمد"})),"تصفية مطبّقة — نوع الخدمة: الخفارة، بحث عن: «أحمد»");
// نص التعداد (سطر واحد، لا بطاقات)
r=rep({days});
assert.equal(R.countsText(r),"6 أيام — 1 منفذ، 1 اليوم الحالي، 3 قادم، 1 مسودة غير محسومة");
assert.match(R.countsText(rep({days:sd,search:"أحمد"})),/^المعروض 3 من 6 أيام/);
// القراءة فقط: لا تعديل للمدخلات
{ const d2=mk(day("2026-10-10",{status:"final",parmanoPersonId:"a",restPersonIds:["b","b"]}),day("2026-10-11",{parmanoSubstituteId:null}));
  const asg=[A(1,"a","إجازة","2026-10-10","2026-10-11")]; const sn=[JSON.stringify(d2),JSON.stringify(people),JSON.stringify(asg)];
  R.buildReport({people,assignments:asg,days:d2,from:"2026-10-09",to:"2026-10-20",today:TODAY,search:"أحمد"});
  assert.deepEqual([JSON.stringify(d2),JSON.stringify(people),JSON.stringify(asg)],sn); }
// بديل مُلغى صراحةً (null) لا يظهر
assert.equal(rep({days:mk(day("2026-10-10",{parmanoPersonId:"a"}),day("2026-10-11",{parmanoSubstituteId:null}))}).rows[1].cells.parmano.length,0);
// فترة سنة كاملة تُبنى
const yr=R.buildReport({people,assignments:[],days:{},from:"2026-01-01",to:"2026-12-31",today:TODAY}); assert.equal(yr.rows.length,365); assert.equal(yr.counts.done+yr.counts.pending,0);
assert.deepEqual(yr.counts,{done:0,upcoming:80,today:1,pending:0,missing:284});   // 12/10 هو اليوم 285 من 365
console.log("كشف الخدمات اليومية: كل الاختبارات نجحت");
