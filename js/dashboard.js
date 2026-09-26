// js/dashboard.js
import {
  collection, query, where, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import {
  cargarTerritorio,
  municipiosDe,
  parroquiasDe,
  comunasDe,
  consejosComunalesDe,
  ESTADOS_VENEZUELA,
  escapeHTML,
  toDateValue
} from "./datos.js";

let unsubEstadal = null;
let unsubNacional = null;
let unsubPersonalDashboard = null;
let unsubViveros = null;
let unsubBancos = null;
let unsubBrigadas = null;
let unsubPlanificacion = null;
let unsubFormaciones = null;
let chartNacional = null;
let chartRecursos = null;
let chartBrigadasMunicipio = null;
let chartTendencia = null;
let chartPersonalCargo = null;

let estadoActual = null;
let municipioActual = null;
let parroquiaActual = null; 
let comunaActual = null;
let consejoActual = null;

let reportesCache = [];
let personalCache = [];
let viverosCache = [];
let bancosCache = [];
let brigadasCache = [];
let planificacionCache = [];
let formacionesCache = [];

/* ==================== FILTROS GLOBALES ==================== */
const filtrosGlobales = {
  fechaDesde: '',
  fechaHasta: '',
  gerencia: '',
  rangoRapido: ''
};
let activeDashboardId = 'dashboardNacionalContent';
let paginaConsejos = 1;
const busquedasJerarquia = {
  estado: '',
  municipio: '',
  parroquia: '',
  comuna: '',
  consejo: ''
};

function normalizeText(value) {
  return String(value ?? '').trim();
}

/* ==================== DEBOUNCE ==================== */

/**
 * Debounce: ejecuta una función después de N ms sin llamadas.
 * Útil para buscadores que disparan renders pesados.
 */
function debounce(fn, ms = 250) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  };
}

/* ==================== APLICACIÓN DE FILTROS ==================== */

/**
 * Verifica si un reporte pasa los filtros globales (fecha + gerencia).
 */
function reportePasaFiltros(r) {
  // Filtro de fecha
  if (filtrosGlobales.fechaDesde || filtrosGlobales.fechaHasta) {
    const fecha = toDateValue(r.fechaRegistro || r?.actividad?.fecha);
    if (!fecha) return false;

    if (filtrosGlobales.fechaDesde) {
      const desde = new Date(filtrosGlobales.fechaDesde + 'T00:00:00');
      if (fecha < desde) return false;
    }
    if (filtrosGlobales.fechaHasta) {
      const hasta = new Date(filtrosGlobales.fechaHasta + 'T23:59:59');
      if (fecha > hasta) return false;
    }
  }

  // Filtro de gerencia
  if (filtrosGlobales.gerencia) {
    const map = {
      organizacion: 'Organización',
      produccion:   'Producción',
      formacion:    'Formación',
      plantacion:   'Plantación',
      politicas:    'Políticas'
    };
    const gerenciaReporte = map[r.indicador] || r.gerencia || '';
    if (gerenciaReporte !== filtrosGlobales.gerencia) return false;
  }

  return true;
}

/**
 * Determina si un tipo de recurso debe mostrarse según la gerencia filtrada.
 * Viveros → Producción, Bancos → Plantación, Brigadas → Organización.
 */
function recursoVisiblePorFiltro(tipoRecurso) {
  if (!filtrosGlobales.gerencia) return true;
  const map = {
    vivero:  'Producción',
    banco:   'Plantación',
    brigada: 'Organización'
  };
  return map[tipoRecurso] === filtrosGlobales.gerencia;
}

/**
 * Normaliza un reporte para garantizar compatibilidad entre el
 * modelo v1.0 (histórico) y v2.0 (wizard nuevo).
 *
 * - Añade `indicador` derivado de `gerencia` si falta (v1.0).
 * - Garantiza que `participantes` tenga `totalM`, `totalF` y `totalGeneral`.
 *
 * @param {Object} reporte
 * @returns {Object} reporte normalizado
 */
function normalizarReporte(reporte) {
  if (!reporte || typeof reporte !== 'object') return reporte;

  // Derivar indicador de gerencia (v1.0)
  let indicador = reporte.indicador;
  if (!indicador && reporte.gerencia) {
    const mapa = {
      'Organización': 'organizacion',
      'Producción':   'produccion',
      'Formación':    'formacion',
      'Plantación':   'plantacion',
      'Políticas':    'politicas'
    };
    indicador = mapa[reporte.gerencia] || 'otro';
  }

  // Normalizar participantes
  const p = reporte.participantes || {};
  const totalM = Number(p.totalM ?? p.hombres ?? 0);
  const totalF = Number(p.totalF ?? p.mujeres ?? 0);

  return {
    ...reporte,
    indicador: indicador || 'otro',
    participantes: {
      ...p,
      hombres: Number(p.hombres ?? totalM),
      mujeres: Number(p.mujeres ?? totalF),
      totalM,
      totalF,
      totalGeneral: Number(p.totalGeneral ?? (totalM + totalF))
    }
  };
}

