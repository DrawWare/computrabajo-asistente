// Paso 2: rubros (presets), roles, keywords por rubro, categorías extra y vista previa de búsquedas.
// Las funciones puras (previewModel, applyKeywordChange, validateRubros) se testean en Node;
// renderStep2 solo toca el DOM dentro de la función.
import { registerStepRule } from "../core/validate.js";
import { buildSearches, mergeKeywordsDetailed } from "../core/builder.js";
import { normalize } from "../core/normalize.js";
import { createChips } from "../ui/chips.js";

const KEY_LISTS = {
  required: { add: "required_add", remove: "required_remove" },
  exclude_title: { add: "exclude_title_add", remove: "exclude_title_remove" },
  exclude_desc: { add: "exclude_desc_add", remove: "exclude_desc_remove" },
};

/** Modelo de la vista previa (sin DOM): búsquedas y keywords finales. */
export function previewModel(answers, data) {
  return { searches: buildSearches(answers, data), keywords: mergeKeywordsDetailed(answers, data) };
}

/**
 * Aplica un cambio hecho en un grupo de chips a los *_add / *_remove de answers.keywords.
 * kind: "required" | "exclude_title" | "exclude_desc". base: valores del rubro (sin ediciones).
 * Devuelve un objeto keywords nuevo (no muta el original).
 */
export function applyKeywordChange(keywords, { kind, base, oldValues, newValues }) {
  const keys = KEY_LISTS[kind];
  const next = structuredClone(keywords);
  const addList = [...(next[keys.add] ?? [])];
  const removeList = [...(next[keys.remove] ?? [])];
  const baseSet = new Set(base.map(normalize));
  const newSet = new Set(newValues.map(normalize));
  const oldSet = new Set(oldValues.map(normalize));
  const has = (list, v) => list.some((x) => normalize(x) === normalize(v));
  const drop = (list, v) => list.filter((x) => normalize(x) !== normalize(v));

  for (const v of oldValues) {
    if (!newSet.has(normalize(v))) {
      if (baseSet.has(normalize(v)) && !has(removeList, v)) removeList.push(v);
      const kept = drop(addList, v);
      addList.splice(0, addList.length, ...kept);
    }
  }
  for (const v of newValues) {
    if (!oldSet.has(normalize(v))) {
      const kept = drop(removeList, v);
      removeList.splice(0, removeList.length, ...kept);
      if (!baseSet.has(normalize(v)) && !has(addList, v)) addList.push(v);
    }
  }
  next[keys.add] = addList;
  next[keys.remove] = removeList;
  return next;
}

/** Valores que muestra un grupo de chips: base del rubro menos quitados, más agregados. */
export function chipValues(keywords, { kind, base }) {
  const keys = KEY_LISTS[kind];
  const removed = new Set((keywords[keys.remove] ?? []).map(normalize));
  const out = [];
  for (const v of [...base, ...(keywords[keys.add] ?? [])]) {
    if (removed.has(normalize(v)) || out.some((x) => normalize(x) === normalize(v))) continue;
    out.push(v);
  }
  return out;
}

export function validateRubros(answers, data) {
  const errors = {};
  if (!(answers.presets ?? []).length) {
    errors.presets = "Elegí al menos un rubro.";
  } else if (buildSearches(answers, data).length === 0) {
    errors.searches = "No quedó ninguna búsqueda: revisá las modalidades y la localidad del paso 1.";
  }
  return errors;
}

registerStepRule("rubros", validateRubros);

// ---------------------------------------------------------------- DOM

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

/**
 * Pinta el paso 2 en root. ctx: {store, data, refresh}. Devuelve {markErrors(errors)}.
 */
