// Validación por paso del wizard. validateStep(stepId, answers, data) -> {campo: mensaje}.
// Las reglas de cada paso se agregan en su sub-tarea (personal: 6.3.3, rubros: 6.3.4, resto: 6.4.x).
const RULES = {};

export function validateStep(stepId, answers, data) {
  const rule = RULES[stepId];
  return rule ? rule(answers ?? {}, data) : {};
}

/** Registra la regla de un paso (usado por los módulos de cada paso). */
export function registerStepRule(stepId, fn) {
  RULES[stepId] = fn;
}