function isRecentReport(reporte) {
  const fecha = toDateValue(reporte?.fechaRegistro || reporte?.fecha || reporte?.actividad?.fecha);
  if (!fecha) return false;
  const diffDays = (Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

function reportesEnTerritorio(filtro) {
  const estado = normalizeText(filtro.estado);
  const municipio = normalizeText(filtro.municipio);
  const parroquia = normalizeText(filtro.parroquia);
  const comuna = normalizeText(filtro.comuna);
  const consejo = normalizeText(filtro.consejo);

  return reportesCache.filter((reporte) => {
    // Filtros globales primero (fecha + gerencia)
    if (!reportePasaFiltros(reporte)) return false;

    // Filtros territoriales
    const loc = reporte?.ubicacion || {};
    if (estado && normalizeText(loc.estado) !== estado) return false;
    if (municipio && normalizeText(loc.municipio) !== municipio) return false;
    if (parroquia && normalizeText(loc.parroquia) !== parroquia) return false;
    if (comuna && normalizeText(loc.comuna) !== comuna) return false;
    if (consejo && normalizeText(loc.consejo) !== consejo) return false;
    return true;
  });
}

function personalEnTerritorio(filtro) {
  const estado = normalizeText(filtro.estado);
  const gerencia = normalizeText(filtro.gerencia);

  return personalCache.filter((persona) => {
    if (persona?.activo === false) return false;
    if (estado && normalizeText(persona?.estado) !== estado) return false;
    if (gerencia && normalizeText(persona?.gerencia) !== gerencia) return false;
    return true;
  });
}

/* ==================== RECURSOS (viveros/bancos/brigadas) ==================== */

function recursosEnTerritorio(cache, filtro) {
  const estado = normalizeText(filtro.estado);
  const municipio = normalizeText(filtro.municipio);
  const parroquia = normalizeText(filtro.parroquia);
  const comuna = normalizeText(filtro.comuna);
  const consejo = normalizeText(filtro.consejo);

  return cache.filter((item) => {
    const ub = item?.ubicacion || {};
    if (estado && normalizeText(ub.estado) !== estado) return false;
    if (municipio && normalizeText(ub.municipio) !== municipio) return false;
    if (parroquia && normalizeText(ub.parroquia) !== parroquia) return false;
    if (comuna && normalizeText(ub.comuna) !== comuna) return false;
    if (consejo && normalizeText(ub.consejo) !== consejo) return false;
    return true;
  });
}

function viverosEnTerritorio(filtro) {
  if (!recursoVisiblePorFiltro('vivero')) return [];
  return recursosEnTerritorio(viverosCache, filtro);
}
function bancosEnTerritorio(filtro) {
  if (!recursoVisiblePorFiltro('banco')) return [];
  return recursosEnTerritorio(bancosCache, filtro);
}
function brigadasEnTerritorio(filtro) {
  if (!recursoVisiblePorFiltro('brigada')) return [];
  return recursosEnTerritorio(brigadasCache, filtro);
}

function planificacionEnTerritorio(filtro) {
  const estado = normalizeText(filtro.estado);
  const municipio = normalizeText(filtro.municipio);
  const parroquia = normalizeText(filtro.parroquia);

  return planificacionCache.filter((p) => {
    const ub = p?.ubicacion || {};
    if (estado && normalizeText(ub.estado) !== estado) return false;
    if (municipio && normalizeText(ub.municipio) !== municipio) return false;
    if (parroquia && normalizeText(ub.parroquia) !== parroquia) return false;
    return true;
  });
}

function formacionesEnTerritorio(filtro) {
  const estado = normalizeText(filtro.estado);
  const municipio = normalizeText(filtro.municipio);
  const parroquia = normalizeText(filtro.parroquia);

  return formacionesCache.filter((f) => {
    const ub = f?.ubicacion || {};
    if (estado && normalizeText(ub.estado) !== estado) return false;
    if (municipio && normalizeText(ub.municipio) !== municipio) return false;
    if (parroquia && normalizeText(ub.parroquia) !== parroquia) return false;
    return true;
  });
}

/**
 * Devuelve { total, activos } de una lista de recursos según su campo `estatus`.
 */
function contarRecursosActivos(lista) {
  const total = lista.length;
  const activos = lista.filter(x => x.estatus === 'activo').length;
  return { total, activos, inactivos: total - activos };
}

function getItemsAtCurrentLevel(filtro = {}) {
  if (!filtro.estado) return ESTADOS_VENEZUELA.slice();
  if (!filtro.municipio) return municipiosDe(filtro.estado);
  if (!filtro.parroquia) return parroquiasDe(filtro.estado, filtro.municipio);
  if (!filtro.comuna) return comunasDe(filtro.estado, filtro.municipio, filtro.parroquia);
  if (!filtro.consejo) return consejosComunalesDe(filtro.estado, filtro.municipio, filtro.parroquia, filtro.comuna);
  return [];
}

function getCurrentLevelKey(filtro = {}) {
  if (!filtro.estado) return 'estado';
  if (!filtro.municipio) return 'municipio';
  if (!filtro.parroquia) return 'parroquia';
  if (!filtro.comuna) return 'comuna';
  return 'consejo';
}

function isTerritorioActivo(itemName, filtro, levelKey) {
  const match = { ...filtro, [levelKey]: itemName };
  const hasRecentReport = reportesEnTerritorio(match).some(isRecentReport);
  const hasActivePersonnel = personalEnTerritorio(match).some((persona) => {
    if (persona?.activo === false) return false;
    if (normalizeText(persona?.estado) === '' && normalizeText(persona?.gerencia) === '') return false;
    return true;
  });
  return hasRecentReport || hasActivePersonnel;
}

function contarActivos(filtro = {}, itemsOverride = null) {
  const items = Array.isArray(itemsOverride) ? itemsOverride : getItemsAtCurrentLevel(filtro);
  const levelKey = getCurrentLevelKey(filtro);
  let activos = 0;

  items.forEach((item) => {
    if (isTerritorioActivo(item, filtro, levelKey)) activos += 1;
  });

  return {
    total: items.length,
    activos,
    inactivos: Math.max(items.length - activos, 0)
  };
}

/**
 * Suma los participantes de todos los reportes en un territorio.
 * @param {Object} filtro
 * @returns {{ totalM: number, totalF: number, totalGeneral: number }}
 */
function contarParticipantes(filtro = {}) {
  const reportes = reportesEnTerritorio(filtro);
  let totalM = 0;
  let totalF = 0;
  reportes.forEach(r => {
    const p = r.participantes || {};
    totalM += Number(p.totalM ?? p.hombres ?? 0);
    totalF += Number(p.totalF ?? p.mujeres ?? 0);
  });
  return { totalM, totalF, totalGeneral: totalM + totalF };
}

/**
 * Cuenta los reportes de un territorio agrupados por indicador.
 * Preparado para Fase 10 (Dashboard enriquecido).
 *
 * @param {Object} filtro — { estado, municipio, parroquia, comuna, consejo }
 * @returns {{ organizacion: number, produccion: number, formacion: number,
 *             plantacion: number, politicas: number, otro: number, total: number }}
 */
function contarPorIndicador(filtro = {}) {
  const reportes = reportesEnTerritorio(filtro);
  const counts = {
    organizacion: 0,
    produccion: 0,
    formacion: 0,
    plantacion: 0,
    politicas: 0,
    otro: 0,
    total: reportes.length
  };

  reportes.forEach(r => {
    const ind = r.indicador || 'otro';
    counts[ind] = (counts[ind] || 0) + 1;
  });

  return counts;
}

/**
 * Agrupa las actividades realizadas por cada persona (según su nombre)
 * en un territorio dado, usando el campo `responsables` o `usuarioNombre`
 * de los reportes.
 *
 * @param {Object} filtro  — { estado, municipio, parroquia, comuna, consejo }
 * @returns {Array<{ nombre: string, actividades: number, ultimaFecha: string }>}
 */
function actividadesPorPersona(filtro = {}) {
  const reportes = reportesEnTerritorio(filtro);
  const mapa = {};

  reportes.forEach(r => {
    // Recolectamos todos los nombres asociados al reporte:
    // 1. Responsables (array de { personalId, nombre })
    // 2. Usuario que cargó el reporte (usuarioNombre)
    const nombres = new Set();

    if (Array.isArray(r.responsables)) {
      r.responsables.forEach(resp => {
        if (resp?.nombre) nombres.add(resp.nombre.trim());
      });
    }
    if (r.usuarioNombre) nombres.add(String(r.usuarioNombre).trim());

    const fecha = toDateValue(r.fechaRegistro || r?.actividad?.fecha);
    const fechaStr = fecha ? fecha.toISOString().slice(0, 10) : '';

    nombres.forEach(nombre => {
      if (!nombre) return;
      if (!mapa[nombre]) {
        mapa[nombre] = { nombre, actividades: 0, ultimaFecha: '' };
      }
      mapa[nombre].actividades += 1;

      if (fechaStr && fechaStr > (mapa[nombre].ultimaFecha || '')) {
        mapa[nombre].ultimaFecha = fechaStr;
      }
    });
  });

  return Object.values(mapa)
    .sort((a, b) => b.actividades - a.actividades);
}

/* ==================== UI DE FILTROS GLOBALES ==================== */

/**
 * Renderiza el HTML de la barra de filtros globales.
 * @param {Object} perfil
 * @returns {string}
 */

function renderFiltrosGlobalesHTML(perfil) {
  // ¿Puede filtrar por gerencia?
  // - control: sí
  // - visor_nacional: sí
  // - dashboard_nacional: NO (ya está restringido a su gerencia)
  // - dashboard_estadal: sí (puede ver todas las gerencias en su estado)
  const puedeFiltrarGerencia = ['control', 'visor_nacional', 'dashboard_estadal'].includes(perfil?.rol);

  // El selector de estado solo aparece para usuarios que pueden navegar entre estados.
  // dashboard_estadal ya está bloqueado a su propio estado; no aplica.
  const puedeCambiarEstado = ['control', 'visor_nacional', 'dashboard_nacional'].includes(perfil?.rol);

  const gerencias = ['Organización', 'Producción', 'Formación', 'Plantación', 'Políticas'];
  const rangoActivo = filtrosGlobales.rangoRapido || '';

  const hayFiltroActivo = filtrosGlobales.fechaDesde
    || filtrosGlobales.fechaHasta
    || filtrosGlobales.gerencia
    || filtrosGlobales.rangoRapido;

  return `
    <div class="subpanel" style="
      background: #f9fdf7;
      border-left: 5px solid var(--verde-brillante);
      margin-bottom: 16px;
      padding: 14px 18px;">

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
        <strong style="color: var(--verde-oscuro); font-size: 14px;">
          🔍 Filtros
        </strong>
        ${hayFiltroActivo ? `
          <button type="button" class="btn btn-secondary btn-sm" id="btnLimpiarFiltros">
            ✕ Limpiar filtros
          </button>
        ` : ''}
      </div>

            ${puedeCambiarEstado ? `
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 12px; color: #666;">Estado (navegación rápida)</label>
          <select id="filtroEstado">
            <option value="">Todos los estados</option>
            ${ESTADOS_VENEZUELA.map(e => `
              <option value="${escapeHTML(e)}" ${e === estadoActual ? 'selected' : ''}>${escapeHTML(e)}</option>
            `).join('')}
          </select>
        </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: ${puedeFiltrarGerencia ? '1.3fr 1fr 1fr 1fr' : '1.3fr 1fr 1fr'}; gap: 12px; align-items: end;">
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; color: #666;">Rango</label>
          <select id="filtroRangoRapido">
            <option value="" ${rangoActivo === '' ? 'selected' : ''}>Personalizado</option>
            <option value="7d" ${rangoActivo === '7d' ? 'selected' : ''}>Últimos 7 días</option>
            <option value="30d" ${rangoActivo === '30d' ? 'selected' : ''}>Últimos 30 días</option>
            <option value="90d" ${rangoActivo === '90d' ? 'selected' : ''}>Últimos 90 días</option>
            <option value="1y" ${rangoActivo === '1y' ? 'selected' : ''}>Último año</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; color: #666;">Desde</label>
          <input type="date" id="filtroFechaDesde" value="${filtrosGlobales.fechaDesde}">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label style="font-size: 12px; color: #666;">Hasta</label>
          <input type="date" id="filtroFechaHasta" value="${filtrosGlobales.fechaHasta}">
        </div>
        ${puedeFiltrarGerencia ? `
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 12px; color: #666;">Gerencia</label>
            <select id="filtroGerencia">
              <option value="">Todas</option>
              ${gerencias.map(g => `
                <option value="${g}" ${g === filtrosGlobales.gerencia ? 'selected' : ''}>${g}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Convierte el valor del selector de rango rápido ('7d', '30d', '90d', '1y')
 * en un par de fechas ISO (YYYY-MM-DD) que se asignan a filtrosGlobales.
 *
 * @param {string} valor  '7d' | '30d' | '90d' | '1y' | ''
 */
function aplicarRangoRapido(valor) {
  if (!valor) {
    filtrosGlobales.rangoRapido = '';
    return;
  }

  const hoy = new Date();
  let desde = null;

  switch (valor) {
    case '7d':  desde = new Date(hoy); desde.setDate(hoy.getDate() - 7);  break;
    case '30d': desde = new Date(hoy); desde.setDate(hoy.getDate() - 30); break;
    case '90d': desde = new Date(hoy); desde.setDate(hoy.getDate() - 90); break;
    case '1y':  desde = new Date(hoy); desde.setFullYear(hoy.getFullYear() - 1); break;
    default:
      filtrosGlobales.rangoRapido = '';
      return;
  }

  // Formato YYYY-MM-DD local (no UTC, para no perder un día por zona horaria)
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  filtrosGlobales.fechaDesde = fmt(desde);
  filtrosGlobales.fechaHasta = fmt(hoy);
  filtrosGlobales.rangoRapido = valor;
}

/**
 * Conecta los inputs de filtros para que actualicen el estado global y
 * re-rendericen el dashboard.
 */
function wireFiltrosGlobales() {
  const inputDesde = document.getElementById('filtroFechaDesde');
  const inputHasta = document.getElementById('filtroFechaHasta');
  const inputGer = document.getElementById('filtroGerencia');
  const selectRango = document.getElementById('filtroRangoRapido');
  const selectEstado = document.getElementById('filtroEstado');
  const btnLimpiar = document.getElementById('btnLimpiarFiltros');

  // Rango rápido
  selectRango?.addEventListener('change', () => {
    aplicarRangoRapido(selectRango.value);
    actualizarBarraFiltros();
    renderJerarquia();
  });

  // Desde manual → reset del rango rápido
  inputDesde?.addEventListener('change', () => {
    filtrosGlobales.fechaDesde = inputDesde.value || '';
    filtrosGlobales.rangoRapido = '';
    actualizarBarraFiltros();
    renderJerarquia();
  });

  // Hasta manual → reset del rango rápido
  inputHasta?.addEventListener('change', () => {
    filtrosGlobales.fechaHasta = inputHasta.value || '';
    filtrosGlobales.rangoRapido = '';
    actualizarBarraFiltros();
    renderJerarquia();
  });

  // Gerencia
  inputGer?.addEventListener('change', () => {
    filtrosGlobales.gerencia = inputGer.value || '';
    actualizarBarraFiltros();
    renderJerarquia();
  });

  // Selector rápido de estado (navegación)
  selectEstado?.addEventListener('change', () => {
    const nuevoEstado = selectEstado.value || null;
    paginaConsejos = 1;
    if (!nuevoEstado) {
      // Volver al nivel superior
      estadoActual = null;
      municipioActual = null;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
    } else {
      // Saltar directo al estado elegido
      estadoActual = nuevoEstado;
      municipioActual = null;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      // Limpiar búsquedas jerárquicas hijas para no arrastrar filtros viejos
      busquedasJerarquia.municipio = '';
      busquedasJerarquia.parroquia = '';
      busquedasJerarquia.comuna = '';
      busquedasJerarquia.consejo = '';
    }
    renderJerarquia();
  });

  // Limpiar todo
  btnLimpiar?.addEventListener('click', () => {
    filtrosGlobales.fechaDesde = '';
    filtrosGlobales.fechaHasta = '';
    filtrosGlobales.gerencia = '';
    filtrosGlobales.rangoRapido = '';
    actualizarBarraFiltros();
    renderJerarquia();
  });
}

/**
 * Vuelve a dibujar la barra de filtros (para que aparezca/desaparezca
 * el botón "Limpiar filtros").
 */
function actualizarBarraFiltros() {
  const perfil = window.__perfil || {};
  const contId = activeDashboardId === 'dashboardEstadalContent'
    ? 'filtrosDashboardEstadal'
    : 'filtrosDashboardNacional';
  const cont = document.getElementById(contId);
  if (!cont) return;
  cont.innerHTML = renderFiltrosGlobalesHTML(perfil);
  wireFiltrosGlobales();
}

/**
 * Inyecta la barra de filtros globales ANTES del contenido del dashboard.
 * Solo se ejecuta una vez al cargar el panel.
 */
function montarFiltrosGlobales(activeId, filtrosId, perfil) {
  const cont = document.getElementById(activeId);
  if (!cont) return;

  // Si ya existe la barra, la reusamos
  let filtrosCont = document.getElementById(filtrosId);
  if (!filtrosCont) {
    filtrosCont = document.createElement('div');
    filtrosCont.id = filtrosId;
    cont.parentNode.insertBefore(filtrosCont, cont);
  }

  filtrosCont.innerHTML = renderFiltrosGlobalesHTML(perfil);
  wireFiltrosGlobales();
}

function renderBloquePlanificacion(filtro) {
  const planificaciones = planificacionEnTerritorio(filtro);
  if (planificaciones.length === 0) return '';

  let total = planificaciones.length;
  let ejecutadas = 0;
  let pendientes = 0;
  let canceladas = 0;
  let totalActividades = 0;
  let totalActividadesEjecutadas = 0;

  planificaciones.forEach(p => {
    const estado = p.estado || 'pendiente';
    if (estado === 'ejecutada') ejecutadas++;
    else if (estado === 'cancelada') canceladas++;
    else pendientes++;

    const acts = Array.isArray(p.actividades) ? p.actividades : [];
    totalActividades += acts.length;
    acts.forEach(a => { if (a.ejecutada === true) totalActividadesEjecutadas++; });
  });

  const pctPlan = total > 0 ? Math.round((ejecutadas / total) * 100) : 0;
  const pctActs = totalActividades > 0 ? Math.round((totalActividadesEjecutadas / totalActividades) * 100) : 0;

  return `
    <div class="subpanel" style="margin-top: 12px; background: #f9fdf7;">
      <h3 style="color: var(--verde-medio); margin-bottom: 10px;">
        📅 Planificación en este territorio
      </h3>
      <div class="mini-panel-resumen">
        <div class="kpi-resumen total">📋 ${total} planificaciones</div>
        <div class="kpi-resumen activo">✅ ${ejecutadas} ejecutadas</div>
        <div class="kpi-resumen inactivo">⏳ ${pendientes} pendientes</div>
        ${canceladas > 0 ? `<div class="kpi-resumen inactivo">❌ ${canceladas} canceladas</div>` : ''}
        <div class="kpi-resumen total">📝 ${totalActividades} actividades</div>
        <div class="kpi-resumen porcentaje">${pctPlan}% planificaciones ejecutadas</div>
        <div class="kpi-resumen porcentaje">${pctActs}% actividades ejecutadas</div>
      </div>
    </div>
  `;
}

function renderResumenNivel(filtro = {}) {
  const resumen = contarActivos(filtro);
  const porcentaje = resumen.total ? Math.round((resumen.activos / resumen.total) * 100) : 0;
  const participantes = contarParticipantes(filtro);
  const indicadores = contarPorIndicador(filtro);

  // Recursos específicos
  const viv = contarRecursosActivos(viverosEnTerritorio(filtro));
  const ban = contarRecursosActivos(bancosEnTerritorio(filtro));
  const bri = contarRecursosActivos(brigadasEnTerritorio(filtro));

  // Personal con actividades
  const personal = actividadesPorPersona(filtro);
  const personalActivo = personalEnTerritorio(filtro);
  const formaciones = formacionesEnTerritorio(filtro);

  return `
    <div class="mini-panel-resumen">
      <div class="kpi-resumen total">📊 ${resumen.total} totales</div>
      <div class="kpi-resumen activo">✅ ${resumen.activos} activos</div>
      <div class="kpi-resumen inactivo">❌ ${resumen.inactivos} inactivos</div>
      <div class="kpi-resumen porcentaje">${porcentaje}% cobertura</div>
      <div class="kpi-resumen total">📋 ${indicadores.total} reportes</div>
      <div class="kpi-resumen porcentaje">🎯 ${participantes.totalGeneral} participantes</div>
    </div>
    ${(viv.total + ban.total + bri.total) > 0 ? `
      <div class="mini-panel-resumen" style="margin-top: 8px;">
        ${viv.total > 0 ? `<div class="kpi-resumen activo">🏡 ${viv.activos}/${viv.total} viveros activos</div>` : ''}
        ${ban.total > 0 ? `<div class="kpi-resumen activo">🌾 ${ban.activos}/${ban.total} bancos activos</div>` : ''}
        ${bri.total > 0 ? `<div class="kpi-resumen activo">🎽 ${bri.activos}/${bri.total} brigadas activas</div>` : ''}
      </div>
    ` : ''}
    ${renderBloquePlanificacion(filtro)}
    ${renderBloqueFormaciones(filtro)}
    ${renderBloquePersonal(personal, filtro, personalActivo)}
    ${renderGraficasTerritoriales(filtro)}
  `;
}

function renderBloqueFormaciones(filtro) {
  const formaciones = formacionesEnTerritorio(filtro);
  if (formaciones.length === 0) return '';

  let total = formaciones.length;
  let planificadas = 0;
  let enCurso = 0;
  let finalizadas = 0;
  let canceladas = 0;
  let totalHoras = 0;
  let totalParticipantes = 0;

  const porModalidad = { Presencial: 0, Virtual: 0, Mixta: 0 };

  formaciones.forEach(f => {
    const e = f.estatus || 'planificada';
    if (e === 'planificada') planificadas++;
    else if (e === 'en_curso') enCurso++;
    else if (e === 'finalizada') finalizadas++;
    else if (e === 'cancelada') canceladas++;

    totalHoras += Number(f.duracionHoras) || 0;
    totalParticipantes += Number(f.participantes?.total) || 0;

    const mod = f.modalidad || 'Presencial';
    if (porModalidad[mod] !== undefined) porModalidad[mod]++;
  });

  const pctFinalizadas = total > 0 ? Math.round((finalizadas / total) * 100) : 0;

  return `
    <div class="subpanel" style="margin-top: 12px; background: #f9fdf7;">
      <h3 style="color: var(--verde-medio); margin-bottom: 10px;">
        🎓 Formaciones en este territorio
      </h3>
      <div class="mini-panel-resumen">
        <div class="kpi-resumen total">📋 ${total} formaciones</div>
        <div class="kpi-resumen activo">✅ ${finalizadas} finalizadas</div>
        ${enCurso > 0 ? `<div class="kpi-resumen total">🔄 ${enCurso} en curso</div>` : ''}
        <div class="kpi-resumen inactivo">⏳ ${planificadas} planificadas</div>
        ${canceladas > 0 ? `<div class="kpi-resumen inactivo">❌ ${canceladas} canceladas</div>` : ''}
        <div class="kpi-resumen total">⏱️ ${totalHoras}h acumuladas</div>
        <div class="kpi-resumen porcentaje">${pctFinalizadas}% finalizadas</div>
        <div class="kpi-resumen porcentaje">🎯 ${totalParticipantes} participantes</div>
      </div>
      ${(porModalidad.Presencial + porModalidad.Virtual + porModalidad.Mixta) > 0 ? `
        <div class="mini-panel-resumen" style="margin-top: 8px;">
          ${porModalidad.Presencial > 0 ? `<div class="kpi-resumen activo">Presencial: ${porModalidad.Presencial}</div>` : ''}
          ${porModalidad.Virtual > 0 ? `<div class="kpi-resumen activo">Virtual: ${porModalidad.Virtual}</div>` : ''}
          ${porModalidad.Mixta > 0 ? `<div class="kpi-resumen activo">Mixta: ${porModalidad.Mixta}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Renderiza el bloque "Personal activo en el territorio".
 * Muestra hasta 10 personas ordenadas por cantidad de actividades.
 */

/* ==================== SEMÁFORO DE GESTIÓN ==================== */

/**
 * Calcula el nivel de gestión de un territorio y devuelve:
 * { nivel: 'verde' | 'amarillo' | 'rojo', score: number, detalle: { reportes, personal, recursos } }
 *
 * @param {string} itemName — nombre del territorio (estado/municipio/etc)
 * @param {Object} filtro   — filtros padre
 * @param {string} levelKey — clave del nivel actual
 */
function calcularSemaforo(itemName, filtro, levelKey) {
  const match = { ...filtro, [levelKey]: itemName };

  // Reportes últimos 30 días
  const reportesRecientes = reportesEnTerritorio(match).filter(isRecentReport).length;

  // Personal activo
  const personalActivo = personalEnTerritorio(match).filter(p => p?.activo !== false).length;

  // Recursos activos
  const vivActivos = viverosEnTerritorio(match).filter(v => v.estatus === 'activo').length;
  const banActivos = bancosEnTerritorio(match).filter(b => b.estatus === 'activo').length;
  const briActivas = brigadasEnTerritorio(match).filter(b => b.estatus === 'activo').length;
  const recursosActivos = vivActivos + banActivos + briActivas;

  // Puntuación
  let score = 0;
  if (reportesRecientes > 5)      score += 3;
  else if (reportesRecientes >= 3) score += 2;
  else if (reportesRecientes >= 1) score += 1;

  if (personalActivo > 2)      score += 2;
  else if (personalActivo >= 1) score += 1;

  if (recursosActivos > 2)      score += 2;
  else if (recursosActivos >= 1) score += 1;

  // Nivel
  let nivel = 'rojo';
  if (score >= 5)      nivel = 'verde';
  else if (score >= 3) nivel = 'amarillo';

  return {
    nivel,
    score,
    detalle: { reportes: reportesRecientes, personal: personalActivo, recursos: recursosActivos }
  };
}

/**
 * Genera el HTML del indicador de semáforo.
 */
function renderSemaforoHTML(semaforo) {
  const config = {
    verde:    { color: '#4caf50', emoji: '🟢', label: 'Gestión activa',  title: 'Alta actividad reciente' },
    amarillo: { color: '#ffc107', emoji: '🟡', label: 'Gestión media',   title: 'Actividad moderada' },
    rojo:     { color: '#dc3545', emoji: '🔴', label: 'Gestión baja',    title: 'Poca actividad reciente' }
  };
  const c = config[semaforo.nivel] || config.rojo;
  const d = semaforo.detalle;

  return `
    <div class="semaforo-badge" title="${c.title} — Reportes: ${d.reportes} · Personal: ${d.personal} · Recursos: ${d.recursos}"
         style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 10px; background: ${c.color}22; border: 1px solid ${c.color}; font-size: 10px; font-weight: 700; color: ${c.color}; margin-left: auto;">
      <span>${c.emoji}</span>
      <span>${semaforo.score}/7</span>
    </div>
  `;
}

function renderBloquePersonal(personalActividades, filtro, personalActivo) {
  const tieneActividades = personalActividades && personalActividades.length > 0;
  const activos = personalActivo || [];

  if (!tieneActividades && activos.length === 0) return '';

  // ── KPIs de personal activo ──
  const totalActivos = activos.length;

  // Top 5 cargos
  const porCargo = {};
  activos.forEach(p => {
    const c = (p?.cargo || 'Sin cargo').trim() || 'Sin cargo';
    porCargo[c] = (porCargo[c] || 0) + 1;
  });
  const topCargos = Object.entries(porCargo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Rango etario (si tienen fechaNacimiento)
  const hoy = new Date();
  const conFecha = activos.filter(p => p?.fechaNacimiento);
  let rangosEdad = null;
  if (conFecha.length > 0) {
    const buckets = { '18-25': 0, '26-35': 0, '36-45': 0, '46-60': 0, '60+': 0, 'Sin edad': 0 };
    activos.forEach(p => {
      const fn = p?.fechaNacimiento;
      if (!fn) { buckets['Sin edad']++; return; }
      let fecha;
      try {
        fecha = typeof fn?.toDate === 'function' ? fn.toDate() : new Date(fn);
      } catch (_) { buckets['Sin edad']++; return; }
      if (!fecha || isNaN(fecha)) { buckets['Sin edad']++; return; }
      const edad = Math.floor((hoy - fecha) / (1000 * 60 * 60 * 24 * 365.25));
      if (edad < 26) buckets['18-25']++;
      else if (edad < 36) buckets['26-35']++;
      else if (edad < 46) buckets['36-45']++;
      else if (edad <= 60) buckets['46-60']++;
      else buckets['60+']++;
    });
    rangosEdad = buckets;
  }

  // ── HTML de KPIs ──
  const kpisHTML = `
    <div class="mini-panel-resumen" style="margin-top: 8px;">
      <div class="kpi-resumen total">👥 ${totalActivos} personal activo</div>
      ${topCargos.map(([cargo, cant]) =>
        `<div class="kpi-resumen activo">${escapeHTML(cargo)}: ${cant}</div>`
      ).join('')}
    </div>
  `;

  const edadesHTML = rangosEdad ? `
    <div class="mini-panel-resumen" style="margin-top: 8px;">
      <div class="kpi-resumen total" style="font-weight: 700;">🎂 Rango etario</div>
      ${rangosEdad['18-25'] > 0 ? `<div class="kpi-resumen activo">18–25: ${rangosEdad['18-25']}</div>` : ''}
      ${rangosEdad['26-35'] > 0 ? `<div class="kpi-resumen activo">26–35: ${rangosEdad['26-35']}</div>` : ''}
      ${rangosEdad['36-45'] > 0 ? `<div class="kpi-resumen activo">36–45: ${rangosEdad['36-45']}</div>` : ''}
      ${rangosEdad['46-60'] > 0 ? `<div class="kpi-resumen activo">46–60: ${rangosEdad['46-60']}</div>` : ''}
      ${rangosEdad['60+'] > 0 ? `<div class="kpi-resumen activo">60+: ${rangosEdad['60+']}</div>` : ''}
      ${rangosEdad['Sin edad'] > 0 ? `<div class="kpi-resumen inactivo">Sin fecha: ${rangosEdad['Sin edad']}</div>` : ''}
    </div>
  ` : '';

  // ── Tabla de personal con actividades (la que ya existía) ──
  let tablaHTML = '';
  if (tieneActividades) {
    const top = personalActividades.slice(0, 10);
    const filas = top.map(p => `
      <tr>
        <td style="font-weight: 600;">${escapeHTML(p.nombre)}</td>
        <td style="text-align: center;">
          <span style="background: var(--primary-gradient); color: #fff; padding: 3px 12px; border-radius: 12px; font-weight: 700; font-size: 12px;">
            ${p.actividades}
          </span>
        </td>
        <td style="font-size: 12px; color: #666;">${escapeHTML(p.ultimaFecha || '—')}</td>
      </tr>
    `).join('');
    const resto = personalActividades.length - top.length;
    tablaHTML = `
      <div class="table-container" style="max-height: 320px; margin-top: 12px;">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Nombre</th>
              <th style="text-align: center;">Actividades</th>
              <th>Última fecha</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${resto > 0 ? `<p style="font-size: 11px; color: #888; margin-top: 8px; text-align: center;">… y ${resto} persona${resto !== 1 ? 's' : ''} más</p>` : ''}
    `;
  }

  return `
    <div class="subpanel" style="margin-top: 12px; background: #f9fdf7;">
      <h3 style="color: var(--verde-medio); margin-bottom: 10px;">
        👥 Personal ${tieneActividades ? 'con actividades en este territorio' : 'activo en este territorio'}
        ${tieneActividades ? `(${personalActividades.length})` : ''}
      </h3>
      ${kpisHTML}
      ${edadesHTML}
      ${tablaHTML}
    </div>
  `;
}

/* ==================== GRÁFICAS AVANZADAS ==================== */

/**
 * Devuelve el HTML de la sección de gráficas. Los canvas se inicializan
 * después de inyectar el HTML con inicializarGraficasTerritoriales().
 */
function renderGraficasTerritoriales(filtro) {
  const viv = viverosEnTerritorio(filtro);
  const ban = bancosEnTerritorio(filtro);
  const bri = brigadasEnTerritorio(filtro);
  const reportes = reportesEnTerritorio(filtro);

  // Solo mostramos la sección si hay algo de data
  if (viv.length + ban.length + bri.length + reportes.length === 0) {
    return '';
  }

  return `
    <div class="subpanel" style="margin-top: 12px; background: #f9fdf7;">
      <h3 style="color: var(--verde-medio); margin-bottom: 12px;">
        📈 Análisis visual
      </h3>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">

        ${(viv.length + ban.length + bri.length) > 0 ? `
          <div style="background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="font-size: 13px; font-weight: 700; color: var(--verde-oscuro); margin-bottom: 8px;">
              🏡 Recursos por tipo
            </div>
              <div class="chart-wrapper">
                <canvas id="chartRecursos"></canvas>
              </div>
          </div>
        ` : ''}

        ${reportes.length > 0 ? `
          <div style="background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="font-size: 13px; font-weight: 700; color: var(--verde-oscuro); margin-bottom: 8px;">
              📊 Tendencia últimos 6 meses
            </div>
              <div class="chart-wrapper">
                <canvas id="chartTendencia"></canvas>
              </div>
          </div>
        ` : ''}

        ${filtro.estado && bri.length > 0 ? `
          <div style="background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="font-size: 13px; font-weight: 700; color: var(--verde-oscuro); margin-bottom: 8px;">
              🎽 Brigadas por municipio
            </div>
            <div class="chart-wrapper">
              <canvas id="chartBrigadasMunicipio"></canvas>
            </div>
          </div>
        ` : ''}

        ${personalCache.length > 0 ? `
          <div style="background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="font-size: 13px; font-weight: 700; color: var(--verde-oscuro); margin-bottom: 8px;">
              👤 Personal por cargo
            </div>
            <div class="chart-wrapper">
              <canvas id="chartPersonalCargo"></canvas>
            </div>
          </div>
        ` : ''}

      </div>
    </div>
  `;
}

/**
 * Inicializa los Chart.js correspondientes. Debe llamarse DESPUÉS de que el
 * HTML de renderGraficasTerritoriales() esté en el DOM.
 */
function inicializarGraficasTerritoriales(filtro) {
  if (typeof Chart === 'undefined') return;

  // ===== 1. Recursos por tipo =====
  const ctxRecursos = document.getElementById('chartRecursos')?.getContext('2d');
  if (ctxRecursos) {
    if (chartRecursos) { try { chartRecursos.destroy(); } catch (_) {} }

    const viv = viverosEnTerritorio(filtro);
    const ban = bancosEnTerritorio(filtro);
    const bri = brigadasEnTerritorio(filtro);

    // Contamos por tipo
    const vivPorTipo = {};
    viv.forEach(v => {
      const t = v.tipo || 'Sin tipo';
      vivPorTipo[t] = (vivPorTipo[t] || 0) + 1;
    });
    const briPorTipo = {};
    bri.forEach(b => {
      const t = b.tipo || 'Sin tipo';
      briPorTipo[t] = (briPorTipo[t] || 0) + 1;
    });

    const labels = [
      ...Object.keys(vivPorTipo),
      ...Object.keys(briPorTipo),
      ...(ban.length > 0 ? ['Bancos de tierra'] : [])
    ];
    const data = [
      ...Object.values(vivPorTipo),
      ...Object.values(briPorTipo),
      ...(ban.length > 0 ? [ban.length] : [])
    ];

    // Si todas las etiquetas están vacías, no renderizamos
    if (labels.length > 0) {
      chartRecursos = new Chart(ctxRecursos, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: [
              'rgba(76, 175, 80, 0.85)',
              'rgba(46, 125, 50, 0.85)',
              'rgba(129, 199, 132, 0.85)',
              'rgba(255, 152, 0, 0.85)',
              'rgba(33, 150, 243, 0.85)',
              'rgba(156, 39, 176, 0.85)',
              'rgba(255, 87, 34, 0.85)',
              'rgba(0, 188, 212, 0.85)'
            ],
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Inter', size: 11 }, padding: 10 }
            }
          }
        }
      });
    }
  }

  // ===== 2. Tendencia (adaptativa según filtro) =====
  const ctxTend = document.getElementById('chartTendencia')?.getContext('2d');
  if (ctxTend) {
    if (chartTendencia) { try { chartTendencia.destroy(); } catch (_) {} }

    const reportes = reportesEnTerritorio(filtro);

    // Determinar rango: si hay filtro activo, usar ese rango; si no, últimos 7 días.
    const ahora = new Date();
    const tieneFiltroFecha = filtrosGlobales.fechaDesde || filtrosGlobales.fechaHasta;
    const desde = tieneFiltroFecha && filtrosGlobales.fechaDesde
      ? new Date(filtrosGlobales.fechaDesde + 'T00:00:00')
      : new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hasta = tieneFiltroFecha && filtrosGlobales.fechaHasta
      ? new Date(filtrosGlobales.fechaHasta + 'T23:59:59')
      : ahora;

    // Calcular duración del rango en días
    const diasRango = Math.max(1, Math.ceil((hasta - desde) / (1000 * 60 * 60 * 24)));

    // Decidir bucket: días (≤ 45 días) o semanas (> 45 días)
    const usarSemanas = diasRango > 45;
    const buckets = [];

    if (usarSemanas) {
      // Buckets semanales (máximo 12 semanas)
      const semanasTotal = Math.min(12, Math.ceil(diasRango / 7));
      for (let i = semanasTotal - 1; i >= 0; i--) {
        const inicio = new Date(ahora.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const fin = new Date(ahora.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        buckets.push({
          label: inicio.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }),
          inicio, fin, count: 0
        });
      }
    } else {
      // Buckets diarios
      for (let i = diasRango - 1; i >= 0; i--) {
        const dia = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
        dia.setHours(0, 0, 0, 0);
        const fin = new Date(dia.getTime() + 24 * 60 * 60 * 1000);
        buckets.push({
          label: dia.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }),
          inicio: dia, fin, count: 0
        });
      }
    }

    // Distribuir reportes en los buckets
    reportes.forEach(r => {
      const fecha = toDateValue(r.fechaRegistro || r?.actividad?.fecha);
      if (!fecha) return;
      const b = buckets.find(x => fecha >= x.inicio && fecha < x.fin);
      if (b) b.count += 1;
    });

    const tituloRango = tieneFiltroFecha ? 'Tendencia del período' : 'Últimos 7 días';

    chartTendencia = new Chart(ctxTend, {
      type: 'line',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [{
          label: tituloRango,
          data: buckets.map(b => b.count),
          borderColor: '#2e7d32',
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#4caf50',
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: tituloRango,
            font: { size: 12, weight: '600' },
            color: '#666',
            padding: { bottom: 8 }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0, font: { size: 11 } }
          },
          x: {
            ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 }
          }
        }
      }
    });
  }

  // ===== 3. Brigadas por municipio (solo si hay estado filtrado) =====
  const ctxBriMun = document.getElementById('chartBrigadasMunicipio')?.getContext('2d');
  if (ctxBriMun && filtro.estado) {
    if (chartBrigadasMunicipio) { try { chartBrigadasMunicipio.destroy(); } catch (_) {} }

    const bri = brigadasEnTerritorio({ estado: filtro.estado });
    const porMunicipio = {};
    bri.forEach(b => {
      const mun = b?.ubicacion?.municipio || 'Sin municipio';
      porMunicipio[mun] = (porMunicipio[mun] || 0) + 1;
    });

    const labels = Object.keys(porMunicipio).sort();
    const data = labels.map(l => porMunicipio[l]);

    if (labels.length > 0) {
      chartBrigadasMunicipio = new Chart(ctxBriMun, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Brigadas',
            data,
            backgroundColor: 'rgba(76, 175, 80, 0.75)',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
            x: { ticks: { font: { size: 10 } } }
          }
        }
      });
    }
  }

  // ===== 4. Personal por cargo (usa personalCache) =====
  const ctxPersCargo = document.getElementById('chartPersonalCargo')?.getContext('2d');
  if (ctxPersCargo) {
    if (chartPersonalCargo) { try { chartPersonalCargo.destroy(); } catch (_) {} }

    // Filtramos el personal según el territorio actual
    const personal = personalEnTerritorio(filtro);

    const porCargo = {};
    personal.forEach(p => {
      const c = p?.cargo || 'Sin cargo';
      porCargo[c] = (porCargo[c] || 0) + 1;
    });

    // Top 6 cargos para no saturar el gráfico
    const entries = Object.entries(porCargo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);

    if (labels.length > 0) {
      chartPersonalCargo = new Chart(ctxPersCargo, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Personal',
            data,
            backgroundColor: 'rgba(33, 150, 243, 0.75)',
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
            y: { ticks: { font: { size: 10 } } }
          }
        }
      });
    }
  }
}

/**
 * Renderiza el breadcrumb actual según el nivel de drill-down activo.
 * @returns {string} HTML del breadcrumb.
 */
function normalizar(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function renderBreadcrumb() {
  const perfil = window.__perfil || {};
  const items = [
    { label: 'Estados', nivel: 0 }
  ];

  if (estadoActual) {
    items.push({ label: estadoActual, nivel: 1 });
  }
  if (municipioActual) {
    items.push({ label: municipioActual, nivel: 2 });
  }
  if (parroquiaActual) {
    items.push({ label: parroquiaActual, nivel: 3 });
  }
  if (comunaActual) {
    items.push({ label: comunaActual, nivel: 4 });
  }
  if (consejoActual) {
    items.push({ label: consejoActual, nivel: 5 });
  }

  const html = items.map((item, idx) => {
    const isLast = idx === items.length - 1;
    const display = escapeHTML(item.label);
    if (isLast) {
      return `<span class="actual">${display}</span>`;
    }
    return `<a data-nivel="${item.nivel}">${display}</a>`;
  }).join('<span>›</span>');

  return `<div class="breadcrumb">${html}</div>`;
}

/**
 * Regresa al nivel anterior del breadcrumb del dashboard jerárquico.
 */
function bindBreadcrumbClick() {
  document.querySelectorAll('.breadcrumb a[data-nivel]').forEach((link) => {
    link.addEventListener('click', () => {
      const nivel = Number(link.dataset.nivel || 0);
      paginaConsejos = 1;
      if (nivel === 0) {
        estadoActual = null;
        municipioActual = null;
        parroquiaActual = null;
        comunaActual = null;
        consejoActual = null;
      } else if (nivel === 1) {
        municipioActual = null;
        parroquiaActual = null;
        comunaActual = null;
        consejoActual = null;
      } else if (nivel === 2) {
        parroquiaActual = null;
        comunaActual = null;
        consejoActual = null;
      } else if (nivel === 3) {
        comunaActual = null;
        consejoActual = null;
      } else if (nivel === 4) {
        consejoActual = null;
      }
      renderJerarquia();
    });
  });
}

/**
 * Limpia el término de búsqueda de todos los niveles descendientes
 * del nivel padre indicado. Ej: al entrar a un estado, se limpian
 * municipio, parroquia, comuna y consejo.
 * @param {string} nivelPadre 'estado' | 'municipio' | 'parroquia' | 'comuna' | 'consejo'
 */
function limpiarBusquedasHijas(nivelPadre) {
  const niveles = ['estado', 'municipio', 'parroquia', 'comuna', 'consejo'];
  const idx = niveles.indexOf(nivelPadre);
  if (idx === -1) return;
  for (let i = idx + 1; i < niveles.length; i++) {
    busquedasJerarquia[niveles[i]] = '';
  }
}

function renderEstados() {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;

  const terminoActual = normalizar(busquedasJerarquia.estado);
  const items = ESTADOS_VENEZUELA.filter((estado) => {
    if (!terminoActual) return true;
    return normalizar(estado).includes(terminoActual);
  });
  const total = items.length;
  const cards = items.map((estado) => {
    const reportesEstado = reportesEnTerritorio({ estado }).length;
    const personalEstado = personalEnTerritorio({ estado }).length;
    const participantes = contarParticipantes({ estado });
    const viv = viverosEnTerritorio({ estado }).length;
    const ban = bancosEnTerritorio({ estado }).length;
    const bri = brigadasEnTerritorio({ estado }).length;
    const activo = isTerritorioActivo(estado, {}, 'estado');
    const semaforo = calcularSemaforo(estado, {}, 'estado');

    return `
      <div class="tarjeta-jerarquia ${activo ? 'activo' : 'inactivo'}" data-nombre="${escapeHTML(estado)}" data-estado="${escapeHTML(estado)}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div class="tarjeta-titulo" style="margin-bottom: 0;">${escapeHTML(estado)}</div>
          ${renderSemaforoHTML(semaforo)}
        </div>
        <div class="tarjeta-stats" style="margin-top: 8px;">
          <span>📋 ${reportesEstado} reportes</span>
          <span>👥 ${personalEstado} personas</span>
          ${participantes.totalGeneral > 0 ? `<span>🎯 ${participantes.totalGeneral} participantes</span>` : ''}
          ${viv > 0 ? `<span>🏡 ${viv} viveros</span>` : ''}
          ${ban > 0 ? `<span>🌾 ${ban} bancos</span>` : ''}
          ${bri > 0 ? `<span>🎽 ${bri} brigadas</span>` : ''}
        </div>
        <div class="tarjeta-badge">${activo ? 'ACTIVO' : 'INACTIVO'}</div>
      </div>
    `;
  }).join('');

  const resumen = contarActivos({}, items);
  const porcentaje = resumen.total ? Math.round((resumen.activos / resumen.total) * 100) : 0;

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <div style="margin: 12px 0 16px;">
        <input type="text" class="buscador-nivel" placeholder="Buscar estado..." value="${escapeHTML(busquedasJerarquia.estado)}" />
      </div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label">Estados</div></div>
      </div>
      <div class="grid-tarjetas">${cards}</div>
      <div class="mini-panel-resumen">
        <div class="kpi-resumen total">📊 ${total} totales</div>
        <div class="kpi-resumen activo">✅ ${resumen.activos} activos</div>
        <div class="kpi-resumen inactivo">❌ ${resumen.inactivos} inactivos</div>
        <div class="kpi-resumen porcentaje">${porcentaje}% cobertura</div>
      </div>
        <div style="margin-top: 18px;">
          <div class="chart-wrapper">
            <canvas id="chartEstados"></canvas>
          </div>
        </div>
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('.tarjeta-jerarquia[data-estado]').forEach((card) => {
    card.addEventListener('click', () => {
      estadoActual = card.dataset.estado;
      municipioActual = null;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      limpiarBusquedasHijas('estado');
      renderJerarquia();
    });
  });

  const debouncedBusqueda = debounce((valor) => {
    busquedasJerarquia.estado = valor;
    renderEstados();
  }, 250);

  cont.querySelectorAll('.buscador-nivel').forEach((input) => {
    input.addEventListener('input', (event) => {
      debouncedBusqueda(event.target.value || '');
    });
  });

  setTimeout(() => {
    if (chartNacional) chartNacional.destroy();
    const ctx = document.getElementById('chartEstados')?.getContext('2d');
    if (ctx && typeof Chart !== 'undefined') {
      const labels = ESTADOS_VENEZUELA.map((estado) => estado);
      const data = ESTADOS_VENEZUELA.map((estado) => reportesEnTerritorio({ estado }).length);
      chartNacional = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Reportes',
            data,
            backgroundColor: 'rgba(46, 125, 50, 0.7)'
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }
  }, 50);
}

function renderMunicipios(estado) {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;
  const terminoActual = normalizar(busquedasJerarquia.municipio);
  const items = municipiosDe(estado).filter((municipio) => {
    if (!terminoActual) return true;
    return normalizar(municipio).includes(terminoActual);
  });
  const cards = items.map((municipio) => {
    const filtro = { estado, municipio };
    const reportesMunicipio = reportesEnTerritorio(filtro).length;
    const personalMunicipio = personalEnTerritorio(filtro).length;
    const viv = viverosEnTerritorio(filtro).length;
    const ban = bancosEnTerritorio(filtro).length;
    const bri = brigadasEnTerritorio(filtro).length;
    const activo = isTerritorioActivo(municipio, { estado }, 'municipio');
    const semaforo = calcularSemaforo(municipio, { estado }, 'municipio');

    return `
      <div class="tarjeta-jerarquia ${activo ? 'activo' : 'inactivo'}" data-municipio="${escapeHTML(municipio)}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div class="tarjeta-titulo" style="margin-bottom: 0;">${escapeHTML(municipio)}</div>
          ${renderSemaforoHTML(semaforo)}
        </div>
        <div class="tarjeta-stats" style="margin-top: 8px;">
          <span>📋 ${reportesMunicipio} reportes</span>
          <span>👥 ${personalMunicipio} personas</span>
          ${viv > 0 ? `<span>🏡 ${viv} viveros</span>` : ''}
          ${ban > 0 ? `<span>🌾 ${ban} bancos</span>` : ''}
          ${bri > 0 ? `<span>🎽 ${bri} brigadas</span>` : ''}
        </div>
        <div class="tarjeta-badge">${activo ? 'ACTIVO' : 'INACTIVO'}</div>
      </div>
    `;
  }).join('') || '<p>Sin datos registrados.</p>';

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <button class="btn btn-secondary" data-volver="estado">Volver</button>
      <div style="margin: 12px 0 16px;">
        <input type="text" class="buscador-nivel" placeholder="Buscar municipio..." value="${escapeHTML(busquedasJerarquia.municipio)}" />
      </div>
      <div class="grid-tarjetas">${cards}</div>
      ${renderResumenNivel({ estado })}
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('[data-volver="estado"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      estadoActual = null;
      municipioActual = null;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  cont.querySelectorAll('[data-municipio]').forEach((card) => {
    card.addEventListener('click', () => {
      municipioActual = card.dataset.municipio;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      limpiarBusquedasHijas('municipio');
      renderJerarquia();
    });
  });

  const debouncedBusqueda = debounce((valor) => {
    busquedasJerarquia.municipio = valor;
    renderMunicipios(estado);
  }, 250);

  cont.querySelectorAll('.buscador-nivel').forEach((input) => {
    input.addEventListener('input', (event) => {
      debouncedBusqueda(event.target.value || '');
    });
  });

  setTimeout(() => inicializarGraficasTerritoriales({ estado }), 80);
}

function renderParroquias(estado, municipio) {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;
  const terminoActual = normalizar(busquedasJerarquia.parroquia);
  const items = parroquiasDe(estado, municipio).filter((parroquia) => {
    if (!terminoActual) return true;
    return normalizar(parroquia).includes(terminoActual);
  });
  const cards = items.map((parroquia) => {
    const filtro = { estado, municipio, parroquia };
    const reportesParroquia = reportesEnTerritorio(filtro).length;
    const personalParroquia = personalEnTerritorio(filtro).length;
    const viv = viverosEnTerritorio(filtro).length;
    const ban = bancosEnTerritorio(filtro).length;
    const bri = brigadasEnTerritorio(filtro).length;
    const activo = isTerritorioActivo(parroquia, { estado, municipio }, 'parroquia');
    const semaforo = calcularSemaforo(parroquia, { estado, municipio }, 'parroquia');

    return `
      <div class="tarjeta-jerarquia ${activo ? 'activo' : 'inactivo'}" data-parroquia="${escapeHTML(parroquia)}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div class="tarjeta-titulo" style="margin-bottom: 0;">${escapeHTML(parroquia)}</div>
          ${renderSemaforoHTML(semaforo)}
        </div>
        <div class="tarjeta-stats" style="margin-top: 8px;">
          <span>📋 ${reportesParroquia} reportes</span>
          <span>👥 ${personalParroquia} personas</span>
          ${viv > 0 ? `<span>🏡 ${viv} viveros</span>` : ''}
          ${ban > 0 ? `<span>🌾 ${ban} bancos</span>` : ''}
          ${bri > 0 ? `<span>🎽 ${bri} brigadas</span>` : ''}
        </div>
        <div class="tarjeta-badge">${activo ? 'ACTIVO' : 'INACTIVO'}</div>
      </div>
    `;
  }).join('') || '<p>Sin datos registrados.</p>';

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <button class="btn btn-secondary" data-volver="municipio">Volver</button>
      <div style="margin: 12px 0 16px;">
        <input type="text" class="buscador-nivel" placeholder="Buscar parroquia..." value="${escapeHTML(busquedasJerarquia.parroquia)}" />
      </div>
      <div class="grid-tarjetas">${cards}</div>
      ${renderResumenNivel({ estado, municipio })}
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('[data-volver="municipio"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      municipioActual = null;
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  cont.querySelectorAll('[data-parroquia]').forEach((card) => {
    card.addEventListener('click', () => {
      parroquiaActual = card.dataset.parroquia;
      comunaActual = null;
      consejoActual = null;
      limpiarBusquedasHijas('parroquia');
      renderJerarquia();
    });
  });

  const debouncedBusqueda = debounce((valor) => {
    busquedasJerarquia.parroquia = valor;
    renderParroquias(estado, municipio);
  }, 250);

  cont.querySelectorAll('.buscador-nivel').forEach((input) => {
    input.addEventListener('input', (event) => {
      debouncedBusqueda(event.target.value || '');
    });
  });

  setTimeout(() => inicializarGraficasTerritoriales({ estado, municipio }), 80);
}

function renderComunas(estado, municipio, parroquia) {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;
  const terminoActual = normalizar(busquedasJerarquia.comuna);
  const items = comunasDe(estado, municipio, parroquia).filter((comuna) => {
    if (!terminoActual) return true;
    return normalizar(comuna).includes(terminoActual);
  });
  const cards = items.map((comuna) => {
    const filtro = { estado, municipio, parroquia, comuna };
    const reportesComuna = reportesEnTerritorio(filtro).length;
    const personalComuna = personalEnTerritorio(filtro).length;
    const viv = viverosEnTerritorio(filtro).length;
    const ban = bancosEnTerritorio(filtro).length;
    const bri = brigadasEnTerritorio(filtro).length;
    const activo = isTerritorioActivo(comuna, { estado, municipio, parroquia }, 'comuna');
    const semaforo = calcularSemaforo(comuna, { estado, municipio, parroquia }, 'comuna');

    return `
      <div class="tarjeta-jerarquia ${activo ? 'activo' : 'inactivo'}" data-comuna="${escapeHTML(comuna)}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div class="tarjeta-titulo" style="margin-bottom: 0;">${escapeHTML(comuna)}</div>
          ${renderSemaforoHTML(semaforo)}
        </div>
        <div class="tarjeta-stats" style="margin-top: 8px;">
          <span>📋 ${reportesComuna} reportes</span>
          <span>👥 ${personalComuna} personas</span>
          ${viv > 0 ? `<span>🏡 ${viv} viveros</span>` : ''}
          ${ban > 0 ? `<span>🌾 ${ban} bancos</span>` : ''}
          ${bri > 0 ? `<span>🎽 ${bri} brigadas</span>` : ''}
        </div>
        <div class="tarjeta-badge">${activo ? 'ACTIVO' : 'INACTIVO'}</div>
      </div>
    `;
  }).join('') || '<p>Sin datos registrados.</p>';

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <button class="btn btn-secondary" data-volver="parroquia">Volver</button>
      <div style="margin: 12px 0 16px;">
        <input type="text" class="buscador-nivel" placeholder="Buscar comuna..." value="${escapeHTML(busquedasJerarquia.comuna)}" />
      </div>
      <div class="grid-tarjetas">${cards}</div>
      ${renderResumenNivel({ estado, municipio, parroquia })}
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('[data-volver="parroquia"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      parroquiaActual = null;
      comunaActual = null;
      consejoActual = null;
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  cont.querySelectorAll('[data-comuna]').forEach((card) => {
    card.addEventListener('click', () => {
      comunaActual = card.dataset.comuna;
      consejoActual = null;
      limpiarBusquedasHijas('comuna');
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  const debouncedBusqueda = debounce((valor) => {
    busquedasJerarquia.comuna = valor;
    renderComunas(estado, municipio, parroquia);
  }, 250);

  cont.querySelectorAll('.buscador-nivel').forEach((input) => {
    input.addEventListener('input', (event) => {
      debouncedBusqueda(event.target.value || '');
    });
  });

  setTimeout(() => inicializarGraficasTerritoriales({ estado, municipio, parroquia }), 80);
}

function renderConsejosComunales(estado, municipio, parroquia, comuna) {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;

  const todos = consejosComunalesDe(estado, municipio, parroquia, comuna);

  const filtro = (busquedasJerarquia.consejo || '').trim();
  const termino = normalizar(filtro);
  const baseFiltrada = termino
    ? todos.filter((consejo) => normalizar(consejo).includes(termino))
    : todos;

  const total = baseFiltrada.length;
  const totalPaginas = Math.max(1, Math.ceil(total / 50));
  const inicio = (paginaConsejos - 1) * 50;
  const filtrados = baseFiltrada.slice(inicio, inicio + 50);

  const cards = filtrados.map((consejo) => {
    const reportesConsejo = reportesEnTerritorio({ estado, municipio, parroquia, comuna, consejo }).length;
    const personalConsejo = personalEnTerritorio({ estado, municipio, parroquia, comuna, consejo }).length;
    const activo = isTerritorioActivo(consejo, { estado, municipio, parroquia, comuna }, 'consejo');
    return `
      <div class="tarjeta-jerarquia ${activo ? 'activo' : 'inactivo'}" data-consejo="${escapeHTML(consejo)}">
        <div class="tarjeta-titulo">${escapeHTML(consejo)}</div>
        <div class="tarjeta-stats">
          <span>📋 ${reportesConsejo} reportes</span>
          <span>👥 ${personalConsejo} personas</span>
        </div>
        <div class="tarjeta-badge">${activo ? 'ACTIVO' : 'INACTIVO'}</div>
      </div>
    `;
  }).join('') || '<p>Sin datos registrados.</p>';

  const desde = total ? inicio + 1 : 0;
  const hasta = Math.min(inicio + filtrados.length, total);
  const resumen = renderResumenNivel({ estado, municipio, parroquia, comuna });

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <button class="btn btn-secondary" data-volver="comuna">Volver</button>
      <div style="margin: 12px 0 16px;">
        <input type="text" class="buscador-nivel" placeholder="Buscar..." value="${escapeHTML(busquedasJerarquia.consejo)}" />
      </div>
      <div class="mini-panel-resumen" style="margin-bottom: 12px;">
        <div class="kpi-resumen total">Mostrando ${desde}–${hasta} de ${total}</div>
      </div>
      <div class="grid-tarjetas">${cards}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-pagina="prev" ${paginaConsejos <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${paginaConsejos} de ${totalPaginas}</span>
        <button class="btn btn-secondary" data-pagina="next" ${paginaConsejos >= totalPaginas ? 'disabled' : ''}>Siguiente</button>
      </div>
      ${resumen}
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('[data-volver="comuna"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      comunaActual = null;
      consejoActual = null;
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  cont.querySelectorAll('[data-pagina]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.pagina;
      if (dir === 'prev' && paginaConsejos > 1) {
        paginaConsejos -= 1;
      }
      if (dir === 'next' && paginaConsejos < totalPaginas) {
        paginaConsejos += 1;
      }
      renderConsejosComunales(estado, municipio, parroquia, comuna);
    });
  });

  const debouncedBusqueda = debounce((valor) => {
    busquedasJerarquia.consejo = valor;
    paginaConsejos = 1;
    renderConsejosComunales(estado, municipio, parroquia, comuna);
  }, 250);

  cont.querySelectorAll('.buscador-nivel').forEach((input) => {
    input.addEventListener('input', (event) => {
      debouncedBusqueda(event.target.value || '');
    });
  });

  cont.querySelectorAll('[data-consejo]').forEach((card) => {
    card.addEventListener('click', () => {
      consejoActual = card.dataset.consejo;
      limpiarBusquedasHijas('consejo');
      paginaConsejos = 1;
      renderJerarquia();
    });
  });
}

function renderConsejoDetalle(estado, municipio, parroquia, comuna, consejo) {
  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;
  const reportes = reportesEnTerritorio({ estado, municipio, parroquia, comuna, consejo });
  const personal = personalEnTerritorio({ estado, municipio, parroquia, comuna, consejo });
  const activo = isTerritorioActivo(consejo, { estado, municipio, parroquia, comuna }, 'consejo');

  const filas = reportes.length
    ? reportes.slice(0, 10).map((reporte) => `
        <tr>
          <td>${escapeHTML(
            reporte?.actividad?.fecha ||
            (reporte?.fechaRegistro?.toDate?.()?.toLocaleDateString('es-VE')) ||
            'Sin fecha'
          )}</td>
          <td>${escapeHTML(reporte?.gerencia || 'Sin gerencia')}</td>
          <td>${escapeHTML(reporte?.ubicacion?.lugar || 'Sin lugar')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3">Sin datos registrados.</td></tr>';

  cont.innerHTML = `
    <div class="panel">
      ${renderBreadcrumb()}
      <button class="btn btn-secondary" data-volver="consejo">Volver</button>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${reportes.length}</div><div class="stat-label">Reportes</div></div>
        <div class="stat-card"><div class="stat-number">${personal.length}</div><div class="stat-label">Personal activo</div></div>
        <div class="stat-card"><div class="stat-number">${activo ? 'Activo' : 'Inactivo'}</div><div class="stat-label">Estado</div></div>
      </div>
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead><tr><th>Fecha</th><th>Gerencia</th><th>Lugar</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${renderResumenNivel({ estado, municipio, parroquia, comuna, consejo })}
    </div>
  `;

  bindBreadcrumbClick();

  cont.querySelectorAll('[data-volver="consejo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      consejoActual = null;
      paginaConsejos = 1;
      renderJerarquia();
    });
  });

  setTimeout(() => inicializarGraficasTerritoriales({
    estado: estadoActual,
    municipio: municipioActual,
    parroquia: parroquiaActual,
    comuna: comunaActual,
    consejo: consejoActual
  }), 80);
}

/**
 * Mantiene el <select id="filtroEstado"> sincronizado con la variable
 * global estadoActual. Se llama desde renderJerarquia() cada vez que
 * el drill-down cambia (por click en tarjeta, breadcrumb, o el propio select).
 */
function sincronizarSelectorEstado() {
  const sel = document.getElementById('filtroEstado');
  if (!sel) return;
  sel.value = estadoActual || '';
}

function renderJerarquia() {
  const perfil = window.__perfil || {};
  const rol = perfil.rol || 'control';

  if (rol === 'dashboard_estadal' && !estadoActual && perfil.estado) {
    estadoActual = perfil.estado;
  } 
  
  sincronizarSelectorEstado();

  if (!estadoActual) {
    renderEstados();
    return;
  }
  if (!municipioActual) {
    renderMunicipios(estadoActual);
    return;
  }
  if (!parroquiaActual) {
    renderParroquias(estadoActual, municipioActual);
    return;
  }
  if (!comunaActual) {
    renderComunas(estadoActual, municipioActual, parroquiaActual);
    return;
  }
  if (!consejoActual) {
    renderConsejosComunales(estadoActual, municipioActual, parroquiaActual, comunaActual);
    return;
  }

  renderConsejoDetalle(estadoActual, municipioActual, parroquiaActual, comunaActual, consejoActual);
}

function resetJerarquia() {
  estadoActual = null;
  municipioActual = null;
  parroquiaActual = null;
  comunaActual = null;
  consejoActual = null;
  paginaConsejos = 1;
}

/* ==================== ESTADAL ==================== */
export async function cargarDashboardEstadal() {
  const perfil = window.__perfil;
  if (!perfil) return;

  activeDashboardId = 'dashboardEstadalContent';
  resetJerarquia();
  estadoActual = perfil.estado || null;

  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;

  // Montamos la barra de filtros (una sola vez por panel)
  montarFiltrosGlobales(activeDashboardId, 'filtrosDashboardEstadal', perfil);

  cont.innerHTML = '<div class="panel">Cargando…</div>';

  if (unsubEstadal) unsubEstadal();
  if (unsubPersonalDashboard) unsubPersonalDashboard();
  if (unsubViveros) unsubViveros();
  if (unsubBancos) unsubBancos();
  if (unsubBrigadas) unsubBrigadas();

  await cargarTerritorio();

  const qReportes = query(collection(db, 'reportes'), where('ubicacion.estado', '==', perfil.estado));
  unsubEstadal = onSnapshot(qReportes, (snap) => {
    reportesCache = snap.docs.map((d) => normalizarReporte({ id: d.id, ...d.data() }));
    renderJerarquia();
  }, (err) => {
    console.error(err);
    cont.innerHTML = `<div class="panel"><p>Error: ${err.message}</p></div>`;
  });

  const qPersonal = query(collection(db, 'personal'), where('estado', '==', perfil.estado));
  unsubPersonalDashboard = onSnapshot(qPersonal, (snap) => {
    personalCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderJerarquia();
  }, (err) => {
    console.error(err);
  });

  // Recursos: viveros / bancos / brigadas
  // Cada uno con su propio manejo de error para no romper los demás
  suscribirRecursos(perfil);
}

/* ==================== NACIONAL ==================== */
export async function cargarDashboardNacional() {
  const perfil = window.__perfil;
  if (!perfil) return;

  activeDashboardId = 'dashboardNacionalContent';
  resetJerarquia();

  const cont = document.getElementById(activeDashboardId);
  if (!cont) return;

  // Montamos la barra de filtros (una sola vez por panel)
  montarFiltrosGlobales(activeDashboardId, 'filtrosDashboardNacional', perfil);

  cont.innerHTML = '<div class="panel">Cargando…</div>';

  if (unsubNacional) unsubNacional();
  if (unsubPersonalDashboard) unsubPersonalDashboard();
  if (unsubViveros) unsubViveros();
  if (unsubBancos) unsubBancos();
  if (unsubBrigadas) unsubBrigadas();

  await cargarTerritorio();

  let qReportes = collection(db, 'reportes');
  if (perfil.rol === 'dashboard_nacional' && perfil.gerencia) {
    // 🔧 FIX: filtrar server-side por gerencia y limitar a 500 docs
    // para evitar descargar la colección completa.
    qReportes = query(
      qReportes,
      where('gerencia', '==', perfil.gerencia),
      limit(500)
    );
  }

  unsubNacional = onSnapshot(qReportes, (snap) => {
    reportesCache = snap.docs.map((d) => normalizarReporte({ id: d.id, ...d.data() }));
    reportesCache.sort((a, b) => {
      const tsA = toDateValue(a.fechaRegistro)?.getTime?.() || 0;
      const tsB = toDateValue(b.fechaRegistro)?.getTime?.() || 0;
      return tsB - tsA;
    });
    renderJerarquia();
  }, (err) => {
    console.error(err);
    cont.innerHTML = `<div class="panel"><p>Error: ${err.message}</p></div>`;
  });

  let qPersonal = collection(db, 'personal');
  if (perfil.rol === 'dashboard_nacional' && perfil.gerencia) {
    qPersonal = query(qPersonal, where('gerencia', '==', perfil.gerencia));
  }

  unsubPersonalDashboard = onSnapshot(qPersonal, (snap) => {
    personalCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderJerarquia();
  }, (err) => {
    console.error(err);
  });
    // Recursos: viveros / bancos / brigadas
  suscribirRecursos(perfil);
}

/* ==================== SUSCRIPCIÓN A RECURSOS ==================== */

/**
 * Suscribe el dashboard a las 3 colecciones de recursos
 * (viveros, bancos de tierra, brigadas).
 *
 * Cada suscripción maneja sus propios errores: si el rol no tiene permiso
 * para una colección (por ejemplo, un reporte_nacional de Formación no puede
 * leer viveros), la suscripción falla silenciosamente sin romper las demás.
 */
function suscribirRecursos(perfil) {
  const rol = perfil?.rol;
  const gerencia = perfil?.gerencia;
  const estado = perfil?.estado;

  const verViveros = rol === 'control' || rol === 'visor_nacional'
    || (rol === 'dashboard_nacional' && gerencia === 'Producción');
  const verBancos = rol === 'control' || rol === 'visor_nacional'
    || (rol === 'dashboard_nacional' && gerencia === 'Plantación');
  const verBrigadas = rol === 'control' || rol === 'visor_nacional'
    || (rol === 'dashboard_nacional' && gerencia === 'Organización');

  // Viveros
  if (verViveros) {
    unsubViveros = onSnapshot(collection(db, 'viveros'), (snap) => {
      viverosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] viveros:', err.code);
      viverosCache = [];
    });
  } else {
    viverosCache = [];
  }

  // Bancos de tierra
  if (verBancos) {
    unsubBancos = onSnapshot(collection(db, 'bancosTierra'), (snap) => {
      bancosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] bancosTierra:', err.code);
      bancosCache = [];
    });
  } else {
    bancosCache = [];
  }

  // Brigadas
  if (verBrigadas) {
    unsubBrigadas = onSnapshot(collection(db, 'brigadas'), (snap) => {
      brigadasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] brigadas:', err.code);
      brigadasCache = [];
    });
  } else {
    brigadasCache = [];
  }

  // Planificación
  // - control y visor_nacional → todas
  // - dashboard_estadal → solo del estado del usuario
  // - dashboard_nacional → solo de la gerencia del usuario
  // - otros roles → no se suscribe
  if (rol === 'control' || rol === 'visor_nacional') {
    unsubPlanificacion = onSnapshot(collection(db, 'planificacion'), (snap) => {
      planificacionCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] planificacion:', err.code);
      planificacionCache = [];
    });
  } else if (rol === 'dashboard_estadal' && estado) {
    const q = query(collection(db, 'planificacion'), where('estadoUsuario', '==', estado));
    unsubPlanificacion = onSnapshot(q, (snap) => {
      planificacionCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] planificacion (estadal):', err.code);
      planificacionCache = [];
    });
  } else if (rol === 'dashboard_nacional' && gerencia) {
    const q = query(collection(db, 'planificacion'), where('gerenciaUsuario', '==', gerencia));
    unsubPlanificacion = onSnapshot(q, (snap) => {
      planificacionCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] planificacion (nacional):', err.code);
      planificacionCache = [];
    });
  } else {
    planificacionCache = [];
  }
    // Formaciones
  // - control y visor_nacional → todas
  // - dashboard_nacional + Formación → todas (o podría filtrar, pero por
  //   simplicidad las traemos todas: son pocos registros)
  // - otros roles → no se suscribe
  const verFormaciones = rol === 'control' || rol === 'visor_nacional'
    || (rol === 'dashboard_nacional' && gerencia === 'Formación');

  if (verFormaciones) {
    unsubFormaciones = onSnapshot(collection(db, 'formaciones'), (snap) => {
      formacionesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderJerarquia();
    }, (err) => {
      console.warn('[Dashboard] formaciones:', err.code);
      formacionesCache = [];
    });
  } else {
    formacionesCache = [];
  }
}

