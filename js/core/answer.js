// Puerto de questions.py (6.4.3): cruce pregunta → respuesta. Sin salario (el sueldo del rol lo resuelve el
// bot; aquí no se usa). Módulo puro. Paridad verificada contra fixtures/expected_answers.cordoba_it.json.
import { normalize } from "./normalize.js";
import { isExcluded } from "./filters.js";
import { toJsRegExp } from "./regex.js";

const PLACEHOLDER_RE = /\[COMPLETAR[^\]]*\]/gi;
const STOPWORDS = new Set(["con", "sin", "los", "las", "del", "por", "para", "que", "tus", "sus", "muy", "una", "uno", "the", "and"]);

const RESIDENCE_TRIGGERS = ["residis", "vivis", "radicado", "radicada"];
const RESIDENCE_NEGATIONS = ["fuera", "afuera", "exterior", "extranjero", "lejos"];
const HOME_PLACES = ["cordoba"];
const HOME_COUNTRY = ["argentina"];
const OTHER_COUNTRIES = [
  "uruguay", "chile", "paraguay", "bolivia", "brasil", "peru", "colombia", "venezuela", "ecuador",
  "mexico", "costa rica", "panama", "guatemala", "republica dominicana", "espana", "estados unidos",
  "eeuu", "ee.uu.",
];
const OTHER_PLACES = [
  "santa fe", "buenos aires", "caba", "capital federal", "ciudad autonoma", "gba", "amba",
  "conurbano", "gran buenos aires", "la plata", "mar del plata", "bahia blanca", "quilmes", "lanus",
  "avellaneda", "moron", "tigre", "san isidro", "vicente lopez", "rosario", "rafaela", "reconquista",
  "mendoza", "tucuman", "salta", "jujuy", "neuquen", "rio negro", "chubut", "santa cruz",
  "tierra del fuego", "la pampa", "entre rios", "parana", "corrientes", "misiones", "posadas",
  "chaco", "resistencia", "formosa", "santiago del estero", "la rioja", "catamarca", "san juan",
  "san luis", "rio cuarto", "villa maria", "san francisco", "carlos paz", "villa allende",
];
const ALL_AR_PLACES = [...OTHER_PLACES, "cordoba"];
const LOCATION_TRIGGERS = [
  ...RESIDENCE_TRIGGERS, "donde vivis", "donde residis", "residencia", "domicilio", "localidad", "ubicacion",
  "ubicado", "ubicada",
];
const INTERIOR_OPTIONS = [
  ["interior", "interior del pais"],
  ["otra provincia", "otras provincias"],
  ["resto del pais", "resto de argentina", "resto de las provincias"],
];

/** Lugar de residencia: homePlaces = términos de la persona; otherPlaces = el resto. */
export const DEFAULT_HOME = { homePlaces: HOME_PLACES, otherPlaces: OTHER_PLACES };

/** Igual a questions.home_from_terms: otros lugares = los de ALL_AR_PLACES que no matchean los términos. */
export function homeFromTerms(homeTerms) {
  const home = [...homeTerms];
  return { homePlaces: home, otherPlaces: ALL_AR_PLACES.filter((p) => !isExcluded(p, null, home)) };
}

const loose = (text) => (normalize(text).match(/[a-z0-9]+/g) ?? []).join(" ");

function significantTokens(text) {
  return new Set(loose(text).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t)));
}

/** Placeholders sin completar ("[COMPLETAR_TELEFONO]") en answer u option (sin repetir). */
export function placeholders(rule) {
  const found = [...String(rule.answer ?? "").matchAll(PLACEHOLDER_RE), ...String(rule.option ?? "").matchAll(PLACEHOLDER_RE)]
    .map((m) => m[0]);
  return [...new Set(found)];
}

/** Primera regla (en orden) cuyo patrón matchea la pregunta; las reglas con placeholder se saltean. */
export function matchRule(questionText, rules) {
  if (!questionText) return null;
  for (const rule of rules) {
    if (placeholders(rule).length) continue;
    if (toJsRegExp(rule.pattern).test(questionText)) return rule;
  }
  return null;
}

