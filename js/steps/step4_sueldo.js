// Paso 4 (6.4.2): pretensión neta por rol, switches de filtros, años mínimos, Jr/Trainee y límite diario.
// Las funciones puras (filas, validación, switches) se testean en Node; renderStep4 solo toca el DOM.
import { registerStepRule } from "../core/validate.js";
import { activeGroups } from "../core/builder.js";
import { grossFromNet, partTimePreview, formatArs } from "../core/salary.js";
import { cvRoles } from "./step3_cvs.js";

export const SALARY_MIN = 100000;
export const SALARY_MAX = 50000000;
export const YEARS_MIN = 2;
export const YEARS_MAX = 5;
export const DAILY_MIN = 1;
export const DAILY_MAX = 25;
export const PART_TIME_NOTE = "el part-time lo calcula el bot (×0,65)";

/** "1.250.000" -> 1250000; vacío o sin dígitos -> null. */
export function parseMoney(text) {
  const digits = String(text ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** 1250000 -> "1.250.000"; null -> "". */
export function formatThousands(n) {
  if (n === null || n === undefined || n === "") return "";
  return String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Bruto (jornada completa) y part-time (vista previa) de un neto. Null si el neto no es válido. */
export function salaryPreview(net) {
  if (!Number.isInteger(net) || net < SALARY_MIN || net > SALARY_MAX) return { gross: null, partTime: null };
  return { gross: grossFromNet(net), partTime: partTimePreview(net) };
}

/**
 * Una fila por rol habilitado. net = salary_net guardado; si nunca se guardó, la sugerencia del preset.
 * (Mismo criterio que buildCvRules.)
 */
export function salaryRows(answers, data) {
  return cvRoles(answers, data)
    .filter((r) => r.enabled)
    .map((r) => {
      const role = data.rubros[r.preset_id].roles.find((x) => x.id === r.role_id);
      const suggested = role.salary_net_suggested ?? null;
      const net = r.entry && "salary_net" in r.entry ? r.entry.salary_net : suggested;
      return { ...r, net, suggested, source: role.salary_source ?? null, hint: role.salary_hint ?? null };
    });
}

/** Roles con salary_net guardado (sugerencia o null) para los habilitados que aún no lo tienen. Pura. */
export function syncSalaries(answers, data) {
  const suggestions = new Map(
    salaryRows(answers, data).map((r) => [`${r.preset_id}\u0000${r.role_id}`, r.suggested]),
  );
  return (answers.roles ?? []).map((entry) => {
    const key = `${entry.preset_id}\u0000${entry.role_id}`;
    if (!suggestions.has(key) || "salary_net" in entry) return entry;
    return { ...entry, salary_net: suggestions.get(key) };
  });
}

/** Validación de filtros rápidos (años mínimos y límite diario). Claves filters.<campo>. */
export function validateFiltros(answers) {
  const errors = {};
  const f = answers.filters ?? {};
  const years = f.min_years_block;
  if (years !== null && years !== undefined && !(Number.isInteger(years) && years >= YEARS_MIN && years <= YEARS_MAX)) {
    errors["filters.min_years_block"] = `Años de experiencia: entre ${YEARS_MIN} y ${YEARS_MAX}, o vacío para no filtrar por años.`;
  }
  const daily = f.daily_limit;
  if (!(Number.isInteger(daily) && daily >= DAILY_MIN && daily <= DAILY_MAX)) {
    errors["filters.daily_limit"] = `Límite diario: un número entre ${DAILY_MIN} y ${DAILY_MAX}.`;
  }
  return errors;
}

/** Validación del paso 4: neto entero entre 100.000 y 50.000.000 por rol habilitado, más filtros. */
export function validateSueldo(answers, data) {
  const errors = {};
  for (const row of salaryRows(answers, data)) {
    const key = `sueldo.${row.preset_id}.${row.role_id}`;
    if (!Number.isInteger(row.net)) {
      errors[key] = `${row.label}: escribí el sueldo neto mensual (solo números).`;
    } else if (row.net < SALARY_MIN || row.net > SALARY_MAX) {
      errors[key] = `${row.label}: el neto tiene que estar entre ${formatThousands(SALARY_MIN)} y ${formatThousands(SALARY_MAX)}.`;
    }
  }
  return { ...errors, ...validateFiltros(answers) };
}

/**
 * Switches de global.json con su estado efectivo (mismo orden que activeGroups:
 * elección explícita > fijo > según rubro > calculado > por defecto).
 */
export function switchRows(answers, data) {
  const explicit = answers.filters?.switches ?? {};
  const presetLocked = new Set();
  const presetDefaults = new Set();
  for (const pid of answers.presets ?? []) {
    for (const g of data.rubros[pid].locked_groups ?? []) presetLocked.add(g);
    for (const g of Object.keys(data.rubros[pid].group_defaults ?? {})) presetDefaults.add(g);
  }
  const active = new Set(activeGroups(answers, data).map((g) => g.id));
  return data.globalData.groups.map((g) => {
    const fixed = Boolean(g.locked) || presetLocked.has(g.id);
    let source;
    if (Object.prototype.hasOwnProperty.call(explicit, g.id)) source = "elegido por vos";
    else if (fixed) source = "fijo para tu búsqueda";
    else if (presetDefaults.has(g.id)) source = "según el rubro";
    else if (g.default_from) source = "calculado de tus respuestas de los pasos 1 y 5 (podés cambiarlo)";
    else source = "valor por defecto";
    return {
      id: g.id, label: g.label, on: active.has(g.id), disabled: fixed, source,
      note: g.note ?? null, important: Boolean(g.important),
    };
  });
}

registerStepRule("sueldo", validateSueldo);

// ---------------------------------------------------------------- DOM

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

/**
 * Pinta el paso 4 en root. ctx: {store, data, refresh}. Devuelve {markErrors(errors)}.
 * Los campos no se vuelven a pintar al editar (no pierden el foco): solo se actualiza el store.
 */
export function renderStep4(root, { store, data }) {
  const ans = () => store.getState().answers;

  const synced = syncSalaries(ans(), data);
  if (JSON.stringify(synced) !== JSON.stringify(ans().roles ?? [])) store.setIn("roles", synced);

  const errorNodes = new Map();
  const errorFor = (key) => {
    const node = el("p", { class: "field-error", "data-err": key, "aria-live": "polite" });
    errorNodes.set(key, node);
    return node;
  };

  // ---- Pretensión por rol
  const salaryWrap = el("div", { class: "cards" });
  const rows = salaryRows(ans(), data);
  if (!rows.length) {
    salaryWrap.append(el("p", { text: "No hay roles habilitados: volvé al paso 3." }));
  }
  for (const row of rows) {
    const key = `sueldo.${row.preset_id}.${row.role_id}`;
    const id = `sal-${row.preset_id}-${row.role_id}`;
    const input = el("input", { type: "text", inputmode: "numeric", id, autocomplete: "off" });
    input.value = formatThousands(row.net);
    const gross = el("output", { id: `${id}-gross` });
    const part = el("output", { id: `${id}-part` });
    const paintOutputs = (net) => {
      const p = salaryPreview(net);
      gross.textContent = p.gross === null ? "—" : formatArs(p.gross);
      part.textContent = p.partTime === null ? "—" : formatArs(p.partTime);
    };
    paintOutputs(row.net);
    input.addEventListener("input", () => {
      const net = parseMoney(input.value);
      const roles = ans().roles.map((r) =>
        r.preset_id === row.preset_id && r.role_id === row.role_id ? { ...r, salary_net: net } : r,
      );
      store.setIn("roles", roles);
      paintOutputs(net);
    });
    input.addEventListener("change", () => {
      input.value = formatThousands(parseMoney(input.value));
    });

    let hintText;
    if (row.source) hintText = `Referencia: ${row.source}.`;
    else if (row.hint) hintText = `Sin referencia calibrada. Pista: ${row.hint}`;
    else hintText = "Sin referencia: escribí tu pretensión.";

    salaryWrap.append(el("article", { class: "card" }, [
      el("div", { class: "field" }, [
        el("label", { for: id, text: `Sueldo neto mensual, jornada completa: ${row.label}` }),
        input,
        el("p", { class: "muted", text: hintText }),
      ]),
      el("p", {}, [document.createTextNode("Bruto calculado: "), gross]),
      el("p", {}, [document.createTextNode(`Part-time (vista previa; ${PART_TIME_NOTE}): `), part]),
      errorFor(key),
    ]));
  }

  // ---- Filtros rápidos
  const switchList = el("fieldset", { class: "field" }, [el("legend", { text: "Excluir avisos con…" })]);
  for (const sw of switchRows(ans(), data)) {
    const id = `sw-${sw.id}`;
    const cb = el("input", { type: "checkbox", id });
    cb.checked = sw.on;
    cb.disabled = sw.disabled;
    const src = el("span", { class: "muted", text: ` (${sw.source})` });
    cb.addEventListener("change", () => {
      store.setIn(`filters.switches.${sw.id}`, cb.checked);
      src.textContent = " (elegido por vos)";
    });
    const row = el("label", { class: "option", for: id }, [cb, document.createTextNode(` ${sw.label}`), src]);
    const card = el("div", { class: sw.important ? "switch-card important" : "switch-card" }, [row]);
    if (sw.note) {
      const noteId = `${id}-note`;
      cb.setAttribute("aria-describedby", noteId);
      card.append(el("p", { class: "switch-note", id: noteId, text: sw.note }));
    }
    switchList.append(card);
  }

  const yearsInput = el("input", { type: "number", min: YEARS_MIN, max: YEARS_MAX, step: 1, id: "min-years", inputmode: "numeric" });
  yearsInput.value = ans().filters?.min_years_block ?? "";
  yearsInput.addEventListener("input", () => {
    store.setIn("filters.min_years_block", yearsInput.value === "" ? null : Number(yearsInput.value));
  });

  const junior = el("input", { type: "checkbox", id: "seeking-junior" });
  junior.checked = Boolean(ans().filters?.seeking_junior);
  junior.addEventListener("change", () => store.setIn("filters.seeking_junior", junior.checked));

  const dailyInput = el("input", { type: "number", min: DAILY_MIN, max: DAILY_MAX, step: 1, id: "daily-limit", inputmode: "numeric" });
  dailyInput.value = ans().filters?.daily_limit ?? "";
  dailyInput.addEventListener("input", () => {
    store.setIn("filters.daily_limit", dailyInput.value === "" ? null : Number(dailyInput.value));
  });

  root.replaceChildren(
    el("h2", { text: "4. Pretensión y filtros rápidos" }),
    el("h3", { text: "Pretensión" }),
    el("p", { class: "muted", text: "Sueldo neto mensual por rol, a jornada completa. Podés dejar la sugerencia o cambiarla." }),
    salaryWrap,
    el("h3", { text: "Filtros" }),
    switchList,
    el("div", { class: "field" }, [
      el("label", { for: "min-years", text: `Años de experiencia mínimos que pidan los avisos para excluirlos (${YEARS_MIN} a ${YEARS_MAX}; vacío = no filtrar)` }),
      yearsInput,
      errorFor("filters.min_years_block"),
    ]),
    el("div", { class: "field" }, [
      el("label", { class: "option", for: "seeking-junior" }, [junior, document.createTextNode(" Busco puestos Jr / Trainee")]),
    ]),
    el("div", { class: "field" }, [
      el("label", { for: "daily-limit", text: `Postulaciones por día (${DAILY_MIN} a ${DAILY_MAX})` }),
      dailyInput,
      errorFor("filters.daily_limit"),
    ]),
  );

  return {
    markErrors(errors) {
      for (const [key, node] of errorNodes) node.textContent = errors[key] ?? "";
    },
  };
}
