// Paso 3 (6.4.1): CVs en Computrabajo. Las funciones puras (sugerencia, validación, avisos) se testean
// en Node; renderStep3 solo toca el DOM dentro de la función.
import { registerStepRule } from "../core/validate.js";
import { normalize } from "../core/normalize.js";

export const CV_MAX_LABELS = 10;
export const CV_EXTENSIONS = [".pdf", ".doc", ".docx"];

/** Parte del nombre para el archivo: sin tildes ni ñ, letras y números, partes unidas con "_". */
export function namePart(text) {
  const plain = String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "");
  return plain.split(/[^A-Za-z0-9]+/).filter(Boolean).join("_");
}

/** 'Ana','Ejemplo','FullStack' -> 'CV_Ana_Ejemplo_FullStack.pdf'. Vacío si falta nombre o apellido. */
export function suggestCvLabel(firstName, lastName, cvSuffix) {
  const first = namePart(firstName);
  const last = namePart(lastName);
  const suffix = namePart(cvSuffix);
  if (!first || !last || !suffix) return "";
  return `CV_${first}_${last}_${suffix}.pdf`;
}

/** Roles de los presets elegidos, en el orden de data.index, con su switch y su sugerencia. */
export function cvRoles(answers, data) {
  const entries = answers.roles ?? [];
  const out = [];
  for (const pid of data.index) {
    if (!(answers.presets ?? []).includes(pid)) continue;
    for (const role of data.rubros[pid].roles) {
      const entry = entries.find((r) => r.preset_id === pid && r.role_id === role.id);
      const enabled = entry && "enabled" in entry ? entry.enabled : role.default_enabled;
      out.push({
        preset_id: pid,
        role_id: role.id,
        label: role.label,
        enabled: Boolean(enabled),
        entry,
        suggestion: suggestCvLabel(answers.personal?.first_name, answers.personal?.last_name, role.cv_suffix),
      });
    }
  }
  return out;
}

/** Etiqueta efectiva: la escrita por la persona, o la sugerencia si nunca la editó. */
export function effectiveCvLabel(role) {
  return role.entry?.cv_label_edited ? String(role.entry.cv_label ?? "") : role.suggestion;
}

/**
 * Roles con su entrada en answers.roles actualizada (cv_label = etiqueta efectiva). Pura: devuelve un
 * array nuevo; se usa para que buildCvRules (que lee cv_label) vea la sugerencia aunque no se haya editado.
 */
export function syncCvRoles(answers, data) {
  const byKey = new Map(cvRoles(answers, data).map((r) => [`${r.preset_id}\u0000${r.role_id}`, r]));
  const roles = (answers.roles ?? []).map((entry) => {
    const role = byKey.get(`${entry.preset_id}\u0000${entry.role_id}`);
    return role ? { ...entry, cv_label: effectiveCvLabel(role) } : entry;
  });
  for (const role of byKey.values()) {
    if (!roles.some((r) => r.preset_id === role.preset_id && r.role_id === role.role_id)) {
      roles.push({
        preset_id: role.preset_id,
        role_id: role.role_id,
        enabled: role.enabled,
        cv_label: effectiveCvLabel(role),
      });
    }
  }
  return roles;
}

/** Errores de validación del paso 3 (bloquean "Siguiente"). Claves: cvs.none, cvs.max, cvs.<pid>.<rid>. */
export function validateCvs(answers, data) {
  const errors = {};
  const enabled = cvRoles(answers, data).filter((r) => r.enabled);
  if (!enabled.length) {
    errors["cvs.none"] = "Habilitá al menos un rol para tu búsqueda.";
    return errors;
  }
  for (const role of enabled) {
    const key = `cvs.${role.preset_id}.${role.role_id}`;
    const label = effectiveCvLabel(role).trim();
    if (!label) {
      errors[key] = `${role.label}: escribí la etiqueta exacta del CV (o completá nombre y apellido en el paso 1).`;
    } else if (label.includes("/") || label.includes("\\")) {
      errors[key] = `${role.label}: la etiqueta es el nombre del archivo, sin carpetas.`;
    } else if (!CV_EXTENSIONS.some((ext) => label.toLowerCase().endsWith(ext))) {
      errors[key] = `${role.label}: la etiqueta debe terminar en .pdf, .doc o .docx.`;
    }
  }
  const distinct = new Set(enabled.map((r) => normalize(effectiveCvLabel(r).trim())).filter(Boolean));
  if (distinct.size > CV_MAX_LABELS) {
    errors["cvs.max"] = `Hay ${distinct.size} CVs distintos y la cuenta admite ${CV_MAX_LABELS}. Usá el mismo CV para roles parecidos.`;
  }
  return errors;
}

