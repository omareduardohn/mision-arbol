// js/navegacion.js
// Construcción dinámica del menú lateral, dispatcher de paneles y carga
// diferida de módulos (imports dinámicos).
//
// Responsabilidades:
//   - Definir la estructura de menús por rol (MENUS).
//   - Inyectar el módulo extra según gerencia para reporte_nacional
//     (MODULOS_POR_GERENCIA).
//   - Construir el DOM del menú de forma segura (sin innerHTML con datos).
//   - Cambiar de panel y delegar la carga al módulo correspondiente.
//   - Filtrar subpaneles del panel-control según qué item del menú se
//     haya clickeado (Descargas / Reportes Especiales / Admin Usuarios).
//   - Exponer etiquetaRol() para mostrar el rol legible en la UI.
//
// El menú se construye al recibir el evento 'usuarioListo' disparado por
// auth.js::inicializarDashboard().

const MENUS = {
  control: [
    { panel: 'panel-control',            subpanel: 'subpanel-descargas',           icono: 'fas fa-download',       texto: 'Descargas y Control' },
    { panel: 'panel-control',            subpanel: 'subpanel-reportes-especiales', icono: 'fas fa-file-alt',       texto: 'Reportes Especiales' },
    { panel: 'panel-control',            subpanel: 'subpanel-admin-usuarios',      icono: 'fas fa-users-cog',      texto: 'Administrar Usuarios', badgeId: 'pendingCount' },
    { panel: 'panel-viveros',            icono: 'fas fa-warehouse',        texto: 'Viveros' },
    { panel: 'panel-bancos-tierra',      icono: 'fas fa-mountain',         texto: 'Bancos de Tierra' },
    { panel: 'panel-brigadas',           icono: 'fas fa-users',            texto: 'Brigadas' },
    { panel: 'panel-comites',            icono: 'fas fa-building',         texto: 'Comités' },
    { panel: 'panel-consejos',           icono: 'fas fa-landmark',         texto: 'Consejos' },
    { panel: 'panel-formaciones',        icono: 'fas fa-graduation-cap',   texto: 'Formaciones' },
    { panel: 'panel-nucleos',            icono: 'fas fa-school',           texto: 'Núcleos' },
    { panel: 'panel-voluntariado',       icono: 'fas fa-hand-holding-heart', texto: 'Voluntariado' },
    { panel: 'panel-dashboard-nacional', icono: 'fas fa-chart-line',       texto: 'Dashboard Nacional' }
  ],
  visor_nacional: [
    { panel: 'panel-dashboard-nacional', icono: 'fas fa-chart-line', texto: 'Dashboard Nacional' },
    { panel: 'panel-voluntariado',       icono: 'fas fa-hand-holding-heart', texto: 'Voluntariado' }
  ],
  reporte_nacional: [
    { panel: 'panel-reporte-nacional', icono: 'fas fa-flag',           texto: 'Reporte Nacional' },
    { panel: 'panel-personal',         icono: 'fas fa-user-friends',   texto: 'Mi Personal' },
    { panel: 'panel-planificacion',    icono: 'fas fa-calendar-alt',   texto: 'Planificación' }
  ],
  reporte_estadal: [
    { panel: 'panel-reporte-estadal',  icono: 'fas fa-map-marker-alt', texto: 'Reporte General' },
    { panel: 'panel-personal',         icono: 'fas fa-users',          texto: 'Mi Personal' },
    { panel: 'panel-planificacion',    icono: 'fas fa-calendar-alt',   texto: 'Planificación' }
  ],
  dashboard_nacional: [
    { panel: 'panel-dashboard-nacional', icono: 'fas fa-chart-line', texto: 'Dashboard Nacional' }
  ],
  dashboard_estadal: [
    { panel: 'panel-dashboard-estadal',  icono: 'fas fa-chart-bar',  texto: 'Dashboard Estadal' }
  ]
};

/**
 * Módulo específico que corresponde a cada gerencia.
 * Solo se inyecta en el menú de reporte_nacional.
 */
const MODULOS_POR_GERENCIA = {
  'Producción':   [{ panel: 'panel-viveros',        icono: 'fas fa-warehouse',      texto: 'Viveros' }],
  'Plantación':   [{ panel: 'panel-bancos-tierra',  icono: 'fas fa-mountain',       texto: 'Bancos de Tierra' }],
  'Organización': [
    { panel: 'panel-brigadas', icono: 'fas fa-users',    texto: 'Brigadas' },
    { panel: 'panel-comites',  icono: 'fas fa-building', texto: 'Comités' },
    { panel: 'panel-consejos', icono: 'fas fa-landmark', texto: 'Consejos' }
  ],
  'Formación':    [
    { panel: 'panel-formaciones', icono: 'fas fa-graduation-cap', texto: 'Formaciones' },
    { panel: 'panel-nucleos',     icono: 'fas fa-school',         texto: 'Núcleos' }
  ]
};

