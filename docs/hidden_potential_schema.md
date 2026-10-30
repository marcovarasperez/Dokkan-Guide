# Esquema de `hidden_potential.json`

Guías curated de Hidden Potential por unidad (formato minimalista: distribución de niveles de las 3 skills del tablero). El adaptador (`app/src/model/hp.ts`) las usa con esta prioridad:

1. **curated** — este archivo (autor citado, p. ej. "Source: CelticLink").
2. **algorithm** — cálculo local a partir del texto de la pasiva de la fuente (reglas del método).
3. **estimated** — estimación por rol (ofensivo: Adicional → Crítico → Evasión; defensivo: Evasión → Adicional → Crítico), siempre etiquetada "Estimated".

En la app la recomendación se muestra como: **Adicional X · Crítico Y · Evasión Z** (reparto estándar 15 + 11 + 0 nodos).

## Entrada

```json
{
  "unitId": 1034761,                  // obligatorio; id de carta (debe existir en units.index.json)
  "variant": "eza",                   // opcional: "base" | "eza" (defecto "base"; "eza" cubre EZA y SEZA)
  "levels": {                         // obligatorio: niveles enteros 0-15
    "additional": 0,                  //   Combo Attack / ataque adicional (icono pot_skill_01)
    "critical": 15,                   //   Critical Hit (icono pot_skill_02)
    "evasion": 11                     //   Evasion (icono pot_skill_03)
  },
  "note": "Prioriza crítico por su roller de daño puro; dodge complementa.",  // opcional (una línea)
  "source": "CelticLink",             // obligatorio: cita del autor de la guía
  "sourceUrl": "",                    // opcional: URL de la fuente (sin YouTube/TikTok en la app)
  "guideDate": "2026-10-01"           // opcional
}
```

## Cómo añadir una guía

Edita `app/public/data/hidden_potential.json` a mano añadiendo la entrada en `entries` (o reemplaza la existente de la misma `unitId`+`variant`). Reglas:

- `unitId` debe existir en `units.index.json` y `levels` deben ser enteros 0-15.
- `source` es obligatorio: cita el autor de la guía (p. ej. `"CelticLink"`).
- **Una guía cada vez, introducida manualmente, nunca scraping en bloque de videos/transcripciones.** Sin enlaces YouTube/TikTok en la app.
