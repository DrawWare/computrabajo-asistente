// Subconjunto común de regex (D8). Espejo de la validación usada en presets y responses.

const FORBIDDEN = ["(?P<", "(?i)", "(?x)", "(?#", "\\A", "\\Z", "*+", "++", "?+"];

export function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convierte un patrón D8 en RegExp de JS. "(?s)" inicial => flags "is"; si no => "i". */
export function toJsRegExp(pattern) {
  for (const bad of FORBIDDEN) {
    if (pattern.includes(bad)) {
      throw new Error(`constructo no soportado en D8: ${bad} en ${pattern}`);
    }
  }
  let body = pattern;
  let flags = "i";
  if (body.startsWith("(?s)")) {
    body = body.slice(4);
    flags = "is";
  }
  if (body.includes("(?s)")) {
    throw new Error(`(?s) solo puede ir al inicio: ${pattern}`);
  }
  return new RegExp(body, flags);
}
