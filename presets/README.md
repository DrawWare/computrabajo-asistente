# presets/ — fuente única de datos de rubros y ubicación

Fuente de verdad del sitio y del builder. **No editar `docs/presets/` a mano**: se regenera con
`python tools/sync_presets.py` (6.2.4).

| Archivo | Contenido |
|---|---|
| `index.json` | Orden de los rubros en la UI. |
| `rubros/<id>.json` | Roles (keywords, sueldo sugerido, CV), categorías, exclusiones y patrones de experiencia. |
| `global.json` | Conjunto compartido `otros_rubros_no_it` y grupos de exclusión (con `default` / `default_from`). |
| `geo_ar.json` | Provincias y ciudades; `ct_verified: true` solo si el slug fue visto en `config.yaml`. |
| `categories.json` | Categorías de Computrabajo; `ct_verified: false` = sin verificar. |
| `answer_choices.json` | Textos neutros de género para cada respuesta del wizard. |
| `responses_template.json` | Plantilla ordenada de reglas de `responses.json` (gana la primera que matchea). |

Reglas: regex en el subconjunto común de D8 (`(?s)` solo al inicio, sin `(?P<…>)`, `(?i)`, `\A`, `\Z`,
posesivos). Ningún nombre de archivo empieza con `_` (Jekyll, H10).
