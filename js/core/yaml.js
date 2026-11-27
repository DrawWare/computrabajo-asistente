// Serializador YAML mínimo (6.4.4): solo lo que produce buildConfig (mapas, listas, escalares).
// Mapas y listas en bloque con indentación de 2; strings con JSON.stringify (YAML acepta ese escape);
// listas de escalares en línea solo si están vacías ([]). PyYAML lo lee igual que el JSON de origen.

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
// PyYAML (YAML 1.1) lee estas claves sin comillas como booleanos o null: siempre se entrecomillan.
const YAML11_WORDS = /^(y|yes|n|no|true|false|on|off|null)$/i;

function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`número no serializable: ${value}`);
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  throw new Error(`tipo no soportado en YAML: ${typeof value}`);
}

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isEmptyBlock = (v) => (Array.isArray(v) ? v.length === 0 : isMap(v) && Object.keys(v).length === 0);
const isBlock = (v) => (Array.isArray(v) || isMap(v)) && !isEmptyBlock(v);

function keyText(key) {
  return PLAIN_KEY.test(key) && !YAML11_WORDS.test(key) ? key : JSON.stringify(key);
}

function emit(value, indent) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return [`${pad}[]`];
    const lines = [];
    for (const item of value) {
      if (isBlock(item)) {
        const nested = emit(item, indent + 2);
        // La primera línea del bloque anidado pasa a ser el "- " de la lista.
        nested[0] = `${pad}- ${nested[0].slice(indent + 2)}`;
        lines.push(...nested);
      } else {
        lines.push(`${pad}- ${isEmptyBlock(item) ? (Array.isArray(item) ? "[]" : "{}") : scalar(item)}`);
      }
    }
    return lines;
  }
  if (isMap(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return [`${pad}{}`];
    const lines = [];
    for (const [key, v] of entries) {
      const k = keyText(key);
      if (isBlock(v)) {
        lines.push(`${pad}${k}:`, ...emit(v, indent + 2));
      } else if (isEmptyBlock(v)) {
        lines.push(`${pad}${k}: ${Array.isArray(v) ? "[]" : "{}"}`);
      } else {
        lines.push(`${pad}${k}: ${scalar(v)}`);
      }
    }
    return lines;
  }
  return [`${pad}${scalar(value)}`];
}

/** Objeto (JSON-compatible) => texto YAML terminado en salto de línea. */
export function toYaml(value) {
  return `${emit(value, 0).join("\n")}\n`;
}
