// Estado del asistente: memoria + borrador en localStorage (clave ct-wizard/v1). Todo acceso a
// storage va en try/catch: sin storage el wizard funciona igual y lo informa en status().
export const STORAGE_KEY = "ct-wizard/v1";
export const STORAGE_VERSION = 1;
export const SAVE_DEBOUNCE_MS = 400;
export const NO_STORAGE_MSG = "No se puede guardar el borrador en este navegador.";
export const UNKNOWN_VERSION_MSG = "Había un borrador de otra versión del asistente y se descartó.";
export const CORRUPT_MSG = "El borrador guardado estaba dañado y se descartó.";

/** Asigna value en obj siguiendo una ruta con puntos ("location.home_terms"), creando objetos. */
export function setIn(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (cur[part] === null || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [opts]
 * @param {object|null} [opts.storage]      objeto con getItem/setItem/removeItem (localStorage por defecto)
 * @param {object} [opts.initialAnswers]    respuestas por defecto (se clonan)
 * @param {Function} [opts.setTimer] / [opts.clearTimer] / [opts.now]  inyectables para tests
 */
export function createStore({
  storage = safeStorage(),
  initialAnswers = {},
  debounceMs = SAVE_DEBOUNCE_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  now = () => new Date().toISOString(),
} = {}) {
  const initial = () => structuredClone(initialAnswers);
  let state = { step: 1, answers: initial() };
  let persistent = true;
  let message = null;
  let timer = null;
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn(state));
  const fail = (msg) => {
    persistent = false;
    message = msg;
  };

  function load() {
    if (!storage) {
      fail(NO_STORAGE_MSG);
      return { loaded: false };
    }
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      fail(NO_STORAGE_MSG);
      return { loaded: false };
    }
    if (raw === null || raw === undefined) return { loaded: false };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      message = CORRUPT_MSG;
      return { loaded: false };
    }
    if (!parsed || parsed.version !== STORAGE_VERSION) {
      message = UNKNOWN_VERSION_MSG;
      return { loaded: false };
    }
    state = { step: Number(parsed.step) || 1, answers: parsed.answers ?? initial() };
    notify();
    return { loaded: true };
  }

  /** Escribe ya. Devuelve true si quedó guardado. */
  function flush() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (!storage) {
      fail(NO_STORAGE_MSG);
      return false;
    }
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, step: state.step, answers: state.answers, updatedAt: now() }),
      );
      return true;
    } catch {
      fail(NO_STORAGE_MSG);
      return false;
    }
  }

  function scheduleSave() {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      flush();
    }, debounceMs);
  }

  function changed() {
    scheduleSave();
    notify();
  }

  return {
    getState: () => state,
    status: () => ({ persistent, message }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    flush,
    setIn(path, value) {
      setIn(state.answers, path, value);
      changed();
    },
    setStep(step) {
      state = { ...state, step };
      changed();
    },
    replaceAnswers(answers) {
      state = { ...state, answers: structuredClone(answers) };
      flush();
      notify();
    },
    /** Borra el borrador del navegador y vuelve a las respuestas por defecto. */
    clearAll() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      state = { step: 1, answers: initial() };
      try {
        storage?.removeItem(STORAGE_KEY);
        message = null;
        persistent = true;
      } catch {
        fail(NO_STORAGE_MSG);
      }
      notify();
    },
  };
}
