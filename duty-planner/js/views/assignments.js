// صفحة التعيينات: إضافة، تعديل، حذف + معاينة حالة الأفراد في يوم معيّن.
import { peopleApi, assignmentsApi } from "../db.js";
import {
  ASSIGNMENT_TYPES, isLongAssignment, phaseOf, durationDays, daysText, endOf, endLabel, isOpenEnded,
  validateAssignment, findOverlaps, describeEffect, buildDayList,
} from "../assignments-logic.js";
import { todayStr, addDays, formatDisplay, formatLong, isValidDateStr } from "../dates.js";
import { escapeHtml, personLabel, personText, byName, toast, describeError } from "../ui.js";
import { confirmDialog, formDialog, UserError } from "../dialog.js";

const PHASE_LABEL = { ongoing: "جارٍ", upcoming: "قادم", ended: "منتهٍ" };

export async function render(root) {
  const state = {
    people: [],
    assignments: [],
    filters: { person: "", type: "", scope: "current" },
    previewDate: todayStr(),
  };

  // الأحداث تُربط بعنصر داخلي جديد في كل عرض، لأن #view نفسه يُعاد استخدامه بين الصفحات
  const page = document.createElement("div");
  root.appendChild(page);
  page.innerHTML = `
    <section class="sheet">
      <header class="sheet-head">
        <div><h2>التعيينات</h2><p class="muted" id="as-summary"></p></div>
        <button class="btn btn-primary" id="add-assignment" type="button">+ إضافة تعيين</button>
      </header>
      <div class="filters">
        <label class="field field-inline"><span>الفرد</span><select id="f-person"></select></label>
        <label class="field field-inline"><span>النوع</span><select id="f-type"></select></label>
        <label class="field field-inline"><span>الفترة</span>
          <select id="f-scope">
            <option value="current">الجارية والقادمة</option>
            <option value="ended">المنتهية</option>
            <option value="all">الكل</option>
          </select></label>
      </div>
      <div id="as-list" class="tbl-wrap"><p class="muted pad">جارٍ التحميل…</p></div>
    </section>

    <section class="sheet">
      <header class="sheet-head">
        <div><h2>معاينة يوم</h2><p class="muted">كيف يظهر الأفراد في يوم معيّن بحسب التعيينات.</p></div>
        <div class="date-nav">
          <button class="btn btn-small" type="button" data-action="pv-prev">اليوم السابق</button>
          <input type="date" id="pv-date" dir="ltr" aria-label="تاريخ المعاينة">
          <button class="btn btn-small" type="button" data-action="pv-next">اليوم التالي</button>
          <button class="btn btn-small" type="button" data-action="pv-today">اليوم</button>
        </div>
      </header>
      <p class="pad pv-title" id="pv-title"></p>
      <ul class="preview-list" id="pv-list"></ul>
      <p class="muted small pad" id="pv-foot"></p>
    </section>`;

  const $ = (sel) => page.querySelector(sel);
  const personById = (id) => state.people.find((p) => p.id === id);

  // ---------- تحميل ----------
  async function load() {
    try {
      [state.people, state.assignments] = await Promise.all([peopleApi.list(), assignmentsApi.list()]);
    } catch (err) {
      $("#as-list").innerHTML = `<div class="notice notice-bad">تعذّر التحميل: ${escapeHtml(describeError(err))}</div>`;
      return;
    }
    fillFilters();
    drawList();
    drawPreview();
  }

  function fillFilters() {
    const f = state.filters;
    const people = [...state.people].sort(byName);
    $("#f-person").innerHTML =
      '<option value="">الكل</option>' +
      people
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(personText(p))}${p.isActive ? "" : " (غير نشط)"}</option>`)
        .join("");
    $("#f-type").innerHTML =
      '<option value="">الكل</option>' +
      ASSIGNMENT_TYPES.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.id)}</option>`).join("");
    $("#f-person").value = f.person;
    $("#f-type").value = f.type;
    $("#f-scope").value = f.scope;
  }

  // ---------- جدول التعيينات ----------
  function drawList() {
    const f = state.filters;
    const today = todayStr();
    const items = state.assignments
      .filter((a) => !f.person || a.personId === f.person)
      .filter((a) => !f.type || a.type === f.type)
      .filter((a) => {
        const ended = phaseOf(a, today) === "ended";
        return f.scope === "all" || (f.scope === "ended" ? ended : !ended);
      })
      .sort((a, b) =>
        f.scope === "current"
          ? a.startDate.localeCompare(b.startDate) || endOf(a).localeCompare(endOf(b))
          : b.startDate.localeCompare(a.startDate)
      );

    const ongoing = state.assignments.filter((a) => phaseOf(a, today) === "ongoing").length;
    $("#as-summary").textContent = `${state.assignments.length} تعيين محفوظ — ${ongoing} جارٍ اليوم`;

    if (!items.length) {
      $("#as-list").innerHTML = '<p class="muted pad">لا توجد تعيينات مطابقة.</p>';
      return;
    }

    const rows = items
      .map((a) => {
        const person = personById(a.personId);
        const phase = phaseOf(a, today);
        const long = isLongAssignment(a);
        return `
        <tr class="${phase === "ended" ? "row-ended" : ""}">
          <td data-label="الفرد">${person ? personLabel(person) : '<span class="muted">فرد غير موجود</span>'}${
            person && !person.isActive ? ' <span class="badge badge-off">غير نشط</span>' : ""
          }</td>
          <td data-label="التعيين"><span class="badge ${long ? "badge-long" : "badge-warn"}">${escapeHtml(a.type)}</span>${
            a.notes ? `<div class="muted small">${escapeHtml(a.notes)}</div>` : ""
          }</td>
          <td data-label="من تاريخ">${formatDisplay(a.startDate)}</td>
          <td data-label="إلى تاريخ">${isOpenEnded(a) ? '<span class="badge badge-long">غير محددة</span>' : formatDisplay(a.endDate)}</td>
          <td data-label="المدة">${isOpenEnded(a) ? "مستمرة" : daysText(durationDays(a))}</td>
          <td data-label="الحالة">${PHASE_LABEL[phase]}</td>
          <td class="td-actions">
            <button class="btn btn-small" type="button" data-action="edit" data-id="${escapeHtml(a.id)}">تعديل</button>
            <button class="btn btn-small btn-danger" type="button" data-action="delete" data-id="${escapeHtml(a.id)}">حذف</button>
          </td>
        </tr>`;
      })
      .join("");

    $("#as-list").innerHTML = `
      <table class="tbl">
        <thead><tr><th>الفرد</th><th>التعيين</th><th>من تاريخ</th><th>إلى تاريخ</th><th>المدة</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ---------- معاينة يوم ----------
  function statusHtml(st) {
    if (st.state === "free") return "🟢 متاح";
    if (st.state === "day") return `⚠️ ${st.assignments.map((a) => escapeHtml(a.type)).join(" + ")}`;
    return `▫️ ${st.long.map((a) => escapeHtml(a.type)).join(" + ")} — ${st.returnDate ? `يعود ${formatDisplay(st.returnDate)}` : "نهاية غير محددة"}`;
  }

  function drawPreview() {
    const date = state.previewDate;
    $("#pv-date").value = date;
    $("#pv-title").textContent = formatLong(date);
    const list = buildDayList(state.people, date, state.assignments);
    $("#pv-list").innerHTML = list.length
      ? list
          .map(
            ({ person, status }) => `
        <li class="pv pv-${status.state}">
          <span class="pv-name">${personLabel(person)}</span>
          <span class="pv-status">${statusHtml(status)}</span>
        </li>`
          )
          .join("")
      : '<li class="muted pad">لا يوجد أفراد نشطون.</li>';
    const inactive = state.people.filter((p) => !p.isActive).length;
    $("#pv-foot").textContent = inactive ? `لا يظهر هنا ${inactive} فرد غير نشط.` : "";
  }

  // ---------- نموذج الإضافة / التعديل ----------
  function formBody(a) {
    const people = state.people
      .filter((p) => p.isActive || p.id === a.personId)
      .sort(byName)
      .map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === a.personId ? "selected" : ""}>${escapeHtml(personText(p))}${p.isActive ? "" : " (غير نشط)"}</option>`)
      .join("");
    const known = ASSIGNMENT_TYPES.some((t) => t.id === a.type);
    const types = (a.type && !known ? [{ id: a.type }] : []).concat(ASSIGNMENT_TYPES);
    const typeOpts = types
      .map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === a.type ? "selected" : ""}>${escapeHtml(t.id)}</option>`)
      .join("");
    return `
      <label class="field"><span>الفرد</span>
        <select name="personId"><option value="">— اختر الفرد —</option>${people}</select></label>
      <label class="field"><span>نوع التعيين</span>
        <select name="type"><option value="">— اختر النوع —</option>${typeOpts}</select></label>
      <div class="field-row">
        <label class="field"><span>من تاريخ</span><input type="date" name="startDate" dir="ltr" value="${escapeHtml(a.startDate || "")}"></label>
        <label class="field"><span>إلى تاريخ (اختياري)</span><input type="date" name="endDate" dir="ltr" value="${escapeHtml(a.endDate || "")}"></label>
      </div>
      <label class="check-inline"><input type="checkbox" name="openEnd" ${a.openEnd ? "checked" : ""}>
        <span>لا أعرف موعد الانتهاء (مهمة مستمرة بلا تاريخ نهاية)</span></label>
      <p class="hint" data-hint></p>
      <label class="field"><span>ملاحظات</span>
        <textarea name="notes" rows="2" maxlength="500">${escapeHtml(a.notes || "")}</textarea></label>`;
  }

  function bindFormBehavior(form, existing) {
    const { startDate: start, endDate: end, type, openEnd } = form.elements;
    const hint = form.querySelector("[data-hint]");
    // ما دام المستخدم لم يغيّر تاريخ النهاية بنفسه، نجعله مساويًا لتاريخ البداية (تعيين ليوم واحد)
    let endTouched = !!existing && !!existing.endDate && existing.startDate !== existing.endDate;
    const refresh = () => {
      hint.textContent = describeEffect({ type: type.value, startDate: start.value, endDate: end.value });
    };
    start.addEventListener("input", () => {
      if (!openEnd.checked && (!endTouched || !end.value || end.value < start.value)) end.value = start.value;
      refresh();
    });
    end.addEventListener("input", () => {
      endTouched = true;
      openEnd.checked = !end.value; // فراغ التاريخ = بلا نهاية محددة
      refresh();
    });
    // «لا أعرف موعد الانتهاء»: يفرّغ تاريخ النهاية؛ وإلغاؤه يعيده مساويًا للبداية
    openEnd.addEventListener("change", () => {
      if (openEnd.checked) end.value = "";
      else {
        end.value = start.value;
        endTouched = false;
      }
      refresh();
    });
    type.addEventListener("change", refresh);
    refresh();
  }

  async function openForm(existing = null) {
    const base = existing
      ? { ...existing, endDate: existing.endDate || "", openEnd: isOpenEnded(existing) }
      : { personId: state.filters.person || "", type: "", startDate: "", endDate: "", notes: "", openEnd: false };
    const saved = await formDialog({
      title: existing ? "تعديل تعيين" : "إضافة تعيين",
      bodyHtml: formBody(base),
      onOpen: (form) => bindFormBehavior(form, existing),
      onSubmit: async (fd) => {
        const data = {
          personId: String(fd.get("personId") || ""),
          type: String(fd.get("type") || ""),
          startDate: String(fd.get("startDate") || ""),
          // تاريخ النهاية اختياري: الفراغ = null = مستمرة بلا نهاية محددة (لا يُملأ ببداية المهمة)
          endDate: fd.get("endDate") ? String(fd.get("endDate")) : null,
          notes: String(fd.get("notes") || "").trim(),
        };
        // نقبل نوعًا قديمًا غير معروف عند التعديل فقط
        const errors = validateAssignment(data).filter(
          (m) => !(existing && data.type === existing.type && m === "اختر نوع التعيين.")
        );
        if (errors.length) throw new UserError(errors.join(" "));

        const overlaps = findOverlaps(state.assignments, data, existing?.id);
        if (overlaps.length) {
          const o = overlaps[0];
          const who = personById(data.personId)?.name || "الفرد";
          const go = await confirmDialog(
            `لدى «${who}» تعيين متداخل مع هذه الفترة: ${o.type} (${formatDisplay(o.startDate)} – ${endLabel(o)}).${isOpenEnded(o) || isOpenEnded(data) ? " إحدى المهمتين بلا تاريخ نهاية، لذلك قد لا يكون التداخل فعليًا." : ""} هل تريد الحفظ رغم ذلك؟`,
            { title: "تعيين متداخل", confirmText: "حفظ رغم ذلك" }
          );
          if (!go) return false;
        }
        if (existing) await assignmentsApi.update(existing.id, data);
        else await assignmentsApi.add(data);
        return true;
      },
    });
    if (saved) {
      toast(existing ? "تم حفظ التعديل." : "تمت إضافة التعيين.", "ok");
      await load();
    }
  }

  async function remove(a) {
    const person = personById(a.personId);
    const ended = phaseOf(a, todayStr()) === "ended";
    const msg =
      `سيُحذف تعيين «${a.type}» لـ ${person ? person.name : "فرد غير موجود"} ` +
      `(${formatDisplay(a.startDate)} – ${endLabel(a)}) نهائيًا.` +
      (ended ? " هذا تعيين منتهٍ، وحذفه يزيله من السجل التاريخي." : "");
    if (!(await confirmDialog(msg, { title: "حذف تعيين", confirmText: "حذف", danger: true }))) return;
    try {
      await assignmentsApi.remove(a.id);
      toast("تم حذف التعيين.", "ok");
      await load();
    } catch (err) {
      toast(describeError(err), "bad");
    }
  }

  // ---------- الأحداث ----------
  const setPreview = (date) => {
    if (!isValidDateStr(date)) return;
    state.previewDate = date;
    drawPreview();
  };

  $("#add-assignment").addEventListener("click", () => openForm());
  $("#f-person").addEventListener("change", (e) => { state.filters.person = e.target.value; drawList(); });
  $("#f-type").addEventListener("change", (e) => { state.filters.type = e.target.value; drawList(); });
  $("#f-scope").addEventListener("change", (e) => { state.filters.scope = e.target.value; drawList(); });
  $("#pv-date").addEventListener("change", (e) => setPreview(e.target.value));

  page.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "pv-prev") return setPreview(addDays(state.previewDate, -1));
    if (action === "pv-next") return setPreview(addDays(state.previewDate, 1));
    if (action === "pv-today") return setPreview(todayStr());
    const a = state.assignments.find((x) => x.id === btn.dataset.id);
    if (!a) return;
    if (action === "edit") openForm(a);
    else if (action === "delete") remove(a);
  });

  await load();
}
