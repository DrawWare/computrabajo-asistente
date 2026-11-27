// Núcleo de pendientes (6.5.1): puerto de dedupe.py (_complete, dedupe_pendientes, read_pendientes),
// pending_report.py (group_pending, suggest_pattern) y parse_responses. Módulo puro, sin DOM ni I/O.
// Sin state.db: no hay filtro por estado de aviso (se avisa en la UI).
import { questionKey } from "./normalize.js";
import { toJsRegExp } from "./regex.js";
import { parseCsv } from "./csv.js";

export const PENDIENTES_HEADER = ["ts", "job_id", "title", "url", "motivo", "detalle", "pregunta", "tipo", "opciones"];
export const LEGACY_PENDIENTES_HEADER = PENDIENTES_HEADER.slice(0, 6); // formato hasta 2026-11-26
export const OPTIONS_SEP = " | ";

export const KIND_RADIO = "radio";
export const KIND_SELECT = "select";
export const KIND_TEXT_NO_AI = "texto_sin_ia";
export const KIND_TEXT_AI_EMPTY = "texto_ia_vacia";
export const KIND_TEXT = "texto";
export const KIND_OTHER = "otro";
const CHOICE_KINDS = [KIND_RADIO, KIND_SELECT];

// Motivo entre paréntesis al final de "detalle" => tipo (dedupe._REASON_KIND).
const REASON_KIND = new Map([
  ["sin opción segura en los radios", KIND_RADIO],
  ["el paso de opción única no tiene opciones visibles", KIND_RADIO],
  ["sin opción segura en el select", KIND_SELECT],
  ["el select no tiene opciones", KIND_SELECT],
  ["sin regla en responses.json ni respuesta sugerida", KIND_TEXT],
  ["tipo de campo no soportado", KIND_OTHER],
]);

/** [pregunta, motivo] de un detalle "<pregunta> (<motivo>)"; si el motivo no es conocido, [detalle, ""]. */
export function splitDetalle(detalle) {
  const text = String(detalle ?? "").trim();
  for (const reason of REASON_KIND.keys()) {
    const suffix = ` (${reason})`;
    if (text.endsWith(suffix)) return [text.slice(0, -suffix.length).trim(), reason];
  }
  return [text, ""];
}

/** Lista de la columna "opciones" (separadas por " | "). */
export function splitOptions(opciones) {
  return String(opciones ?? "").split("|").map((o) => o.trim()).filter(Boolean);
}

/** Fila con las 9 columnas, sin espacios. En filas viejas deduce pregunta y tipo desde "detalle". */
export function completeRow(row) {
  const out = {};
  for (const col of PENDIENTES_HEADER) out[col] = String(row?.[col] ?? "").trim();
  if (out.motivo === "pregunta_sin_regla" && !(out.pregunta && out.tipo)) {
    const [question, reason] = splitDetalle(out.detalle);
    out.pregunta = out.pregunta || question;
    out.tipo = out.tipo || REASON_KIND.get(reason) || "";
  }
  return out;
}

/** Identidad de una pendiente: (job_id, motivo, pregunta normalizada). */
export function pendingKey(row) {
  return JSON.stringify([row.job_id, row.motivo, questionKey(row.pregunta)]);
}

// Completa la fila guardada con lo que trae una repetida (dedupe._merge). Conserva ts y detalle.
function mergeRow(kept, repeated) {
  for (const col of ["title", "url", "opciones"]) {
    if (!kept[col] && repeated[col]) kept[col] = repeated[col];
  }
  if (repeated.tipo && kept.tipo !== repeated.tipo && (kept.tipo === "" || kept.tipo === KIND_TEXT)) {
    kept.tipo = repeated.tipo;
  }
}

/** Una fila por pendingKey, en orden de aparición. */
export function dedupePendientes(rows) {
  const kept = new Map();
  for (const raw of rows) {
    const row = completeRow(raw);
    const key = pendingKey(row);
    if (kept.has(key)) mergeRow(kept.get(key), row);
    else kept.set(key, row);
  }
  return [...kept.values()];
}

/** Filas de pendientes.csv (texto) en el formato actual, sin deduplicar. Acepta el de 6 columnas. */
export function readPendientes(text) {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const at = new Map();
  header.forEach((name, i) => at.set(name, i));
  return body.map((cells) => {
    const row = {};
    for (const col of PENDIENTES_HEADER) {
      const i = at.get(col);
      row[col] = i === undefined ? "" : cells[i] ?? "";
    }
    return completeRow(row);
  });
}

const KIND_RANK = (kind) => (!kind ? 0 : kind === KIND_TEXT ? 1 : 2);

/**
 * Agrupa las pendientes `pregunta_sin_regla` por pregunta (group_pending sin state.db).
 * Devuelve [{question, kind, options, jobs: {job_id: {title, url, ts}}}] en orden de aparición.
 */
