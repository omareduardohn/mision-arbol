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
//   - Exponer etiquetaRol() para mostrar el rol legible en la UI.
//
// El menú se construye al recibir el evento 'usuarioListo' disparado por
// auth.js::inicializarDashboard().

const MENUS = {
  control: [
    { panel: 'panel-control',            subpanel: 'subpanel-descargas',            icono: 'fas fa-download',       texto: 'Descargas y Control' },
    { panel: 'panel-control',            subpanel: 'subpanel-reportes-especiales',  icono: 'fas fa-file-alt',       texto: 'Reportes Especiales' },
    { panel: 'panel-control',            subpanel: 'subpanel-admin-usuarios',       icono: 'fas fa-users-cog',      texto: 'Administrar Usuarios', badgeId: 'pendingCount' },
    { panel: 'panel-viveros',            icono: 'fas fa-warehouse',        texto: 'Viveros' },
    { panel: 'panel-bancos-tierra',      icono: 'fas fa-mountain',         texto: 'Bancos de Tierra' },
    { panel: 'panel-brigadas',           icono: 'fas fa-users',            texto: 'Brigadas' },
    { panel: 'panel-formaciones',        icono: 'fas fa-graduation-cap',   texto: 'Formaciones' },
    { panel: 'panel-dashboard-nacional', icono: 'fas fa-chart-line',       texto: 'Dashboard Nacional' }
  ],
  visor_nacional: [
    { panel: 'panel-dashboard-nacional', icono: 'fas fa-chart-line', texto: 'Dashboard Nacional' }
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
 * visor_nacional y dashboard_nacional NO reciben botones;
 * ven la información dentro del dashboard.
 */
const MODULOS_POR_GERENCIA = {
  'Producción':   { panel: 'panel-viveros',        icono: 'fas fa-warehouse',      texto: 'Viveros' },
  'Plantación':   { panel: 'panel-bancos-tierra',  icono: 'fas fa-mountain',       texto: 'Bancos de Tierra' },
  'Organización': { panel: 'panel-brigadas',       icono: 'fas fa-users',          texto: 'Brigadas' },
  'Formación':    { panel: 'panel-formaciones',    icono: 'fas fa-graduation-cap', texto: 'Formaciones' }
};

const TITULOS = {
  'panel-control':            'Panel de Control y Seguimiento',
  'panel-reporte-nacional':   'Reporte Nacional',
  'panel-reporte-estadal':    'Reporte Estadal',
  'panel-dashboard-estadal':  'Dashboard Estadal',
  'panel-dashboard-nacional': 'Dashboard Nacional',
  'panel-personal':           'Mi Personal',
  'panel-planificacion':      'Planificación de Actividades',
  'panel-formaciones':        'Núcleo de Formación'
};

export function construirMenu(rol, perfil) {
  const nav = document.getElementById('navMenu');
  if (!nav) return;
  nav.innerHTML = '';

  // Copiamos el menú base del rol para no mutar la constante global
  const opciones = [...(MENUS[rol] || [])];

  // Inyectar módulo por gerencia — SOLO para reporte_nacional.
  // visor_nacional y dashboard_nacional ven la info dentro del dashboard.
  if (rol === 'reporte_nacional') {
    const modulo = MODULOS_POR_GERENCIA[perfil?.gerencia];
    if (modulo) {
      // Insertar después de "Reporte Nacional" (índice 1)
      opciones.splice(1, 0, modulo);
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
    iconI.className = op.icono; // clase CSS, no HTML
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
      mostrarPanel(op.panel);
      if (op.subpanel) {
        setTimeout(() => {
          const sp = document.getElementById(op.subpanel);
          if (sp) sp.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      // Accesibilidad: indicar link activo
      document.querySelectorAll('.nav-link').forEach(n => n.removeAttribute('aria-current'));
      item.setAttribute('aria-current', 'page');
      document.getElementById('sidebar').classList.remove('open');
    });

    nav.appendChild(item);
  });

  // Cargar panel por defecto
  const primero = opciones[0];
  if (primero) mostrarPanel(primero.panel);
}

export function mostrarPanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'block';

  const title = document.getElementById('pageTitle');
  if (title) title.textContent = TITULOS[panelId] || 'Panel';

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