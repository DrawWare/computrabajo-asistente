// Paso 1: datos personales y ubicación. validatePersonal es pura (testeable en Node);
// renderStep1 solo toca el DOM dentro de la función (el módulo se puede importar sin navegador).
import { registerStepRule } from "../core/validate.js";
import { createChips } from "../ui/chips.js";
import { normalize } from "../core/normalize.js";

/** Términos de residencia sugeridos para una localidad (presets/geo_ar.json). [] si no hay localidad conocida. */
export function suggestedHomeTerms(data, provinceId, cityId) {
  const prov = data.geo.provinces.find((p) => p.id === provinceId);
  const city = prov?.cities.find((c) => c.id === cityId);
  return city ? [...city.terms] : [];
}

const termSet = (terms) => [...new Set((terms ?? []).map(normalize))].sort();

/** true si dos listas de términos son iguales para el bot (sin tildes, mayúsculas ni orden). */
export function sameTerms(a, b) {
  const x = termSet(a);
  const y = termSet(b);
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

/**
 * Términos al cambiar de localidad: la sugerencia nueva reemplaza la lista solo si el usuario no la personalizó
 * (vacía o igual a la sugerencia anterior). Si la personalizó, se conserva.
 */
export function nextHomeTerms(current, previousSuggested, newSuggested) {
  const cur = current ?? [];
  if (!newSuggested?.length) return [...cur];
  if (!cur.length || sameTerms(cur, previousSuggested)) return [...newSuggested];
  return [...cur];
}

export const HOME_TERMS_HELP = {
  purpose: "Sirven para dos cosas: filtrar avisos presenciales o híbridos fuera de tu zona y responder las preguntas de residencia (\"¿Dónde vivís?\", \"¿Residís en…?\").",
  examples: [
    ["Córdoba Capital", "cordoba, cordoba capital"],
    ["Rosario / Santa Fe", "rosario, santa fe"],
    ["CABA / AMBA", "caba, capital federal, buenos aires, amba"],
  ],
  howto: "Escribí un término y apretá Enter para convertirlo en etiqueta. Con uno solo alcanza para avanzar, pero conviene sumar los nombres con que aparece tu zona en los avisos. No hace falta repetir con y sin tilde: el bot los trata igual.",
};

export const MODALITIES = [["remoto", "Remoto"], ["hibrido", "Híbrido"], ["presencial", "Presencial"]];
const SCHEDULES = [["full_time", "Full time"], ["part_time", "Part time"], ["ambos", "Ambos"]];
const YES_NO_FIELDS = [
  ["availability.shifts_weekends", "¿Tenés disponibilidad para turnos rotativos y fines de semana?"],
  ["availability.immediate", "¿Podés incorporarte de inmediato?"],
  ["availability.travel", "¿Podés viajar por trabajo?"],
  ["availability.relocate", "¿Podés mudarte por trabajo?"],
];
const OTHER_CITY = "__otra__";

/** Validación del paso 1 (espejo de la sección "Validación paso 1" de 6.3.3). */
export function validatePersonal(answers) {
  const errors = {};
  const p = answers.personal ?? {};
  const loc = answers.location ?? {};
  const av = answers.availability ?? {};

  if (!String(p.first_name ?? "").trim()) errors["personal.first_name"] = "Escribí tu nombre.";
  if (!String(p.last_name ?? "").trim()) errors["personal.last_name"] = "Escribí tu apellido.";

  const phone = String(p.phone ?? "");
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d\s-]+$/.test(phone) || digits.length < 10 || digits.length > 13) {
    errors["personal.phone"] = "Teléfono: 10 a 13 dígitos (se aceptan +, espacios y guiones).";
  }

  if (p.age !== null && p.age !== undefined && p.age !== "") {
    const age = Number(p.age);
    if (!Number.isInteger(age) || age < 14 || age > 99) errors["personal.age"] = "Edad: entre 14 y 99, o dejala vacía.";
  }

  if (!loc.province_id) errors["location.province_id"] = "Elegí una provincia.";
  if (!loc.city_id && !String(loc.city_other ?? "").trim()) {
    errors["location.city_id"] = "Elegí una localidad o escribí otra.";
  }
  const modalities = loc.modalities ?? [];
  if (!modalities.length) errors["location.modalities"] = "Elegí al menos una modalidad.";
  if (!(loc.home_terms ?? []).length) {
    errors["location.home_terms"] = "Agregá al menos un término de residencia.";
  }
  if (modalities.includes("presencial") && (loc.presencial_zone_terms ?? []).length && !String(loc.zones_label ?? "").trim()) {
    errors["location.zones_label"] = "Escribí el nombre de la zona (por ejemplo, Zona Sur).";
  }

  if (!SCHEDULES.some(([value]) => value === av.schedule)) errors["availability.schedule"] = "Elegí la jornada.";
  for (const [path] of YES_NO_FIELDS) {
    const key = path.split(".")[1];
    if (typeof av[key] !== "boolean") errors[path] = "Respondé sí o no.";
  }
  return errors;
}

