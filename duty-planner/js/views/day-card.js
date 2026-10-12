// عرض بطاقة الخدمة اليومية (HTML فقط، بلا منطق حفظ) — مصمَّمة لتشبه ورقة برنامج الخدمات
// ولتكون قابلة للطباعة لاحقًا (العناصر التفاعلية تحمل الصنف no-print).
import { escapeHtml, personLabel } from "../ui.js";
import { formatLong, formatDisplay, isFriday } from "../dates.js";
import { assignmentsOnDate, endLabel } from "../assignments-logic.js";
import { availablePeople } from "../services-logic.js";
import { ICON, TAGS } from "../day-check.js";

// نص حالة فرد في قائمة (للقوائم الرئيسية وحوارات الاختيار)
export function statusText(entry) {
  const reasons = entry.reasons.map(escapeHtml).join(" + ");
  if (entry.state === "free") return "🟢 متاح";
  if (entry.state === "busy") return `⚠️ ${reasons}`;
  return `▫️ ${reasons} — ${entry.returnDate ? `يعود ${formatDisplay(entry.returnDate)}` : "نهاية غير محددة"}`;
}

export function renderEmptyDay(date) {
  return `
    <section class="sheet empty">
      <div class="empty-icon" aria-hidden="true">🗓️</div>
      <h2>لم يُعدّ هذا اليوم بعد</h2>
      <p>${escapeHtml(formatLong(date))}</p>
      <p><button class="btn btn-primary" type="button" data-action="create-day">ابدأ إعداد هذا اليوم (مسودة)</button></p>
      <p class="muted small">لا تُنشأ الأيام تلقائيًا؛ اليوم يبدأ حين تبدأ أنت بإعداده.</p>
    </section>`;
}

export function renderDayCard({ date, eff, people, assignments, days, check = null }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const nameOf = (id) => (byId.get(id) ? personLabel(byId.get(id)) : '<span class="muted">فرد غير موجود</span>');
  const isFinal = eff.status === "final";

  const slot = (label, id, action, derived = false) => `
    <div class="slot">
      <span class="slot-label">${label}:</span>
      <span class="slot-value ${id ? "" : "slot-empty"}">${id ? nameOf(id) : ""}</span>
      <button class="btn btn-small no-print" type="button" data-action="${action}">${id ? "تغيير" : "اختيار"}</button>
      ${derived ? '<span class="slot-note no-print">تلقائي من اليوم السابق</span>' : ""}
    </div>`;

  // الراحة
  const friday = isFriday(date);
  const restNames = eff.restPersonIds.map(nameOf).join(" + ");
  const rest = `
    <div class="slot slot-wide">
      <span class="slot-label">الراحة:</span>
      <span class="slot-value ${restNames ? "" : "slot-empty"}">${restNames}</span>
      <button class="btn btn-small no-print" type="button" data-action="pick-rest">${restNames ? "تعديل" : "اختيار"}</button>
      ${
        friday
          ? `<span class="slot-note">${restNames ? "استثناء: راحة يوم الجمعة مخالفة للقاعدة المعتادة" : "لا توجد راحة يوم الجمعة عادةً (يمكن منحها استثناءً بتأكيدك)"}</span>`
          : ""
      }
    </div>`;

  // الأفراد المتاحون
  const avail = availablePeople({ date, people, assignments, days });
  const count = (s) => avail.filter((e) => e.state === s).length;
  const availHtml = avail.length
    ? avail
        .map(
          (e) => `<li class="avail-item avail-${e.state}"><span class="avail-name">${personLabel(e.person)}</span><span class="avail-status">${statusText(e)}</span></li>`
        )
        .join("")
    : '<li class="muted pad">لا يوجد أفراد نشطون.</li>';

  // المهام والتعيينات: التعيينات تلقائيًا حسب التاريخ + المهام اليدوية لليوم
  const rows = [
    ...assignmentsOnDate(assignments, date).map((a) => ({
      who: nameOf(a.personId), task: escapeHtml(a.type), from: a.startDate, toLabel: endLabel(a), manual: false,
    })),
    ...eff.otherTasks.map((t, i) => ({
      who: nameOf(t.personId), task: escapeHtml(t.task || "مهمة"), from: date, toLabel: formatDisplay(date), manual: true, index: i,
    })),
  ];
  const tasksHtml = rows.length
    ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>الفرد</th><th>المهمة</th><th>من تاريخ</th><th>إلى تاريخ</th><th class="no-print"></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td data-label="الفرد">${r.who}</td><td data-label="المهمة">${r.task}</td>
              <td data-label="من تاريخ">${formatDisplay(r.from)}</td><td data-label="إلى تاريخ">${r.toLabel}</td>
              <td class="td-actions no-print">${
                r.manual
                  ? `<button class="btn btn-small" type="button" data-action="edit-task" data-index="${r.index}">تعديل</button>
                     <button class="btn btn-small btn-danger" type="button" data-action="del-task" data-index="${r.index}">حذف</button>`
                  : '<span class="muted small">من صفحة التعيينات</span>'
              }</td></tr>`
          )
          .join("")}</tbody></table></div>`
    : '<p class="muted pad">لا توجد مهام أو تعيينات في هذا اليوم.</p>';

  return `
    <article class="sheet day-card">
      <header class="day-head">
        <h2 class="day-title">خدمة ${escapeHtml(formatLong(date))}</h2>
        <span class="badge ${isFinal ? "badge-ok" : "badge-warn"}">${isFinal ? "معتمد" : "مسودة"}</span>
        <button class="btn btn-check no-print" type="button" data-action="check-day">🔎 فحص اليوم</button>
        <button class="btn no-print" type="button" data-action="print-day">🖨️ طباعة بطاقة اليوم</button>
      </header>
      ${check ? renderCheckPanel(check) : ""}

      <div class="roles">
        ${slot("الخفير", eff.parmanoPersonId, "pick-parmano")}
        ${slot("الحارس", eff.gardPersonId, "pick-gard")}
        ${slot("البديل", eff.parmanoSubstituteId, "pick-parmano-sub", eff.parmanoSubstituteDerived)}
        ${slot("بديل الحارس", eff.gardSubstituteId, "pick-gard-sub", eff.gardSubstituteDerived)}
      </div>
      ${rest}

      <div class="divider"><span>الأفراد المتاحون</span></div>
      <p class="avail-summary muted small"><span>🟢 ${count("free")} متاح</span><span>⚠️ ${count("busy")} لديهم تعيين أو دور</span><span>▫️ ${count("long")} مهمة طويلة</span></p>
      <ul class="avail">${availHtml}</ul>

      <section class="day-tasks">
        <header class="sheet-head">
          <h3>المهام والتعيينات</h3>
          <button class="btn btn-small no-print" type="button" data-action="add-task">+ إضافة مهمة</button>
        </header>
        ${tasksHtml}
      </section>

      <footer class="day-actions no-print">
        <button class="btn ${isFinal ? "" : "btn-primary"}" type="button" data-action="toggle-status">${isFinal ? "إعادة إلى مسودة" : "اعتماد اليوم"}</button>
        ${isFinal ? "" : '<button class="btn btn-danger" type="button" data-action="delete-day">حذف المسودة</button>'}
      </footer>
    </article>`;
}

