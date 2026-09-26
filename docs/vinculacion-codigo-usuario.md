# Vinculación de códigos únicos con usuarios — Misión Árbol

## Propósito

Los documentos de las colecciones `/viveros` y `/brigadas` tienen un campo
`codigoUnico` que los identifica de forma legible para humanos, sin depender
del ID autogenerado por Firestore (que es largo e ilegible).

## Formato de los códigos

| Colección | Prefijo | Formato | Ejemplo |
|---|---|---|---|
| `/viveros`  | `VIV-` | `VIV-` + 6 dígitos con padding de ceros | `VIV-000042` |
| `/brigadas` | `BRG-` | `BRG-` + 6 dígitos con padding de ceros | `BRG-000007` |

El contador es **global por colección** (no por estado, no por gerencia).
Empieza en `1` y se incrementa de a uno.

## Implementación del contador

Los contadores viven en la colección `/contadores`:

```
/contadores/viveros   { ultimo: 42, actualizado: <timestamp> }
/contadores/brigadas  { ultimo: 7,  actualizado: <timestamp> }
```

La generación se hace con `runTransaction()` del SDK de Firestore,
que garantiza atomicidad:

1. Lee el documento `/contadores/{tipo}`.
2. Calcula `siguiente = ultimo + 1`.
3. Escribe `{ ultimo: siguiente }` en la misma transacción.
4. Devuelve `siguiente` para que el llamador lo use como código.

Si dos usuarios crean un vivero al mismo tiempo, Firestore serializa
las transacciones — el segundo espera y recibe `ultimo + 2`, nunca
el mismo número.

## Vinculación con el usuario

Además del `codigoUnico`, cada vivero/brigada guarda:

| Campo | Contenido |
|---|---|
| `creado` | `serverTimestamp()` — cuándo se creó |
| `creadoPor` | UID del usuario que lo creó (Firebase Auth) |
| `creadoPorNombre` | Nombre legible del usuario (para mostrar) |

La vinculación con el usuario se hace por `creadoPor` (UID). Para obtener
los datos completos del usuario creador, hacer:

```js
import { getDoc, doc } from "...firebase-firestore.js";
const userSnap = await getDoc(doc(db, 'usuarios', vivero.creadoPor));
const userData = userSnap.data();
```

## Reglas de Firestore aplicables

La colección `/contadores` está protegida por reglas que:

- Permiten `get` a cualquier usuario autenticado (necesario para leer el contador).
- Permiten `create` solo si `ultimo > 0` (no se puede crear en cero).
- Permiten `update` solo si `ultimo` aumenta estrictamente.
- **Prohíben `delete`** (nadie puede resetear el contador).

Referencia: ver bloque `match /contadores/{tipo}` en `firestore.rules`.

## Retrocompatibilidad

Los documentos creados **antes** de implementar este sistema
**no tienen** `codigoUnico`. La UI los muestra como `—` en la columna
"Código". El script de backfill (Fase 6) los completará.

## Consultas

Para buscar un vivero por código desde Firestore:

```js
import { query, collection, where, getDocs } from "...firebase-firestore.js";
const q = query(collection(db, 'viveros'), where('codigoUnico', '==', 'VIV-000042'));
const snap = await getDocs(q);
```

Para buscar brigadas por código:

```js
const q = query(collection(db, 'brigadas'), where('codigoUnico', '==', 'BRG-000007'));
```

## Versionado

- **v1.0** — Implementación inicial (Fase 3 del roadmap).
  - Contadores atómicos por colección.
  - Prefijos `VIV-` y `BRG-`.
  - Reglas anti-reset.