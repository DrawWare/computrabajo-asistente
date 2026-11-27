// Paso 5 (6.4.3): cuestionario rápido y "Probar una pregunta". Las funciones puras se testean en Node;
// renderStep5 solo toca el DOM dentro de la función.
import { registerStepRule } from "../core/validate.js";
import { renderResponses } from "../core/builder.js";
import { homeFromTerms, matchRule, resolveAnswer } from "../core/answer.js";

export const SUMMARY_MAX_LINES = 3;
export const SUMMARY_MAX_CHARS = 450;
export const YEARS_MIN = 0;
export const YEARS_MAX = 50;
const OFFICE_LABELS = [["basico", "Básico"], ["intermedio", "Intermedio"], ["avanzado", "Avanzado"]];

/** Problema con el resumen profesional, o null si está bien. Máx. 3 líneas y 450 caracteres. */
export function summaryProblem(text) {
  const t = String(text ?? "").trim();
  if (!t) return "Escribí un resumen profesional.";
  if (t.split(/\r?\n/).length > SUMMARY_MAX_LINES) return `El resumen tiene como máximo ${SUMMARY_MAX_LINES} líneas.`;
  if (t.length > SUMMARY_MAX_CHARS) return `El resumen tiene como máximo ${SUMMARY_MAX_CHARS} caracteres (tiene ${t.length}).`;
  return null;
}

/** Problema con los años de experiencia (entero 0–50), o null. */
export function yearsProblem(value) {
  if (value === null || value === undefined || value === "") return `Escribí los años de experiencia (entero entre ${YEARS_MIN} y ${YEARS_MAX}).`;
  return Number.isInteger(value) && value >= YEARS_MIN && value <= YEARS_MAX
    ? null
    : `Los años de experiencia son un entero entre ${YEARS_MIN} y ${YEARS_MAX}.`;
}

/** Validación del paso 5: resumen no vacío (≤ 3 líneas, ≤ 450 caracteres) y años 0–50. */
export function validateCuestionario(answers) {
  const errors = {};
  const s = answers.skills ?? {};
  const summary = summaryProblem(s.summary);
  if (summary) errors["skills.summary"] = summary;
  const years = yearsProblem(s.years_experience);
  if (years) errors["skills.years_experience"] = years;
  return errors;
}

/** experience_by_preset con la línea por defecto de cada rubro elegido que todavía no la tiene. Pura. */
export function syncExperience(answers, data) {
  const next = { ...(answers.skills?.experience_by_preset ?? {}) };
  for (const pid of answers.presets ?? []) {
    if (!(pid in next)) next[pid] = data.rubros[pid].experience_default ?? "";
  }
  return next;
}

/**
 * "Probar una pregunta": regla que matchea (id) y respuesta que daría el bot, con las mismas reglas
 * que se exportan (renderResponses) y la misma lógica que resolve_answer (sin salario).
 */
export function probeQuestion(answers, data, question, options = []) {
  const rules = renderResponses(answers, data);
  const home = homeFromTerms(answers.location?.home_terms ?? []);
  const rule = matchRule(question, rules);
  const answer = resolveAnswer(question, rules, options, { home });
  return { ruleId: rule ? rule.id : null, answer, pending: answer === null };
}

registerStepRule("cuestionario", validateCuestionario);

// ---------------------------------------------------------------- DOM

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

function select(id, label, options, value) {
  const sel = el("select", { id });
  sel.append(el("option", { value: "", text: "Elegí una opción" }));
  for (const [v, text] of options) sel.append(el("option", { value: v, text }));
  sel.value = value ?? "";
  return el("div", { class: "field" }, [el("label", { for: id, text: label }), sel]);
}

