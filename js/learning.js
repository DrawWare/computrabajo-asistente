// Pestaña "Aprendizaje continuo y métricas" (6.5.2). Lee pendientes.csv y responses.json del disco con
// FileReader/File.text(): ningún pedido de red. La lógica está en core/learning.js (testeada en Node).
import {
  KIND_LABELS, addLearned, buildResponses, loadPendientesText, parseResponsesText, removeLearned, responsesText,
} from "./core/learning.js";
import { KIND_OTHER, KIND_RADIO, KIND_SELECT } from "./core/pending.js";

export const PRIVACY_MSG = "Tus archivos no salen de este navegador.";
const NO_STATE_MSG = "Las métricas salen solo del CSV: no se lee state.db, así que pueden incluir avisos ya postulados.";

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Monta la pestaña dentro de `root` y devuelve la API mínima para pruebas manuales. */
export function initLearning(root) {
  const state = { pending: null, base: [], learned: [] };

  const csvInput = el("input", { id: "learn-csv", type: "file", accept: ".csv,text/csv" });
  const respInput = el("input", { id: "learn-responses", type: "file", accept: ".json,application/json" });
  const fileErr = el("p", { class: "field-error", role: "alert" });
  const notes = el("ul", { class: "notes", id: "learn-notes", "aria-live": "polite" });
  const metrics = el("div", { id: "learn-metrics", "aria-live": "polite" });
  const questions = el("div", { id: "learn-questions" });
  const changes = el("div", { id: "learn-changes", "aria-live": "polite" });
  const dlBtn = el("button", { type: "button", id: "learn-download", text: "Descargar responses.json actualizado" });

  root.replaceChildren(
    el("p", { class: "notice", text: PRIVACY_MSG }),
    el("div", { class: "tools" }, [
      el("label", { class: "file-label", for: "learn-csv", text: "pendientes.csv" }),
      csvInput,
    ]),
    el("div", { class: "tools" }, [
      el("label", { class: "file-label", for: "learn-responses", text: "responses.json (opcional, para descargarlo completo)" }),
      respInput,
    ]),
    fileErr,
    notes,
    el("h2", { text: "Métricas" }),
    metrics,
    el("h2", { text: "Preguntas sin regla" }),
    questions,
    el("h2", { text: "Cambios pendientes" }),
    changes,
    el("div", { class: "nav-buttons" }, [dlBtn]),
  );

  function renderNotes() {
    const items = [];
    if (state.pending) items.push(NO_STATE_MSG);
    if (!state.base.length) items.push("No subiste responses.json: la descarga incluirá solo las respuestas nuevas.");
    notes.replaceChildren(...items.map((text) => el("li", { text })));
  }

  function renderMetrics() {
    if (!state.pending) {
      metrics.replaceChildren(el("p", { text: "Subí pendientes.csv para ver las métricas." }));
      return;
    }
    const m = state.pending.metrics;
    const summary = el("dl", { class: "summary" }, [
      el("dt", { text: "Avisos" }), el("dd", { text: String(m.avisos) }),
      el("dt", { text: "Preguntas únicas" }), el("dd", { text: String(m.preguntasUnicas) }),
      el("dt", { text: "Filas (sin repetir)" }), el("dd", { text: String(m.filas) }),
    ]);
    const tipoRows = Object.entries(KIND_LABELS)
      .filter(([kind]) => m.porTipo[kind])
      .map(([kind, label]) => el("tr", {}, [el("td", { text: label }), el("td", { text: String(m.porTipo[kind]) })]));
    const tipos = tipoRows.length
      ? el("table", { class: "metric-table" }, [
        el("caption", { text: "Preguntas por tipo" }),
        el("tbody", {}, tipoRows),
      ])
      : el("p", { text: "Sin preguntas pendientes." });
    const top = el("ol", { class: "top-questions" }, m.top.map((t) =>
      el("li", { text: `${t.question} (${t.avisos} ${t.avisos === 1 ? "aviso" : "avisos"})` })));
    const max = Math.max(1, ...m.porDia.map(([, n]) => n));
    const bars = el("div", { class: "bars", role: "img", "aria-label": "Pendientes por día" },
      m.porDia.map(([day, n]) => {
        const bar = el("div", { class: "bar", title: `${day}: ${n}` });
        bar.style.height = `${Math.round((n / max) * 100)}%`;
        return el("div", { class: "bar-col" }, [bar, el("span", { class: "bar-label", text: day.slice(5) })]);
      }));
    metrics.replaceChildren(
      summary,
      tipos,
      el("h3", { text: "Preguntas con más avisos" }),
      top,
      el("h3", { text: "Pendientes por día" }),
      bars,
    );
  }

  function questionCard(group, index) {
    const err = el("p", { class: "field-error", role: "alert" });
    const jobs = Object.entries(group.jobs).map(([id, j]) =>
      el("li", {}, [el("a", { href: j.url, target: "_blank", rel: "noopener noreferrer", text: j.title || id })]));
    const head = el("h3", { text: group.question });
    const meta = el("p", { class: "muted", text: `${KIND_LABELS[group.kind] ?? KIND_LABELS[""]} · ${Object.keys(group.jobs).length} aviso(s)` });
    const isChoice = group.kind === KIND_RADIO || group.kind === KIND_SELECT;
    const hasOpts = group.options.length > 0;
    const body = [];
    let read;
    if (isChoice && hasOpts) {
      const name = `learn-opt-${index}`;
      const radios = group.options.map((opt, i) => el("input", { type: "radio", name, value: opt, id: `${name}-${i}` }));
      body.push(el("fieldset", { class: "options" }, radios.map((input, i) =>
        el("label", { class: "option" }, [input, el("span", { text: group.options[i] })]))));
      read = () => {
        const checked = radios.find((input) => input.checked);
        return checked ? { option: checked.value, answer: checked.value } : null;
      };
    } else if (isChoice) {
      const input = el("input", { type: "text", "aria-label": "Opción tal como aparece en el sitio", placeholder: "Opción tal como aparece en el sitio" });
      body.push(el("p", { class: "notice", text: "No conocemos las opciones de esta pregunta: escribí la opción tal como aparece en el sitio." }), input);
      read = () => (input.value.trim() ? { option: input.value, answer: input.value } : null);
    } else {
      const area = el("textarea", { rows: "2", "aria-label": "Respuesta", placeholder: "Respuesta" });
      body.push(area);
      read = () => (area.value.trim() ? { answer: area.value } : null);
    }
    if (group.kind === KIND_OTHER || group.kind === "") {
      body.unshift(el("p", { class: "notice", text: "El bot no sabe completar este tipo de campo: la regla no se va a usar." }));
    }
    const add = el("button", {
      type: "button",
      text: "Agregar respuesta",
      onclick: () => {
        err.textContent = "";
        const picked = read();
        if (!picked) {
          err.textContent = isChoice ? "Elegí una opción." : "Escribí la respuesta.";
          return;
        }
        try {
          state.learned = addLearned(state.learned, {
            question: group.question,
            kind: group.kind,
            options: group.options,
            answer: picked.answer,
            option: picked.option,
          });
          renderChanges();
        } catch (e) {
          err.textContent = e.message;
        }
      },
    });
    return el("article", { class: "question-card" }, [head, meta, el("ul", { class: "job-links" }, jobs), ...body, add, err]);
  }

  function renderQuestions() {
    if (!state.pending) {
      questions.replaceChildren(el("p", { text: "Acá aparecen las preguntas que el bot no supo responder." }));
      return;
    }
    if (!state.pending.groups.length) {
      questions.replaceChildren(el("p", { text: "No hay preguntas pendientes en este CSV." }));
      return;
    }
    questions.replaceChildren(...state.pending.groups.map((g, i) => questionCard(g, i)));
  }

  function renderChanges() {
    const items = state.learned.map((rule) => {
      const undo = el("button", { type: "button", text: "Deshacer", onclick: () => {
        state.learned = removeLearned(state.learned, rule.id);
        renderChanges();
      } });
      const label = rule.option ? `${rule.pattern} → ${rule.option}` : `${rule.pattern} → ${rule.answer}`;
      return el("li", {}, [el("span", { text: label }), " ", undo]);
    });
    changes.replaceChildren(
      items.length ? el("ul", { class: "changes" }, items) : el("p", { text: "Todavía no agregaste respuestas." }),
    );
    dlBtn.disabled = !state.base.length && !state.learned.length;
  }

  csvInput.addEventListener("change", async () => {
    const file = csvInput.files?.[0];
    if (!file) return;
    fileErr.textContent = "";
    try {
      state.pending = loadPendientesText(await file.text());
    } catch (e) {
      fileErr.textContent = `No se pudo leer pendientes.csv: ${e.message}`;
      return;
    }
    renderNotes();
    renderMetrics();
    renderQuestions();
  });

  respInput.addEventListener("change", async () => {
    const file = respInput.files?.[0];
    if (!file) return;
    fileErr.textContent = "";
    const parsed = parseResponsesText(await file.text());
    if (parsed.error) {
      fileErr.textContent = parsed.error;
      return;
    }
    state.base = parsed.data;
    if (parsed.warnings.length) fileErr.textContent = parsed.warnings.join(" ");
    renderNotes();
    renderChanges();
  });

  dlBtn.addEventListener("click", () => {
    download("responses.json", responsesText(buildResponses(state.base, state.learned)), "application/json;charset=utf-8");
  });

  renderNotes();
  renderMetrics();
  renderQuestions();
  renderChanges();
  return { state };
}