const TITULOS = {
  'panel-control':            'Panel de Control y Seguimiento',
  'panel-reporte-nacional':   'Reporte Nacional',
  'panel-reporte-estadal':    'Reporte Estadal',
  'panel-dashboard-estadal':  'Dashboard Estadal',
  'panel-dashboard-nacional': 'Dashboard Nacional',
  'panel-personal':           'Mi Personal',
  'panel-planificacion':      'Planificación de Actividades',
  'panel-formaciones':        'Núcleo de Formación',
  'panel-viveros':            'Gestión de Viveros',
  'panel-bancos-tierra':      'Gestión de Bancos de Tierra',
  'panel-brigadas':           'Gestión de Brigadas',
  'panel-comites':            'Gestión de Comités Ecosocialistas',
  'panel-consejos':           'Gestión de Consejos Ecosocialistas',
  'panel-nucleos':            'Gestión de Núcleos Formativos',
  'panel-voluntariado':       'Voluntariado'
};

/**
 * Subpaneles que viven dentro de `panel-control`.
 * Cuando el usuario clickea uno de los 3 items del menú que apuntan a
 * `panel-control`, se ocultan los otros 2 y se muestra solo el elegido.
 * El resto de paneles no se ve afectado (muestran todos sus subpaneles).
 */
const SUBPANELES_CONTROL = [
  'subpanel-descargas',
  'subpanel-planificaciones',
  'subpanel-reportes-especiales',
  'subpanel-admin-usuarios'
];

/**
 * Mapa: qué subpaneles del panel-control se muestran al seleccionar
 * cada opción del menú.
 *
 * Nota: "Descargas y Control" agrupa DOS subpaneles (descargas + planificaciones)
 * porque son conceptualmente parte de la misma sección de "descargas".
 * Las otras opciones muestran solo su propio subpanel.
 */
const SUBPANELES_VISIBLES_POR_OPCION = {
  'subpanel-descargas':            ['subpanel-descargas', 'subpanel-planificaciones'],
  'subpanel-reportes-especiales':  ['subpanel-reportes-especiales'],
  'subpanel-admin-usuarios':       ['subpanel-admin-usuarios']
};

/**
 * Títulos específicos para los subpaneles del panel-control.
 * Permiten que el header diga "Reportes Especiales" en vez de
 * "Panel de Control y Seguimiento" cuando se navega a ese subpanel.
 */
const TITULOS_SUBPANEL = {
  'subpanel-descargas':            'Descargas y Control',
  'subpanel-reportes-especiales':  'Reportes Especiales',
  'subpanel-admin-usuarios':       'Administración de Usuarios'
};

export function construirMenu(rol, perfil) {
  const nav = document.getElementById('navMenu');
  if (!nav) return;
  nav.innerHTML = '';

  // Copiamos el menú base del rol para no mutar la constante global
  const opciones = [...(MENUS[rol] || [])];

  // Inyectar módulos por gerencia — SOLO para reporte_nacional.
  if (rol === 'reporte_nacional') {
    const modulos = MODULOS_POR_GERENCIA[perfil?.gerencia];
    if (Array.isArray(modulos) && modulos.length) {
      opciones.splice(1, 0, ...modulos);
    }
  }

  opciones.forEach((op, idx) => {
    const item = document.createElement('a');
    item.href = '#';
    item.className = 'nav-link' + (idx === 0 ? ' active' : '');
    item.dataset.panel = op.panel;
    item.dataset.subpanel = op.subpanel || '';

    // Icono — construido por DOM (sin innerHTML)
    const iconSpan = document.createElement('span');
    iconSpan.className = 'nav-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    const iconI = document.createElement('i');
    iconI.className = op.icono;
    iconSpan.appendChild(iconI);

    // Texto — textContent (nunca se interpreta como HTML)
    const textSpan = document.createElement('span');
    textSpan.className = 'nav-text';
    textSpan.textContent = op.texto;

    // Badge opcional (ej: contador de usuarios pendientes)
    if (op.badgeId) {
      textSpan.appendChild(document.createTextNode(' '));
      const badge = document.createElement('span');
      badge.id = op.badgeId;
      badge.className = 'badge bg-warning';
      badge.style.display = 'none';
      badge.textContent = '0';
      textSpan.appendChild(badge);
    }

    item.appendChild(iconSpan);
    item.appendChild(textSpan);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarPanel(op.panel, op.subpanel || null);
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.nav-link').forEach(n => n.removeAttribute('aria-current'));
      item.setAttribute('aria-current', 'page');
      document.getElementById('sidebar').classList.remove('open');
    });

    nav.appendChild(item);
  });

  // Cargar panel por defecto (con su subpanel si tiene)
  const primero = opciones[0];
  if (primero) mostrarPanel(primero.panel, primero.subpanel || null);
}

/**
 * Muestra un panel y, opcionalmente, filtra sus subpaneles.
 *
 * @param {string} panelId      id del panel a mostrar (ej: 'panel-control')
 * @param {string|null} subpanelId  id del subpanel a mostrar dentro del panel.
 *                                  Si es null, se muestran todos los subpaneles.
 *                                  Solo aplica a `panel-control`; el resto de
 *                                  paneles ignora este parámetro.
 */
