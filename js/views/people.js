// إدارة الأفراد: إضافة، تعديل، تعطيل، تفعيل. لا حذف أبدًا (التعطيل يحفظ السجل التاريخي).
import { peopleApi } from "../db.js";
import { escapeHtml, personLabel, byName, toast, describeError } from "../ui.js";
import { confirmDialog, formDialog, UserError } from "../dialog.js";

const yesNo = (value) =>
  `<option value="no" ${value ? "" : "selected"}>لا</option><option value="yes" ${value ? "selected" : ""}>نعم</option>`;

function formBody(p) {
  return `
    <label class="field"><span>الاسم</span>
      <input name="name" maxlength="60" autocomplete="off" value="${escapeHtml(p.name || "")}"></label>
    <div class="field-row">
      <label class="field"><span>سائق؟</span><select name="isDriver">${yesNo(p.isDriver)}</select></label>
      <label class="field"><span>نشط؟</span><select name="isActive">${yesNo(p.isActive !== false)}</select></label>
    </div>
    <label class="field"><span>ملاحظات</span>
      <textarea name="notes" rows="3" maxlength="500">${escapeHtml(p.notes || "")}</textarea></label>`;
}

export async function render(root) {
  const state = { people: [] };

  root.innerHTML = `
    <section class="sheet">
      <header class="sheet-head">
        <div><h2>الأفراد</h2><p class="muted" id="people-summary"></p></div>
        <button class="btn btn-primary" id="add-person" type="button">+ إضافة فرد</button>
      </header>
      <ul class="people-list" id="people-list"><li class="muted pad">جارٍ التحميل…</li></ul>
      <p class="muted small pad">لا يُحذف أي فرد: عند مغادرته عطّله ليبقى سجله وخدماته القديمة محفوظة.</p>
    </section>`;

  const list = root.querySelector("#people-list");
  const summary = root.querySelector("#people-summary");

  async function load() {
    try {
      state.people = await peopleApi.list();
      draw();
    } catch (err) {
      list.innerHTML = `<li class="notice notice-bad">تعذّر تحميل الأفراد: ${escapeHtml(describeError(err))}</li>`;
    }
  }

  function draw() {
    const people = [...state.people].sort((a, b) =>
      !!a.isActive !== !!b.isActive ? (a.isActive ? -1 : 1) : byName(a, b)
    );
    const active = people.filter((p) => p.isActive).length;
    const drivers = people.filter((p) => p.isActive && p.isDriver).length;
    summary.textContent = `${active} نشط — منهم ${drivers} سائق 🚗 — و${people.length - active} غير نشط`;

    list.innerHTML = people.length
      ? people
          .map(
            (p) => `
        <li class="person ${p.isActive ? "" : "person-off"}">
          <span class="person-name">${personLabel(p)}</span>
          <span class="person-notes">${escapeHtml(p.notes || "")}</span>
          <span class="badge ${p.isActive ? "badge-ok" : "badge-off"}">${p.isActive ? "نشط" : "غير نشط"}</span>
          <span class="row-actions">
            <button class="btn btn-small" type="button" data-action="edit" data-id="${escapeHtml(p.id)}">تعديل</button>
            <button class="btn btn-small ${p.isActive ? "btn-danger" : ""}" type="button" data-action="toggle" data-id="${escapeHtml(p.id)}">${p.isActive ? "تعطيل" : "تفعيل"}</button>
          </span>
        </li>`
          )
          .join("")
      : '<li class="muted pad">لا يوجد أفراد بعد. أضف أول فرد.</li>';
  }

  async function openForm(existing = null) {
    const saved = await formDialog({
      title: existing ? "تعديل فرد" : "إضافة فرد",
      bodyHtml: formBody(existing || {}),
      onOpen: (form) => form.elements.name.focus(),
      onSubmit: async (fd) => {
        const data = {
          name: String(fd.get("name") || "").trim().replace(/\s+/g, " "),
          isDriver: fd.get("isDriver") === "yes",
          isActive: fd.get("isActive") === "yes",
          notes: String(fd.get("notes") || "").trim(),
        };
        if (!data.name) throw new UserError("اكتب اسم الفرد.");
        const dup = state.people.find((p) => p.id !== existing?.id && p.name === data.name);
        if (dup) {
          const go = await confirmDialog(`يوجد فرد آخر بالاسم نفسه «${data.name}». هل تريد المتابعة؟`, {
            title: "اسم مكرر",
            confirmText: "متابعة",
          });
          if (!go) return false;
        }
        if (existing) await peopleApi.update(existing.id, data);
        else await peopleApi.add(data);
        return true;
      },
    });
    if (saved) {
      toast(existing ? "تم حفظ التعديل." : "تمت إضافة الفرد.", "ok");
      await load();
    }
  }

  async function toggle(person) {
    if (person.isActive) {
      const ok = await confirmDialog(
        `سيُعطَّل «${person.name}» ولن يظهر كمرشح عادي، وتبقى خدماته وتعييناته القديمة محفوظة. يمكنك تفعيله لاحقًا.`,
        { title: "تعطيل فرد", confirmText: "تعطيل", danger: true }
      );
      if (!ok) return;
    }
    try {
      await peopleApi.setActive(person.id, !person.isActive);
      toast(person.isActive ? "تم التعطيل." : "تم التفعيل.", "ok");
      await load();
    } catch (err) {
      toast(describeError(err), "bad");
    }
  }

  root.querySelector("#add-person").addEventListener("click", () => openForm());
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const person = state.people.find((p) => p.id === btn.dataset.id);
    if (!person) return;
    if (btn.dataset.action === "edit") openForm(person);
    else toggle(person);
  });

  await load();
}
