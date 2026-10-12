// قسم الإحصائيات = كشف الخدمات اليومية لفترة يحددها المستخدم (أيام منفذة + أيام قادمة في جدول واحد).
// للقراءة فقط: يقرأ people و assignments و daily_services عبر نفس دوال db.js ولا يكتب شيئًا ولا ينشئ أي مجموعة.
// التعديل يتم من صفحة «برنامج الخدمات» الحالية عبر رابط «فتح اليوم» (#/services/YYYY-MM-DD) دون أي آلية تعديل جديدة.
import { peopleApi, assignmentsApi, dailyApi } from "../db.js";
import {
  COLUMNS, TYPE_OPTIONS, LEGEND, validatePeriod, buildReport, filterNote, countsText,
} from "../report-logic.js";
import { buildDocxBytes, docxFileName } from "../docx.js";
import { todayStr, formatDisplay } from "../dates.js";
import { daysText } from "../assignments-logic.js";
import { escapeHtml, toast, describeError } from "../ui.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pad = (n) => String(n).padStart(2, "0");

function monthBounds(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}
function preparedNow() {
  const n = new Date();
  return `${formatDisplay(todayStr())} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

// ---------- عرض HTML ----------
const nameHtml = (e) => {
  const n = escapeHtml(e.name);
  const hl = e.hit ? `<mark class="rp-hit">${n}</mark>` : n;
  return `${hl}${e.driver ? ' <span class="car" title="سائق">🚗</span>' : ""}${e.inactive ? ' <span class="rp-muted">(غير نشط)</span>' : ""}`;
};
function entryHtml(e) {
  if (e.note) return `<div class="rp-line rp-sub"><span class="rp-note">${escapeHtml(e.note)}:</span> ${nameHtml(e)}</div>`;
  if (e.kind) {
    return `<div class="rp-line rp-${e.kind}">${nameHtml(e)} — ${escapeHtml(e.detail)}${e.span ? `<div class="rp-span">${escapeHtml(e.span)}</div>` : ""}</div>`;
  }
  return `<div class="rp-line">${nameHtml(e)}</div>`;
}
const cellHtml = (entries) => (entries.length ? entries.map(entryHtml).join("") : '<span class="rp-none">لا توجد</span>');

function rowHtml(r, columns) {
  const st = r.status;
  const label = `${st.kind === "done" ? "✓ " : ""}${escapeHtml(st.label)}${st.sub ? ` (${escapeHtml(st.sub)})` : ""}`;
  return `<tr class="rp-row rp-${st.kind}" data-date="${r.date}">
    <td class="rp-date"><strong class="rp-d">${formatDisplay(r.date)}</strong><span class="rp-wd">${escapeHtml(r.weekday)}</span>
      <span class="rp-state">${label}</span><a class="rp-link no-print" href="#/services/${r.date}">فتح اليوم</a></td>
    ${columns.map((c) => `<td class="rp-cell rp-c-${c}">${cellHtml(r.cells[c])}</td>`).join("")}
  </tr>`;
}

export async function render(root) {
  // الأحداث تُربط بعنصر داخلي جديد لأن #view يُعاد استخدامه بين الصفحات
  const page = document.createElement("div");
  root.appendChild(page);
  const def = monthBounds(todayStr());
  const state = { people: [], assignments: [], days: {}, applied: null, report: null };

  page.innerHTML = `
    <section class="sheet rp-controls no-print">
      <header class="sheet-head">
        <div><h2>كشف الخدمات اليومية</h2><p class="muted">اختر فترة تشمل أيامًا منفذة وأخرى قادمة. للقراءة فقط: لا شيء يُعدَّل من هذه الصفحة.</p></div>
      </header>
      <div class="rp-form">
        <label class="field field-inline"><span>من تاريخ</span><input type="date" id="rp-from" dir="ltr" value="${def.from}"></label>
        <label class="field field-inline"><span>إلى تاريخ</span><input type="date" id="rp-to" dir="ltr" value="${def.to}"></label>
        <button class="btn btn-primary rp-apply" id="rp-apply" type="button">عرض الكشف</button>
        <p class="rp-days" aria-live="polite">عدد الأيام المشمولة: <strong id="rp-days">—</strong></p>
      </div>
      <div class="rp-form rp-filters">
        <label class="field field-inline rp-grow"><span>بحث عن اسم فرد</span><input type="search" id="rp-search" placeholder="اكتب اسم الفرد" autocomplete="off"></label>
        <label class="field field-inline"><span>نوع الخدمة</span>
          <select id="rp-type">${TYPE_OPTIONS.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("")}</select></label>
        <button class="btn" id="rp-reset" type="button">إعادة عرض الكشف الكامل</button>
      </div>
      <div id="rp-msg" role="alert"></div>
      <div class="rp-actions">
        <button class="btn" type="button" data-action="print-report">🖨️ طباعة الكشف</button>
        <button class="btn" type="button" data-action="save-pdf">حفظ بصيغة PDF</button>
        <button class="btn" type="button" data-action="export-word">تصدير إلى Word</button>
        <span class="muted small" id="rp-export-note"></span>
      </div>
    </section>

    <section class="sheet rp-report" id="rp-report"><p class="muted pad">جارٍ التحميل…</p></section>`;
  const $ = (sel) => page.querySelector(sel);

  // ---------- البيانات ----------
  async function loadData() {
    const [people, assignments, days] = await Promise.all([peopleApi.list(), assignmentsApi.list(), dailyApi.list()]);
    state.people = people;
    state.assignments = assignments;
    state.days = Object.fromEntries(days.map((d) => [d.id, d]));
  }

  const showMsg = (text, kind = "bad") => {
    $("#rp-msg").innerHTML = text ? `<div class="notice notice-${kind}">${escapeHtml(text)}</div>` : "";
  };

  // عدد الأيام الحي + تنبيه أن الفترة لم تُطبَّق بعد
  function refreshInputsInfo() {
    const from = $("#rp-from").value, to = $("#rp-to").value;
    const v = validatePeriod(from, to);
    $("#rp-days").textContent = v.ok ? daysText(v.days) : "—";
    const dirty = state.applied && (state.applied.from !== from || state.applied.to !== to);
    if (v.ok || !from || !to) {
      if (dirty && v.ok) showMsg("تغيّرت الفترة: اضغط «عرض الكشف» لتطبيقها. الطباعة والتصدير يخصان الكشف المعروض حاليًا.", "info");
      else if (!dirty) showMsg("");
    }
  }

  // ---------- الرسم ----------
  function draw() {
    const root_ = $("#rp-report");
    if (!state.applied) return;
    let report;
    try {
      report = buildReport({
        people: state.people, assignments: state.assignments, days: state.days,
        from: state.applied.from, to: state.applied.to, today: todayStr(),
        search: $("#rp-search").value, type: $("#rp-type").value,
      });
    } catch (err) {
      root_.innerHTML = `<div class="notice notice-bad">${escapeHtml(err.message)}</div>`;
      state.report = null;
      return;
    }
    state.report = report;
    const note = filterNote(report);
    $("#rp-export-note").textContent = report.filtered ? "الطباعة والتصدير يطابقان التصفية الحالية؛ اضغط «إعادة عرض الكشف الكامل» لطباعة كل الأيام." : "";

    root_.innerHTML = `
      <header class="rp-head">
        <h2 class="rp-title">كشف الخدمات اليومية</h2>
        <p class="rp-period">الفترة: من <strong>${formatDisplay(report.from)}</strong> إلى <strong>${formatDisplay(report.to)}</strong></p>
        <p class="rp-prepared">تاريخ إعداد التقرير: <span id="rp-prepared">${preparedNow()}</span></p>
        <p class="rp-counts">${escapeHtml(countsText(report))}</p>
        ${note ? `<p class="rp-filter">${escapeHtml(note)}</p>` : ""}
      </header>
      <ul class="rp-legend" aria-label="وسيلة الإيضاح">
        ${LEGEND.map((l) => `<li><span class="rp-swatch rp-sw-${l.kind}" aria-hidden="true"></span>${escapeHtml(l.text)}</li>`).join("")}
      </ul>
      ${
        report.rows.length
          ? `<div class="rp-wrap"><table class="rp-table" id="rp-table">
              <thead><tr><th class="rp-date">التاريخ واليوم</th>${report.columns.map((c) => `<th class="rp-th-${c}">${escapeHtml(COLUMNS[c])}</th>`).join("")}</tr></thead>
              <tbody>${report.rows.map((r) => rowHtml(r, report.columns)).join("")}</tbody></table></div>`
          : '<p class="notice notice-info rp-empty">لا توجد أيام مطابقة للبحث أو التصفية في هذه الفترة.</p>'
      }
      <p class="rp-foot muted small">المائل في عمود المهام: تكليف مسجّل في صفحة التعيينات. «بديل»: اليوم الثاني من خدمة الخفارة أو الحراسة (48 ساعة) وليس خدمة جديدة.
        الأيام القادمة مخططة وقابلة للتعديل؛ الأيام المنفذة هي الأيام السابقة المعتمدة (final) فقط.</p>`;
  }

  // ---------- تطبيق الفترة ----------
  async function apply() {
    const from = $("#rp-from").value, to = $("#rp-to").value;
    const v = validatePeriod(from, to);
    if (!v.ok) {
      showMsg(v.message);
      return;
    }
    showMsg("");
    $("#rp-apply").disabled = true;
    try {
      await loadData(); // قراءة حديثة من Firebase عند كل «عرض الكشف»
      state.applied = { from, to };
      draw();
    } catch (err) {
      console.error(err);
      showMsg(`تعذّر تحميل البيانات: ${describeError(err)}`);
    } finally {
      $("#rp-apply").disabled = false;
    }
  }

  // ---------- الطباعة والتصدير ----------
  function withPrintTitle(fn) {
    const old = document.title;
    const restore = () => { document.title = old; window.removeEventListener("afterprint", restore); };
    document.title = `كشف الخدمات اليومية ${state.report.from} إلى ${state.report.to}`;
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 15000); // احتياط للمتصفحات التي لا تطلق afterprint
    fn();
  }
  function printReport(hint) {
    if (!state.report) return toast("اعرض الكشف أولًا.", "bad");
    const el = $("#rp-prepared");
    if (el) el.textContent = preparedNow(); // تاريخ الإعداد = لحظة الطباعة
    if (hint) toast(hint, "info");
    withPrintTitle(() => window.print());
  }
  function exportWord() {
    if (!state.report) return toast("اعرض الكشف أولًا.", "bad");
    try {
      const bytes = buildDocxBytes(state.report, { preparedAt: preparedNow(), countsText: countsText(state.report), filterNote: filterNote(state.report) });
      const url = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
      const a = document.createElement("a");
      a.href = url;
      a.download = docxFileName(state.report);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast(`تم إنشاء ملف Word (${state.report.shown} يومًا).`, "ok");
    } catch (err) {
      console.error(err);
      toast(`تعذّر إنشاء ملف Word: ${err.message}`, "bad");
    }
  }

  // ---------- الأحداث ----------
  $("#rp-apply").addEventListener("click", apply);
  for (const id of ["#rp-from", "#rp-to"]) {
    $(id).addEventListener("input", refreshInputsInfo);
    $(id).addEventListener("change", refreshInputsInfo);
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  }
  $("#rp-search").addEventListener("input", draw);
  $("#rp-type").addEventListener("change", draw);
  $("#rp-reset").addEventListener("click", () => {
    $("#rp-search").value = "";
    $("#rp-type").value = "all";
    draw();
  });
  page.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]")?.dataset.action;
    if (a === "print-report") printReport();
    else if (a === "save-pdf") printReport("في نافذة الطباعة اختر الوجهة «حفظ كـ PDF». أوقف «الرؤوس والتذييلات» لنتيجة أنظف.");
    else if (a === "export-word") exportWord();
  });

  refreshInputsInfo();
  try {
    await loadData();
    state.applied = { from: def.from, to: def.to };
    draw();
  } catch (err) {
    console.error(err);
    $("#rp-report").innerHTML = `<div class="notice notice-bad">تعذّر تحميل البيانات: ${escapeHtml(describeError(err))}</div>`;
  }
}