export function renderStep2(root, { store, data, refresh }) {
  const ans = () => store.getState().answers;
  const verifiedUnknown = new Set(data.categories.filter((c) => !c.ct_verified).map((c) => c.slug));

  const h = el("h2", { text: "2. Rubros y búsquedas" });
  const cardsWrap = el("div", { class: "cards" });
  const catsWrap = el("fieldset", { class: "field" }, [el("legend", { text: "Categorías adicionales" })]);
  const previewWrap = el("section", { "aria-label": "Vista previa de búsquedas" });
  const previewStatus = el("p", { class: "status", "aria-live": "polite" });

  function setPresets(next) {
    const roles = (ans().roles ?? []).filter((r) => next.includes(r.preset_id));
    for (const pid of next) {
      for (const role of data.rubros[pid].roles) {
        if (!roles.some((r) => r.preset_id === pid && r.role_id === role.id)) {
          roles.push({ preset_id: pid, role_id: role.id, enabled: role.default_enabled });
        }
      }
    }
    store.setIn("presets", next);
    store.setIn("roles", roles);
  }

  function setRoleEnabled(pid, rid, on) {
    const roles = ans().roles.map((r) => (r.preset_id === pid && r.role_id === rid ? { ...r, enabled: on } : r));
    store.setIn("roles", roles);
  }

  function isRoleEnabled(pid, role) {
    const entry = (ans().roles ?? []).find((r) => r.preset_id === pid && r.role_id === role.id);
    return entry && "enabled" in entry ? entry.enabled : role.default_enabled;
  }

  function paintPreview() {
    const answers = ans();
    previewStatus.textContent = "";
    const { searches, keywords } = previewModel(answers, data);
    const list = el("ol", { class: "searches" });
    for (const s of searches) {
      const badges = [];
      const unverified = [...verifiedUnknown].find((slug) => s.url.includes(`-de-${slug}-`));
      if (unverified) badges.push(`categoría "${unverified}" sin verificar`);
      const link = el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.url });
      const item = el("li", {}, [el("span", { text: s.label + " " }), link]);
      if (badges.length) item.append(el("span", { class: "badge", text: ` — ${badges[0]}: abrila y confirmá que lista avisos` }));
      list.append(item);
    }
    const counts = el("p", { text: `${searches.length} búsquedas.` });
    const kwBox = el("details", {}, [
      el("summary", { text: `Palabras finales: ${keywords.required.length} requeridas, ${keywords.exclude_title.length} excluidas en el título, ${keywords.exclude_desc.length} excluidas en la descripción` }),
      el("p", { text: `Requeridas: ${keywords.required.join(", ")}` }),
      el("p", { text: `Excluidas en el título: ${keywords.exclude_title.join(", ")}` }),
      el("p", { text: `Excluidas en la descripción: ${keywords.exclude_desc.join(", ")}` }),
    ]);
    const dropped = keywords.dropped_by_positives.length
      ? el("p", { class: "notice-small", text: `Se quitaron de las exclusiones por "positivos ganan": ${keywords.dropped_by_positives.join(", ")}.` })
      : null;
    previewWrap.replaceChildren(el("h3", { text: "Vista previa" }), counts, list, kwBox, ...(dropped ? [dropped] : []));
  }

  function paintCards() {
    const selected = ans().presets ?? [];
    cardsWrap.replaceChildren();
    for (const pid of data.index) {
      const preset = data.rubros[pid];
      const on = selected.includes(pid);
      const cb = el("input", { type: "checkbox", id: `pre-${pid}` });
      cb.checked = on;
      cb.addEventListener("change", () => {
        const next = cb.checked ? [...selected, pid] : selected.filter((x) => x !== pid);
        setPresets(next);
        paintCards();
        paintPreview();
        refresh();
      });
      const card = el("article", { class: "card" }, [
        el("label", { class: "option", for: `pre-${pid}` }, [cb, document.createTextNode(` ${preset.label}`)]),
        el("p", { class: "muted", text: preset.description }),
      ]);
      if (on) {
        const rolesBox = el("fieldset", { class: "field" }, [el("legend", { text: "Roles" })]);
        for (const role of preset.roles) {
          const rcb = el("input", { type: "checkbox", id: `role-${pid}-${role.id}` });
          rcb.checked = isRoleEnabled(pid, role);
          rcb.addEventListener("change", () => {
            setRoleEnabled(pid, role.id, rcb.checked);
            paintCards();
            paintPreview();
            refresh();
          });
          rolesBox.append(el("label", { class: "option", for: `role-${pid}-${role.id}` }, [rcb, document.createTextNode(` ${role.label}`)]));
        }
        card.append(rolesBox);

        const enabledRoles = preset.roles.filter((r) => isRoleEnabled(pid, r));
        const positiveBase = enabledRoles.flatMap((r) => r.keywords);
        const groups = [
          { kind: "required", label: "Palabras que buscás en el título", base: positiveBase },
          { kind: "exclude_title", label: "Excluir si el título contiene", base: preset.exclude_title_keywords ?? [] },
          { kind: "exclude_desc", label: "Excluir si la descripción contiene", base: preset.exclude_desc_keywords ?? [] },
        ];
        for (const g of groups) {
          const box = el("div", { class: "field" });
          createChips({
            container: box,
            label: `${g.label} (${preset.label})`,
            values: chipValues(ans().keywords, g),
            onChange: (newValues) => {
              const oldValues = chipValues(ans().keywords, g);
              store.setIn("keywords", applyKeywordChange(ans().keywords, { ...g, oldValues, newValues }));
              paintPreview();
              refresh();
            },
          });
          card.append(box);
        }
      }
      cardsWrap.append(card);
    }
  }

  function paintCats() {
    catsWrap.replaceChildren(el("legend", { text: "Categorías adicionales" }));
    for (const c of data.categories) {
      const id = `cat-${c.slug}`;
      const cb = el("input", { type: "checkbox", id, value: c.slug });
      cb.checked = (ans().extra_categories ?? []).includes(c.slug);
      cb.addEventListener("change", () => {
        const cur = ans().extra_categories ?? [];
        const next = cb.checked ? [...cur, c.slug] : cur.filter((x) => x !== c.slug);
        store.setIn("extra_categories", next);
        paintPreview();
        refresh();
      });
      const text = c.ct_verified ? c.label : `${c.label} (sin verificar)`;
      catsWrap.append(el("label", { class: "option", for: id }, [cb, document.createTextNode(` ${text}`)]));
    }
  }

  root.replaceChildren(h, el("h3", { text: "Rubros" }), cardsWrap, catsWrap, previewWrap, previewStatus);
  paintCards();
  paintCats();
  paintPreview();

  return { markErrors() {} };
}
