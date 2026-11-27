// Aprendizaje continuo (6.5.2): métricas del CSV de pendientes y flujo "responder ⇒ exportar" en funciones puras.
// La UI (docs/js/learning.js) solo lee archivos, pinta y llama acá. Nada sale del navegador.
import {
  KIND_OTHER, KIND_RADIO, KIND_SELECT, KIND_TEXT, KIND_TEXT_AI_EMPTY, KIND_TEXT_NO_AI,
  dedupePendientes, groupPending, insertLearnedRules, readPendientes, ruleFromAnswer, validateResponses,
} from "./pending.js";

export const TOP_N = 10;

/** Etiquetas de tipo para tarjetas y métricas (pending_report.KIND_LABELS, en español corto). */
export const KIND_LABELS = {
  [KIND_RADIO]: "Radio (opción única)",
  [KIND_SELECT]: "Lista desplegable",
  [KIND_TEXT_NO_AI]: "Texto sin botón IA",
  [KIND_TEXT_AI_EMPTY]: "Texto con botón IA vacío",
  [KIND_TEXT]: "Texto (formato anterior)",
  [KIND_OTHER]: "Tipo no soportado",
  "": "Desconocido",
};

/** Lee pendientes.csv (texto) y arma filas deduplicadas, grupos por pregunta y métricas. */
export function loadPendientesText(text) {
  const rows = dedupePendientes(readPendientes(text));
  const groups = groupPending(rows);
  return { rows, groups, metrics: computeMetrics(rows, groups) };
}

/**
 * Métricas del CSV (sin state.db: no se sabe si el aviso ya está postulado).
 * - avisos: job_id distintos; preguntasUnicas: grupos de pregunta sin regla.
 * - porTipo: cantidad de preguntas por tipo (KIND_LABELS); top: las 10 con más avisos.
 * - porDia: filas por día (ts = YYYY-MM-DD…), ordenadas por fecha.
 */
export function computeMetrics(rows, groups) {
  const jobs = new Set(rows.map((r) => r.job_id));
  const porTipo = {};
  for (const kind of Object.keys(KIND_LABELS)) porTipo[kind] = 0;
  for (const g of groups) porTipo[g.kind] = (porTipo[g.kind] ?? 0) + 1;

  const top = groups
    .map((g) => ({ question: g.question, avisos: Object.keys(g.jobs).length }))
    .sort((a, b) => b.avisos - a.avisos)
    .slice(0, TOP_N);

  const perDay = new Map();
  for (const r of rows) {
    const day = /^\d{4}-\d{2}-\d{2}/.exec(r.ts)?.[0] ?? "sin fecha";
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const porDia = [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return { filas: rows.length, avisos: jobs.size, preguntasUnicas: groups.length, porTipo, top, porDia };
}

/**
 * Agrega una respuesta aprendida. Si ya había una regla con el mismo id (misma pregunta), la reemplaza.
 * Devuelve un array nuevo; la lista de cambios pendientes es esta misma lista (en orden).
 */
export function addLearned(learned, input) {
  const rule = ruleFromAnswer(input);
  return [...learned.filter((r) => r.id !== rule.id), rule];
}

/** Quita una respuesta aprendida por id (deshacer). */
export function removeLearned(learned, id) {
  return learned.filter((r) => r.id !== id);
}

/** responses.json para descargar: las aprendidas al principio, sin duplicar ids de las reglas base. */
export function buildResponses(baseRules, learned) {
  return insertLearnedRules(baseRules, learned);
}

/** Texto de responses.json (UTF-8, 2 espacios, salto final), igual que el paso 6. */
export function responsesText(rules) {
  return `${JSON.stringify(rules, null, 2)}\n`;
}

/** Lee un responses.json subido: {data, error, warnings}. Mismas reglas que validateResponses. */
export function parseResponsesText(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch (err) {
    return { data: null, error: `responses.json no es JSON válido: ${err.message}`, warnings: [] };
  }
  const { error, warnings } = validateResponses(data);
  return { data: error ? null : data, error, warnings };
}
