// Espejo de profile_builder.gross_from_net / part_time_preview y questions.format_ars (Python).

/** D12: (neto * 1205 + 500000) // 1000000 * 1000, con enteros. */
export function grossFromNet(net) {
  return Math.floor((Math.trunc(net) * 1205 + 500000) / 1000000) * 1000;
}

/** Round half-even (como round() de Python). */
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Vista previa part-time: igual a cv_router.salary_for (redondeo a miles). */
export function partTimePreview(net, factor = 0.65) {
  return roundHalfEven((Number(net) * factor) / 1000) * 1000;
}

/** 1250000 -> "$1.250.000". */
export function formatArs(amount) {
  const n = Math.trunc(Number(amount));
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${sign}${digits}`;
}