registerStepRule("personal", validatePersonal);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function textField(id, label, value, onInput, type = "text") {
  const input = el("input", { id, type, autocomplete: "off" });
  input.value = value ?? "";
  input.addEventListener("input", () => onInput(input.value));
  return { node: el("div", { class: "field" }, [el("label", { for: id, text: label }), input]), input };
}

function radioGroup(name, legend, options, current, onChange) {
  const inputs = options.map(([value, text]) => {
    const id = `${name}-${value}`;
    const input = el("input", { type: "radio", name, id, value });
    input.checked = current === value;
    input.addEventListener("change", () => onChange(value));
    return el("label", { class: "option", for: id }, [input, document.createTextNode(` ${text}`)]);
  });
  return el("fieldset", { class: "field" }, [el("legend", { text: legend }), ...inputs]);
}

/**
 * Pinta el paso 1 en `root`. ctx: {store, data, refresh}. Devuelve {markErrors(errors)}.
 */
export function renderStep1(root, { store, data, refresh }) {
  const answers = () => store.getState().answers;

  const h = el("h2", { text: "1. Datos personales y ubicación" });
  const form = el("form", { novalidate: "" });
  form.addEventListener("submit", (event) => event.preventDefault());

  const p = answers().personal;
  const first = textField("f-first", "Nombre", p.first_name, (v) => {
    store.setIn("personal.first_name", v);
    refresh();
  });
  const last = textField("f-last", "Apellido", p.last_name, (v) => {
    store.setIn("personal.last_name", v);
    refresh();
  });
  const phone = textField("f-phone", "Teléfono (celular)", p.phone, (v) => {
    store.setIn("personal.phone", v);
    refresh();
  }, "tel");
  const age = textField("f-age", "Edad (opcional)", p.age ?? "", (v) => {
    store.setIn("personal.age", v === "" ? null : Number(v));
    refresh();
  }, "number");

  // Provincia y localidad
  const provinceSelect = el("select", { id: "f-province" });
  provinceSelect.append(el("option", { value: "", text: "— Elegí —" }));
  for (const prov of data.geo.provinces) provinceSelect.append(el("option", { value: prov.id, text: prov.label }));
  provinceSelect.value = answers().location.province_id;

  const citySelect = el("select", { id: "f-city" });
  const otherWrap = el("div", { class: "field", hidden: "" });
  const otherInput = el("input", { id: "f-city-other", type: "text", autocomplete: "off" });
  otherInput.value = answers().location.city_other ?? "";
  otherInput.addEventListener("input", () => {
    store.setIn("location.city_other", otherInput.value);
    refresh();
  });
  otherWrap.append(el("label", { for: "f-city-other", text: "Localidad" }), otherInput);
  let otherMode = answers().location.city_id === "" && (answers().location.city_other ?? "") !== "";

  function fillCities() {
    const prov = data.geo.provinces.find((x) => x.id === provinceSelect.value);
    citySelect.replaceChildren(el("option", { value: "", text: "— Elegí —" }));
    for (const city of prov?.cities ?? []) citySelect.append(el("option", { value: city.id, text: city.label }));
    citySelect.append(el("option", { value: OTHER_CITY, text: "Otra localidad…" }));
    citySelect.value = otherMode ? OTHER_CITY : answers().location.city_id;
    otherWrap.hidden = !otherMode;
  }

  const currentSuggestion = () =>
    suggestedHomeTerms(data, answers().location.province_id, answers().location.city_id);

  function applyCity(cityId, previousSuggested) {
    const prov = data.geo.provinces.find((x) => x.id === provinceSelect.value);
    const city = prov?.cities.find((c) => c.id === cityId);
    store.setIn("location.city_id", cityId);
    if (city) {
      store.setIn("location.city_other", "");
      store.setIn("location.home_terms", nextHomeTerms(answers().location.home_terms, previousSuggested, city.terms));
      store.setIn("location.presencial_zone_terms", [...city.zones]);
    }
    otherInput.value = "";
  }

  provinceSelect.addEventListener("change", () => {
    const previous = currentSuggestion();
    store.setIn("location.province_id", provinceSelect.value);
    otherMode = false;
    const prov = data.geo.provinces.find((x) => x.id === provinceSelect.value);
    applyCity(prov?.cities[0]?.id ?? "", previous);
    homeChips.setValues(answers().location.home_terms);
    zoneChips.setValues(answers().location.presencial_zone_terms);
    fillCities();
    updateSuggestion();
    refresh();
  });
  citySelect.addEventListener("change", () => {
    const previous = currentSuggestion();
    otherMode = citySelect.value === OTHER_CITY;
    if (otherMode) {
      store.setIn("location.city_id", ""); // los términos cargados se conservan
    } else {
      applyCity(citySelect.value, previous);
      homeChips.setValues(answers().location.home_terms);
      zoneChips.setValues(answers().location.presencial_zone_terms);
    }
    fillCities();
    updateSuggestion();
    refresh();
  });

  const homeWrap = el("div", { class: "field" });
  const homeChips = createChips({
    container: homeWrap,
    label: "Términos de residencia (aparecen en avisos y preguntas)",
    values: answers().location.home_terms,
    onChange: (values) => {
      store.setIn("location.home_terms", values);
      updateSuggestion();
      refresh();
    },
  });
  const homeHelp = el("div", { class: "help", id: "home-terms-help" }, [
    el("p", { text: HOME_TERMS_HELP.purpose }),
    el("p", { text: "Ejemplos:" }),
    el("ul", {}, HOME_TERMS_HELP.examples.map(([place, terms]) => el("li", { text: `${place}: ${terms}` }))),
    el("p", { text: HOME_TERMS_HELP.howto }),
  ]);
  const suggestBtn = el("button", { type: "button", class: "secondary", id: "use-suggested-terms" });
  suggestBtn.addEventListener("click", () => {
    store.setIn("location.home_terms", currentSuggestion());
    homeChips.setValues(answers().location.home_terms);
    updateSuggestion();
    refresh();
  });
  function updateSuggestion() {
    const sug = currentSuggestion();
    suggestBtn.hidden = !sug.length || sameTerms(sug, answers().location.home_terms);
    suggestBtn.textContent = `Usar los términos sugeridos (${sug.join(", ")})`;
  }
  homeWrap.append(homeHelp, suggestBtn);
  updateSuggestion();

  // Modalidades y zonas
  const modWrap = el("fieldset", { class: "field" }, [el("legend", { text: "Modalidades que buscás" })]);
  for (const [value, text] of MODALITIES) {
    const id = `mod-${value}`;
    const input = el("input", { type: "checkbox", id, value });
    input.checked = answers().location.modalities.includes(value);
    input.addEventListener("change", () => {
      const checked = MODALITIES.map(([v]) => v).filter((v) => {
        const box = modWrap.querySelector(`input[value="${v}"]`);
        return box?.checked;
      });
      store.setIn("location.modalities", checked);
      zoneWrap.hidden = !checked.includes("presencial");
      refresh();
    });
    modWrap.append(el("label", { class: "option", for: id }, [input, document.createTextNode(` ${text}`)]));
  }
  const zoneWrap = el("div", { class: "field" });
  zoneWrap.hidden = !answers().location.modalities.includes("presencial");
  const zoneChips = createChips({
    container: zoneWrap,
    label: "Zonas para trabajo presencial (vacío = presencial en cualquier parte de tu residencia)",
    values: answers().location.presencial_zone_terms,
    onChange: (values) => {
      store.setIn("location.presencial_zone_terms", values);
      refresh();
    },
  });
  const zoneLabel = textField("f-zones-label", "Nombre de la zona (ej.: Zona Sur)", answers().location.zones_label, (v) => {
    store.setIn("location.zones_label", v);
    refresh();
  });
  zoneWrap.append(zoneLabel.node);

  // Disponibilidad
  const schedule = radioGroup("schedule", "Jornada", SCHEDULES, answers().availability.schedule, (v) => {
    store.setIn("availability.schedule", v);
    refresh();
  });
  const yesNo = YES_NO_FIELDS.map(([path, text]) => {
    const key = path.split(".")[1];
    const current = answers().availability[key];
    return radioGroup(key, text, [["true", "Sí"], ["false", "No"]], current === null ? null : String(current), (v) => {
      store.setIn(path, v === "true");
      refresh();
    });
  });

  fillCities();
  form.append(
    el("div", { class: "grid" }, [first.node, last.node, phone.node, age.node]),
    el("div", { class: "field" }, [el("label", { for: "f-province", text: "Provincia" }), provinceSelect]),
    el("div", { class: "field" }, [el("label", { for: "f-city", text: "Localidad" }), citySelect]),
    otherWrap,
    homeWrap,
    modWrap,
    zoneWrap,
    schedule,
    ...yesNo,
  );
  root.replaceChildren(h, form);

  const fields = {
    "personal.first_name": first.input,
    "personal.last_name": last.input,
    "personal.phone": phone.input,
    "personal.age": age.input,
    "location.province_id": provinceSelect,
    "location.city_id": citySelect,
    "location.modalities": modWrap,
    "location.home_terms": homeWrap,
    "location.zones_label": zoneLabel.input,
    "availability.schedule": schedule,
    ...Object.fromEntries(YES_NO_FIELDS.map(([path], i) => [path, yesNo[i]])),
  };
  return {
    markErrors(errors) {
      for (const node of Object.values(fields)) node.removeAttribute("aria-invalid");
      for (const path of Object.keys(errors)) fields[path]?.setAttribute("aria-invalid", "true");
    },
  };
}
