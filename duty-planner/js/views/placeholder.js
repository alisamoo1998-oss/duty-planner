// قالب موحّد للصفحات التي ستُبنى في مراحل لاحقة.
import { escapeHtml } from "../ui.js";

export function renderPlaceholder(root, { icon, title, text, phase }) {
  root.innerHTML = `
    <section class="sheet empty">
      <div class="empty-icon" aria-hidden="true">${icon}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(text)}</p>
      <p class="muted small">${escapeHtml(phase)}</p>
    </section>`;
}
