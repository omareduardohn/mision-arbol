// js/esquemasActividades.js
// Esquema declarativo de formularios por gerencia → tipo de actividad.
//
// Cada tipo de actividad define la lista EXACTA de campos que debe pedir.
// El renderizador genérico dibuja estos campos, sus dependencias (visibleSi),
// validaciones y sumatorias automáticas. Esto reemplaza los renderPaso3*
// hardcodeados y elimina los "bucles" de campos entre actividades.
//
// Tipos de campo soportados por el renderizador:
//   text, textarea, number, date, time, select, radio, checkbox,
//   personal  → dropdown desde /personal (responsable / vinculación),
//   brigada   → dropdown desde /brigadas,
//   comite    → dropdown desde /comitesEcosocialistas,
//   consejo   → dropdown desde /consejosEcosocialistas,
//   especies  → widget de especies + cantidad + sumatoria (renderEspeciesWidget),
//   otro      → select con "Otro (especificar)" que abre un cuadro de texto.
//
// Propiedades de un campo:
//   { id, tipo, label, opciones?, requerido?, visibleSi?, categoria?, unidad?, sumatoria?, hint?, max? }
//   - visibleSi: expresión booleana en string evaluada contra los valores del
//     formulario actual (ej: "comiteConformado === 'Sí'").
//   - categoria: para tipo 'especies' → 'Forestales'|'Frutales'|'Ornamentales'|'Medicinales'.
//   - unidad:    'kilogramos' | 'gramos' | 'unidades' (para sumatorias con métrica).
//   - max:       tope de validación (ej: meta de brinzales).

/* ==================== CAMPOS COMUNES (todas las actividades) ==================== */
// El responsable principal SIEMPRE sale desde /personal (no texto libre).
const RESPONSABLE_PRINCIPAL = {
  id: 'responsablePrincipal',
  tipo: 'personal',
  label: 'Responsable principal *',
  requerido: true,
  hint: 'Selecciona de tu equipo cargado en "Mi Personal".'
};

// Vinculación opcional con otros miembros del equipo (precargados).
const VINCULACION_EQUIPO = {
  id: 'vinculaciones',
  tipo: 'personal_multi',
  label: '¿Participó otro personal del equipo?',
  hint: 'Selecciona quiénes participaron y especifica qué hizo cada uno.'
};

/* ==================== ACOMPAÑAMIENTO Y MOVILIZACIÓN (con sumatoria) ==================== */
// Entes adscritos / ministerios con nº de participantes por cada uno.
// Sumatoria automática → "Disgregación de fuerzas movilizadas".
const ACOMPANAMIENTO = {
  id: 'acompanamiento',
  tipo: 'acompanamiento',
  label: 'Acompañamiento y Movilización',
  entes: 'ENTES_ADSCRITOS',
  ministerios: 'MINISTERIOS'
};

// Campos comunes antepuestos a toda actividad (además del responsable).
export const CAMPOS_COMUNES = [
  RESPONSABLE_PRINCIPAL,
  VINCULACION_EQUIPO,
  ACOMPANAMIENTO
];