/** Pinta el paso 5 en root. ctx: {store, data}. Devuelve {markErrors(errors)}. */
export function renderStep5(root, { store, data }) {
  const ans = () => store.getState().answers;
  const skill = (key, value) => store.setIn(`skills.${key}`, value);

  const synced = syncExperience(ans(), data);
  if (JSON.stringify(synced) !== JSON.stringify(ans().skills?.experience_by_preset ?? {})) {
    skill("experience_by_preset", synced);
  }
  const s = () => ans().skills ?? {};

  const errorNodes = new Map();
  const errorFor = (key) => {
    const node = el("p", { class: "field-error", "data-err": key, "aria-live": "polite" });
    errorNodes.set(key, node);
    return node;
  };

  const englishOptions = Object.entries(data.choices.english_level).map(([k, v]) => [k, v.label]);
  const english = select("sk-english", "Nivel de inglés", englishOptions, s().english_level);
  english.querySelector("select").addEventListener("change", (e) => skill("english_level", e.target.value || null));

  const office = select("sk-office", "Office (Word, Excel)", OFFICE_LABELS, s().office_level);
  office.querySelector("select").addEventListener("change", (e) => skill("office_level", e.target.value || null));

  const check = (id, label, key) => {
    const cb = el("input", { type: "checkbox", id });
    cb.checked = Boolean(s()[key]);
    cb.addEventListener("change", () => skill(key, cb.checked));
    return el("div", { class: "field" }, [el("label", { class: "option", for: id }, [cb, document.createTextNode(` ${label}`)])]);
  };

  const years = el("input", { type: "number", id: "sk-years", min: YEARS_MIN, max: YEARS_MAX, step: 1, inputmode: "numeric" });
  years.value = s().years_experience ?? "";
  years.addEventListener("input", () => skill("years_experience", years.value === "" ? null : Number(years.value)));

  const education = el("input", { type: "text", id: "sk-education", autocomplete: "off" });
  education.value = s().education_text ?? "";
  education.addEventListener("input", () => skill("education_text", education.value));

  const summary = el("textarea", { id: "sk-summary", rows: 3 });
  summary.value = s().summary ?? "";
  const counter = el("p", { class: "muted", "aria-live": "polite" });
  const paintCounter = () => {
    const t = summary.value.trim();
    counter.textContent = `${t.split(/\r?\n/).length} de ${SUMMARY_MAX_LINES} líneas · ${t.length} de ${SUMMARY_MAX_CHARS} caracteres`;
  };
  summary.addEventListener("input", () => {
    skill("summary", summary.value);
    paintCounter();
  });
  paintCounter();

  const expWrap = el("fieldset", { class: "field" }, [el("legend", { text: "Experiencia por rubro (una línea)" })]);
  for (const pid of ans().presets ?? []) {
    const id = `sk-exp-${pid}`;
    const input = el("input", { type: "text", id, autocomplete: "off" });
    input.value = s().experience_by_preset?.[pid] ?? "";
    input.addEventListener("input", () => {
      skill("experience_by_preset", { ...(s().experience_by_preset ?? {}), [pid]: input.value });
    });
    expWrap.append(el("div", { class: "field" }, [el("label", { for: id, text: data.rubros[pid].label }), input]));
  }

  // ---- Probar una pregunta
  const probeQ = el("textarea", { id: "probe-q", rows: 2 });
  const probeOpts = el("textarea", { id: "probe-opts", rows: 3 });
  const probeOut = el("div", { class: "probe-result", "aria-live": "polite" });
  const probeBtn = el("button", { type: "button", text: "Probar" });
  probeBtn.addEventListener("click", () => {
    const q = probeQ.value.trim();
    if (!q) {
      probeOut.textContent = "Escribí una pregunta para probar.";
      return;
    }
    const options = probeOpts.value.split(/\r?\n/).map((o) => o.trim()).filter(Boolean);
    const r = probeQuestion(ans(), data, q, options);
    const rule = r.ruleId ? `Regla: ${r.ruleId}.` : "Ninguna regla matchea.";
    const what = r.pending
      ? "Respuesta: ninguna segura (quedaría pendiente)."
      : `${options.length ? "Opción" : "Respuesta"}: ${r.answer}`;
    probeOut.replaceChildren(el("p", { text: rule }), el("p", { text: what }));
  });

  root.replaceChildren(
    el("h2", { text: "5. Cuestionario rápido" }),
    english,
    check("sk-port", "Portugués avanzado", "portuguese_advanced"),
    office,
    check("sk-vehicle", "Tengo movilidad propia", "has_vehicle"),
    check("sk-license", "Tengo registro de conducir", "has_license"),
    check("sk-cven", "Tengo el CV en inglés", "cv_in_english"),
    el("div", { class: "field" }, [el("label", { for: "sk-years", text: `Años de experiencia (${YEARS_MIN} a ${YEARS_MAX})` }), years, errorFor("skills.years_experience")]),
    el("div", { class: "field" }, [el("label", { for: "sk-education", text: "Estudios (texto libre)" }), education]),
    el("div", { class: "field" }, [el("label", { for: "sk-summary", text: "Resumen profesional" }), summary, counter, errorFor("skills.summary")]),
    expWrap,
    el("section", { "aria-label": "Probar una pregunta" }, [
      el("h3", { text: "Probar una pregunta" }),
      el("p", { class: "muted", text: "Escribí una pregunta de un formulario para ver qué respondería el bot. Opciones opcionales, una por línea." }),
      el("div", { class: "field" }, [el("label", { for: "probe-q", text: "Pregunta" }), probeQ]),
      el("div", { class: "field" }, [el("label", { for: "probe-opts", text: "Opciones (una por línea)" }), probeOpts]),
      probeBtn,
      probeOut,
    ]),
  );

  return {
    markErrors(errors) {
      for (const [key, node] of errorNodes) node.textContent = errors[key] ?? "";
    },
  };
}
