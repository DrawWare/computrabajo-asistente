// Builder de perfil: espejo de computrabajo_bot/profile_builder.py (6.3.2). Módulo puro, sin I/O.
// Mismas reglas, mismo orden de listas y mismo resultado (paridad verificada con fixtures/).
import { normalize, slugify } from "./normalize.js";
import { isExcluded } from "./filters.js";
import { grossFromNet, partTimePreview } from "./salary.js";

export { grossFromNet, partTimePreview };

export const BASE_URL = "https://ar.computrabajo.com";
const MODALITY_ORDER = ["remoto", "hibrido", "presencial"];
const PART_TIME_FACTOR = 0.65;
const CHOICE_SOURCES = {
  english_level: "skills.english_level",
  portuguese_advanced: "skills.portuguese_advanced",
  office_level: "skills.office_level",
  has_vehicle: "skills.has_vehicle",
  has_license: "skills.has_license",
  cv_in_english: "skills.cv_in_english",
  schedule: "availability.schedule",
  shifts_weekends: "availability.shifts_weekends",
  immediate: "availability.immediate",
};
const VAR_RE = /\{\{([A-Za-z_.]+)\}\}/g;

const has = (obj, key) => obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
const isNone = (v) => v === null || v === undefined;

/** Espejo de _get: ruta con puntos; null si falta. */
export function getPath(obj, path) {
  let cur = obj;
  for (const part of path.split(".")) {
    if (isNone(cur) || typeof cur !== "object" || Array.isArray(cur) || !has(cur, part)) return null;
    cur = cur[part];
  }
  return isNone(cur) ? null : cur;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalize(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function without(items, removes) {
  const drop = new Set(removes.map(normalize));
  return items.filter((item) => !drop.has(normalize(item)));
}

function roleEntries(answers) {
  const map = new Map();
  for (const r of answers.roles ?? []) map.set(`${r.preset_id}\u0000${r.role_id}`, r);
  return map;
}

function enabledRoles(answers, data) {
  const entries = roleEntries(answers);
  const out = [];
  for (const pid of answers.presets ?? []) {
    if (!has(data.rubros, pid)) throw new Error(`preset desconocido: ${pid}`);
    for (const role of data.rubros[pid].roles) {
      const entry = entries.get(`${pid}\u0000${role.id}`);
      const enabled = entry && has(entry, "enabled") ? entry.enabled : role.default_enabled;
      if (enabled) out.push([pid, role]);
    }
  }
  return out;
}

function geoLookup(answers, data) {
  const loc = answers.location ?? {};
  const prov = data.geo.provinces.find((p) => p.id === loc.province_id) ?? null;
  const city = prov ? prov.cities.find((c) => c.id === loc.city_id) ?? null : null;
  return [prov, city];
}

function joinOr(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} o ${parts[parts.length - 1]}`;
}

function placeholder(path) {
  return `[COMPLETAR_${path.replaceAll(".", "_").toUpperCase()}]`;
}

/** Grupos activos en orden de global.json (switches > locked > group_defaults > default_from/default). */
export function activeGroups(answers, data) {
  const switches = getPath(answers, "filters.switches") ?? {};
  const presetLocked = new Set();
  const presetDefaults = {};
  for (const pid of answers.presets ?? []) {
    for (const g of data.rubros[pid].locked_groups ?? []) presetLocked.add(g);
    Object.assign(presetDefaults, data.rubros[pid].group_defaults ?? {});
  }
  const out = [];
  for (const group of data.globalData.groups) {
    const gid = group.id;
    let on;
    if (has(switches, gid)) {
      on = Boolean(switches[gid]);
    } else if (group.locked || presetLocked.has(gid)) {
      on = true;
    } else if (has(presetDefaults, gid)) {
      on = Boolean(presetDefaults[gid]);
    } else if (has(group, "default_from")) {
      const src = group.default_from;
      const value = Boolean(getPath(answers, src.path));
      on = src.negate ? !value : value;
    } else {
      on = Boolean(group.default ?? false);
    }
    if (on) out.push(group);
  }
  return out;
}

/** Igual que mergeKeywords, más las exclusiones que quitó "positivos ganan" (solo para la vista previa). */
export function mergeKeywordsDetailed(answers, data) {
  const kw = answers.keywords ?? {};
  const presets = answers.presets ?? [];

  let positives = enabledRoles(answers, data).flatMap(([, role]) => role.keywords);
  positives = positives.concat(presets.flatMap((pid) => data.rubros[pid].required_title_extra ?? []));
  positives = positives.concat(kw.required_add ?? []);
  positives = dedupe(positives);
  const required = without(positives, kw.required_remove ?? []);

  const groups = activeGroups(answers, data);
  const minYears = getPath(answers, "filters.min_years_block");
  const homeTerms = (answers.location ?? {}).home_terms ?? [];

  let title = [];
  for (const g of groups) title = title.concat(g.title ?? []);
  for (const pid of presets) {
    for (const setName of data.rubros[pid].exclude_title_sets ?? []) {
      title = title.concat(data.globalData.sets[setName]);
    }
    title = title.concat(data.rubros[pid].exclude_title_keywords ?? []);
  }
  title = title.concat(kw.exclude_title_add ?? []);
  title = without(dedupe(title), kw.exclude_title_remove ?? []);
  // Positivos ganan: se quita de la exclusión toda keyword que se solape con un positivo.
  const beforePositives = title;
  title = title.filter(
    (k) => !positives.some((p) => isExcluded(p, null, [k]) !== null || isExcluded(k, null, [p]) !== null),
  );
  const droppedByPositives = beforePositives.filter((k) => !title.includes(k));

  let desc = [];
  for (const g of groups) {
    desc = desc.concat(g.desc ?? []);
    if (g.id === "anios_minimos" && !isNone(minYears)) {
      for (let n = Number(minYears); n <= Number(g.max_years); n++) {
        desc = desc.concat(g.desc_templates.map((t) => t.replaceAll("{n}", String(n))));
        if (n >= g.plain_from) desc.push(`${n} años de experiencia`);
      }
    }
    if (g.id === "residir_en_otra_ciudad") {
      const home = new Set(homeTerms.map(normalize));
      desc = desc.concat(g.residir_places.filter((p) => !home.has(normalize(p))).map((p) => `residir en ${p}`));
    }
  }
  for (const pid of presets) desc = desc.concat(data.rubros[pid].exclude_desc_keywords ?? []);
  const level = getPath(answers, "skills.english_level");
  desc = desc.concat(data.choices.english_level[level]?.exclude_desc ?? []);
  const pt = getPath(answers, "skills.portuguese_advanced");
  if (!isNone(pt)) {
    desc = desc.concat(data.choices.portuguese_advanced[String(Boolean(pt)).toLowerCase()].exclude_desc);
  }
  desc = desc.concat(kw.exclude_desc_add ?? []);
  desc = without(dedupe(desc), kw.exclude_desc_remove ?? []);

  return { required, exclude_title: title, exclude_desc: desc, dropped_by_positives: droppedByPositives };
}

/** {required, exclude_title, exclude_desc} (espejo de merge_keywords). */
export function mergeKeywords(answers, data) {
  const { required, exclude_title, exclude_desc } = mergeKeywordsDetailed(answers, data);
  return { required, exclude_title, exclude_desc };
}

export function buildCategories(answers, data) {
  let cats = [];
  for (const pid of answers.presets ?? []) cats = cats.concat(data.rubros[pid].search_categories);
  cats = cats.concat(answers.extra_categories ?? []);
  return [...new Set(cats)];
}

/** URLs en el orden exacto de 6.2.3 (remoto; presencial/híbrido en ciudad; híbrido en provincia). */
export function buildSearches(answers, data) {
  const modalities = answers.location.modalities;
  const junior = Boolean(getPath(answers, "filters.seeking_junior"));
  const cats = buildCategories(answers, data);
  const [prov, city] = geoLookup(answers, data);
  const paths = [];

  if (modalities.includes("remoto")) {
    paths.push(["/empleos-en-remoto", "Remoto — todas las categorías"]);
    for (const c of cats) paths.push([`/empleos-de-${c}-en-remoto`, `Remoto — ${c}`]);
  }
  if ((modalities.includes("presencial") || modalities.includes("hibrido")) && prov && city) {
    const p = prov.ct_slug;
    const ci = city.ct_slug;
    const base = `/empleos-en-${p}-en-${ci}`;
    paths.push([base, `${city.label} — todas las categorías`]);
    if (junior) {
      paths.push([`${base}-sin-experiencia`, `${city.label} — sin experiencia`]);
      paths.push([`${base}?iex=4`, `${city.label} — 1 año`]);
      paths.push([`${base}?iex=5`, `${city.label} — 2 años`]);
    }
    for (const c of cats) paths.push([`/empleos-de-${c}-en-${p}-en-${ci}`, `${city.label} — ${c}`]);
  }
  if (modalities.includes("hibrido") && prov) {
    const p = prov.ct_slug;
    paths.push([`/empleos-en-${p}-hibrido`, `${prov.label} híbrido — todas las categorías`]);
    if (junior) paths.push([`/empleos-en-${p}-hibrido?iex=4`, `${prov.label} híbrido — 1 año`]);
    for (const c of cats) paths.push([`/empleos-de-${c}-en-${p}-hibrido`, `${prov.label} híbrido — ${c}`]);
  }

  const seen = new Set();
  const out = [];
  for (const [path, label] of paths) {
    const url = BASE_URL + path;
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ url, enabled: true, label });
    }
  }
  return out;
}

/** Una regla por rol habilitado. Sueldo siempre por D12. */
export function buildCvRules(answers, data) {
  const entries = roleEntries(answers);
  const rules = [];
  for (const [pid, role] of enabledRoles(answers, data)) {
    const entry = entries.get(`${pid}\u0000${role.id}`) ?? {};
    const label = entry.cv_label || placeholder(`cv_rules.${role.id}.cv_label`);
    const net = has(entry, "salary_net") ? entry.salary_net : (role.salary_net_suggested ?? null);
    const rule = { keywords: [...role.keywords], cv_label: label };
    if (!isNone(net)) {
      rule.salary_net = Math.trunc(net);
      rule.salary_gross = grossFromNet(net);
    }
    rules.push(rule);
  }
  return rules;
}

export function deriveVars(answers, data) {
  const [prov, city] = geoLookup(answers, data);
  const loc = answers.location ?? {};
  const cityLabel = city ? city.label : (loc.city_other || placeholder("derived.city_label"));
  const parts = [];
  for (const m of MODALITY_ORDER) {
    if (!(loc.modalities ?? []).includes(m)) continue;
    if (m === "remoto") {
      parts.push("modalidad 100% remota");
    } else if (m === "hibrido") {
      parts.push(`híbrida en ${cityLabel}`);
    } else {
      const zones = loc.presencial_zone_terms && loc.presencial_zone_terms.length ? loc.zones_label : null;
      parts.push(zones ? `presencial en ${zones} de ${cityLabel}` : `presencial en ${cityLabel}`);
    }
  }
  const nets = [];
  const entries = roleEntries(answers);
  for (const [pid, role] of enabledRoles(answers, data)) {
    const entry = entries.get(`${pid}\u0000${role.id}`) ?? {};
    const net = has(entry, "salary_net") ? entry.salary_net : (role.salary_net_suggested ?? null);
    if (!isNone(net)) nets.push(Math.trunc(net));
  }
  const personal = answers.personal ?? {};
  return {
    city_label: cityLabel,
    modalities_text: joinOr(parts),
    salary_fallback_net: nets.length ? String(Math.min(...nets)) : placeholder("derived.salary_fallback_net"),
    slug: slugify(`${personal.first_name ?? ""} ${personal.last_name ?? ""}`),
  };
}

function lookup(path, answers, derived, choices) {
  const dot = path.indexOf(".");
  const root = dot < 0 ? path : path.slice(0, dot);
  const rest = dot < 0 ? "" : path.slice(dot + 1);
  if (root === "derived") return isNone(derived[rest]) ? null : derived[rest];
  if (root === "choice") {
    const d2 = rest.indexOf(".");
    const table = d2 < 0 ? rest : rest.slice(0, d2);
    const field = d2 < 0 ? "" : rest.slice(d2 + 1);
    const raw = getPath(answers, CHOICE_SOURCES[table] ?? "");
    if (isNone(raw)) return null;
    const key = typeof raw === "boolean" ? String(raw).toLowerCase() : String(raw);
    const entry = choices[table]?.[key];
    return isNone(entry) ? null : (isNone(entry[field]) ? null : entry[field]);
  }
  return getPath(answers, path);
}

function render(text, answers, derived, choices) {
  return text.replace(VAR_RE, (_m, path) => {
    const value = lookup(path, answers, derived, choices);
    if (isNone(value) || value === "") return placeholder(path);
    return String(value);
  });
}

function whenOk(when, answers) {
  if (isNone(when)) return true;
  if (has(when, "not")) return !whenOk(when.not, answers);
  const value = getPath(answers, when.path);
  if (has(when, "equals")) return value === when.equals;
  if (has(when, "includes")) return Array.isArray(value) && value.includes(when.includes);
  throw new Error(`condición 'when' no soportada: ${JSON.stringify(when)}`);
}

function experienceRules(answers, data) {
  const presets = [...(answers.presets ?? [])].sort(
    (a, b) => data.rubros[a].experience_priority - data.rubros[b].experience_priority,
  );
  return presets.map((pid) => ({
    id: `experiencia:${pid}`,
    pattern: `experiencia.*(${data.rubros[pid].experience_terms.join("|")})`,
    answer: `{{skills.experience_by_preset.${pid}}}`,
  }));
}

/** responses.json generado (S2), en el orden de la plantilla S8. */
export function renderResponses(answers, data) {
  const derived = deriveVars(answers, data);
  const rules = [];
  for (const entry of data.template) {
    if (has(entry, "insert")) {
      if (entry.insert !== "experience_rules") throw new Error(`insert desconocido: ${entry.insert}`);
      for (const rule of experienceRules(answers, data)) {
        rule.answer = render(rule.answer, answers, derived, data.choices);
        rules.push(rule);
      }
      continue;
    }
    if (!whenOk(entry.when ?? null, answers)) continue;
    const rule = { id: entry.id, pattern: entry.pattern, answer: render(entry.answer, answers, derived, data.choices) };
    if (has(entry, "option")) rule.option = render(entry.option, answers, derived, data.choices);
    rules.push(rule);
  }
  return rules;
}

/** config.yaml v2 (S1) como objeto. */
export function buildConfig(answers, data) {
  const derived = deriveVars(answers, data);
  const kw = mergeKeywords(answers, data);
  const loc = answers.location;
  const [prov, city] = geoLookup(answers, data);
  const config = {
    schema_version: 2,
    profile_name: derived.slug,
    searches: buildSearches(answers, data),
    daily_limit: answers.filters.daily_limit,
    delays: { min: 4, max: 12 },
    max_pages: 3,
    exclude_title_keywords: kw.exclude_title,
    required_title_keywords: kw.required,
    exclude_desc_keywords: kw.exclude_desc,
    cv_rules: buildCvRules(answers, data),
    salary_part_time_factor: PART_TIME_FACTOR,
    default_cv_label: null,
    captcha_timeout: 180,
    page_timeout: 30,
    location: {
      province: prov ? prov.label : "",
      city: city ? city.label : (loc.city_other ?? ""),
      home_terms: [...loc.home_terms],
      presencial_zone_terms: [...(loc.presencial_zone_terms ?? [])],
      modalities: [...loc.modalities],
    },
  };
  const level = getPath(answers, "skills.english_level");
  const block = data.choices.english_level[level]?.block_terms;
  if (!isNone(block)) config.english_block_terms = [...block];
  return config;
}

/** profile.json del bundle (S10). */
export function buildProfileJson(answers, data, nowIso) {
  return {
    bundle_version: 1,
    slug: deriveVars(answers, data).slug,
    created_at: nowIso,
    generator: "wizard-web/1",
    answers: { ...answers },
  };
}
