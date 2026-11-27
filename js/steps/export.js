// Paso 6 (6.4.4): exportar. Descargas (config.yaml, responses.json, zip del perfil), advertencias y comandos
// para instalar el bundle. Toda la lógica está en core/export.js; acá solo DOM.
import { buildBundleZip, bundleFileName, commandBlocks, exportWarnings } from "../core/export.js";
import { buildConfig, deriveVars, renderResponses } from "../core/builder.js";
import { toYaml } from "../core/yaml.js";

const SHELLS = [
  ["powershell", "PowerShell"],
  ["cmd", "CMD"],
  ["unix", "macOS / Linux"],
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

/** Descarga un Blob local. El enlace se quita y la URL se revoca enseguida después del clic. */
function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = el("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderExport(root, { store, data }) {
  const answers = () => store.getState().answers;
  const slug = () => deriveVars(answers(), data).slug;
  const nowIso = () => new Date().toISOString();

  const warnings = exportWarnings(answers(), data);
  const warnList = el("ul", { id: "export-warnings", "aria-live": "polite" }, warnings.map((w) => el("li", { text: w })));
  const warnBox = el("section", { class: "export-warnings", "aria-labelledby": "export-warn-title" }, [
    el("h3", { id: "export-warn-title", text: "Antes de la corrida real" }),
    warnings.length
      ? warnList
      : el("p", { text: "Sin advertencias: no quedan placeholders ni categorías sin verificar." }),
  ]);

  const status = el("p", { id: "export-status", role: "status", "aria-live": "polite" });
  const say = (msg) => status.textContent = msg;

  const downloads = el("div", { class: "export-buttons" }, [
    el("button", { type: "button", id: "dl-config", text: "Descargar config.yaml" }),
    el("button", { type: "button", id: "dl-responses", text: "Descargar responses.json" }),
    el("button", { type: "button", id: "dl-zip", text: "Descargar perfil completo (.zip)" }),
  ]);
  const [btnConfig, btnResponses, btnZip] = downloads.children;
  btnConfig.onclick = () => {
    const yaml = toYaml(buildConfig(answers(), data));
    download("config.yaml", yaml, "text/yaml;charset=utf-8");
    say("config.yaml descargado.");
  };
  btnResponses.onclick = () => {
    const json = `${JSON.stringify(renderResponses(answers(), data), null, 2)}\n`;
    download("responses.json", json, "application/json;charset=utf-8");
    say("responses.json descargado.");
  };
  btnZip.onclick = () => {
    const name = bundleFileName(slug());
    download(name, buildBundleZip(answers(), data, nowIso()), "application/zip");
    say(`${name} descargado. Seguí los pasos de abajo para instalarlo.`);
  };

  // Caja de comandos con pestañas: una por sistema, con botón "Copiar".
  const cmds = () => commandBlocks(slug());
  const pre = el("pre", { id: "export-cmd", class: "export-cmd" });
  const tabs = el("div", { role: "tablist", class: "export-tabs" });
  let shell = "powershell";
  const tabButtons = SHELLS.map(([key, label]) => {
    const b = el("button", { type: "button", role: "tab", "data-shell": key, text: label });
    b.onclick = () => {
      shell = key;
      paint();
    };
    return b;
  });
  tabs.append(...tabButtons);
  const copy = el("button", {
    type: "button",
    id: "copy-cmd",
    text: "Copiar",
    onclick: async () => {
      const text = pre.textContent;
      try {
        await navigator.clipboard.writeText(text);
        say("Comando copiado.");
      } catch {
        say("No se pudo copiar: seleccioná el texto y copialo a mano.");
      }
    },
  });

  function paint() {
    pre.textContent = cmds()[shell];
    tabButtons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.shell === shell)));
  }
  paint();

  const steps = el("ol", { class: "export-steps" }, [
    el("li", { text: "Descargá el zip del perfil y guardalo en Descargas." }),
    el("li", { text: "Abrí una terminal en la carpeta del bot y ejecutá el comando de tu sistema." }),
    el("li", { text: `Iniciá sesión con: python main.py --profile ${slug()} --login` }),
    el("li", { text: `Probá sin postular: python main.py --profile ${slug()} --dry-run --limit 3` }),
  ]);

  root.replaceChildren(
    el("h2", { text: "Exportar" }),
    el("p", { text: "El zip se arma en este navegador. Tus respuestas no se envían a ningún servidor." }),
    warnBox,
    downloads,
    el("section", { class: "export-install", "aria-labelledby": "export-install-title" }, [
      el("h3", { id: "export-install-title", text: "Instalar el perfil en el bot" }),
      el("div", { class: "export-tabs-wrap" }, [tabs, copy]),
      pre,
      steps,
    ]),
    status,
  );

  return { markErrors() {} };
}