/* ==================== ESQUEMAS POR GERENCIA ==================== */
export const ESQUEMAS = {

  /* ========== ORGANIZACIÓN ========== */
  organizacion: {
    'Conformación de Brigada Ecosocialista': {
      label: 'Conformación de Brigada Ecosocialista',
      campos: [
        { id: 'tipoBrigada', tipo: 'select', label: 'Tipo de brigada *', requerido: true,
          opciones: ['Brigada Ecosocialista'] },
        { id: 'cantidadBrigadas', tipo: 'number', label: 'Cantidad de brigadas conformadas *', requerido: true },
        { id: 'miembrosBrigada', tipo: 'number', label: 'Miembros por brigada *', requerido: true },
        { id: 'clasificacionBrigada', tipo: 'select', label: 'Clasificación por edades *', requerido: true,
          opciones: [
            'Araguaney I (0 a 5 años)', 'Araguaney II (6 a 9 años)', 'Araguaney III (10 a 11 años)',
            'Jacaranda I (12 a 14 años)', 'Jacaranda II (15 a 17 años)',
            'Mango (Superior de 31 años)', 'Distintas Edades'
          ] },
        { id: 'nombreBrigada', tipo: 'text', label: 'Nombre de la brigada' }
      ]
    },
    'Juramentación de Brigada': {
      label: 'Juramentación de Brigada',
      campos: [
        { id: 'brigada', tipo: 'brigada', label: 'Brigada ecosocialista a juramentar *', requerido: true,
          hint: 'Solo se listan las brigadas registradas por Organización.' },
        { id: 'miembrosBrigada', tipo: 'number', label: 'Miembros juramentados *', requerido: true }
      ]
    },
    'Conformación de Comité Ecosocialista': {
      label: 'Conformación de Comité Ecosocialista',
      campos: [
        { id: 'nombreComite', tipo: 'text', label: 'Nombre del comité *', requerido: true },
        { id: 'consejoVinculado', tipo: 'consejo', label: 'Consejo ecosocialista vinculado (si aplica)' },
        { id: 'integrantes', tipo: 'number', label: 'Cantidad de integrantes' }
      ]
    },
    'Renovación de Comité Ecosocialista': {
      label: 'Renovación de Comité Ecosocialista',
      campos: [
        { id: 'comite', tipo: 'comite', label: 'Comité ecosocialista a renovar *', requerido: true },
        { id: 'detalleRenovacion', tipo: 'textarea', label: 'Detalle de la renovación (vocerías, etc.)' }
      ]
    },
    'Asamblea Comunitaria': {
      label: 'Asamblea Comunitaria',
      campos: [
        { id: 'tipoAsamblea', tipo: 'text', label: 'Tipo de asamblea comunitaria *', requerido: true,
          hint: 'Ej: renovación de vocerías, aprobación de proyecto, contraloría...' },
        { id: 'seConformoComite', tipo: 'select', label: '¿Se conformó/atendió un comité ecosocialista?',
          opciones: ['Sí', 'No'] },
        { id: 'comite', tipo: 'comite', label: 'Comité ecosocialista', visibleSi: "seConformoComite === 'Sí'" },
        { id: 'seConformoConsejo', tipo: 'select', label: '¿Se conformó/atendió un consejo ecosocialista?',
          opciones: ['Sí', 'No'] },
        { id: 'consejo', tipo: 'consejo', label: 'Consejo ecosocialista', visibleSi: "seConformoConsejo === 'Sí'" },
        { id: 'logros', tipo: 'textarea', label: '¿Qué se logró en la asamblea?' }
      ]
    },
    'Reunión con Consejo Comunal': {
      label: 'Reunión con Consejo Comunal',
      campos: [
        { id: 'temaReunion', tipo: 'text', label: 'Tema de la reunión *', requerido: true },
        { id: 'acuerdos', tipo: 'textarea', label: 'Acuerdos alcanzados' }
      ]
    },
    'Reunión con Comuna / Circuito Comunal': {
      label: 'Reunión con Comuna / Circuito Comunal',
      campos: [
        { id: 'temaReunion', tipo: 'text', label: 'Tema de la reunión *', requerido: true },
        { id: 'acuerdos', tipo: 'textarea', label: 'Acuerdos alcanzados' }
      ]
    },
    'Mesa de Gestión Forestal': {
      label: 'Mesa de Gestión Forestal',
      campos: [
        { id: 'temaMesa', tipo: 'text', label: 'Tema tratado *', requerido: true },
        { id: 'instituciones', tipo: 'otro', label: 'Instituciones participantes',
          opciones: ['Minec', 'Conare', 'Inparques', 'Alcaldía', 'Gobernación'] },
        { id: 'acuerdos', tipo: 'textarea', label: 'Acuerdos' }
      ]
    },
    'Articulación Interinstitucional': {
      label: 'Articulación Interinstitucional',
      campos: [
        { id: 'instancias', tipo: 'checkbox', label: 'Instancias con las que se articuló *', requerido: true,
          opciones: [
            'Consejo Comunal', 'Equipo Político Parroquial', 'Equipo Político Municipal',
            'Equipo Político Estadal', 'Alcaldía', 'Gobernación', 'Diputados',
            'Concejo Municipal', 'Concejo Estadal (CLEC)', 'Partido Político', 'Otro'
          ] },
        { id: 'queSeLogro', tipo: 'textarea', label: '¿Qué se logró con la articulación? *', requerido: true }
      ]
    },
    'Directorio / Reunión de Planificación': {
      label: 'Directorio / Reunión de Planificación',
      campos: [
        { id: 'acuerdos', tipo: 'textarea', label: 'Acuerdos alcanzados *', requerido: true }
      ]
    },
    'Acompañamiento a Movimientos Sociales': {
      label: 'Acompañamiento a Movimientos Sociales',
      campos: [
        { id: 'movimiento', tipo: 'text', label: 'Movimiento social acompañado *', requerido: true },
        { id: 'tipoAcompanamiento', tipo: 'textarea', label: 'Tipo de acompañamiento / qué se hizo' }
      ]
    },
    'Censo / Mapeo de Voluntariado': {
      label: 'Censo / Mapeo de Voluntariado',
      campos: [
        { id: 'personasCensadas', tipo: 'number', label: 'Personas censadas *', requerido: true },
        { id: 'observaciones', tipo: 'textarea', label: 'Observaciones' }
      ]
    },
    'Inspección al Territorio': {
      label: 'Inspección al Territorio',
      campos: [
        { id: 'objetivoInspeccion', tipo: 'select', label: 'Objetivo de la inspección *', requerido: true,
          opciones: [
            'Visitar brigada ecosocialista', 'Visitar comité ecosocialista',
            'Visitar consejo ecosocialista', 'Verificar producción (vivero)',
            'Evaluar problemática ambiental', 'Coordinación de reunión con consejo comunal', 'Otro'
          ] },
        { id: 'brigada', tipo: 'brigada', label: 'Brigada inspeccionada', visibleSi: "objetivoInspeccion === 'Visitar brigada ecosocialista'" },
        { id: 'comite', tipo: 'comite', label: 'Comité inspeccionado', visibleSi: "objetivoInspeccion === 'Visitar comité ecosocialista'" },
        { id: 'consejo', tipo: 'consejo', label: 'Consejo inspeccionado', visibleSi: "objetivoInspeccion === 'Visitar consejo ecosocialista'" },
        { id: 'vivero', tipo: 'vivero', label: 'Vivero inspeccionado', visibleSi: "objetivoInspeccion === 'Verificar producción (vivero)'" },
        { id: 'resultado', tipo: 'textarea', label: 'Resultado de la inspección *', requerido: true }
      ]
    },
    'Otro (especificar)': {
      label: 'Otro (especificar)',
      campos: [
        { id: 'descripcion', tipo: 'textarea', label: 'Describe la actividad *', requerido: true }
      ]
    }
  },

  /* ========== PRODUCCIÓN ========== */
  produccion: {
    'Recolección de Semillas': {
      label: 'Recolección de Semillas',
      campos: [
        { id: 'especies', tipo: 'especies_multi', label: 'Especies recolectadas *', requerido: true,
          unidad: 'kilogramos', sumatoria: true,
          hint: 'Elige la unidad (kg o gr) y la cantidad por especie. El total se calcula solo.' },
        { id: 'conservacionEmpaque', tipo: 'select', label: 'Conservación por empaque',
          opciones: ['Bolsa de Papel', 'Bolsa de Plástico', 'Recipiente de Vidrio', 'Recipiente Metálico', 'Saco', 'Caja de Cartón'] },
        { id: 'conservacionEspacio', tipo: 'select', label: 'Conservación por espacio',
          opciones: ['Estantería', 'Residencia Personal', 'Refrigerada', 'Vivero', 'Otro'] },
        { id: 'ubicacionAlmacen', tipo: 'text', label: 'Ubicación de almacenamiento' }
      ]
    },
    'Recolección de Brinzales': {
      label: 'Recolección de Brinzales',
      campos: [
        { id: 'metaTotal', tipo: 'number', label: 'Meta total de brinzales (opcional)',
          hint: 'Si la defines, los recuadros por especie avisan al superarla.' },
        { id: 'especies', tipo: 'especies_multi', label: 'Brinzales recolectados por especie *', requerido: true,
          unidad: 'unidades', sumatoria: true }
      ]
    },
    'Llenado de Bolsas': {
      label: 'Llenado de Bolsas',
      campos: [
        { id: 'bolsasLlenadas', tipo: 'number', label: 'Bolsas llenadas *', requerido: true },
        { id: 'sustratoPreparado', tipo: 'number', label: 'Sustrato preparado (kg)' }
      ]
    },
    'Germinación de Semillas': {
      label: 'Germinación de Semillas',
      campos: [
        { id: 'sabePlantas', tipo: 'select', label: '¿Sabe qué plantas están germinando?', opciones: ['Sí', 'No'] },
        { id: 'especies', tipo: 'especies_multi', label: 'Especies germinando *', requerido: true,
          unidad: 'unidades', sumatoria: true }
      ]
    },
    'Producción de Sustrato / Abono / Biofertilizante': {
      label: 'Producción de Sustrato / Abono / Biofertilizante',
      campos: [
        { id: 'sustratoPreparado', tipo: 'number', label: 'Cantidad preparada (kg)' },
        { id: 'acarreoSustrato', tipo: 'number', label: 'Cantidad de acarreo (kg)' }
      ]
    },
    'Corte de Esquejes': {
      label: 'Corte de Esquejes',
      campos: [
        { id: 'especies', tipo: 'especies_multi', label: 'Especies (esquejes) *', requerido: true,
          unidad: 'unidades', sumatoria: true }
      ]
    },
    'Mantenimiento de Vivero': {
      label: 'Mantenimiento de Vivero',
      campos: [
        { id: 'vivero', tipo: 'vivero', label: 'Vivero atendido *', requerido: true },
        { id: 'labores', tipo: 'textarea', label: 'Labores realizadas' }
      ]
    },
    'Creación y/o Monitoreo de Espacios Productivos': {
      label: 'Creación y/o Monitoreo de Espacios Productivos',
      campos: [
        { id: 'tipoEspacio', tipo: 'select', label: 'Tipo de espacio *', requerido: true,
          opciones: ['VIVERO INSTITUCIONAL', 'VIVERO COMUNITARIO', 'VIVERO ESCOLAR', 'ESPACIO PRODUCTIVO', 'BANCO DE GERMOPLASMA'] },
        { id: 'capacidadInstalada', tipo: 'number', label: 'Capacidad instalada (unidades)',
          hint: 'Para viveros: capacidad de plantas.' },
        { id: 'canterosLlenados', tipo: 'number', label: 'Canteros llenados' },
        { id: 'bolsasLlenadas', tipo: 'number', label: 'Bolsas llenadas' }
      ]
    },
    'Identificación de Espacios de Banco de Germoplasma': {
      label: 'Identificación de Espacios de Banco de Germoplasma',
      campos: [
        { id: 'nombreBanco', tipo: 'text', label: 'Nombre del espacio *', requerido: true },
        { id: 'capacidadBanco', tipo: 'number', label: 'Capacidad de almacenamiento (kg)' }
      ]
    },
    'Entrega de Semillas a Instituciones / Comunidades': {
      label: 'Entrega de Semillas a Instituciones / Comunidades',
      campos: [
        { id: 'institucion', tipo: 'text', label: 'Institución / comunidad receptora *', requerido: true },
        { id: 'especies', tipo: 'especies_multi', label: 'Semillas entregadas por especie *', requerido: true,
          unidad: 'kilogramos', sumatoria: true }
      ]
    },
    'Hagamos del Plástico un Árbol': {
      label: 'Hagamos del Plástico un Árbol',
      campos: [
        { id: 'bolsasPlasticas', tipo: 'number', label: 'Bolsas plásticas recolectadas' },
        { id: 'tapas', tipo: 'number', label: 'Tapas recolectadas' },
        { id: 'botellas', tipo: 'number', label: 'Botellas recolectadas' },
        { id: 'otroPlastico', tipo: 'number', label: 'Otro plástico reutilizable (kg)' }
      ]
    },
    'Preparación de Canteros': {
      label: 'Preparación de Canteros',
      campos: [
        { id: 'canterosLlenados', tipo: 'number', label: 'Canteros preparados *', requerido: true },
        { id: 'sustratoPreparado', tipo: 'number', label: 'Sustrato utilizado (kg)' }
      ]
    },
    'Otro (especificar)': {
      label: 'Otro (especificar)',
      campos: [
        { id: 'descripcion', tipo: 'textarea', label: 'Describe la actividad *', requerido: true }
      ]
    }
  },

  /* ========== FORMACIÓN ========== */
  formacion: {
    'Taller Formativo': {
      label: 'Taller Formativo',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema formativo *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true },
        { id: 'modalidad', tipo: 'radio', label: 'Modalidad *', opciones: ['Presencial', 'Virtual', 'Mixta'], requerido: true },
        { id: 'materialDidactico', tipo: 'checkbox', label: 'Material didáctico', opciones: ['Video', 'Presentación', 'Dinámica grupal', 'Juegos', 'Otro'] },
        { id: 'seCreoNucleo', tipo: 'select', label: '¿Se creó un núcleo formativo?', opciones: ['Sí', 'No'] },
        { id: 'nucleoFormativo', tipo: 'text', label: 'Núcleo formativo creado', visibleSi: "seCreoNucleo === 'Sí'" },
        { id: 'brigada', tipo: 'brigada', label: 'Brigada vinculada (si aplica)' },
        { id: 'comite', tipo: 'comite', label: 'Comité vinculado (si aplica)' },
        { id: 'consejo', tipo: 'consejo', label: 'Consejo vinculado (si aplica)' }
      ]
    },
    'Conversatorio': {
      label: 'Conversatorio',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true },
        { id: 'modalidad', tipo: 'radio', label: 'Modalidad', opciones: ['Presencial', 'Virtual', 'Mixta'] },
        { id: 'seCreoNucleo', tipo: 'select', label: '¿Se creó un núcleo formativo?', opciones: ['Sí', 'No'] },
        { id: 'nucleoFormativo', tipo: 'text', label: 'Núcleo formativo creado', visibleSi: "seCreoNucleo === 'Sí'" }
      ]
    },
    'Cineforo Ambiental': {
      label: 'Cineforo Ambiental',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema / película *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Charla Educativa': {
      label: 'Charla Educativa',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Seminario': {
      label: 'Seminario',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true },
        { id: 'modalidad', tipo: 'radio', label: 'Modalidad', opciones: ['Presencial', 'Virtual', 'Mixta'] }
      ]
    },
    'Foro Nacional': {
      label: 'Foro Nacional',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Aulas Verdes para la Práctica Ecosocialista': {
      label: 'Aulas Verdes para la Práctica Ecosocialista',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Aulas Abiertas Vivero Misión Árbol': {
      label: 'Aulas Abiertas Vivero Misión Árbol',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Rutas Pedagógicas "Árboles de mi Comunidad"': {
      label: 'Rutas Pedagógicas "Árboles de mi Comunidad"',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Diplomado': {
      label: 'Diplomado',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true },
        { id: 'modalidad', tipo: 'radio', label: 'Modalidad', opciones: ['Presencial', 'Virtual', 'Mixta'] }
      ]
    },
    'Eco-sendero': {
      label: 'Eco-sendero',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Expedición Pedagógica': {
      label: 'Expedición Pedagógica',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Jueves Eco Productivos para la Propagación Vegetal': {
      label: 'Jueves Eco Productivos para la Propagación Vegetal',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Gran Jornada de Recolección de Semillas': {
      label: 'Gran Jornada de Recolección de Semillas',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Gran Jornada de Elaboración de Sustrato': {
      label: 'Gran Jornada de Elaboración de Sustrato',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Despliegue Nacional 1E1A (Un Estudiante, Un Árbol)': {
      label: 'Despliegue Nacional 1E1A (Un Estudiante, Un Árbol)',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Conversatorio Programa 1E1A': {
      label: 'Conversatorio Programa 1E1A',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Actividad Recreativa Ecológica': {
      label: 'Actividad Recreativa Ecológica',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Visita Técnica': {
      label: 'Visita Técnica',
      campos: [
        { id: 'tema', tipo: 'text', label: 'Tema *', requerido: true },
        { id: 'personasSensibilizadas', tipo: 'number', label: 'Personas sensibilizadas *', requerido: true }
      ]
    },
    'Otro (especificar)': {
      label: 'Otro (especificar)',
      campos: [
        { id: 'descripcion', tipo: 'textarea', label: 'Describe la actividad *', requerido: true }
      ]
    }
  },

  /* ========== PLANTACIÓN ========== */
  plantacion: {
    'Jornada de Reforestación': {
      label: 'Jornada de Reforestación',
      campos: [
        { id: 'subtipo', tipo: 'select', label: 'Tipo de reforestación *', requerido: true,
          opciones: ['Forestal', 'Frutal', 'Mixta', 'Preventiva (Ríos / Quebradas)', 'Conservación de Manglar', 'Conmemorativa'] },
        { id: 'especies', tipo: 'especies_multi', label: 'Especies establecidas *', requerido: true,
          unidad: 'unidades', sumatoria: true },
        { id: 'porte', tipo: 'select', label: 'Porte de las plantas *', requerido: true,
          opciones: ['1cm a 30cm', '31cm a 50cm', '51cm a 1M'] },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas (latitud / longitud)' },
        { id: 'dimensionesArea', tipo: 'text', label: 'Dimensiones del área (m² / ha)' },
        { id: 'tipoZona', tipo: 'select', label: 'Tipo de zona atendida *', requerido: true,
          opciones: [
            'PARQUE NACIONAL', 'PARQUES MUNICIPALES Y BOSQUES URBANOS',
            'ÁREAS RURALES DE DESARROLLO INTEGRAL', 'ÁREAS BOSCOSAS BAJO PROTECCIÓN',
            'ÁREAS DE PROTECCIÓN Y RECUPERACIÓN AMBIENTAL', 'ZONAS PROTECTORAS',
            'RESERVA FORESTAL NATURAL', 'RESERVA DE FAUNA SILVESTRE',
            'BOSQUES Y ÁREAS BOSCOSAS PERIURBANAS', 'ÁREAS CRÍTICAS CON PRIORIDAD DE TRATAMIENTO'
          ] },
        { id: 'tipoArea', tipo: 'radio', label: 'Tipo de área *', opciones: ['NUEVA', 'REPOSICIÓN'], requerido: true },
        { id: 'caracteristicasSuelo', tipo: 'radio', label: 'Características del suelo *', requerido: true,
          opciones: ['Limoso', 'Arcilloso', 'Arenoso', 'Otro'] },
        { id: 'afectacionBanco', tipo: 'radio', label: 'Afectación del banco de tierra *', requerido: true,
          opciones: ['Ninguna', 'Incendio Forestal', 'Aprovechamiento agrícola', 'Expansión periurbana', 'Otro'] }
      ]
    },
    'Plantación Ornamental / Paisajismo': {
      label: 'Plantación Ornamental / Paisajismo',
      campos: [
        { id: 'especies', tipo: 'especies_multi', label: 'Especies establecidas *', requerido: true,
          unidad: 'unidades', sumatoria: true },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Identificación de Árboles Semilleros': {
      label: 'Identificación de Árboles Semilleros',
      campos: [
        { id: 'arbolesSemilleros', tipo: 'number', label: 'Cantidad de árboles semilleros *', requerido: true },
        { id: 'especiesIdentificadas', tipo: 'text', label: 'Especies identificadas' },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Conservación de Especies Establecidas': {
      label: 'Conservación de Especies Establecidas',
      campos: [
        { id: 'arbolesAtendidos', tipo: 'number', label: 'Cantidad de árboles atendidos *', requerido: true },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Atención a Árboles (Mantenimiento Fitosanitario)': {
      label: 'Atención a Árboles (Mantenimiento Fitosanitario)',
      campos: [
        { id: 'arbolesRecuperados', tipo: 'number', label: 'Cantidad de árboles recuperados *', requerido: true },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Realización de Hoyaduras': {
      label: 'Realización de Hoyaduras',
      campos: [
        { id: 'cantidadHoyaduras', tipo: 'number', label: 'Cantidad de hoyaduras *', requerido: true },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Lanzamiento de Avíos': {
      label: 'Lanzamiento de Avíos',
      campos: [
        { id: 'cantidadAvios', tipo: 'number', label: 'Cantidad de avíos *', requerido: true },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Aplicación de Instrumento para Bancos de Tierra': {
      label: 'Aplicación de Instrumento para Bancos de Tierra',
      campos: [
        { id: 'caracteristicasSuelo', tipo: 'radio', label: 'Características del suelo',
          opciones: ['Limoso', 'Arcilloso', 'Arenoso', 'Otro'] },
        { id: 'afectacionBanco', tipo: 'radio', label: 'Afectación',
          opciones: ['Ninguna', 'Incendio Forestal', 'Aprovechamiento agrícola', 'Expansión periurbana', 'Otro'] },
        { id: 'coordenadas', tipo: 'coordenadas', label: 'Coordenadas' }
      ]
    },
    'Eco-senderismo / Expedición Pedagógica': {
      label: 'Eco-senderismo / Expedición Pedagógica',
      campos: [
        { id: 'dimensionesArea', tipo: 'text', label: 'Dimensiones del sendero (m / km)' },
        { id: 'tipoZona', tipo: 'select', label: 'Tipo de zona',
          opciones: ['PARQUE NACIONAL', 'PARQUES MUNICIPALES Y BOSQUES URBANOS', 'ÁREAS RURALES DE DESARROLLO INTEGRAL', 'ÁREAS BOSCOSAS BAJO PROTECCIÓN'] }
      ]
    },
    'Ruta Pedagógica "Árboles de mi Comunidad"': {
      label: 'Ruta Pedagógica "Árboles de mi Comunidad"',
      campos: [
        { id: 'dimensionesArea', tipo: 'text', label: 'Dimensiones de la ruta (m / km)' },
        { id: 'tipoZona', tipo: 'select', label: 'Tipo de zona',
          opciones: ['PARQUE NACIONAL', 'PARQUES MUNICIPALES Y BOSQUES URBANOS', 'ÁREAS RURALES DE DESARROLLO INTEGRAL'] }
      ]
    },
    'Otro (especificar)': {
      label: 'Otro (especificar)',
      campos: [
        { id: 'descripcion', tipo: 'textarea', label: 'Describe la actividad *', requerido: true }
      ]
    }
  },

  /* ========== POLÍTICAS ========== */
  politicas: {
    'Otro (especificar)': {
      label: 'Actividad Política',
      campos: [
        { id: 'tipoActividad', tipo: 'text', label: 'Tipo de actividad política *', requerido: true,
          hint: 'Ej: Movilización, Marcha, Concentración, Acto político, Jornada de calle...' },
        { id: 'organizaciones', tipo: 'checkbox', label: 'Organizaciones participantes *', requerido: true,
          opciones: ['PSUV', 'JPSUV', 'Movimientos sociales', 'Comunas', 'Consejos Comunales', 'Milicia Bolivariana', 'Otro'] },
        { id: 'cantidadAsistentes', tipo: 'number', label: 'Cantidad de asistentes *', requerido: true },
        { id: 'convocatoria', tipo: 'radio', label: 'Convocatoria',
          opciones: ['Nacional', 'Estadal', 'Municipal', 'Parroquial', 'Comunal'] },
        { id: 'descripcion', tipo: 'textarea', label: 'Descripción de la actividad *', requerido: true },
        { id: 'objetivo', tipo: 'textarea', label: 'Objetivo o finalidad *', requerido: true }
      ]
    }
  }
};

/* ==================== HELPERS ==================== */
/**
 * Devuelve el esquema de una gerencia + tipo de actividad.
 * @param {string} gerencia
 * @param {string} tipoActividad
 * @returns {{ label: string, campos: Array } | null}
 */
export function esquemaDe(gerencia, tipoActividad) {
  const porGerencia = ESQUEMAS[gerencia];
  if (!porGerencia) return null;
  return porGerencia[tipoActividad] || null;
}

/**
 * Lista los tipos de actividad de una gerencia en el orden del esquema.
 * @param {string} gerencia
 * @returns {string[]}
 */
export function tiposActividadDe(gerencia) {
  const porGerencia = ESQUEMAS[gerencia];
  return porGerencia ? Object.keys(porGerencia) : [];
}
