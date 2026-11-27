// Respuestas por defecto del wizard (esquema S9). Pura.
export function defaultAnswers() {
  return {
    schema_version: 1,
    personal: { first_name: "", last_name: "", phone: "", age: null },
    location: {
      province_id: "", city_id: "", city_other: "",
      home_terms: [], presencial_zone_terms: [], zones_label: "", modalities: [],
    },
    availability: { schedule: "", shifts_weekends: null, immediate: null, travel: null, relocate: null },
    presets: [],
    extra_categories: [],
    keywords: {
      required_add: [], required_remove: [], exclude_title_add: [], exclude_title_remove: [],
      exclude_desc_add: [], exclude_desc_remove: [],
    },
    roles: [],
    filters: { switches: {}, min_years_block: null, seeking_junior: false, daily_limit: 15 },
    skills: {},
  };
}
