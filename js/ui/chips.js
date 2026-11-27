// Componente de etiquetas accesible: agregar con Enter/coma/blur, quitar con botón con aria-label.
import { normalize } from "../core/normalize.js";

let counter = 0;

/**
 * @param {{container: HTMLElement, label: string, values?: string[], placeholder?: string,
 *          onChange?: (values: string[]) => void}} opts
 * @returns {{getValues: () => string[], setValues: (v: string[]) => void}}
 */
export function createChips({ container, label, values = [], placeholder = "Escribí y presioná Enter", onChange }) {
  counter += 1;
  const inputId = `chips-input-${counter}`;
  let items = [...values];

  const labelEl = document.createElement("label");
  labelEl.htmlFor = inputId;
  labelEl.textContent = label;

  const list = document.createElement("ul");
  list.className = "chips";

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.placeholder = placeholder;
  input.autocomplete = "off";

  function render() {
    list.replaceChildren();
    for (const value of items) {
      const li = document.createElement("li");
      li.className = "chip";
      const text = document.createElement("span");
      text.textContent = value;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Quitar ${value}`);
      remove.addEventListener("click", () => commit(items.filter((v) => v !== value)));
      li.append(text, remove);
      list.append(li);
    }
  }

  function commit(next) {
    items = next;
    render();
    onChange?.([...items]);
  }

  function add(raw) {
    const term = raw.replaceAll(",", "").trim();
    if (!term) return;
    if (items.some((v) => normalize(v) === normalize(term))) return;
    commit([...items, term]);
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(input.value);
      input.value = "";
    }
  });
  input.addEventListener("blur", () => {
    if (input.value.trim()) {
      add(input.value);
      input.value = "";
    }
  });

  container.replaceChildren(labelEl, list, input);
  render();

  return {
    getValues: () => [...items],
    setValues(next) {
      items = [...next];
      render();
    },
  };
}
