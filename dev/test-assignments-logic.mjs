import assert from "node:assert/strict";
import * as L from "../js/assignments-logic.js";
const A=(id,personId,type,s,e)=>({id,personId,type,startDate:s,endDate:e});
const P=(id,name,isActive=true)=>({id,name,isActive});

// الأنواع
assert.equal(L.ASSIGNMENT_TYPES.length,12);
assert.deepEqual(L.ASSIGNMENT_TYPES.map(t=>t.id).slice(0,3),["مريض","عطلة","إجازة"]);
// طويل / يوم واحد
assert.equal(L.isLongAssignment(A(1,"a","يوم دراسي","2026-10-11","2026-10-11")),false);
assert.equal(L.isLongAssignment(A(1,"a","مهمة أخرى","2026-10-11","2026-10-13")),true);
assert.equal(L.isLongAssignment(A(1,"a","مهمة طويلة","2026-10-11","2026-10-11")),true);
assert.equal(L.isLongAssignment({type:"تأخر",startDate:"2026-10-11"}),true);  // بلا endDate = مستمرة (تغيّر عمدًا: لم تعد تُعدّ يومًا واحدًا)
// المدة والمراحل
assert.equal(L.durationDays(A(1,"a","إجازة","2026-10-11","2026-10-13")),3);
assert.equal(L.phaseOf(A(1,"a","إجازة","2026-10-11","2026-10-13"),"2026-10-14"),"ended");
assert.equal(L.phaseOf(A(1,"a","إجازة","2026-10-11","2026-10-13"),"2026-10-13"),"ongoing");
assert.equal(L.phaseOf(A(1,"a","إجازة","2026-10-11","2026-10-13"),"2026-10-10"),"upcoming");
assert.equal(L.daysText(1),"يوم واحد"); assert.equal(L.daysText(2),"يومان"); assert.equal(L.daysText(5),"5 أيام"); assert.equal(L.daysText(12),"12 يومًا");
// التحقق
assert.deepEqual(L.validateAssignment(A(1,"a","إجازة","2026-10-11","2026-10-13")),[]);
assert.ok(L.validateAssignment(A(1,"","إجازة","2026-10-11","2026-10-13")).includes("اختر الفرد."));
assert.ok(L.validateAssignment(A(1,"a","xx","2026-10-11","2026-10-13")).includes("اختر نوع التعيين."));
assert.ok(L.validateAssignment(A(1,"a","إجازة","2026-10-13","2026-10-11")).includes("تاريخ النهاية قبل تاريخ البداية."));
assert.ok(L.validateAssignment(A(1,"a","إجازة","","2026-10-11")).includes("تاريخ البداية غير صحيحة.".replace("صحيحة","صحيح")));
assert.ok(L.validateAssignment(A(1,"a","إجازة","2026-02-30","2026-03-01")).length>0);
// التداخل
const all=[A("x","a","مريض","2026-10-10","2026-10-12"),A("y","b","مريض","2026-10-10","2026-10-12")];
assert.equal(L.findOverlaps(all,A(null,"a","عطلة","2026-10-12","2026-10-14")).length,1);
assert.equal(L.findOverlaps(all,A(null,"a","عطلة","2026-10-13","2026-10-14")).length,0);
assert.equal(L.findOverlaps(all,A("x","a","عطلة","2026-10-11","2026-10-11"),"x").length,0);
// حالة الفرد
const ppl=[P("a","أحمد"),P("b","بلال"),P("c","جمال"),P("d","داود",false)];
const asg=[
  A(1,"a","يوم دراسي","2026-10-11","2026-10-11"),
  A(2,"b","إجازة","2026-10-11","2026-10-13"),
  A(3,"b","نقاهة","2026-10-14","2026-10-15"),   // متصلة بالإجازة
  A(4,"d","مهمة أخرى","2026-10-11","2026-10-11"),
];
const st=(id,d)=>L.personDayStatus(ppl.find(p=>p.id===id),d,asg);
assert.equal(st("a","2026-10-11").state,"day");
assert.equal(st("a","2026-10-12").state,"free");   // عودة تلقائية بعد يوم واحد
assert.equal(st("a","2026-10-10").state,"free");   // قبل البدء
assert.equal(st("b","2026-10-12").state,"long");
assert.equal(st("b","2026-10-12").returnDate,"2026-10-16"); // تمتد عبر التعيين المتصل
assert.equal(st("b","2026-10-16").state,"free");   // عاد تلقائيًا
assert.equal(st("c","2026-10-11").state,"free");
assert.equal(st("d","2026-10-11").state,"inactive");
// القائمة: المتاحون ثم ⚠️ ثم الطويل أسفلًا، وغير النشط غائب
const day=L.buildDayList(ppl,"2026-10-11",asg).map(x=>x.person.name+":"+x.status.state);
assert.deepEqual(day,["جمال:free","أحمد:day","بلال:long"]);
const day2=L.buildDayList(ppl,"2026-10-16",asg).map(x=>x.status.state);
assert.deepEqual(day2,["free","free","free"]);
// وصف الأثر
assert.match(L.describeEffect({type:"يوم دراسي",startDate:"2026-10-11",endDate:"2026-10-11"}),/ليوم واحد/);
assert.match(L.describeEffect({type:"إجازة",startDate:"2026-10-11",endDate:"2026-10-13"}),/13\/10\/2026.*14\/10\/2026/);
assert.equal(L.describeEffect({type:"إجازة",startDate:"",endDate:""}),"");

