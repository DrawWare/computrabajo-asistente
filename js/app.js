// Bootstrap del asistente: carga presets, router de pasos, barra de progreso y botones.
import { loadPresetData } from "./core/presets.js";
import { validateStep } from "./core/validate.js";
import { defaultAnswers } from "./core/defaults.js";
import { createStore, NO_STORAGE_MSG } from "./store.js";
import { renderStep1 } from "./steps/step1_personal.js";
import { renderStep2 } from "./steps/step2_rubros.js";
import { renderStep3 } from "./steps/step3_cvs.js";
import { renderStep4 } from "./steps/step4_sueldo.js";
import { renderStep5 } from "./steps/step5_cuestionario.js";
import { renderExport } from "./steps/export.js";
import { initLearning } from "./learning.js";

const PRESETS_URL = new URL("../presets/", import.meta.url);

const fetchPreset = async (rel) => {
  const res = await fetch(new URL(rel, PRESETS_URL));
  if (!res.ok) throw new Error(`no se pudo cargar presets/${rel} (${res.status})`);
  return res.json();
};

const STEPS = [
  { id: "personal", title: "Datos y ubicación", render: renderStep1 },
  { id: "rubros", title: "Rubros y búsquedas", render: renderStep2 },
  { id: "cvs", title: "CVs", render: renderStep3 },
  { id: "sueldo", title: "Pretensión y filtros", render: renderStep4 },
  { id: "cuestionario", title: "Cuestionario", render: renderStep5 },
  { id: "exportar", title: "Exportar", render: renderExport },
];

const $ = (id) => document.getElementById(id);

async function main() {
  const statusEl = $("app-status");
  let data;
  try {
    data = await loadPresetData(fetchPreset);
  } catch (err) {
    statusEl.textContent = `No se pudieron cargar los datos del asistente: ${err.message}`;
    return;
  }

  const store = createStore({ initialAnswers: defaultAnswers() });
  const loaded = store.load();

  let current = { markErrors() {} };
  const ctx = { store, data, refresh: () => refresh() };

  function refresh() {
    const { step } = store.getState();
    const def = STEPS[step - 1];
    const answers = store.getState().answers;
    const errors = validateStep(def.id, answers, data);
    current.markErrors(errors);

    const list = $("errors");
    list.replaceChildren(
      ...Object.values(errors).map((msg) => {
        const li = document.createElement("li");
        li.textContent = msg;
        return li;
      }),
    );
    $("next").disabled = Object.keys(errors).length > 0 || step === STEPS.length;
    $("prev").disabled = step === 1;

    const st = store.status();
    const messages = [];
    if (!st.persistent) messages.push(st.message ?? NO_STORAGE_MSG);
    else if (st.message) messages.push(st.message);
    else if (loaded.loaded) messages.push("Borrador restaurado de este navegador.");
    statusEl.textContent = messages.join(" ");

    $("progress").setAttribute("aria-valuenow", String(step));
    $("progress").style.setProperty("--progress", `${(step / STEPS.length) * 100}%`);
    const nav = $("steps-nav");
    nav.replaceChildren(
      ...STEPS.map((s, i) => {
        const li = document.createElement("li");
        li.textContent = s.title;
        if (i + 1 === step) li.setAttribute("aria-current", "step");
        if (i + 1 < step) li.className = "done";
        return li;
      }),
    );
  }

  function renderStep() {
    const def = STEPS[store.getState().step - 1];
    current = def.render($("step-root"), ctx);
    refresh();
  }

  store.subscribe(() => refresh());

  $("prev").addEventListener("click", () => {
    const step = Math.max(1, store.getState().step - 1);
    store.setStep(step);
    renderStep();
  });
  $("next").addEventListener("click", () => {
    const step = Math.min(STEPS.length, store.getState().step + 1);
    store.flush();
    store.setStep(step);
    renderStep();
  });
  $("clear").addEventListener("click", () => {
    if (!window.confirm("¿Borrar todo lo que cargaste en este navegador?")) return;
    store.clearAll();
    renderStep();
  });
  $("resume").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result));
        if (bundle?.bundle_version !== 1 || typeof bundle.answers !== "object") throw new Error("formato");
        store.replaceAnswers(bundle.answers);
        renderStep();
        statusEl.textContent = "Perfil cargado desde el archivo.";
      } catch {
        statusEl.textContent = "Ese archivo no es un perfil.json válido del asistente.";
      }
    };
    reader.readAsText(file);
  });

  // Solo las secciones de la barra principal (.tabs): los botones de otros pasos (p. ej. PowerShell/CMD del paso 6) también usan role="tab".
  const sectionTabs = () => [...document.querySelectorAll(".tabs > [role='tab']")];
  for (const tab of sectionTabs()) {
    tab.addEventListener("click", () => {
      for (const t of sectionTabs()) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
      }
    });
  }

  renderStep();
  initLearning(document.getElementById("panel-aprendizaje"));
}

main();
