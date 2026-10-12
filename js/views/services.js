// صفحة برنامج الخدمات: التنقل بين الأيام، إنشاء مسودات، وتعديل بطاقة اليوم.
// لا يُنشأ أي يوم تلقائيًا. كل عملية تثبّت تاريخ يومها عند بدايتها (انظر saveDay) فلا تُكتب بيانات يوم في يوم آخر.
import { peopleApi, assignmentsApi, dailyApi } from "../db.js";
import {
  STATUS, MAX_REST, newDayDoc, dateRange, effectiveDay, substitutesToPersist,
  candidateList, missingParts,
} from "../services-logic.js";
import { todayStr, addDays, diffDays, formatDisplay, weekdayName, isValidDateStr, isFriday } from "../dates.js";
import { escapeHtml, personLabel, personText, byName, toast, describeError } from "../ui.js";
import { confirmDialog, formDialog, UserError } from "../dialog.js";
import { pickDialog } from "../picker.js";
import { renderDayCard, renderEmptyDay, statusText } from "./day-card.js";
import { checkDay } from "../day-check.js";

// حقل الوثيقة + عنوان الحوار + نوع القائمة لكل زر اختيار
const PICK = {
  "pick-parmano":     { field: "parmanoPersonId",     kind: "parmano", title: "اختيار الخفير" },
  "pick-gard":        { field: "gardPersonId",        kind: "gard",    title: "اختيار الحارس" },
  "pick-parmano-sub": { field: "parmanoSubstituteId", kind: "plain",   title: "اختيار البديل" },
  "pick-gard-sub":    { field: "gardSubstituteId",    kind: "plain",   title: "اختيار بديل الحارس" },
};