/* ==================== CLEANUP EN LOGOUT ==================== */
/**
 * Libera las 6 suscripciones onSnapshot cuando el usuario cierra sesión.
 * Previene memory leaks y consumo de cuota Firestore post-logout.
 * El evento 'usuarioCerroSesion' es emitido por auth.js en document.
 */
function limpiarSuscripcionesDashboard() {
  if (unsubEstadal) { try { unsubEstadal(); } catch (_) {} unsubEstadal = null; }
  if (unsubNacional) { try { unsubNacional(); } catch (_) {} unsubNacional = null; }
  if (unsubPersonalDashboard) { try { unsubPersonalDashboard(); } catch (_) {} unsubPersonalDashboard = null; }
  if (unsubViveros) { try { unsubViveros(); } catch (_) {} unsubViveros = null; }
  if (unsubBancos) { try { unsubBancos(); } catch (_) {} unsubBancos = null; }
  if (unsubBrigadas) { try { unsubBrigadas(); } catch (_) {} unsubBrigadas = null; }
  if (unsubPlanificacion) { try { unsubPlanificacion(); } catch (_) {} unsubPlanificacion = null; }
  if (unsubFormaciones) { try { unsubFormaciones(); } catch (_) {} unsubFormaciones = null; }
}

document.addEventListener('usuarioCerroSesion', limpiarSuscripcionesDashboard);