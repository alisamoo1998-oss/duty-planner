// حوار اختيار من قائمة مرتبة (فرد واحد أو عدة أفراد).
// يعيد Promise: null عند الإلغاء، أو { id } (اختيار واحد؛ id=null يعني مسح)، أو { ids } (اختيار متعدد).
import { escapeHtml } from "./ui.js";

// items: [{ id, nameHtml, metaHtml, statusHtml, dim }]
export function pickDialog({ title, items, selected = [], multiple = false, max = Infinity, allowClear = false, note = "" }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg dlg-wide";
    const rows = items
      .map((it) => {
        const isSel = selected.includes(it.id);
        const body = `<span class="pick-main"><span class="pick-name">${it.nameHtml}</span>
          ${it.metaHtml ? `<span class="pick-meta">${it.metaHtml}</span>` : ""}</span>
          <span class="pick-status">${it.statusHtml}</span>`;
        const cls = `pick-row ${it.dim ? "pick-dim" : ""} ${isSel ? "pick-selected" : ""}`;
        return multiple
          ? `<li><label class="${cls}"><input type="checkbox" value="${escapeHtml(it.id)}" ${isSel ? "checked" : ""}>${body}</label></li>`
          : `<li><button type="button" class="${cls}" data-id="${escapeHtml(it.id)}">${body}</button></li>`;
      })
      .join("");

    dlg.innerHTML = `
      <form method="dialog" class="dlg-body">
        <h2>${escapeHtml(title)}</h2>
        ${note ? `<p class="muted small">${escapeHtml(note)}</p>` : ""}
        ${multiple ? `<p class="pick-count" data-count></p>` : ""}
        <ul class="pick-list">${rows || '<li class="muted pad">لا يوجد أفراد للاختيار.</li>'}</ul>
        <div class="dlg-actions">
          ${multiple ? '<button type="button" class="btn btn-primary" data-save>حفظ</button>' : ""}
          ${allowClear ? '<button type="button" class="btn btn-danger" data-clear>مسح الاختيار</button>' : ""}
          <button type="button" class="btn" data-cancel>إلغاء</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);

    let result = null;
    const finish = (r) => { result = r; dlg.close(); };
    const boxes = [...dlg.querySelectorAll("input[type=checkbox]")];

    if (multiple) {
      const count = dlg.querySelector("[data-count]");
      const refresh = () => {
        const n = boxes.filter((b) => b.checked).length;
        count.textContent = `المختارون: ${n} من ${max}`;
        boxes.forEach((b) => (b.disabled = !b.checked && n >= max)); // لا يتجاوز الحد الأقصى
      };
      boxes.forEach((b) => b.addEventListener("change", refresh));
      refresh();
      dlg.querySelector("[data-save]").addEventListener("click", () =>
        finish({ ids: boxes.filter((b) => b.checked).map((b) => b.value) }));
    } else {
      dlg.querySelectorAll("button[data-id]").forEach((b) =>
        b.addEventListener("click", () => finish({ id: b.dataset.id })));
    }
    const clear = dlg.querySelector("[data-clear]");
    if (clear) clear.addEventListener("click", () => finish(multiple ? { ids: [] } : { id: null }));
    dlg.querySelector("[data-cancel]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}