export function mostrarPanel(panelId, subpanelId = null) {
  // 1. Ocultar todos los paneles
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');

  // 2. Mostrar el panel solicitado
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'block';

  // 3. Filtrado de subpaneles del panel-control
  //    Solo aplica si el panel es `panel-control` y se pasó un subpanelId.
  //    - Con subpanelId: mostrar solo los subpaneles que mapea ese id.
  //    - Sin subpanelId: mostrar todos (comportamiento legacy).
  if (panelId === 'panel-control') {
    const visibles = subpanelId
      ? (SUBPANELES_VISIBLES_POR_OPCION[subpanelId] || [subpanelId])
      : null;

    SUBPANELES_CONTROL.forEach(id => {
      const sp = document.getElementById(id);
      if (!sp) return;
      if (visibles && !visibles.includes(id)) {
        sp.style.display = 'none';
      } else {
        sp.style.display = '';
      }
    });
  }

  // 4. Actualizar título de la página
  const title = document.getElementById('pageTitle');
  if (title) {
    if (panelId === 'panel-control' && subpanelId && TITULOS_SUBPANEL[subpanelId]) {
      title.textContent = TITULOS_SUBPANEL[subpanelId];
    } else {
      title.textContent = TITULOS[panelId] || 'Panel';
    }
  }

  // 5. Cargar contenido del panel
  cargarContenidoPanel(panelId);
}

async function cargarContenidoPanel(panelId) {
  // Importaciones dinámicas para no cargar todo al inicio
  switch (panelId) {
    case 'panel-control': {
      const { cargarPanelControl } = await import('./admin.js');
      cargarPanelControl();
      break;
    }
    case 'panel-reporte-nacional': {
      const { cargarFormularioCumplimiento } = await import('./reportesCumplimiento.js');
      cargarFormularioCumplimiento();
      break;
    }
    case 'panel-reporte-estadal': {
      const { cargarFormularioCumplimiento } = await import('./reportesCumplimiento.js');
      cargarFormularioCumplimiento();
      break;
    }
    case 'panel-dashboard-estadal': {
      const { cargarDashboardEstadal } = await import('./dashboard.js');
      cargarDashboardEstadal();
      break;
    }
    case 'panel-dashboard-nacional': {
      const { cargarDashboardNacional } = await import('./dashboard.js');
      cargarDashboardNacional();
      break;
    }
    case 'panel-viveros': {
      const { cargarPanelViveros } = await import('./viveros.js');
      cargarPanelViveros();
      break;
    }
    case 'panel-bancos-tierra': {
      const { cargarPanelBancos } = await import('./bancosTierra.js');
      cargarPanelBancos();
      break;
    }
    case 'panel-brigadas': {
      const { cargarPanelBrigadas } = await import('./brigadas.js');
      cargarPanelBrigadas();
      break;
    }
    case 'panel-comites': {
      const { cargarPanelComites } = await import('./comites.js');
      cargarPanelComites();
      break;
    }
    case 'panel-consejos': {
      const { cargarPanelConsejos } = await import('./consejos.js');
      cargarPanelConsejos();
      break;
    }
    case 'panel-nucleos': {
      const { cargarPanelNucleos } = await import('./nucleos.js');
      cargarPanelNucleos();
      break;
    }
    case 'panel-voluntariado': {
      const { cargarPanelVoluntariado } = await import('./voluntariado.js');
      cargarPanelVoluntariado();
      break;
    }
    case 'panel-personal': {
      const { cargarPanelPersonal } = await import('./personal.js');
      cargarPanelPersonal();
      break;
    }
    case 'panel-planificacion': {
      const { cargarPanelPlanificacion } = await import('./planificacion.js');
      cargarPanelPlanificacion();
      break;
    }
    case 'panel-formaciones': {
      const { cargarPanelFormaciones } = await import('./formaciones.js');
      cargarPanelFormaciones();
      break;
    }
  }
}

document.addEventListener('usuarioListo', (e) => {
  construirMenu(e.detail.rol, e.detail);
});

document.getElementById('btn-menu')?.addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const abierto = sidebar.classList.toggle('open');
  document.getElementById('btn-menu')?.setAttribute('aria-expanded', String(abierto));
});

/**
 * Retorna el label legible del rol para mostrar en la UI.
 * @param {string} rol
 * @returns {string}
 */
export function etiquetaRol(rol) {
  const etiquetas = {
    control: 'Control y Seguimiento Nacional',
    visor_nacional: 'Visor Nacional',
    reporte_nacional: 'Reporte Nacional',
    reporte_estadal: 'Reporte Estadal',
    dashboard_nacional: 'Gestión Nacional',
    dashboard_estadal: 'Gestión Estadal'
  };
  return etiquetas[rol] || rol || 'Sin rol';
}