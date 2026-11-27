// Espejo de filters.normalize, dedupe.question_key y profiles.slugify (Python). Módulo puro.

/** Minúsculas, sin marcas diacríticas y con espacios colapsados (igual a filters.normalize). */
export function normalize(text) {
  const decomposed = String(text ?? "").normalize("NFKD");
  const stripped = decomposed.replace(/\p{M}/gu, "");
  return stripped.toLowerCase().trim().split(/\s+/).filter(Boolean).join(" ");
}

/** Clave para comparar preguntas: solo palabras a-z0-9 (igual a dedupe.question_key). */
export function questionKey(text) {
  return (normalize(text || "").match(/[a-z0-9]+/g) || []).join(" ");
}

const SLUG_MAX_LEN = 32;

/** 'María José Gómez' -> 'maria-jose-gomez' (igual a profiles.slugify). */
export function slugify(text) {
  const decomposed = String(text || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const slug = decomposed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, SLUG_MAX_LEN).replace(/-+$/, "");
}
