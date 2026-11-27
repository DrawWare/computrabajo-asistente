// Lector de CSV (6.5.1): BOM, comillas dobles con escape "", CRLF o LF, comas y saltos dentro de comillas.
// Módulo puro. Equivale a csv.reader de Python (sin dialectos): las líneas en blanco se ignoran.

/** Texto CSV => matriz de celdas (strings). Lanza Error si hay comillas sin cerrar. */
export function parseCsv(text) {
  let s = String(text ?? "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (c === "\r" || c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (inQuotes) throw new Error("CSV: hay comillas sin cerrar");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Línea en blanco = una sola celda vacía: csv.DictReader la saltea.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
