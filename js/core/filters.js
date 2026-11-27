// Espejo de filters.is_excluded (Python). Módulo puro.
import { normalize } from "./normalize.js";
import { escapeRegex } from "./regex.js";

/** Devuelve la keyword que excluye el aviso (tal como viene en la lista), o null. */
export function isExcluded(title, description, keywords) {
  const haystack = normalize(`${title ?? ""} ${description ?? ""}`);
  for (const keyword of keywords) {
    if (!keyword || !String(keyword).trim()) continue;
    const pattern = new RegExp(`(?<!\\w)${escapeRegex(normalize(keyword))}(?!\\w)`);
    if (pattern.test(haystack)) return keyword;
  }
  return null;
}
