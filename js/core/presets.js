// Carga de presets/ (espejo de profile_builder.load_preset_data). fetchJson es inyectable (tests con fs).

/**
 * @param {(relPath: string) => Promise<any>} fetchJson  lee un JSON relativo a presets/
 * @returns {Promise<{index: string[], rubros: Record<string, any>, globalData: any, geo: any,
 *   categories: any[], choices: any, template: any[]}>}
 */
export async function loadPresetData(fetchJson) {
  const index = (await fetchJson("index.json")).rubros;
  const rubrosList = await Promise.all(index.map((id) => fetchJson(`rubros/${id}.json`)));
  const rubros = Object.fromEntries(index.map((id, i) => [id, rubrosList[i]]));
  const [globalData, geo, categories, choices, template] = await Promise.all([
    fetchJson("global.json"),
    fetchJson("geo_ar.json"),
    fetchJson("categories.json"),
    fetchJson("answer_choices.json"),
    fetchJson("responses_template.json"),
  ]);
  return { index, rubros, globalData, geo, categories, choices, template };
}