// ===== مهام بلا تاريخ نهاية (مستمرة) =====
const O=(id,personId,type,s)=>({id,personId,type,startDate:s,endDate:null});
assert.equal(L.isOpenEnded(O(1,"a","مهمة أخرى","2026-10-11")),true);
assert.equal(L.isOpenEnded({startDate:"2026-10-11"}),true); assert.equal(L.isOpenEnded({startDate:"2026-10-11",endDate:""}),true);
assert.equal(L.isOpenEnded(A(1,"a","إجازة","2026-10-11","2026-10-11")),false);
assert.equal(L.endLabel(O(1,"a","تعيين","2026-10-11")),"غير محددة"); assert.equal(L.endLabel(A(1,"a","تعيين","2026-10-11","2026-10-13")),"13/10/2026");
assert.equal(L.durationDays(O(1,"a","تعيين","2026-10-11")),null);
assert.equal(L.isLongAssignment(O(1,"a","تأخر","2026-10-11")),true);
// التحقق: النهاية اختيارية والبداية إلزامية
assert.deepEqual(L.validateAssignment({personId:"a",type:"مهمة أخرى",startDate:"2026-10-11",endDate:null,notes:""}),[]);
assert.deepEqual(L.validateAssignment({personId:"a",type:"مهمة أخرى",startDate:"2026-10-11",endDate:"",notes:""}),[]);
assert.ok(L.validateAssignment({personId:"a",type:"مهمة أخرى",startDate:"",endDate:null}).includes("تاريخ البداية غير صحيح."));
assert.ok(L.validateAssignment({personId:"a",type:"مهمة أخرى",startDate:"2026-10-11",endDate:"2026-02-30"}).includes("تاريخ النهاية غير صحيح."));
assert.ok(L.validateAssignment({personId:"a",type:"مهمة أخرى",startDate:"2026-10-11",endDate:"2026-10-10"}).includes("تاريخ النهاية قبل تاريخ البداية."));
// لا تنتهي تلقائيًا أبدًا
assert.equal(L.phaseOf(O(1,"a","تعيين","2026-10-01"),"2030-01-01"),"ongoing");
assert.equal(L.phaseOf(O(1,"a","تعيين","2026-10-20"),"2026-10-11"),"upcoming");
assert.equal(L.coversDate(O(1,"a","تعيين","2026-10-01"),"2040-05-05"),true);
assert.equal(L.coversDate(O(1,"a","تعيين","2026-10-01"),"2026-09-30"),false);
// حالة الفرد: مستمرة = طويلة بلا تاريخ عودة، وتستمر لما بعد أي تاريخ لاحق
{ const pp=[P("a","أحمد"),P("b","بلال")]; const asg2=[O(1,"a","مهمة أخرى","2026-10-11")];
  const s1=L.personDayStatus(pp[0],"2026-10-11",asg2), s2=L.personDayStatus(pp[0],"2027-03-01",asg2);
  assert.equal(s1.state,"long"); assert.equal(s1.returnDate,null); assert.equal(s2.state,"long"); assert.equal(s2.returnDate,null);
  assert.equal(L.personDayStatus(pp[0],"2026-10-10",asg2).state,"free");            // قبل البداية
  assert.equal(L.personDayStatus(pp[1],"2026-10-12",asg2).state,"free");
  // سلسلة تنتهي بمستمرة: لا تاريخ عودة
  const chain=[A(1,"a","إجازة","2026-10-11","2026-10-13"),O(2,"a","مريض","2026-10-14")];
  assert.equal(L.personDayStatus(pp[0],"2026-10-12",chain).returnDate,null);
  // تعيين محدد بعد مستمرة سابقة لا يلغيها
  assert.equal(L.personDayStatus(pp[0],"2026-12-01",[O(1,"a","تعيين","2026-10-01"),A(2,"a","إجازة","2026-11-01","2026-11-05")]).returnDate,null);
  const list=L.buildDayList(pp,"2026-10-20",asg2); assert.deepEqual(list.map(x=>x.person.id+":"+x.status.state),["b:free","a:long"]); }
// التداخل مع مهمة مستمرة (متحفظ)
assert.equal(L.findOverlaps([O(1,"a","تعيين","2026-10-01")],A(null,"a","عطلة","2027-01-01","2027-01-02")).length,1);
assert.equal(L.findOverlaps([O(1,"a","تعيين","2026-10-10")],A(null,"a","عطلة","2026-10-01","2026-10-09")).length,0);   // تنتهي قبل بدايتها
assert.equal(L.findOverlaps([A(1,"a","عطلة","2026-10-01","2026-10-05")],O(null,"a","تعيين","2026-10-03")).length,1);
// شرح الأثر
assert.match(L.describeEffect({type:"تعيين",startDate:"2026-10-11",endDate:""}),/بلا تاريخ نهاية.*مستمرة.*لا تنتهي تلقائيًا/);
assert.match(L.describeEffect({type:"تعيين",startDate:"2026-10-11",endDate:""}),/يتعذّر التأكد/);
assert.equal(L.describeEffect({type:"تعيين",startDate:"",endDate:""}),"");

console.log("منطق التعيينات: كل الاختبارات نجحت");
