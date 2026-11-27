// Exportación del paso 6 (6.4.4): arma los archivos del bundle perfil_<slug>.zip, las advertencias y los
// comandos para instalarlo. Módulo puro (sin DOM); lo usan el paso 6 y webtests/export_fixture.mjs.
import { buildConfig, buildCategories, buildProfileJson, deriveVars, renderResponses } from "./builder.js";
import { toYaml } from "./yaml.js";
import { makeZip } from "./zip.js";

export const PLACEHOLDER_RE = /\[COMPLETAR[^\]]*\]/gi; // mismo criterio que questions.PLACEHOLDER_RE

/** Nombre del zip que se descarga y que `main.py --import-bundle` acepta. */
export const bundleFileName = (slug) => `perfil_${slug}.zip`;

/** Texto de LEEME.txt (va dentro del bundle). Sin datos personales: solo el slug. */
export function leemeText(slug) {
  return [
    `Perfil "${slug}" del asistente web de Computrabajo`,
    "",
    "Instalación (una vez):",
    "  1. Instalá Python 3.11 o superior (python.org).",
    "  2. Desde la carpeta computrabajo_bot/ del bot:",
    "       pip install -r requirements.txt",
    "       python -m playwright install chromium",
    "",
    "Pasos:",
    `  a) Importar este perfil:  python main.py --import-bundle <este zip>`,
    `  b) Iniciar sesión:        python main.py --profile ${slug} --login`,
    `  c) Prueba sin postular:   python main.py --profile ${slug} --dry-run --limit 3`,
    `  d) Corrida real:          python main.py --profile ${slug}`,
    "",
    "Antes de la corrida real:",
    "  - En Computrabajo, los CV se eligen de los ya cargados: el bot no sube archivos.",
    "    El nombre de cada CV tiene que coincidir con el de cv_rules en config.yaml.",
    "  - Reemplazá los valores marcados como [COMPLETAR_...] en responses.json.",
    "",
    "Privacidad: este zip contiene tus respuestas. No lo compartas ni lo subas a ningún sitio.",
    "",
  ].join("\n");
}

/** profile.json, config.yaml, responses.json y LEEME.txt como strings UTF-8, en ese orden. */
export function buildBundleFiles(answers, data, nowIso) {
  const slug = deriveVars(answers, data).slug;
  const responses = renderResponses(answers, data);
  return [
    { name: "profile.json", data: `${JSON.stringify(buildProfileJson(answers, data, nowIso), null, 2)}\n` },
    { name: "config.yaml", data: toYaml(buildConfig(answers, data)) },
    { name: "responses.json", data: `${JSON.stringify(responses, null, 2)}\n` },
    { name: "LEEME.txt", data: leemeText(slug) },
  ];
}

/** Zip del bundle (método STORE, nombres UTF-8). */
export function buildBundleZip(answers, data, nowIso, date = new Date()) {
  return makeZip(buildBundleFiles(answers, data, nowIso), date);
}

/**
 * Advertencias para el resumen final: placeholders [COMPLETAR_…] que quedarán en responses.json y categorías
 * de búsqueda sin verificar (ct_verified: false en presets/categories.json). Lista de strings; vacía si no hay nada.
 */
export function exportWarnings(answers, data) {
  const out = [];
  const seen = new Set();
  for (const rule of renderResponses(answers, data)) {
    const found = [...(rule.answer ?? "").matchAll(PLACEHOLDER_RE), ...(rule.option ?? "").matchAll(PLACEHOLDER_RE)];
    for (const [tag] of found) {
      const key = `${rule.id}|${tag}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(`responses.json: la regla «${rule.id}» tiene ${tag} sin completar.`);
      }
    }
  }
  for (const slug of buildCategories(answers, data)) {
    const cat = data.categories.find((c) => c.slug === slug);
    if (cat && cat.ct_verified === false) {
      out.push(`categoría «${slug}» sin verificar en Computrabajo: revisá la búsqueda antes de la corrida real.`);
    }
  }
  return out;
}

/** Comandos para instalar y probar el bundle, por sistema. Las rutas de la carpeta del bot van entre <>. */
export function commandBlocks(slug) {
  const zip = bundleFileName(slug);
  return {
    powershell: [
      'cd "<carpeta del bot>\\computrabajo_bot"',
      `python main.py --import-bundle "$HOME\\Downloads\\${zip}"`,
    ].join("\n"),
    cmd: [
      'cd /d "<carpeta del bot>\\computrabajo_bot"',
      `python main.py --import-bundle "%USERPROFILE%\\Downloads\\${zip}"`,
    ].join("\r\n"),
    unix: [
      'cd "<carpeta del bot>/computrabajo_bot"',
      `python3 main.py --import-bundle "$HOME/Downloads/${zip}"`,
    ].join("\n"),
  };
}
