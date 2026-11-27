// V4.2: paquete completo computrabajo-<slug>.zip: motor del bot (bot_dist/computrabajo_bot.zip, ya limpio),
// perfil (profiles/<slug>/) y scripts en un solo zip. Módulo puro (sin DOM): fetch se inyecta para los tests.
import { buildBundleFiles } from "./export.js";
import { deriveVars } from "./builder.js";
import { makeZip, readZip } from "./zip.js";
import { buildPackageScripts } from "./scripts.js";

/** Ruta del motor, relativa a la página (la publica tools/export_site.py junto con el sitio). */
export const ENGINE_ZIP_PATH = "bot_dist/computrabajo_bot.zip";
const PKG_DIR = "computrabajo_bot";
const PROFILE_FILES = ["config.yaml", "responses.json", "profile.json"];

/** Nombre del zip del paquete completo. */
export const packageFileName = (slug) => `computrabajo-${slug}.zip`;

/** Texto de LEEME.txt del paquete. Sin datos personales: solo el slug. Empieza con la primera instrucción. */
export function packageLeemeText(slug) {
  return [
    "Descomprimí este zip en cualquier carpeta (por ejemplo en tu Escritorio o Documentos).",
    `Perfil "${slug}" del asistente web de Computrabajo. El zip trae el motor del bot, tu perfil y los scripts.`,
    "",
    "Instalación (una sola vez):",
    "  1. Windows: doble clic en instalar_y_configurar.bat.",
    "     macOS/Linux: abrí una terminal en esa carpeta y ejecutá: chmod +x *.sh && ./instalar_y_configurar.sh",
    "     (instala las dependencias y Chromium, comprueba tu perfil y te ofrece iniciar sesión o probar).",
    "  2. Elegí [1] para iniciar sesión en Computrabajo.",
    "",
    "Para usar el bot después:",
    "  - Windows: doble clic en iniciar_bot.bat.   macOS/Linux: ./iniciar_bot.sh",
    "  - [2] prueba sin postular (3 avisos). [3] postula de verdad: pide escribir SI para confirmar.",
    "",
    "Requisito: Python 3.11 o superior (python.org). Los scripts instalan lo demás.",
    "",
    "Antes de la corrida real:",
    "  - En Computrabajo, los CV se eligen de los ya cargados: el bot no sube archivos.",
    `    El nombre de cada CV tiene que coincidir con el de cv_rules en computrabajo_bot/profiles/${slug}/config.yaml.`,
    `  - Reemplazá los valores marcados como [COMPLETAR_...] en computrabajo_bot/profiles/${slug}/responses.json.`,
    "",
    "Privacidad: este zip contiene tus respuestas y tu configuración. No lo compartas ni lo subas a ningún sitio.",
    "",
  ].join("\n");
}

/**
 * Lee el zip del motor. fetchBytes(url) -> Uint8Array | ArrayBuffer (Node en tests, fetch en el navegador).
 * Devuelve [{name, data}] con nombres "computrabajo_bot/...".
 */
export async function loadEngineEntries(fetchBytes) {
  return readZip(await fetchBytes(ENGINE_ZIP_PATH));
}

/** fetch del motor en el navegador. Error con mensaje claro si no hay red o el archivo falta. */
export async function fetchEngineBytes(url = ENGINE_ZIP_PATH) {
  let response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch {
    throw new Error("no se pudo descargar el motor del bot (revisá la conexión)");
  }
  if (!response.ok) throw new Error(`el motor del bot no está disponible (HTTP ${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Árbol del paquete como [{name, data, mode?}] con raíz computrabajo-<slug>/: scripts, LEEME.txt, motor y perfil.
 * Valida el motor: debe traer computrabajo_bot/main.py y no puede pisar profiles/<slug>/.
 */
export function buildPackageFiles(answers, data, nowIso, engineEntries) {
  const slug = deriveVars(answers, data).slug;
  const root = `computrabajo-${slug}/`;
  const names = new Set(engineEntries.map((entry) => entry.name));
  if (!names.has(`${PKG_DIR}/main.py`)) {
    throw new Error("el motor del bot no trae computrabajo_bot/main.py: el paquete quedaría incompleto");
  }
  const profileDir = `${PKG_DIR}/profiles/${slug}/`;
  const clash = engineEntries.find((entry) => entry.name.startsWith(profileDir));
  if (clash) throw new Error(`el motor del bot trae «${clash.name}», que pisaría el perfil ${slug}`);

  const scripts = buildPackageScripts(slug).map((file) => ({ ...file, name: root + file.name }));
  const leeme = { name: `${root}LEEME.txt`, data: packageLeemeText(slug) };
  const engine = engineEntries.map((entry) => ({ name: root + entry.name, data: entry.data }));
  const profile = buildBundleFiles(answers, data, nowIso)
    .filter((file) => PROFILE_FILES.includes(file.name))
    .map((file) => ({ name: `${root}${profileDir}${file.name}`, data: file.data }));
  return [...scripts, leeme, ...engine, ...profile];
}

/** Zip del paquete completo (STORE, nombres UTF-8, .sh con permisos 0755). */
export function buildPackageZip(answers, data, nowIso, engineEntries, date = new Date()) {
  return makeZip(buildPackageFiles(answers, data, nowIso, engineEntries), date);
}