export function groupPending(rows) {
  const groups = new Map();
  for (const row of dedupePendientes(rows)) {
    if (row.motivo !== "pregunta_sin_regla" || !row.pregunta) continue;
    const key = questionKey(row.pregunta);
    if (!groups.has(key)) groups.set(key, { question: row.pregunta, kind: "", options: [], jobs: {} });
    const group = groups.get(key);
    if (KIND_RANK(row.tipo) > KIND_RANK(group.kind)) group.kind = row.tipo;
    if (!group.options.length) group.options = splitOptions(row.opciones);
    if (!Object.prototype.hasOwnProperty.call(group.jobs, row.job_id)) {
      group.jobs[row.job_id] = { title: row.title, url: row.url, ts: row.ts };
    }
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- sugerencia de patrón
const ACCENT_CLASSES = { á: "[aá]", é: "[eé]", í: "[ií]", ó: "[oó]", ú: "[uú]", ü: "[uü]", ñ: "[nñ]" };
// Palabras de arranque que no hacen a la pregunta (pending_report._LEADING_FILLERS).
const LEADING_FILLERS = new Set((
  "tenes tienes tiene contas cuentas cuenta con cual cuales es tu su sos estas se te que podes puedes puede "
  + "hay alguna algun vez"
).split(" "));
const MAX_PATTERN_WORDS = 8;
// Mismos caracteres que escapa re.escape de Python (sin espacios: las palabras no los tienen).
const PY_SPECIAL = "()[]{}?*+-|^$\\.&~#";

function wordPattern(word) {
  let out = "";
  for (const char of word) {
    if (ACCENT_CLASSES[char]) out += ACCENT_CLASSES[char];
    else out += PY_SPECIAL.includes(char) ? `\\${char}` : char;
  }
  return out;
}

/** Regex acotada para la pregunta (= pending_report.suggest_pattern). Ver fixtures/suggest_patterns.json. */
export function suggestPattern(question) {
  const stripped = String(question ?? "").trim().replace(/^[¿¡ ]+/, "").trim();
  const head = stripped.split(/[(?!,:;]/)[0];
  const words = head.toLowerCase().split(/\s+/).filter(Boolean);
  while (words.length > 2 && LEADING_FILLERS.has(normalizeWord(words[0]))) words.shift();
  return words.slice(0, MAX_PATTERN_WORDS).map(wordPattern).join(" ");
}

function normalizeWord(word) {
  return word.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

// ---------------------------------------------------------------- reglas aprendidas
/**
 * Regla nueva a partir de una respuesta elegida en la pestaña de aprendizaje. Sus literales son específicos:
 * id `aprendida:<questionKey>`, patrón sugerido, answer y, para radio/select, option (debe estar en options si se conocen).
 */
export function ruleFromAnswer({ question, kind, options = [], answer, option }) {
  const text = String(question ?? "").trim();
  if (!questionKey(text)) throw new Error("la pregunta no tiene palabras");
  const value = String(answer ?? "").trim();
  if (!value) throw new Error("falta la respuesta");
  const rule = { id: `aprendida:${questionKey(text)}`, pattern: suggestPattern(text), answer: value };
  if (CHOICE_KINDS.includes(kind)) {
    const opt = String(option ?? "").trim();
    if (!opt) throw new Error("elegí una de las opciones");
    if (options.length && !options.includes(opt)) throw new Error(`«${opt}» no está entre las opciones de la pregunta`);
    rule.option = opt;
  }
  return rule;
}

/** Las aprendidas van al principio (son literales); una regla con el mismo id se reemplaza. */
export function insertLearnedRules(rules, learned) {
  const ids = new Set(learned.map((r) => r.id));
  return [...learned, ...rules.filter((r) => !ids.has(r.id))];
}

// ---------------------------------------------------------------- validación de responses.json
/**
 * Mismos errores que main.parse_responses (el primero, como Python). `warnings`: patrones que no compilan en JS.
 * Limitación: no reproduce todos los errores de re.compile de Python; un patrón inválido solo en Python
 * puede pasar esta validación.
 */
export function validateResponses(data) {
  const warnings = [];
  if (!Array.isArray(data)) return { error: "responses.json debe ser una lista de reglas", warnings };
  for (let i = 0; i < data.length; i++) {
    const rule = data[i];
    const isObject = rule !== null && typeof rule === "object" && !Array.isArray(rule);
    if (!isObject || typeof rule.pattern !== "string" || typeof rule.answer !== "string") {
      return { error: `responses.json[${i}]: se esperan 'pattern' y 'answer' como textos`, warnings };
    }
    if ("option" in rule && typeof rule.option !== "string") {
      return { error: `responses.json[${i}].option debe ser un texto (opción de radio/select)`, warnings };
    }
    try {
      toJsRegExp(rule.pattern);
    } catch (err) {
      warnings.push(`responses.json[${i}].pattern no compila en JS: ${err.message}`);
    }
  }
  return { error: null, warnings };
}