// نتيجة 🔎 فحص اليوم: نتيجة عامة ثم سطر لكل بند، وتحت كل بند الملاحظات التفصيلية (للقراءة فقط).
export function renderCheckPanel(r) {
  const sectionHtml = r.sections
    .map((s) => {
      let line;
      if (s.key === "drivers") {
        line = `${ICON[s.level]} ${escapeHtml(s.level === "ok" ? s.okText : s.items[0].text)}`;
      } else if (s.level === "ok") {
        line = `${ICON.ok} ${escapeHtml(s.title)}: ${escapeHtml(s.okText)}`;
      } else {
        line = `${ICON[s.level]} ${escapeHtml(s.title)}`;
      }
      // السائقون: البند الأول (إن كان 🔴) هو العنوان نفسه فلا يُكرَّر؛ أي بنود أخرى (مثل «تعذّر التحقق») تُعرض تحته
      const items = s.key === "drivers" ? s.items.slice(s.level === "ok" ? 0 : 1) : s.items;
      const sub = items.length
        ? `<ul class="dc-items">${items.map((i) => `<li class="dc-item dc-${i.level}">${ICON[i.level]} ${i.kind ? `<span class="dc-tag dc-tag-${i.kind}">${TAGS[i.kind]}</span> ` : ""}${escapeHtml(i.text)}</li>`).join("")}</ul>`
        : "";
      const drivers = s.key === "drivers"
        ? `<ul class="dc-items dc-drivers">${s.drivers
            .map((d) => `<li class="dc-item">${personLabel(d.person)} — ${d.available ? "🟢 متاح" : `⚠️ ${d.reasons.map(escapeHtml).join(" + ")}`}</li>`)
            .join("")}</ul>`
        : "";
      return `<li class="dc-sec dc-${s.level}"><div class="dc-line">${line}</div>${sub}${drivers}</li>`;
    })
    .join("");
  return `
    <section class="dc-panel dc-${r.level} no-print" id="dc-panel" aria-label="نتيجة فحص اليوم">
      <header class="dc-head">
        <strong class="dc-verdict">${escapeHtml(r.verdict)}</strong>
        <button class="btn btn-small" type="button" data-action="close-check">إخفاء</button>
      </header>
      <ul class="dc-list">${sectionHtml}</ul>
      <p class="dc-note muted small">الفحص تنبيهي فقط: لا يمنع الحفظ ولا يغيّر أي بيانات، والقرار لك.</p>
    </section>`;
}
