# Changelog — Mejoras Reportes y Organización Territorial
### Rama `feature/mejoras-reportes` — Misión Árbol

**Fecha:** 16/10/2026
**Base:** `main` @ `f24a4be`

---

## Resumen

Refactorización y ampliación del sistema de reportes, planificación, dashboard
nacional y registros organizativos. Todo el trabajo está en la rama
`feature/mejoras-reportes` (sin hacer push ni deploy; los hace el usuario).

---

## Fases implementadas (commits)

| Fase | Commit | Descripción |
|---|---|---|
| 1 | `34b6aca` | Catálogos centralizados: tallas (dropdown), entes adscritos y ministerios oficiales. |
| 2a | `643930d` | Esquema declarativo `js/esquemasActividades.js` (5 gerencias × ~60 tipos de actividad). |
| 2b | `c09e033` | Wizard paso 3 consume el esquema (formularios dinámicos por tipo de actividad). |
| 4a | `49bbcf7` | Responsable precargado desde Mi Personal (reporte) + quitar "No" de planificada. |
| 4b | `bbfd34b` | Responsable precargado en planificación. |
| 4c | `404ff20` | Vinculación de personal con "¿en qué ayudó?" en el cierre. |
| 6.1 | `1af7194` | CRUD comités ecosocialistas (`COM-XXXXXX`). |
| 6.2 | `f8a2381` | CRUD consejos ecosocialistas (`CON-XXXXXX`). |
| 6.3 | `1808ce4` | CRUD núcleos formativos (`NUC-XXXXXX`) con `vinculadoA:{tipo,id}`. |
| 6.4 | `19af26b` | Formulario público `voluntariado.html` + vista admin. |
| 6.6 | `d78ee06` | Flujo "Otro → notificación → reportar a nacional" en vínculos. |
| 5 | `f2b69ce` | Dashboard enriquecido: personal por actividades + inventario comités/consejos/núcleos. |
| 5 | `9ffda73` | Tabla preview de reportes antes de descargar (visor de control). |

---

## Nuevas colecciones Firestore

| Colección | Código | Contador | Responsable |
|---|---|---|---|
| `/comitesEcosocialistas` | `COM-XXXXXX` | `/contadores/comites` | Organización |
| `/consejosEcosocialistas` | `CON-XXXXXX` | `/contadores/consejos` | Organización |
| `/nucleos` | `NUC-XXXXXX` | `/contadores/nucleos` | Formación |
| `/voluntarios` | (auto) | — | Público |

---

## Nuevos archivos

- `js/esquemasActividades.js` — esquema declarativo de formularios.
- `js/comites.js`, `js/consejos.js`, `js/nucleos.js`, `js/voluntariado.js` — módulos CRUD.
- `voluntariado.html` — formulario público (link aparte).

---

## Pendiente de decisión del usuario

1. **`firestore.rules`**: modificado pero **sin commitear** (reglas de las 4 colecciones nuevas).
   - El `--dry-run` compiló correctamente.
   - Falta: OK del usuario para commitear + deploy (`firebase deploy --only firestore:rules`).
2. **Prueba del wizard en navegador** (no testeado por el agente; validar con `npx serve .`).
3. **Push** a `main` (lo hace el usuario).

---

## Qué probar

1. Wizard de reporte: paso 2 → gerencia, paso 3 → campos dinámicos por actividad.
2. Especies con sumatoria (kg/gr) y acompañamiento con sumatoria.
3. Responsable/vinculación desde Mi Personal.
4. CRUD de comités/consejos/núcleos (códigos COM-/CON-/NUC-).
5. Flujo "Otro (especificar)" → notificación a nacional.
6. Dashboard: inventario por estado/municipio/parroquia/comuna.
7. Descargas: botón "Ver preview".
8. Formulario público `/voluntariado.html`.
