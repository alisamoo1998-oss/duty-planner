// صفحة الوثائق والمهام: العالقة، الأرشيف، التوزيع العادل، الإحصائيات، الأنواع.
// تعتمد على peopleApi الحالية — لا قائمة أفراد منفصلة. مجموعات Firestore: documents, doc_types.
import { peopleApi, documentsApi, docTypesApi } from "../db.js";
import {
  DOC_STATUS, DOC_STATUS_LABEL, DEFAULT_DOC_TYPES,
  isOpenDoc, pendingStart, pendingDays, completionDays, validateDocument,
  fairRanking, eventTitle, sortedHistory, ageClass, durationClass,
} from "../documents-logic.js";
import { todayStr, formatDisplay, isValidDateStr, addDays } from "../dates.js";
import { escapeHtml, personLabel, personText, byName, toast, describeError } from "../ui.js";
import { confirmDialog, formDialog, UserError } from "../dialog.js";

export async function render(root) {
  const page = document.createElement("div");
  root.appendChild(page);

  const state = {
    people: [],
    types: [],
    documents: [],
    tab: "pending", // pending | archive | fair | stats | types
    filters: {
      pending: { q: "", person: "", type: "", status: "", duration: "", sort: "oldest" },
      archive: { q: "", person: "", type: "", from: "", to: "", sort: "newest" },
    },
    fairType: "",
    statsPeriod: "all",
  };

  page.innerHTML = `
    <section class="sheet doc-toolbar no-print">
      <nav class="doc-tabs" aria-label="أقسام الوثائق">
        <button type="button" class="doc-tab active" data-tab="pending">العالقة</button>
        <button type="button" class="doc-tab" data-tab="archive">الأرشيف</button>
        <button type="button" class="doc-tab" data-tab="fair">التوزيع العادل</button>
        <button type="button" class="doc-tab" data-tab="stats">إحصائيات الوثائق</button>
        <button type="button" class="doc-tab" data-tab="types">أنواع الوثائق</button>
      </nav>
    </section>
    <div id="doc-body"><p class="muted pad">جارٍ التحميل…</p></div>`;

  const $ = (sel) => page.querySelector(sel);
  const body = () => $("#doc-body");
  const personById = (id) => state.people.find((p) => p.id === id);

  // ---------- تحميل ----------
  async function load() {
    try {
      const [people, documents, types] = await Promise.all([
        peopleApi.list(),
        documentsApi.list(),
        docTypesApi.list(),
      ]);
      state.people = people;
      state.documents = documents;
      if (!types.length) {
        await docTypesApi.ensureDefaults(DEFAULT_DOC_TYPES);
        state.types = await docTypesApi.list();
      } else {
        state.types = types;
      }
    } catch (err) {
      body().innerHTML = `<div class="notice notice-bad">تعذّر التحميل: ${escapeHtml(describeError(err))}</div>`;
      return;
    }
    draw();
  }

  function setTab(tab) {
    state.tab = tab;
    page.querySelectorAll(".doc-tab").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("active", on);
    });
    draw();
  }

  // ---------- أدوات مساعدة ----------
  function peopleOpts(selected = "", { includeInactive = false, allLabel = "— اختر الفرد —" } = {}) {
    const list = [...state.people]
      .filter((p) => includeInactive || p.isActive || p.id === selected)
      .sort(byName);
    return (
      `<option value="">${escapeHtml(allLabel)}</option>` +
      list
        .map(
          (p) =>
            `<option value="${escapeHtml(p.id)}" ${p.id === selected ? "selected" : ""}>${escapeHtml(personText(p))}${
              p.isActive ? "" : " (غير نشط)"
            }</option>`
        )
        .join("")
    );
  }

  function typeOpts(selected = "", allLabel = "— اختر النوع —") {
    return (
      `<option value="">${escapeHtml(allLabel)}</option>` +
      state.types
        .map(
          (t) =>
            `<option value="${escapeHtml(t.name)}" ${t.name === selected ? "selected" : ""}>${escapeHtml(t.name)}</option>`
        )
        .join("")
    );
  }

  function lastNote(doc) {
    const hist = doc.history || [];
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].note) return hist[i];
    return null;
  }

  // ---------- بطاقة وثيقة ----------
  function cardHtml(doc) {
    const today = todayStr();
    const days = pendingDays(doc, today);
    const open = isOpenDoc(doc);
    const age = open ? ageClass(days) : "";
    const note = lastNote(doc);
    const dur =
      open
        ? `<span class="doc-dur ${durationClass(days)}">⏱ ${days} يوم</span>`
        : `<span>✅ ${doc.lastCompleteDate ? formatDisplay(doc.lastCompleteDate) : "—"}</span>`;

    const actions = open
      ? `<button class="btn btn-small btn-ok" type="button" data-action="complete" data-id="${escapeHtml(doc.id)}">تحرير</button>
         <button class="btn btn-small" type="button" data-action="return" data-id="${escapeHtml(doc.id)}">إرجاع</button>`
      : `<button class="btn btn-small" type="button" data-action="return" data-id="${escapeHtml(doc.id)}">إرجاع</button>`;

    return `
      <article class="doc-card status-${escapeHtml(doc.status)} ${age}" data-id="${escapeHtml(doc.id)}">
        <div class="doc-card-top">
          <span class="doc-type">${escapeHtml(doc.typeName)}</span>
          <span class="badge badge-${doc.status === "completed" ? "ok" : doc.status === "returned" ? "warn" : "off"}">${DOC_STATUS_LABEL[doc.status] || doc.status}</span>
        </div>
        <div class="doc-owner">${escapeHtml(doc.ownerName)}</div>
        <div class="doc-meta">
          <span>👤 ${escapeHtml(doc.personName || "—")}</span>
          <span>📅 ${formatDisplay(doc.grantDate)}</span>
          ${dur}
        </div>
        ${note ? `<div class="doc-note">💬 ${escapeHtml(note.note)}</div>` : ""}
        <div class="doc-actions no-print">
          ${actions}
          <button class="btn btn-small" type="button" data-action="note" data-id="${escapeHtml(doc.id)}">ملاحظة</button>
          <button class="btn btn-small" type="button" data-action="details" data-id="${escapeHtml(doc.id)}">تفاصيل</button>
        </div>
      </article>`;
  }

  // ---------- فلاتر ----------
  function filterPending() {
    const f = state.filters.pending;
    const today = todayStr();
    let list = state.documents.filter(isOpenDoc);
    if (f.status) list = list.filter((d) => d.status === f.status);
    if (f.person) list = list.filter((d) => d.personId === f.person);
    if (f.type) list = list.filter((d) => d.typeName === f.type);
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter(
        (d) =>
          (d.ownerName || "").toLowerCase().includes(q) ||
          (d.personName || "").toLowerCase().includes(q) ||
          (d.typeName || "").toLowerCase().includes(q) ||
          (d.history || []).some((h) => (h.note || "").toLowerCase().includes(q))
      );
    }
    if (f.duration) {
      list = list.filter((d) => {
        const days = pendingDays(d, today);
        if (f.duration === "0-3") return days <= 3;
        if (f.duration === "4-7") return days >= 4 && days <= 7;
        if (f.duration === "8-14") return days >= 8 && days <= 14;
        if (f.duration === "15+") return days >= 15;
        return true;
      });
    }
    list.sort((a, b) => {
      if (f.sort === "oldest") return (a.grantDate || "").localeCompare(b.grantDate || "");
      if (f.sort === "newest") return (b.grantDate || "").localeCompare(a.grantDate || "");
      if (f.sort === "person") return String(a.personName || "").localeCompare(String(b.personName || ""), "ar");
      if (f.sort === "type") return String(a.typeName || "").localeCompare(String(b.typeName || ""), "ar");
      return 0;
    });
    return list;
  }

  function filterArchive() {
    const f = state.filters.archive;
    let list = state.documents.filter((d) => d.status === DOC_STATUS.COMPLETED);
    if (f.person) list = list.filter((d) => d.personId === f.person);
    if (f.type) list = list.filter((d) => d.typeName === f.type);
    if (f.from) list = list.filter((d) => d.grantDate >= f.from);
    if (f.to) list = list.filter((d) => d.grantDate <= f.to);
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter(
        (d) =>
          (d.ownerName || "").toLowerCase().includes(q) ||
          (d.personName || "").toLowerCase().includes(q) ||
          (d.typeName || "").toLowerCase().includes(q) ||
          (d.history || []).some((h) => (h.note || "").toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      if (f.sort === "newest") return (b.grantDate || "").localeCompare(a.grantDate || "");
      if (f.sort === "oldest") return (a.grantDate || "").localeCompare(b.grantDate || "");
      if (f.sort === "person") return String(a.personName || "").localeCompare(String(b.personName || ""), "ar");
      if (f.sort === "type") return String(a.typeName || "").localeCompare(String(b.typeName || ""), "ar");
      if (f.sort === "complete") return (b.lastCompleteDate || "").localeCompare(a.lastCompleteDate || "");
      return 0;
    });
    return list;
  }

  // ---------- رسم التبويبات ----------
  function drawPending() {
    const f = state.filters.pending;
    const list = filterPending();
    body().innerHTML = `
      <section class="sheet">
        <header class="sheet-head">
          <div><h2>القطع العالقة</h2><p class="muted">${list.length} وثيقة</p></div>
          <div class="doc-head-btns">
            <button class="btn" type="button" data-action="print" data-src="pending">🖨️ طباعة</button>
            <button class="btn btn-primary" type="button" data-action="add-doc">+ تسجيل مهمة جديدة</button>
          </div>
        </header>
        <div class="filters">
          <label class="field field-inline rp-grow"><span>بحث</span><input type="search" id="dp-q" value="${escapeHtml(f.q)}" placeholder="صاحب الوثيقة، الفرد، النوع…"></label>
          <label class="field field-inline"><span>الفرد</span><select id="dp-person">${peopleOpts(f.person, { allLabel: "الكل", includeInactive: true })}</select></label>
          <label class="field field-inline"><span>النوع</span><select id="dp-type">${typeOpts(f.type, "الكل")}</select></label>
          <label class="field field-inline"><span>الحالة</span>
            <select id="dp-status">
              <option value="">الكل</option>
              <option value="pending" ${f.status === "pending" ? "selected" : ""}>جديدة</option>
              <option value="returned" ${f.status === "returned" ? "selected" : ""}>معادة</option>
            </select></label>
          <label class="field field-inline"><span>المدة</span>
            <select id="dp-duration">
              <option value="">أي مدة</option>
              <option value="0-3" ${f.duration === "0-3" ? "selected" : ""}>0–3 أيام</option>
              <option value="4-7" ${f.duration === "4-7" ? "selected" : ""}>4–7 أيام</option>
              <option value="8-14" ${f.duration === "8-14" ? "selected" : ""}>8–14 يوم</option>
              <option value="15+" ${f.duration === "15+" ? "selected" : ""}>15 فأكثر</option>
            </select></label>
          <label class="field field-inline"><span>الترتيب</span>
            <select id="dp-sort">
              <option value="oldest" ${f.sort === "oldest" ? "selected" : ""}>الأقدم أولًا</option>
              <option value="newest" ${f.sort === "newest" ? "selected" : ""}>الأحدث أولًا</option>
              <option value="person" ${f.sort === "person" ? "selected" : ""}>حسب الفرد</option>
              <option value="type" ${f.sort === "type" ? "selected" : ""}>حسب النوع</option>
            </select></label>
        </div>
        <div class="doc-grid">${list.length ? list.map(cardHtml).join("") : '<p class="muted pad">لا توجد وثائق عالقة مطابقة.</p>'}</div>
      </section>`;
    bindFilter("pending");
  }

  function drawArchive() {
    const f = state.filters.archive;
    const list = filterArchive();
    body().innerHTML = `
      <section class="sheet">
        <header class="sheet-head">
          <div><h2>الأرشيف — الوثائق المنجزة</h2><p class="muted">${list.length} وثيقة</p></div>
          <button class="btn" type="button" data-action="print" data-src="archive">🖨️ طباعة</button>
        </header>
        <div class="filters">
          <label class="field field-inline rp-grow"><span>بحث</span><input type="search" id="da-q" value="${escapeHtml(f.q)}" placeholder="بحث في الأرشيف…"></label>
          <label class="field field-inline"><span>الفرد</span><select id="da-person">${peopleOpts(f.person, { allLabel: "الكل", includeInactive: true })}</select></label>
          <label class="field field-inline"><span>النوع</span><select id="da-type">${typeOpts(f.type, "الكل")}</select></label>
          <label class="field field-inline"><span>من تاريخ</span><input type="date" id="da-from" dir="ltr" value="${escapeHtml(f.from)}"></label>
          <label class="field field-inline"><span>إلى تاريخ</span><input type="date" id="da-to" dir="ltr" value="${escapeHtml(f.to)}"></label>
          <label class="field field-inline"><span>الترتيب</span>
            <select id="da-sort">
              <option value="newest" ${f.sort === "newest" ? "selected" : ""}>الأحدث أولًا</option>
              <option value="oldest" ${f.sort === "oldest" ? "selected" : ""}>الأقدم أولًا</option>
              <option value="person" ${f.sort === "person" ? "selected" : ""}>حسب الفرد</option>
              <option value="type" ${f.sort === "type" ? "selected" : ""}>حسب النوع</option>
              <option value="complete" ${f.sort === "complete" ? "selected" : ""}>حسب التحرير</option>
            </select></label>
        </div>
        <div class="doc-grid">${list.length ? list.map(cardHtml).join("") : '<p class="muted pad">لا توجد وثائق منجزة مطابقة.</p>'}</div>
      </section>`;
    bindFilter("archive");
  }

  function bindFilter(which) {
    if (which === "pending") {
      const map = { "dp-q": "q", "dp-person": "person", "dp-type": "type", "dp-status": "status", "dp-duration": "duration", "dp-sort": "sort" };
      for (const [id, key] of Object.entries(map)) {
        const el = page.querySelector("#" + id);
        if (!el) continue;
        el.addEventListener("input", () => { state.filters.pending[key] = el.value; drawPending(); });
        el.addEventListener("change", () => { state.filters.pending[key] = el.value; drawPending(); });
      }
    } else {
      const map = { "da-q": "q", "da-person": "person", "da-type": "type", "da-from": "from", "da-to": "to", "da-sort": "sort" };
      for (const [id, key] of Object.entries(map)) {
        const el = page.querySelector("#" + id);
        if (!el) continue;
        el.addEventListener("input", () => { state.filters.archive[key] = el.value; drawArchive(); });
        el.addEventListener("change", () => { state.filters.archive[key] = el.value; drawArchive(); });
      }
    }
  }

  function drawFair() {
    const ranking = state.fairType ? fairRanking(state.fairType, state.people.filter((p) => p.isActive), state.documents) : [];
    body().innerHTML = `
      <section class="sheet">
        <header class="sheet-head">
          <div>
            <h2>التوزيع العادل</h2>
            <p class="muted">لكل نوع وثيقة: من هو الأحق بالحصول على المهمة التالية (كل نوع يُحسب لوحده).</p>
          </div>
        </header>
        <div class="filters">
          <label class="field field-inline"><span>نوع الوثيقة</span>
            <select id="fair-type">${typeOpts(state.fairType, "— اختر النوع —")}</select>
          </label>
        </div>
        ${
          !state.fairType
            ? '<p class="muted pad">اختر نوع الوثيقة لعرض ترتيب الأولوية.</p>'
            : ranking.length === 0
            ? '<p class="muted pad">لا يوجد أفراد نشطون.</p>'
            : `<div class="tbl-wrap"><table class="tbl">
                <thead><tr><th>الترتيب</th><th>الفرد</th><th>عدد المرات (هذا النوع)</th><th>آخر منح</th></tr></thead>
                <tbody>${ranking
                  .map(
                    (r, i) => `<tr class="${i === 0 ? "doc-fair-top" : ""}">
                  <td>${i + 1}${i === 0 ? ' <span class="badge badge-ok">الأولوية التالية</span>' : ""}</td>
                  <td>${escapeHtml(r.name)}</td>
                  <td>${r.count}</td>
                  <td>${r.lastDate ? formatDisplay(r.lastDate) : "—"}</td>
                </tr>`
                  )
                  .join("")}</tbody></table></div>
              <p class="muted small pad">القاعدة: الأقل حصولًا على هذا النوع أولًا. عند التساوي يُفضَّل من مرّ وقت أطول منذ آخر منح.</p>`
        }
      </section>`;
    $("#fair-type")?.addEventListener("change", (e) => {
      state.fairType = e.target.value;
      drawFair();
    });
  }

  function drawStats() {
    let docs = state.documents.slice();
    const period = state.statsPeriod;
    if (period !== "all") {
      const now = new Date();
      let cutoff;
      if (period === "30") cutoff = new Date(now - 30 * 86400000);
      else if (period === "90") cutoff = new Date(now - 90 * 86400000);
      else if (period === "year") cutoff = new Date(now.getFullYear(), 0, 1);
      const cs = cutoff.toISOString().slice(0, 10);
      docs = docs.filter((d) => d.grantDate >= cs);
    }
    const open = docs.filter(isOpenDoc);
    const completed = docs.filter((d) => d.status === DOC_STATUS.COMPLETED);
    const returned = docs.filter((d) => d.status === DOC_STATUS.RETURNED);
    const durations = completed.map(completionDays).filter((x) => x !== null);
    const avg = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : "—";

    const byType = {};
    docs.forEach((d) => {
      byType[d.typeName] = byType[d.typeName] || { total: 0, open: 0, completed: 0 };
      byType[d.typeName].total++;
      if (d.status === DOC_STATUS.COMPLETED) byType[d.typeName].completed++;
      else byType[d.typeName].open++;
    });

    const byPerson = {};
    docs.forEach((d) => {
      const k = d.personName || "—";
      byPerson[k] = byPerson[k] || { open: 0, completed: 0 };
      if (d.status === DOC_STATUS.COMPLETED) byPerson[k].completed++;
      else byPerson[k].open++;
    });

    const personAvg = {};
    completed.forEach((d) => {
      const days = completionDays(d);
      if (days === null) return;
      const k = d.personName || "—";
      if (!personAvg[k]) personAvg[k] = { total: 0, n: 0 };
      personAvg[k].total += days;
      personAvg[k].n++;
    });
    const fastest = Object.entries(personAvg)
      .map(([name, v]) => ({ name, avg: v.total / v.n, n: v.n }))
      .sort((a, b) => a.avg - b.avg);

    body().innerHTML = `
      <section class="sheet">
        <header class="sheet-head">
          <div><h2>إحصائيات الوثائق</h2></div>
          <label class="field field-inline"><span>الفترة</span>
            <select id="ds-period">
              <option value="all" ${period === "all" ? "selected" : ""}>كل الوقت</option>
              <option value="30" ${period === "30" ? "selected" : ""}>آخر 30 يوم</option>
              <option value="90" ${period === "90" ? "selected" : ""}>آخر 90 يوم</option>
              <option value="year" ${period === "year" ? "selected" : ""}>هذه السنة</option>
            </select>
          </label>
        </header>
        <div class="doc-stats-grid">
          <div class="doc-stat"><div class="doc-stat-v">${open.length}</div><div class="doc-stat-l">عالقة</div></div>
          <div class="doc-stat doc-stat-ok"><div class="doc-stat-v">${completed.length}</div><div class="doc-stat-l">منجزة</div></div>
          <div class="doc-stat doc-stat-warn"><div class="doc-stat-v">${returned.length}</div><div class="doc-stat-l">معادة</div></div>
          <div class="doc-stat"><div class="doc-stat-v">${avg}</div><div class="doc-stat-l">متوسط الإنجاز (أيام)</div></div>
        </div>
        <div class="doc-stats-cols">
          <div class="doc-stats-box">
            <h3>حسب النوع</h3>
            ${
              Object.keys(byType).length
                ? Object.entries(byType)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(
                      ([n, v]) =>
                        `<div class="doc-stats-row"><span>${escapeHtml(n)}</span><strong>${v.total}</strong> <span class="muted small">(${v.open} عالقة / ${v.completed} منجزة)</span></div>`
                    )
                    .join("")
                : '<p class="muted">لا بيانات</p>'
            }
          </div>
          <div class="doc-stats-box">
            <h3>حسب الفرد</h3>
            ${
              Object.keys(byPerson).length
                ? Object.entries(byPerson)
                    .sort((a, b) => b[1].open + b[1].completed - (a[1].open + a[1].completed))
                    .map(
                      ([n, v]) =>
                        `<div class="doc-stats-row"><span>${escapeHtml(n)}</span><strong>${v.open} عالقة / ${v.completed} منجزة</strong></div>`
                    )
                    .join("")
                : '<p class="muted">لا بيانات</p>'
            }
          </div>
          <div class="doc-stats-box">
            <h3>أسرع الأفراد في الإنجاز</h3>
            ${
              fastest.length
                ? fastest
                    .map(
                      (r, i) =>
                        `<div class="doc-stats-row"><span>${i + 1}. ${escapeHtml(r.name)}</span><strong>${r.avg.toFixed(1)} يوم</strong> <span class="muted small">(${r.n})</span></div>`
                    )
                    .join("")
                : '<p class="muted">لا توجد وثائق منجزة بعد</p>'
            }
          </div>
        </div>
      </section>`;
    $("#ds-period")?.addEventListener("change", (e) => {
      state.statsPeriod = e.target.value;
      drawStats();
    });
  }

  function drawTypes() {
    body().innerHTML = `
      <section class="sheet">
        <header class="sheet-head">
          <div><h2>أنواع الوثائق والمهام</h2><p class="muted">${state.types.length} نوع</p></div>
          <button class="btn btn-primary" type="button" data-action="add-type">+ إضافة نوع</button>
        </header>
        <ul class="people-list">
          ${
            state.types.length
              ? state.types
                  .map(
                    (t) => `
            <li class="person">
              <span class="person-name">${escapeHtml(t.name)}</span>
              <span class="badge ${t.isDefault ? "badge-off" : "badge-ok"}">${t.isDefault ? "افتراضي" : "مخصص"}</span>
              <span class="row-actions">
                ${
                  t.isDefault
                    ? ""
                    : `<button class="btn btn-small btn-danger" type="button" data-action="del-type" data-id="${escapeHtml(t.id)}">حذف</button>`
                }
              </span>
            </li>`
                  )
                  .join("")
              : '<li class="muted pad">لا أنواع بعد.</li>'
          }
        </ul>
      </section>`;
  }

  function draw() {
    if (state.tab === "pending") drawPending();
    else if (state.tab === "archive") drawArchive();
    else if (state.tab === "fair") drawFair();
    else if (state.tab === "stats") drawStats();
    else if (state.tab === "types") drawTypes();
  }

  // ---------- نماذج ----------
  async function openAddDoc() {
    if (!state.people.some((p) => p.isActive)) {
      toast("أضف أفرادًا نشطين أولًا من قسم الأفراد.", "bad");
      return;
    }
    let selectedType = "";
    const saved = await formDialog({
      title: "تسجيل مهمة جديدة",
      bodyHtml: `
        <label class="field"><span>نوع الوثيقة / المهمة</span>
          <select name="typeName">${typeOpts("")}</select></label>
        <div class="hint" data-fair-hint hidden></div>
        <label class="field"><span>الفرد المكلّف</span>
          <select name="personId">${peopleOpts("")}</select></label>
        <label class="field"><span>اسم صاحب الوثيقة</span>
          <input name="ownerName" maxlength="120" autocomplete="off"></label>
        <label class="field"><span>تاريخ المنح</span>
          <input type="date" name="grantDate" dir="ltr" value="${todayStr()}"></label>
        <label class="field"><span>ملاحظة عند المنح</span>
          <textarea name="note" rows="2" maxlength="500"></textarea></label>`,
      onOpen: (form) => {
        const typeSel = form.elements.typeName;
        const personSel = form.elements.personId;
        const hint = form.querySelector("[data-fair-hint]");
        const refresh = () => {
          selectedType = typeSel.value;
          if (!selectedType) {
            hint.hidden = true;
            return;
          }
          const ranking = fairRanking(
            selectedType,
            state.people.filter((p) => p.isActive),
            state.documents
          );
          if (!ranking.length) {
            hint.hidden = true;
            return;
          }
          const top = ranking[0];
          const top3 = ranking
            .slice(0, 3)
            .map((r, i) => `${i + 1}. ${r.name} (${r.count})`)
            .join(" — ");
          hint.hidden = false;
          hint.innerHTML = `<strong>الأولوية لهذا النوع:</strong> ${escapeHtml(top.name)} (حصل على ${top.count} مرة)<br><span class="small">${escapeHtml(top3)}</span>`;
          if (!personSel.value) personSel.value = top.id;
        };
        typeSel.addEventListener("change", refresh);
        refresh();
      },
      onSubmit: async (fd) => {
        const data = {
          personId: String(fd.get("personId") || ""),
          typeName: String(fd.get("typeName") || "").trim(),
          ownerName: String(fd.get("ownerName") || "").trim().replace(/\s+/g, " "),
          grantDate: String(fd.get("grantDate") || ""),
          note: String(fd.get("note") || "").trim(),
        };
        const errors = validateDocument(data);
        if (errors.length) throw new UserError(errors.join(" "));
        if (data.grantDate > todayStr()) throw new UserError("تاريخ المنح لا يمكن أن يكون في المستقبل.");

        const dup = state.documents.find(
          (d) =>
            isOpenDoc(d) &&
            d.typeName === data.typeName &&
            (d.ownerName || "").toLowerCase() === data.ownerName.toLowerCase()
        );
        if (dup) {
          const go = await confirmDialog(
            "توجد وثيقة مشابهة عالقة (نفس النوع وصاحب الوثيقة). هل تريد المتابعة؟",
            { title: "تنبيه تكرار", confirmText: "متابعة" }
          );
          if (!go) return false;
        }

        const person = personById(data.personId);
        const history = [
          {
            id: `h_${Date.now()}`,
            type: "grant",
            date: data.grantDate,
            personId: data.personId,
            personName: person ? person.name : "—",
            note: data.note || null,
            createdAt: new Date().toISOString(),
          },
        ];
        await documentsApi.add({
          personId: data.personId,
          personName: person ? person.name : "—",
          typeName: data.typeName,
          ownerName: data.ownerName,
          grantDate: data.grantDate,
          status: DOC_STATUS.PENDING,
          history,
          lastCompleteDate: null,
        });
        return true;
      },
    });
    if (saved) {
      toast("تم تسجيل المهمة.", "ok");
      await load();
    }
  }

  async function openComplete(doc) {
    if (!isOpenDoc(doc)) {
      toast("الوثيقة منجزة بالفعل.", "bad");
      return;
    }
    const saved = await formDialog({
      title: "تسجيل التحرير",
      bodyHtml: `
        <label class="field"><span>تاريخ التحرير</span>
          <input type="date" name="date" dir="ltr" value="${todayStr()}"></label>
        <label class="field"><span>ملاحظة</span>
          <textarea name="note" rows="2" maxlength="500"></textarea></label>`,
      onSubmit: async (fd) => {
        const date = String(fd.get("date") || "");
        const note = String(fd.get("note") || "").trim();
        if (!isValidDateStr(date)) throw new UserError("تاريخ التحرير غير صحيح.");
        const start = pendingStart(doc);
        if (date < start) throw new UserError("تاريخ التحرير لا يمكن أن يكون قبل تاريخ المنح/الإرجاع.");
        const history = [
          ...(doc.history || []),
          {
            id: `h_${Date.now()}`,
            type: "complete",
            date,
            note: note || null,
            createdAt: new Date().toISOString(),
          },
        ];
        await documentsApi.update(doc.id, {
          status: DOC_STATUS.COMPLETED,
          lastCompleteDate: date,
          history,
        });
        return true;
      },
    });
    if (saved) {
      toast("تم التحرير ونُقلت للأرشيف.", "ok");
      await load();
    }
  }

  async function openReturn(doc) {
    const saved = await formDialog({
      title: "إرجاع الوثيقة لاستكمالها",
      bodyHtml: `
        <label class="field"><span>تاريخ الإرجاع</span>
          <input type="date" name="date" dir="ltr" value="${todayStr()}"></label>
        <label class="field"><span>الفرد الذي تعود إليه</span>
          <select name="personId">${peopleOpts(doc.personId)}</select></label>
        <label class="field"><span>سبب الإرجاع</span>
          <textarea name="reason" rows="3" maxlength="500" required></textarea></label>`,
      onSubmit: async (fd) => {
        const date = String(fd.get("date") || "");
        const personId = String(fd.get("personId") || "");
        const reason = String(fd.get("reason") || "").trim();
        if (!isValidDateStr(date)) throw new UserError("تاريخ الإرجاع غير صحيح.");
        if (!personId) throw new UserError("اختر الفرد.");
        if (!reason) throw new UserError("اكتب سبب الإرجاع.");
        const person = personById(personId);
        const history = [
          ...(doc.history || []),
          {
            id: `h_${Date.now()}`,
            type: "return",
            date,
            personId,
            personName: person ? person.name : "—",
            note: reason,
            createdAt: new Date().toISOString(),
          },
        ];
        await documentsApi.update(doc.id, {
          status: DOC_STATUS.RETURNED,
          personId,
          personName: person ? person.name : "—",
          lastCompleteDate: null,
          history,
        });
        return true;
      },
    });
    if (saved) {
      toast("تم إرجاع الوثيقة.", "ok");
      await load();
    }
  }

  async function openNote(doc) {
    const saved = await formDialog({
      title: "إضافة ملاحظة متابعة",
      bodyHtml: `
        <label class="field"><span>تاريخ الملاحظة</span>
          <input type="date" name="date" dir="ltr" value="${todayStr()}"></label>
        <label class="field"><span>الملاحظة</span>
          <textarea name="text" rows="3" maxlength="500" required></textarea></label>`,
      onSubmit: async (fd) => {
        const date = String(fd.get("date") || todayStr());
        const text = String(fd.get("text") || "").trim();
        if (!text) throw new UserError("أدخل نص الملاحظة.");
        const history = [
          ...(doc.history || []),
          {
            id: `h_${Date.now()}`,
            type: "note",
            date: isValidDateStr(date) ? date : todayStr(),
            note: text,
            createdAt: new Date().toISOString(),
          },
        ];
        await documentsApi.update(doc.id, { history });
        return true;
      },
    });
    if (saved) {
      toast("تمت إضافة الملاحظة.", "ok");
      await load();
    }
  }

  async function showDetails(doc) {
    const today = todayStr();
    const days = pendingDays(doc, today);
    const hist = sortedHistory(doc);
    const timeline = hist
      .map(
        (h) => `
      <div class="doc-tl-item doc-tl-${escapeHtml(h.type)}">
        <div class="doc-tl-date">${formatDisplay(h.date)}</div>
        <div class="doc-tl-title">${escapeHtml(eventTitle(h))}</div>
        ${h.note ? `<div class="doc-tl-note">${escapeHtml(h.note)}</div>` : ""}
      </div>`
      )
      .join("");

    await formDialog({
      title: "تفاصيل الوثيقة",
      submitText: "إغلاق",
      bodyHtml: `
        <div class="doc-details">
          <div class="doc-details-grid">
            <div><span class="muted small">النوع</span><div><strong>${escapeHtml(doc.typeName)}</strong></div></div>
            <div><span class="muted small">الحالة</span><div>${DOC_STATUS_LABEL[doc.status] || doc.status}</div></div>
            <div><span class="muted small">صاحب الوثيقة</span><div><strong>${escapeHtml(doc.ownerName)}</strong></div></div>
            <div><span class="muted small">الفرد المكلّف</span><div>${escapeHtml(doc.personName || "—")}</div></div>
            <div><span class="muted small">تاريخ المنح</span><div>${formatDisplay(doc.grantDate)}</div></div>
            ${
              isOpenDoc(doc)
                ? `<div><span class="muted small">مدة العالقة</span><div class="${durationClass(days)}">${days} يوم</div></div>`
                : `<div><span class="muted small">تاريخ التحرير</span><div>${doc.lastCompleteDate ? formatDisplay(doc.lastCompleteDate) : "—"}</div></div>`
            }
          </div>
          <h3 class="doc-tl-head">سجل الإجراءات</h3>
          <div class="doc-tl">${timeline || '<p class="muted">لا أحداث</p>'}</div>
        </div>`,
      onSubmit: async () => true,
    });
  }

  async function openAddType() {
    const saved = await formDialog({
      title: "إضافة نوع وثيقة",
      bodyHtml: `<label class="field"><span>اسم النوع</span><input name="name" maxlength="80" autocomplete="off"></label>`,
      onSubmit: async (fd) => {
        const name = String(fd.get("name") || "").trim().replace(/\s+/g, " ");
        if (!name) throw new UserError("أدخل اسم النوع.");
        if (state.types.some((t) => t.name === name)) throw new UserError("هذا النوع موجود مسبقًا.");
        await docTypesApi.add({ name, isDefault: false });
        return true;
      },
    });
    if (saved) {
      toast("تمت إضافة النوع.", "ok");
      await load();
    }
  }

  async function deleteType(t) {
    if (t.isDefault) return;
    if (state.documents.some((d) => d.typeName === t.name)) {
      toast("لا يمكن حذف نوع مستخدم في وثائق موجودة.", "bad");
      return;
    }
    if (!(await confirmDialog(`حذف النوع «${t.name}»؟`, { title: "حذف نوع", confirmText: "حذف", danger: true })))
      return;
    try {
      await docTypesApi.remove(t.id);
      toast("تم حذف النوع.", "ok");
      await load();
    } catch (err) {
      toast(describeError(err), "bad");
    }
  }

  // ---------- طباعة / تصدير ----------
  function docsForPrint(src) {
    if (src === "pending") return filterPending();
    if (src === "archive") return filterArchive();
    return state.documents.slice();
  }

  function printTable(docs) {
    const rows = docs
      .map(
        (d, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(d.typeName)}</td><td>${escapeHtml(d.ownerName)}</td>
           <td>${escapeHtml(d.personName || "")}</td><td>${formatDisplay(d.grantDate)}</td>
           <td>${d.lastCompleteDate ? formatDisplay(d.lastCompleteDate) : "—"}</td>
           <td>${DOC_STATUS_LABEL[d.status] || d.status}</td></tr>`
      )
      .join("");
    return `<h2>سجل الوثائق والمهام</h2>
      <p>تاريخ الطباعة: ${formatDisplay(todayStr())} — عدد النتائج: ${docs.length}</p>
      <table class="tbl"><thead><tr>
        <th>#</th><th>النوع</th><th>صاحب الوثيقة</th><th>الفرد</th><th>المنح</th><th>التحرير</th><th>الحالة</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  function doPrint(src) {
    const docs = docsForPrint(src);
    if (!docs.length) return toast("لا توجد نتائج للطباعة.", "bad");
    const area = document.createElement("div");
    area.className = "doc-print-area";
    area.innerHTML = printTable(docs);
    document.body.appendChild(area);
    const old = document.title;
    document.title = `وثائق_${todayStr()}`;
    const restore = () => {
      document.title = old;
      area.remove();
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 15000);
    window.print();
  }

  function exportWord(src) {
    const docs = docsForPrint(src);
    if (!docs.length) return toast("لا توجد نتائج للتصدير.", "bad");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8"><style>body{font-family:Arial;direction:rtl}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:6px;text-align:right}th{background:#eee}</style></head>
      <body>${printTable(docs)}</body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documents_${todayStr()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast("تم تنزيل ملف Word.", "ok");
  }

  async function openPrint(src) {
    const saved = await formDialog({
      title: "طباعة / تصدير",
      submitText: "إغلاق",
      bodyHtml: `
        <p class="muted">المصدر الحالي: ${src === "pending" ? "العالقة (حسب الفلاتر)" : src === "archive" ? "الأرشيف (حسب الفلاتر)" : "الكل"}</p>
        <div class="dlg-actions" style="margin-top:12px">
          <button type="button" class="btn btn-primary" data-print="print">🖨️ طباعة / PDF</button>
          <button type="button" class="btn" data-print="word">📄 Word</button>
        </div>`,
      onOpen: (form) => {
        form.querySelector('[data-print="print"]').addEventListener("click", () => {
          doPrint(src);
        });
        form.querySelector('[data-print="word"]').addEventListener("click", () => {
          exportWord(src);
        });
      },
      onSubmit: async () => true,
    });
  }

  // ---------- أحداث ----------
  page.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".doc-tab");
    if (tabBtn) {
      setTab(tabBtn.dataset.tab);
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === "add-doc") return openAddDoc();
    if (action === "add-type") return openAddType();
    if (action === "print") return openPrint(btn.dataset.src || "pending");
    if (action === "del-type") {
      const t = state.types.find((x) => x.id === btn.dataset.id);
      if (t) return deleteType(t);
      return;
    }
    const doc = state.documents.find((d) => d.id === btn.dataset.id);
    if (!doc) return;
    if (action === "complete") return openComplete(doc);
    if (action === "return") return openReturn(doc);
    if (action === "note") return openNote(doc);
    if (action === "details") return showDetails(doc);
  });

  // فتح التفاصيل عند النقر على البطاقة (خارج الأزرار)
  page.addEventListener("click", (e) => {
    const card = e.target.closest(".doc-card");
    if (card && card.dataset.id && !e.target.closest(".doc-actions")) {
      const doc = state.documents.find((d) => d.id === card.dataset.id);
      if (doc) showDetails(doc);
    }
  });

  await load();
}
