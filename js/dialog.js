// حوارات صغيرة مبنية على عنصر <dialog> الأصلي: تأكيد، ونموذج.
import { escapeHtml, describeError } from "./ui.js";

// خطأ يُعرض نصه للمستخدم كما هو داخل النموذج (للتحقق من المدخلات).
export class UserError extends Error {}

function makeDialog(inner) {
  const dlg = document.createElement("dialog");
  dlg.className = "dlg";
  dlg.innerHTML = inner;
  document.body.appendChild(dlg);
  return dlg;
}

// يعيد Promise<boolean>
export function confirmDialog(message, { title = "تأكيد", confirmText = "تأكيد", danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = makeDialog(`
      <form method="dialog" class="dlg-body">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="dlg-actions">
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" value="ok">${escapeHtml(confirmText)}</button>
          <button class="btn" value="cancel" ${danger ? "autofocus" : ""}>إلغاء</button>
        </div>
      </form>`);
    dlg.addEventListener("close", () => {
      resolve(dlg.returnValue === "ok");
      dlg.remove();
    });
    dlg.showModal();
  });
}

// نموذج في حوار. onSubmit(formData, form) يرمي UserError لعرض رسالة داخل النموذج،
// ويعيد false ليبقى الحوار مفتوحًا. يعيد Promise<boolean> = هل تم الحفظ.
export function formDialog({ title, bodyHtml, submitText = "حفظ", onOpen, onSubmit }) {
  return new Promise((resolve) => {
    const dlg = makeDialog(`
      <form class="dlg-body" novalidate>
        <h2>${escapeHtml(title)}</h2>
        ${bodyHtml}
        <div class="notice notice-bad" role="alert" data-error hidden></div>
        <div class="dlg-actions">
          <button class="btn btn-primary" type="submit">${escapeHtml(submitText)}</button>
          <button class="btn" type="button" data-cancel>إلغاء</button>
        </div>
      </form>`);
    const form = dlg.querySelector("form");
    const errBox = dlg.querySelector("[data-error]");
    let saved = false;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      const buttons = form.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));
      try {
        const result = await onSubmit(new FormData(form), form);
        if (result !== false) {
          saved = true;
          dlg.close();
        }
      } catch (err) {
        if (!(err instanceof UserError)) console.error(err);
        errBox.textContent = err instanceof UserError ? err.message : describeError(err);
        errBox.hidden = false;
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    });
    form.querySelector("[data-cancel]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => {
      dlg.remove();
      resolve(saved);
    });
    dlg.showModal();
    if (onOpen) onOpen(form);
  });
}
