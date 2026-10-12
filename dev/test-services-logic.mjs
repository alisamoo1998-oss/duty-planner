import assert from "node:assert/strict";
import * as S from "../js/services-logic.js";
const P=(id,name,isActive=true,isDriver=false)=>({id,name,isActive,isDriver});
const people=[P("a","أحمد"),P("b","بلال"),P("c","جمال"),P("d","داود"),P("e","هشام",false),P("f","وليد")];
const day=(date,o={})=>({date,status:"final",parmanoPersonId:null,gardPersonId:null,restPersonIds:[],otherTasks:[],...o});
const A=(id,personId,type,s,e)=>({id,personId,type,startDate:s,endDate:e});

// بنية اليوم الجديد: بلا مفاتيح للبديلين
const nd=S.newDayDoc("2026-10-11");
assert.equal(nd.status,"draft"); assert.ok(!("parmanoSubstituteId" in nd)); assert.deepEqual(nd.restPersonIds,[]);
assert.deepEqual(S.dateRange("2026-10-30",3),["2026-10-30","2026-10-31","2026-11-01"]);

// البديل المشتق من اليوم السابق
let days={ "2026-10-10":day("2026-10-10",{parmanoPersonId:"a",gardPersonId:"b"}), "2026-10-11":S.newDayDoc("2026-10-11") };
let eff=S.effectiveDay("2026-10-11",days);
assert.equal(eff.parmanoSubstituteId,"a"); assert.equal(eff.gardSubstituteId,"b");
assert.equal(eff.parmanoSubstituteDerived,true);
assert.deepEqual(S.substitutesToPersist(eff),{parmanoSubstituteId:"a",gardSubstituteId:"b"});
assert.equal(S.effectiveDay("2026-10-12",days),null);               // لا وثيقة = لا يوم
// اختيار صريح يغلب المشتق، و null = بلا بديل
days["2026-10-11"].parmanoSubstituteId="c"; days["2026-10-11"].gardSubstituteId=null;
eff=S.effectiveDay("2026-10-11",days);
assert.equal(eff.parmanoSubstituteId,"c"); assert.equal(eff.gardSubstituteId,null);
assert.deepEqual(S.substitutesToPersist(eff),{});
// اليوم الثالث: عاد أحمد متاحًا (12/10 = متاح)
days["2026-10-12"]=S.newDayDoc("2026-10-12");
assert.equal(S.effectiveDay("2026-10-12",days).parmanoSubstituteId,null);

// ترتيب الخفير: لا سجل أولًا ثم الأقدم، مع المهام الطويلة في الأسفل، واستبعاد البديل وغير النشط
days={
  "2026-09-20":day("2026-09-20",{parmanoPersonId:"a"}),
  "2026-10-01":day("2026-10-01",{parmanoPersonId:"b",status:"draft"}),
  "2026-10-10":day("2026-10-10",{parmanoPersonId:"c"}),
  "2026-10-11":S.newDayDoc("2026-10-11"),
};
let asg=[A(1,"d","مهمة طويلة","2026-10-08","2026-10-15"),A(2,"f","يوم دراسي","2026-10-11","2026-10-11")];
let list=S.candidateList({kind:"parmano",date:"2026-10-11",people,assignments:asg,days});
const ids=list.map(x=>x.person.id);
assert.ok(!ids.includes("c"),"خفير الأمس = بديل اليوم: مستبعد");
assert.ok(!ids.includes("e"),"غير النشط مستبعد");
assert.deepEqual(ids,["f","a","b","d"]);                           // f بلا سجل (⚠️) ثم a(21 يومًا) ثم b(10) ثم d طويل
assert.equal(list[1].metrics.since,21); assert.equal(list[2].metrics.since,10); assert.equal(list[2].metrics.last.isDraft,true);
assert.equal(list[0].state,"busy"); assert.deepEqual(list[0].reasons,["يوم دراسي"]);
assert.equal(list[3].state,"long"); assert.equal(list[3].returnDate,"2026-10-16");
// من يظهر مع ⚠️ لأن له دورًا آخر في اليوم
days["2026-10-11"].gardPersonId="a";
list=S.candidateList({kind:"parmano",date:"2026-10-11",people,assignments:asg,days});
const a=list.find(x=>x.person.id==="a"); assert.equal(a.state,"busy"); assert.deepEqual(a.reasons,["الحارس"]);
// ولا يُحسب دوره الحالي كتعارض في قائمته
days["2026-10-11"].parmanoPersonId="b";
list=S.candidateList({kind:"parmano",date:"2026-10-11",people,assignments:asg,days});
assert.equal(list.find(x=>x.person.id==="b").state,"free");
// keepIds يُبقي الاختيار الحالي حتى لو بديل
list=S.candidateList({kind:"parmano",date:"2026-10-11",people,assignments:asg,days,keepIds:["c"]});
assert.ok(list.some(x=>x.person.id==="c"));

// الراحة
days={
  "2026-10-05":day("2026-10-05",{restPersonIds:["a"]}),
  "2026-10-09":day("2026-10-09",{restPersonIds:["b"]}),
  "2026-10-13":S.newDayDoc("2026-10-13"),
};
asg=[A(1,"c","إجازة","2026-10-01","2026-10-10")];
const rm=(id)=>S.restMetrics(id,"2026-10-13",days,asg);
assert.deepEqual([rm("a").since,rm("a").streak],[8,7]);            // راحة 5/10 → عمل 6..12 = 7 أيام
assert.deepEqual([rm("b").since,rm("b").streak],[4,3]);
assert.equal(rm("c").since,null); assert.equal(rm("c").streak,2);   // عاد 11/10: عمل 11،12
assert.equal(rm("d").streak,null);
list=S.candidateList({kind:"rest",date:"2026-10-13",people,assignments:[],days});
assert.deepEqual(list.map(x=>x.person.id),["c","d","f","a","b"]);   // بلا سجل أولًا (بالاسم) ثم الأطول عملًا
list=S.candidateList({kind:"rest",date:"2026-10-13",people,assignments:asg,days});
assert.deepEqual(list.map(x=>x.person.id),["d","f","a","b","c"]);   // c عاد حديثًا فأقل ضغطًا
// الإجازة تُوقف أيام العمل والراحة قبلها لا تُحسب
days["2026-10-13"].restPersonIds=["f"];
assert.equal(S.restAllowed("2026-10-09"),false); assert.equal(S.restAllowed("2026-10-11"),true); // الجمعة
// الأفراد المتاحون: متاح ثم ⚠️ ثم طويل، والبديل غائب
days={ "2026-10-10":day("2026-10-10",{parmanoPersonId:"a"}), "2026-10-11":{...S.newDayDoc("2026-10-11"),restPersonIds:["b"],otherTasks:[{personId:"c",task:"حراسة المخزن"}]} };
asg=[A(1,"d","مهمة طويلة","2026-10-10","2026-10-12")];
const av=S.availablePeople({date:"2026-10-11",people,assignments:asg,days});
assert.deepEqual(av.map(x=>x.person.id+":"+x.state),["f:free","b:busy","c:busy","d:long"]);
assert.deepEqual(av.find(x=>x.person.id==="c").reasons,["مهمة: حراسة المخزن"]);
assert.ok(!av.some(x=>x.person.id==="a"||x.person.id==="e"));
// ما ينقص
assert.deepEqual(S.missingParts(S.effectiveDay("2026-10-11",days)),["الخفير","الحارس"]);
console.log("منطق الخدمات اليومية: كل الاختبارات نجحت");