function dateFromHash() {
  const part = location.hash.replace(/^#\/?/, "").split("/")[1];
  return isValidDateStr(part) ? part : todayStr();
}

export async function render(root) {
  // الأحداث تُربط بعنصر داخلي جديد لأن #view يُعاد استخدامه بين الصفحات
  const page = document.createElement("div");
  root.appendChild(page);
  const state = { people: [], assignments: [], days: {}, date: dateFromHash(), checkDate: null };

  page.innerHTML = `
    <section class="sheet day-toolbar">
      <div class="date-nav">
        <button class="btn btn-small" type="button" data-action="nav-prev">اليوم السابق</button>
        <input type="date" id="svc-date" dir="ltr" aria-label="تاريخ اليوم">
        <button class="btn btn-small" type="button" data-action="nav-next">اليوم التالي</button>
        <button class="btn btn-small" type="button" data-action="nav-today">اليوم</button>
        <span id="svc-dayinfo" class="day-info" aria-live="polite"></span>
      </div>
      <button class="btn btn-small" type="button" data-action="open-week">+ إنشاء مسودات أيام</button>
    </section>
    <div id="svc-strip" class="day-strip" aria-label="الأيام القريبة"></div>
    <div id="svc-card"><p class="muted pad">جارٍ التحميل…</p></div>`;

  const $ = (sel) => page.querySelector(sel);

  async function load() {
    try {
      const [people, assignments, days] = await Promise.all([peopleApi.list(), assignmentsApi.list(), dailyApi.list()]);
      state.people = people;
      state.assignments = assignments;
      state.days = Object.fromEntries(days.map((d) => [d.id, d]));
    } catch (err) {
      $("#svc-card").innerHTML = `<div class="notice notice-bad">تعذّر التحميل: ${escapeHtml(describeError(err))}</div>`;
      return;
    }
    draw();
  }

  // ---------- العرض ----------
  function draw() {
    $("#svc-date").value = state.date;
    const diff = diffDays(state.date, todayStr());
    $("#svc-dayinfo").textContent = `${weekdayName(state.date)} — ${diff === 0 ? "اليوم الحالي" : diff > 0 ? `بعد ${daysAgo(diff)}` : `قبل ${daysAgo(-diff)}`}`;
    history.replaceState(null, "", `#/services/${state.date}`); // يحفظ اليوم في الرابط دون إعادة تحميل الصفحة

    // شريط الأيام القريبة: رمادي = غير مُعدّ، أصفر = مسودة، أخضر = معتمد
    $("#svc-strip").innerHTML = dateRange(addDays(state.date, -3), 14)
      .map((d) => {
        const doc = state.days[d];
        const cls = !doc ? "chip-none" : doc.status === STATUS.FINAL ? "chip-final" : "chip-draft";
        return `<button type="button" class="chip ${cls} ${d === state.date ? "chip-active" : ""} ${d === todayStr() ? "chip-today" : ""}" data-action="go-date" data-date="${d}">
          <span>${d === todayStr() ? "اليوم" : weekdayName(d)}</span><strong>${formatDisplay(d).slice(0, 5)}</strong></button>`;
      })
      .join("");
    $("#svc-strip .chip-active")?.scrollIntoView?.({ inline: "center", block: "nearest" });

    const eff = effectiveDay(state.date, state.days);
    $("#svc-card").innerHTML = eff
      ? renderDayCard({
          date: state.date, eff, people: state.people, assignments: state.assignments, days: state.days,
          // نتيجة الفحص تُعاد حسابها مع كل رسم ما دامت مفتوحة، فلا تبقى قديمة بعد أي تعديل
          check: state.checkDate === state.date
            ? checkDay({ date: state.date, people: state.people, assignments: state.assignments, days: state.days })
            : null,
        })
      : renderEmptyDay(state.date);
  }

  const setDate = (date) => {
    if (!isValidDateStr(date)) {
      $("#svc-date").value = state.date; // حقل فارغ/غير صالح: يبقى اليوم المعروض ولا يتغير شيء
      return;
    }
    state.date = date;
    state.checkDate = null; // الفحص خاص باليوم الذي طُلب له
    draw();
  };

  // ---------- الحفظ ----------
  // يثبّت البديلين المشتقين من اليوم السابق عند أي حفظ حتى لا يتغيرا لاحقًا دون علم المستخدم.
  // date يُثبَّت عند بدء العملية (لا يُقرأ من state.date وقت الحفظ) لتبقى التعديلات على يومها حتى لو تغيّر اليوم المعروض أثناء الحوار.
  async function saveDay(patch, date = state.date) {
    const eff = effectiveDay(date, state.days);
    if (!eff) {
      toast("تعذّر الحفظ: اليوم لم يعد موجودًا.", "bad");
      return false;
    }
    const payload = { ...substitutesToPersist(eff), ...patch };
    try {
      await dailyApi.save(date, payload);
      state.days[date] = { ...state.days[date], ...payload, date };
      draw();
      return true;
    } catch (err) {
      toast(`تعذّر الحفظ: ${describeError(err)}`, "bad");
      return false;
    }
  }

  // ---------- عناصر قوائم الاختيار ----------
  function toItems(list, kind) {
    return list.map((e) => {
      let meta = "";
      const m = e.metrics;
      if (kind === "parmano" || kind === "gard") {
        const word = kind === "parmano" ? "آخر خفارة" : "آخر حراسة";
        meta = m.last
          ? `${word}: ${formatDisplay(m.last.date)}${m.last.isDraft ? " (مسودة)" : ""} — منذ ${daysAgo(m.since)}`
          : "لا يوجد سجل سابق";
      } else if (kind === "rest") {
        const rest = m.last ? `آخر راحة: ${formatDisplay(m.last.date)}${m.last.isDraft ? " (مسودة)" : ""} — منذ ${daysAgo(m.since)}` : "لا يوجد سجل راحة";
        meta = `${rest} • أيام العمل المتواصلة: ${m.streak === null ? "—" : m.streak}`;
      }
      return { id: e.person.id, nameHtml: personLabel(e.person), metaHtml: escapeHtml(meta), statusHtml: statusText(e), dim: e.state === "long" };
    });
  }
  const daysAgo = (n) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يومًا`);

  async function pick(action) {
    const cfg = PICK[action];
    const date = state.date;
    const eff = effectiveDay(date, state.days);
    const current = eff[cfg.field] || null;
    const list = candidateList({
      kind: cfg.kind, date, people: state.people, assignments: state.assignments,
      days: state.days, keepIds: current ? [current] : [],
    });
    const res = await pickDialog({
      title: cfg.title, items: toItems(list, cfg.kind), selected: current ? [current] : [], allowClear: !!current,
      note: cfg.kind === "plain" ? "" : "الترتيب اقتراح فقط، والاختيار لك.",
    });
    if (!res) return;
    await saveDay({ [cfg.field]: res.id }, date);
  }

  async function pickRest() {
    const date = state.date;
    const eff = effectiveDay(date, state.days);
    if (!eff) return;
    const friday = isFriday(date);
    const list = candidateList({
      kind: "rest", date, people: state.people, assignments: state.assignments,
      days: state.days, keepIds: eff.restPersonIds,
    });
    const res = await pickDialog({
      title: friday ? "اختيار الراحة — استثناء يوم الجمعة" : "اختيار الراحة",
      items: toItems(list, "rest"), selected: eff.restPersonIds, multiple: true, max: MAX_REST,
      note: friday
        ? "تنبيه: اليوم الجمعة ولا تُمنح الراحة فيه عادةً. أي إضافة تحتاج تأكيدك كاستثناء قبل الحفظ."
        : "الترتيب: الأطول عملًا متواصلًا ثم الأبعد عن آخر راحة. الاختيار لك (حتى 4 أفراد).",
    });
    if (!res) return;
    if (friday) {
      const added = res.ids.filter((id) => !eff.restPersonIds.includes(id));
      if (added.length) {
        const names = added.map((id) => state.people.find((p) => p.id === id)?.name || "فرد").join("، ");
        const go = await confirmDialog(
          `اليوم هو الجمعة (${formatDisplay(date)})، ومنح الراحة فيه مخالف للقاعدة المعتادة (لا راحة يوم الجمعة). ` +
            `سيُمنح الراحة: ${names}. هل تريد المتابعة كاستثناء؟ عند الإلغاء لا يُحفظ أي تغيير.`,
          { title: "راحة يوم الجمعة — مخالفة للقاعدة المعتادة", confirmText: "متابعة كاستثناء", danger: true }
        );
        if (!go) return; // إلغاء: لا شيء يُحفظ
      }
    }
    if ((await saveDay({ restPersonIds: res.ids }, date)) && friday && res.ids.length) toast("تم منح الراحة كاستثناء ليوم الجمعة.", "ok");
  }

  // ---------- المهام اليدوية ----------
  async function taskForm(index = null) {
    const date = state.date;
    const eff = effectiveDay(date, state.days);
    const existing = index === null ? null : eff.otherTasks[index];
    const list = candidateList({
      kind: "plain", date, people: state.people, assignments: state.assignments,
      days: state.days, keepIds: existing ? [existing.personId] : [],
    });
    const options = list
      .map((e) => `<option value="${escapeHtml(e.person.id)}" ${existing && existing.personId === e.person.id ? "selected" : ""}>${escapeHtml(personText(e.person))}${e.state === "long" ? " (مهمة طويلة)" : ""}</option>`)
      .join("");
    const saved = await formDialog({
      title: existing ? "تعديل مهمة" : "إضافة مهمة لهذا اليوم",
      bodyHtml: `
        <label class="field"><span>الفرد</span><select name="personId"><option value="">— اختر الفرد —</option>${options}</select></label>
        <label class="field"><span>المهمة</span><input name="task" maxlength="80" autocomplete="off" value="${escapeHtml(existing ? existing.task : "")}"></label>`,
      onSubmit: async (fd) => {
        const personId = String(fd.get("personId") || "");
        const task = String(fd.get("task") || "").trim();
        if (!personId) throw new UserError("اختر الفرد.");
        if (!task) throw new UserError("اكتب المهمة.");
        const tasks = [...eff.otherTasks];
        if (existing) tasks[index] = { personId, task };
        else tasks.push({ personId, task });
        return saveDay({ otherTasks: tasks }, date);
      },
    });
    if (saved) toast(existing ? "تم حفظ التعديل." : "تمت إضافة المهمة.", "ok");
  }

  async function deleteTask(index) {
    const date = state.date;
    const eff = effectiveDay(date, state.days);
    if (!(await confirmDialog("حذف هذه المهمة من اليوم؟", { title: "حذف مهمة", confirmText: "حذف", danger: true }))) return;
    await saveDay({ otherTasks: eff.otherTasks.filter((_, i) => i !== index) }, date);
  }

  // ---------- إنشاء الأيام ----------
  async function createDay() {
    const date = state.date;
    try {
      await dailyApi.createDrafts([date]);
      state.days[date] = state.days[date] || newDayDoc(date);
      draw();
    } catch (err) {
      toast(`تعذّر إنشاء اليوم: ${describeError(err)}`, "bad");
    }
  }

  async function openWeek() {
    const saved = await formDialog({
      title: "إنشاء مسودات أيام",
      submitText: "إنشاء",
      bodyHtml: `
        <div class="field-row">
          <label class="field"><span>من تاريخ</span><input type="date" name="start" dir="ltr" value="${state.date}"></label>
          <label class="field"><span>عدد الأيام</span><input type="number" name="count" min="1" max="31" value="7" dir="ltr"></label>
        </div>
        <p class="hint">تُنشأ مسودات فارغة فقط. الأيام الموجودة لا تُستبدل ولا تتغير.</p>`,
      onSubmit: async (fd) => {
        const start = String(fd.get("start") || "");
        const count = Number(fd.get("count"));
        if (!isValidDateStr(start)) throw new UserError("تاريخ البداية غير صحيح.");
        if (!Number.isInteger(count) || count < 1 || count > 31) throw new UserError("عدد الأيام بين 1 و31.");
        const { created, skipped } = await dailyApi.createDrafts(dateRange(start, count));
        created.forEach((d) => (state.days[d] = newDayDoc(d)));
        state.date = start;
        toast(`تم إنشاء ${created.length} مسودة${skipped ? ` وتخطي ${skipped} موجودة` : ""}.`, "ok");
        draw();
        return true;
      },
    });
    return saved;
  }

  // ---------- الطباعة ----------
  // تطبع بطاقة اليوم المحدد فقط (تنسيق الطباعة في styles.css يخفي كل ما عداها).
  // اسم اليوم يصير عنوان الصفحة أثناء الطباعة ليُقترح اسمًا لملف PDF، ثم يُعاد العنوان.
  function printDay() {
    const old = document.title;
    const restore = () => {
      document.title = old;
      window.removeEventListener("afterprint", restore);
    };
    document.title = `خدمة ${state.date}`;
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 15000); // احتياط للمتصفحات التي لا تطلق afterprint
    window.print();
  }

  // ---------- الحالة والحذف ----------
  async function toggleStatus() {
    const date = state.date;
    const eff = effectiveDay(date, state.days);
    if (eff.status === STATUS.FINAL) return saveDay({ status: STATUS.DRAFT }, date);
    const missing = missingParts(eff);
    if (missing.length) {
      const go = await confirmDialog(`اليوم ناقص: ${missing.join(" و")}. هل تريد اعتماده رغم ذلك؟ (يدخل اليوم المعتمد في الإحصائيات)`, {
        title: "اعتماد يوم ناقص", confirmText: "اعتماد رغم ذلك",
      });
      if (!go) return;
    }
    if (await saveDay({ status: STATUS.FINAL }, date)) toast("تم اعتماد اليوم.", "ok");
  }

  async function deleteDay() {
    const date = state.date;
    if (!(await confirmDialog("ستُحذف هذه المسودة وكل ما أُدخل فيها. الأيام الأخرى لا تتأثر.", { title: "حذف مسودة", confirmText: "حذف", danger: true }))) return;
    try {
      await dailyApi.remove(date);
      delete state.days[date];
      draw();
      toast("تم حذف المسودة.", "ok");
    } catch (err) {
      toast(describeError(err), "bad");
    }
  }

  // ---------- الأحداث ----------
  $("#svc-date").addEventListener("change", (e) => setDate(e.target.value));
  page.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "nav-prev") return setDate(addDays(state.date, -1));
    if (a === "nav-next") return setDate(addDays(state.date, 1));
    if (a === "nav-today") return setDate(todayStr());
    if (a === "go-date") return setDate(btn.dataset.date);
    if (a === "open-week") return openWeek();
    if (a === "create-day") return createDay();
    if (PICK[a]) return pick(a);
    if (a === "pick-rest") return pickRest();
    if (a === "add-task") return taskForm();
    if (a === "edit-task") return taskForm(Number(btn.dataset.index));
    if (a === "del-task") return deleteTask(Number(btn.dataset.index));
    if (a === "check-day") {
      state.checkDate = state.date;
      draw();
      page.querySelector("#dc-panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (a === "close-check") {
      state.checkDate = null;
      return draw();
    }
    if (a === "print-day") return printDay();
    if (a === "toggle-status") return toggleStatus();
    if (a === "delete-day") return deleteDay();
  });

  await load();
}