/** Avisos no bloqueantes: dos roles habilitados que comparten el mismo CV. */
export function cvWarnings(answers, data) {
  const byLabel = new Map();
  for (const role of cvRoles(answers, data).filter((r) => r.enabled)) {
    const key = normalize(effectiveCvLabel(role).trim());
    if (!key) continue;
    byLabel.set(key, [...(byLabel.get(key) ?? []), role.label]);
  }
  return [...byLabel.values()]
    .filter((labels) => labels.length > 1)
    .map((labels) => `Estos roles comparten un CV: ${labels.join(", ")}. Está bien si es a propósito.`);
}

export const CV_GUIDE_STEPS = [
  "Renombrá tu archivo con el nombre exacto que aparece en esta página (botón «Copiar nombre»).",
  "En Computrabajo entrá a Mi Perfil → Currículum y elegí tu CV en Word o PDF.",
  "Subí el archivo ya renombrado.",
  "Verificá que la lista de currículums muestre ese mismo nombre.",
];

registerStepRule("cvs", validateCvs);

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
 * Pinta el paso 3 en root. ctx: {store, data, refresh}. Devuelve {markErrors(errors)}.
 * Editar un nombre NO vuelve a pintar la lista (no pierde el foco): solo actualiza el store.
 */
export function renderStep3(root, { store, data }) {
  const ans = () => store.getState().answers;

  // Sincroniza cv_label con la etiqueta efectiva (lo que lee el builder) antes de pintar.
  const synced = syncCvRoles(ans(), data);
  if (JSON.stringify(synced) !== JSON.stringify(ans().roles ?? [])) store.setIn("roles", synced);

  const roleCards = el("div", { class: "cards" });
  const warnBox = el("p", { class: "notice-small", "aria-live": "polite" });
  const cardsByKey = new Map();

  function setEntry(pid, rid, patch) {
    const roles = (ans().roles ?? []).map((r) =>
      r.preset_id === pid && r.role_id === rid ? { ...r, ...patch } : r,
    );
    store.setIn("roles", roles);
  }

  function paintRoles() {
    const roles = cvRoles(ans(), data);
    roleCards.replaceChildren();
    cardsByKey.clear();
    if (!roles.length) {
      roleCards.append(el("p", { text: "Primero elegí rubros en el paso 2." }));
      return;
    }
    for (const role of roles) {
      const key = `${role.preset_id}.${role.role_id}`;
      const id = `cv-${key.replace(/\./g, "-")}`;
      const sw = el("input", { type: "checkbox", id: `${id}-on` });
      sw.checked = role.enabled;
      sw.addEventListener("change", () => {
        setEntry(role.preset_id, role.role_id, { enabled: sw.checked });
        paintRoles();
      });

      const input = el("input", { type: "text", id, autocomplete: "off", spellcheck: "false" });
      input.value = effectiveCvLabel(role);
      input.addEventListener("input", () => {
        setEntry(role.preset_id, role.role_id, { cv_label: input.value, cv_label_edited: true });
      });

      const status = el("p", { class: "status", "aria-live": "polite" });
      const copy = el("button", { type: "button", text: "Copiar nombre" });
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(input.value);
          status.textContent = "Nombre copiado.";
        } catch {
          status.textContent = "No se pudo copiar: seleccioná el texto del campo y copiálo a mano.";
        }
      });
      const reset = el("button", { type: "button", text: "Restaurar sugerencia" });
      reset.addEventListener("click", () => {
        setEntry(role.preset_id, role.role_id, { cv_label: role.suggestion, cv_label_edited: false });
        paintRoles();
      });

      const err = el("p", { class: "field-error", "data-err": `cvs.${key}`, "aria-live": "polite" });
      cardsByKey.set(`cvs.${key}`, err);

      roleCards.append(el("article", { class: "card" }, [
        el("label", { class: "option", for: `${id}-on` }, [sw, document.createTextNode(` Usar este rol: ${role.label}`)]),
        el("div", { class: "field" }, [
          el("label", { for: id, text: "Nombre del archivo del CV" }),
          input,
          el("div", { class: "row-actions" }, [copy, reset]),
          status,
          err,
        ]),
      ]));
    }
  }

  const guide = el("ol", { class: "cv-guide" }, CV_GUIDE_STEPS.map((t) => el("li", { text: t })));
  root.replaceChildren(
    el("h2", { text: "3. CVs en Computrabajo" }),
    el("p", { text: "El bot no sube archivos: elige un CV que ya tengas cargado en Computrabajo. Para que lo encuentre, el nombre del archivo tiene que coincidir exactamente con el de esta página." }),
    el("p", { class: "notice-small", text: "Tu cuenta admite hasta 10 CVs distintos. Recordatorio: el nombre se define antes de subir el archivo." }),
    guide,
    el("h3", { text: "Roles y CV" }),
    roleCards,
    warnBox,
  );
  paintRoles();

  return {
    markErrors(errors) {
      for (const [key, node] of cardsByKey) node.textContent = errors[key] ?? "";
      const warnings = cvWarnings(ans(), data);
      warnBox.textContent = warnings.join(" ");
    },
  };
}