/** "Sí" / "No" para una pregunta de residencia de sí/no, o null si no aplica o no es seguro. */
export function residenceYesNo(questionText, home = DEFAULT_HOME) {
  if (!questionText || !isExcluded(questionText, null, RESIDENCE_TRIGGERS)) return null;
  if (isExcluded(questionText, null, RESIDENCE_NEGATIONS)) return null;
  const inHome = isExcluded(questionText, null, home.homePlaces);
  const inArgentina = isExcluded(questionText, null, HOME_COUNTRY);
  const otherPlace = isExcluded(questionText, null, home.otherPlaces);
  const otherCountry = isExcluded(questionText, null, OTHER_COUNTRIES);
  if (inHome) return otherPlace || otherCountry ? null : "Sí";
  if (otherPlace) return "No";
  if (otherCountry) return inArgentina ? null : "No";
  return inArgentina ? "Sí" : null;
}

/** Opción de un radio/select de ubicación por lugar, o null si no aplica o no es seguro. */
export function locationOption(questionText, options, home = DEFAULT_HOME) {
  if (!questionText || !options.length || !isExcluded(questionText, null, LOCATION_TRIGGERS)) return null;
  if (isExcluded(questionText, null, RESIDENCE_NEGATIONS)) return null;
  if ([home.homePlaces, home.otherPlaces, OTHER_COUNTRIES].some((places) => isExcluded(questionText, null, places))) {
    return null;
  }

  const cordoba = options.filter((o) => isExcluded(o, null, home.homePlaces));
  if (cordoba.length === 1) return cordoba[0];
  if (cordoba.length) {
    const capital = cordoba.filter((o) => isExcluded(o, null, ["capital"]));
    return capital.length === 1 ? capital[0] : null;
  }

  const elsewhere = [...home.otherPlaces, ...OTHER_COUNTRIES, ...RESIDENCE_NEGATIONS];
  for (const terms of INTERIOR_OPTIONS) {
    const found = options.filter((o) => isExcluded(o, null, terms) && !isExcluded(o, null, elsewhere));
    if (found.length === 1) return found[0];
    if (found.length) return null;
  }
  return null;
}

/** Elige la opción de select/radio que corresponde a answer, o null si no hay una segura (4 criterios). */
export function pickOption(answer, options, pattern = null) {
  if (!answer || !options.length) return null;
  const wanted = loose(answer);
  if (!wanted) return null;

  // 1) igualdad normalizada
  for (const option of options) if (loose(option) === wanted) return option;

  // 2) contención por palabras completas; gana la más larga
  const paddedWanted = ` ${wanted} `;
  const contained = options.filter((option) => {
    const candidate = loose(option);
    return candidate && (paddedWanted.includes(` ${candidate} `) || ` ${candidate} `.includes(paddedWanted));
  });
  if (contained.length) {
    // max() de Python devuelve la primera de las más largas.
    return contained.reduce((best, o) => (loose(o).length > loose(best).length ? o : best));
  }

  // 3) regex de la regla aplicada a las opciones
  if (pattern) {
    const re = toJsRegExp(pattern);
    for (const option of options) if (re.test(option)) return option;
  }

  // 4) solapamiento de tokens significativos; empate => null
  const wantedTokens = significantTokens(answer);
  let best = null;
  let bestScore = 0;
  let ambiguous = false;
  for (const option of options) {
    const tokens = significantTokens(option);
    const score = [...wantedTokens].filter((t) => tokens.has(t)).length;
    if (score > bestScore) {
      best = option;
      bestScore = score;
      ambiguous = false;
    } else if (score === bestScore && score > 0) {
      ambiguous = true;
    }
  }
  return best === null || ambiguous ? null : best;
}

/**
 * Respuesta para una pregunta, o null (pendiente). Sin salario (igual a resolve_answer con salary=None).
 * - Texto (sin options): answer de la primera regla que matchea.
 * - Opciones: sí/no de residencia, ubicación por lugar, o option/answer de la regla elegida por pickOption.
 */
export function resolveAnswer(questionText, responses, options = [], { home = DEFAULT_HOME } = {}) {
  if (!options.length) {
    const rule = matchRule(questionText, responses);
    return rule === null ? null : rule.answer;
  }
  const yesNo = residenceYesNo(questionText, home);
  if (yesNo !== null) return pickOption(yesNo, options);
  const place = locationOption(questionText, options, home);
  if (place !== null) return place;
  const rule = matchRule(questionText, responses);
  if (rule === null) return null;
  return pickOption(rule.option || rule.answer, options);
}
