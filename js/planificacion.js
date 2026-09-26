// js/planificacion.js
// Planificación semanal — Misión Árbol v2.0
//
// Características:
//   - Cascada territorial (estado → municipio → parroquia → comuna → consejo)
//   - Múltiples actividades por planificación (repetibles con "Agregar actividad")
//   - Estatus por actividad + estatus global de la planificación
//   - Vinculación plan ↔ cumplimiento (ver reportesCumplimiento.js)
//
// Colección Firestore: /planificacion
//
// Suscripción: onSnapshot — se limpia al cerrar sesión vía evento
// 'usuarioCerroSesion' (disparado por auth.js::logout).

import {
  collection, addDoc, getDoc, doc, query, where,
  serverTimestamp, onSnapshot, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader } from "./auth.js";
import {
  ESTADOS_VENEZUELA,
  GERENCIAS,
  TIPOS_ACTIVIDAD_POR_GERENCIA,
  PROGRAMAS,
  municipiosDe,
  parroquiasDe,
  comunasDe,
  consejosComunalesDe,
  cargarTerritorio,
  escapeHTML,
  resetSelect
} from "./datos.js";

/* ==================== ESTADO GLOBAL ==================== */
let unsubPlan = null;
let actividadCounter = 0;

const ESTATUS_ACTIVIDAD = [
  'Confirmada',
  'En proceso de confirmación',
  'No confirmada'
];

const ESTADOS_PLAN = [
  { id: 'pendiente',  label: '⏳ Pendiente' },
  { id: 'ejecutada',  label: '✅ Ejecutada' },
  { id: 'cancelada',  label: '❌ Cancelada' }
];

/* ==================== INICIALIZACIÓN ==================== */

export async function cargarPanelPlanificacion() {
  const perfil = window.__perfil;
  if (!perfil) return;

  await cargarTerritorio();

  // Wiring de controles principales (una sola vez)
  if (!window.__planWired) {
    wireFormulario();
    wireModalDetalle();
    window.__planWired = true;
  }

  // Poblar estados
  poblarEstados(perfil);

  // Cascada
  wireCascada();

  // Semana auto-fill
  wireSemana();

  // Primera actividad por defecto
  const cont = document.getElementById('actividades-container');
  if (cont && cont.children.length === 0) {
    agregarActividadRow();
  }

  // Lista de planificaciones
  await cargarListaPlanificaciones(perfil);
}

/* ==================== POBLAR ESTADOS ==================== */

function poblarEstados(perfil) {
  const sel = document.getElementById('plan_estado');
  if (!sel) return;

  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${e}">${e}</option>`).join('');

  // Si el usuario es reporte_estadal, viene bloqueado a su estado
  if (perfil.rol === 'reporte_estadal' && perfil.estado) {
    sel.value = perfil.estado;
    sel.disabled = true;

    // Disparamos la carga de municipios
    setTimeout(() => {
      cargarMunicipios(perfil.estado);
    }, 0);
  }
}

/* ==================== CASCADA TERRITORIAL ==================== */

function wireCascada() {
  const selEstado    = document.getElementById('plan_estado');
  const selMunicipio = document.getElementById('plan_municipio');
  const selParroquia = document.getElementById('plan_parroquia');
  const selComuna    = document.getElementById('plan_comuna');
  const selConsejo   = document.getElementById('plan_consejo');

  if (!selEstado) return;

  selEstado.addEventListener('change', () => {
    const estado = selEstado.value;
    cargarMunicipios(estado);
  });

  selMunicipio?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;

    if (!municipio) {
      resetSelect(selParroquia, 'Seleccione...');
      resetSelect(selComuna, 'Seleccione...');
      resetSelect(selConsejo, 'Seleccione...');
      return;
    }

    const parroquias = parroquiasDe(estado, municipio);
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parroquias.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = false;

    resetSelect(selComuna, 'Seleccione...');
    resetSelect(selConsejo, 'Seleccione...');
  });

  selParroquia?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    const parroquia = selParroquia.value;

    if (!parroquia) {
      resetSelect(selComuna, 'Seleccione...');
      resetSelect(selConsejo, 'Seleccione...');
      return;
    }

    const comunas = comunasDe(estado, municipio, parroquia);
    selComuna.innerHTML = '<option value="">Seleccione...</option>' +
      comunas.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selComuna.disabled = false;

    resetSelect(selConsejo, 'Seleccione...');
  });

  selComuna?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    const parroquia = selParroquia.value;
    const comuna = selComuna.value;

    if (comuna === 'No Aplica') {
      selConsejo.innerHTML = '<option value="No Aplica" selected>— No Aplica —</option>';
      selConsejo.disabled = true;
      return;
    }

    if (!comuna) {
      resetSelect(selConsejo, 'Seleccione...');
      return;
    }

    const consejos = consejosComunalesDe(estado, municipio, parroquia, comuna);
    selConsejo.innerHTML = '<option value="">Seleccione...</option>' +
      consejos.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = false;
  });
}

function cargarMunicipios(estado) {
  const selMunicipio = document.getElementById('plan_municipio');
  const selParroquia = document.getElementById('plan_parroquia');
  const selComuna    = document.getElementById('plan_comuna');
  const selConsejo   = document.getElementById('plan_consejo');

  if (!estado) {
    resetSelect(selMunicipio, 'Seleccione...');
    resetSelect(selParroquia, 'Seleccione...');
    resetSelect(selComuna, 'Seleccione...');
    resetSelect(selConsejo, 'Seleccione...');
    return;
  }

  const municipios = municipiosDe(estado);
  selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
    municipios.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
  selMunicipio.disabled = false;

  resetSelect(selParroquia, 'Seleccione...');
  resetSelect(selComuna, 'Seleccione...');
  resetSelect(selConsejo, 'Seleccione...');
}

/* ==================== SEMANA ==================== */

function wireSemana() {
  const inputInicio = document.getElementById('plan_semana');
  const inputFin = document.getElementById('plan_semana_fin');

  if (!inputInicio || !inputFin) return;

  inputInicio.addEventListener('change', () => {
    const inicio = inputInicio.value;
    if (!inicio) {
      inputFin.value = '';
      return;
    }
    const d = new Date(inicio + 'T00:00:00');
    const fin = new Date(d);
    fin.setDate(d.getDate() + 6);
    inputFin.value = fin.toISOString().slice(0, 10);
  });
}

/* ==================== ACTIVIDADES REPETIBLES ==================== */

function agregarActividadRow() {
  const container = document.getElementById('actividades-container');
  if (!container) return;

  actividadCounter += 1;
  const uid = 'act-' + actividadCounter;

  const row = document.createElement('div');
  row.className = 'actividad-row';
  row.dataset.actId = uid;

  const gerenciasOpts = GERENCIAS.map(g =>
    `<option value="${g.id}">${escapeHTML(g.nombre)}</option>`
  ).join('');

  row.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
      <strong style="color: var(--verde-oscuro);">Actividad #${actividadCounter}</strong>
      <button type="button" class="btn btn-danger btn-sm btn-remove-act">✕ Eliminar</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Fecha prevista *</label>
        <input type="date" class="act-fecha" required>
      </div>
      <div class="form-group">
        <label>Hora</label>
        <input type="time" class="act-hora">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Gerencia *</label>
        <select class="act-gerencia" required>
          <option value="">Seleccione...</option>
          ${gerenciasOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Tipo de actividad *</label>
        <select class="act-tipo" required disabled>
          <option value="">Seleccione gerencia primero...</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Programa</label>
        <select class="act-programa">
          <option value="">Seleccione...</option>
          ${PROGRAMAS.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Participantes esperados</label>
        <input type="number" class="act-participantes" min="0" value="0">
      </div>
    </div>

    <div class="form-group">
      <label>Lugar específico *</label>
      <input type="text" class="act-lugar" placeholder="Ej: Plaza Bolívar, Vivero, Liceo..." required>
    </div>

    <div class="form-group">
      <label>Descripción *</label>
      <textarea class="act-descripcion" rows="2" required></textarea>
    </div>

    <div class="form-group">
      <label>Objetivo</label>
      <textarea class="act-objetivo" rows="2"></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Responsable principal</label>
        <input type="text" class="act-responsable" placeholder="Nombre y apellido">
      </div>
      <div class="form-group">
        <label>Teléfono del responsable</label>
        <input type="tel" class="act-telefono" placeholder="0412-1234567">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Estatus de la actividad *</label>
        <select class="act-estatus" required>
          <option value="">Seleccione...</option>
          ${ESTATUS_ACTIVIDAD.map(e => `<option value="${e}">${e}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Autoridades invitadas</label>
        <input type="text" class="act-autoridades" placeholder="Ej: Alcalde, Director regional...">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Coordenadas (latitud)</label>
        <input type="text" class="act-lat" placeholder="Ej: 8.5">
      </div>
      <div class="form-group">
        <label>Coordenadas (longitud)</label>
        <input type="text" class="act-lng" placeholder="Ej: -66.9">
      </div>
    </div>

    <hr style="margin: 14px 0; border: none; border-top: 1px dashed #ddd;">
  `;

  container.appendChild(row);

  // Wiring: eliminar
  row.querySelector('.btn-remove-act').addEventListener('click', () => {
    if (container.querySelectorAll('.actividad-row').length <= 1) {
      toast('Debe haber al menos una actividad');
      return;
    }
    row.remove();
  });

  // Wiring: al cambiar gerencia → cargar tipos de actividad
  const selGer = row.querySelector('.act-gerencia');
  const selTipo = row.querySelector('.act-tipo');

  selGer.addEventListener('change', () => {
    const g = selGer.value;
    if (!g) {
      selTipo.innerHTML = '<option value="">Seleccione gerencia primero...</option>';
      selTipo.disabled = true;
      return;
    }

    const tipos = TIPOS_ACTIVIDAD_POR_GERENCIA[g] || [];
    selTipo.innerHTML = '<option value="">Seleccione...</option>' +
      tipos.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
    selTipo.disabled = false;
  });
}

/* ==================== WIRING FORMULARIO ==================== */

function wireFormulario() {
  const form = document.getElementById('formPlanificacion');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarPlanificacion();
  });

  document.getElementById('btnAgregarActividad')?.addEventListener('click', () => {
    agregarActividadRow();
  });

  document.getElementById('btnLimpiarPlanificacion')?.addEventListener('click', () => {
    if (!confirm('¿Limpiar el formulario actual? Se perderán los datos no guardados.')) return;
    limpiarFormulario();
  });
}

function limpiarFormulario() {
  const perfil = window.__perfil;

  // Reset semana
  const inputInicio = document.getElementById('plan_semana');
  const inputFin = document.getElementById('plan_semana_fin');
  if (inputInicio) inputInicio.value = '';
  if (inputFin) inputFin.value = '';

  // Reset cascada
  const selEstado = document.getElementById('plan_estado');
  if (selEstado) {
    if (perfil?.rol === 'reporte_estadal' && perfil.estado) {
      selEstado.value = perfil.estado;
      cargarMunicipios(perfil.estado);
    } else {
      selEstado.value = '';
      cargarMunicipios('');
    }
  }

  // Reset actividades
  const cont = document.getElementById('actividades-container');
  if (cont) {
    cont.innerHTML = '';
    actividadCounter = 0;
    agregarActividadRow();
  }
}

/* ==================== GUARDAR ==================== */

async function guardarPlanificacion() {
  const perfil = window.__perfil;
  if (!perfil) return toast('Sesión no válida');

  // === Validar cabecera ===
  const semanaInicio = document.getElementById('plan_semana')?.value;
  const estado = document.getElementById('plan_estado')?.value;
  const municipio = document.getElementById('plan_municipio')?.value;
  const parroquia = document.getElementById('plan_parroquia')?.value;
  const comuna = document.getElementById('plan_comuna')?.value;
  const consejo = document.getElementById('plan_consejo')?.value;

  if (!semanaInicio) return toast('Selecciona la fecha de inicio de la semana');
  if (!estado)       return toast('Selecciona el estado');
  if (!municipio)    return toast('Selecciona el municipio');
  if (!parroquia)    return toast('Selecciona la parroquia');
  if (!comuna)       return toast('Selecciona la comuna/circuito o "No Aplica"');
  if (!consejo)      return toast('Selecciona el consejo comunal o "No Aplica"');

  // === Validar actividades ===
  const actividades = [];
  let validacionOk = true;

  document.querySelectorAll('#actividades-container .actividad-row').forEach((row, idx) => {
    const act = {
      numero: idx + 1,
      fecha: row.querySelector('.act-fecha')?.value || '',
      hora: row.querySelector('.act-hora')?.value || '',
      gerencia: row.querySelector('.act-gerencia')?.value || '',
      tipoActividad: row.querySelector('.act-tipo')?.value || '',
      programa: row.querySelector('.act-programa')?.value || '',
      participantesEsperados: parseInt(row.querySelector('.act-participantes')?.value, 10) || 0,
      lugar: row.querySelector('.act-lugar')?.value.trim() || '',
      descripcion: row.querySelector('.act-descripcion')?.value.trim() || '',
      objetivo: row.querySelector('.act-objetivo')?.value.trim() || '',
      responsable: row.querySelector('.act-responsable')?.value.trim() || '',
      telefono: row.querySelector('.act-telefono')?.value.trim() || '',
      estatus: row.querySelector('.act-estatus')?.value || '',
      autoridades: row.querySelector('.act-autoridades')?.value.trim() || '',
      latitud: row.querySelector('.act-lat')?.value.trim() || '',
      longitud: row.querySelector('.act-lng')?.value.trim() || ''
    };

    // Campos obligatorios por actividad
    if (!act.fecha || !act.gerencia || !act.tipoActividad || !act.lugar || !act.descripcion || !act.estatus) {
      validacionOk = false;
      return;
    }

    actividades.push(act);
  });

  if (!validacionOk) return toast('Completa todos los campos obligatorios (*) de cada actividad');
  if (actividades.length === 0) return toast('Agrega al menos una actividad');

  // === Guardar ===
  loader(true);
  try {
    const semanaFin = document.getElementById('plan_semana_fin')?.value || '';

    const docData = {
      usuarioId: perfil.uid,
      usuarioEmail: perfil.email,
      nombreUsuario: perfil.nombre || perfil.email,

      semanaInicio,
      semanaFin,

      ubicacion: {
        estado,
        municipio,
        parroquia,
        comuna,
        consejo
      },

      // Compatibilidad con versiones anteriores y dashboards
      estadoUsuario: estado,
      gerenciaUsuario: perfil.gerencia || null,

      actividades,
      estado: 'pendiente', // Estado de la planificación (global)
      version: '2.0',
      fechaRegistro: serverTimestamp()
    };

    await addDoc(collection(db, 'planificacion'), docData);

    toast('✅ Planificación guardada correctamente', 3500);
    limpiarFormulario();

  } catch (e) {
    console.error('[Planificación] Error al guardar:', e);
    if (e.code === 'permission-denied') {
      toast('No tienes permisos para guardar esta planificación');
    } else {
      toast('Error al guardar: ' + (e.message || e.code || 'desconocido'));
    }
  } finally {
    loader(false);
  }
}

/* ==================== LISTA HISTÓRICA ==================== */

async function cargarListaPlanificaciones(perfil) {
  if (unsubPlan) unsubPlan();
  const cont = document.getElementById('panel-planificacion-content');
  if (!cont) return;

  // Filtro según el rol:
  //  - reporte_estadal y control → todas las del estado
  //  - reporte_nacional → por gerencia
  let q;
  if (perfil.rol === 'control') {
    q = query(collection(db, 'planificacion'));
  } else if (perfil.rol === 'reporte_nacional' && perfil.gerencia) {
    q = query(collection(db, 'planificacion'), where('gerenciaUsuario', '==', perfil.gerencia));
  } else {
    q = query(collection(db, 'planificacion'), where('usuarioId', '==', perfil.uid));
  }

  unsubPlan = onSnapshot(q, (snap) => {
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📅</span>
          <div class="empty-state-msg">No hay planificaciones registradas</div>
          <div class="empty-state-hint">Crea la primera planificación semanal con el formulario de arriba.</div>
        </div>`;
      return;
    }

    const planificaciones = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const fa = a.semanaInicio || '';
        const fb = b.semanaInicio || '';
        return fb.localeCompare(fa);
      });

    // 👇 NUEVO: calculamos y renderizamos stats
    renderPlanificacionStats(planificaciones);

    const filas = planificaciones.map(p => {
      const ubic = p.ubicacion || {};
      const ubicTexto = [ubic.estado, ubic.municipio, ubic.parroquia]
        .filter(Boolean)
        .join(' › ');
      const estadoPlan = ESTADOS_PLAN.find(e => e.id === p.estado)?.label || p.estado || 'Pendiente';
      const nombreSeguro = escapeHTML(p.nombreUsuario || '');

      return `
        <tr>
          <td><strong>${escapeHTML(p.semanaInicio || '—')}</strong><br>
              <small>a ${escapeHTML(p.semanaFin || '—')}</small></td>
          <td>${nombreSeguro}</td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td>${(p.actividades || []).length} act.</td>
          <td>${estadoPlan}</td>
          <td>
            <button class="btn btn-primary btn-sm" data-ver="${p.id}"
                    aria-label="Ver detalle de la planificación de ${nombreSeguro}">👁️ Ver</button>
            ${perfil.rol === 'control' || p.usuarioId === perfil.uid
              ? `<button class="btn btn-danger btn-sm" data-del="${p.id}"
                        aria-label="Eliminar planificación de ${nombreSeguro}">🗑️</button>`
              : ''}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Usuario</th>
              <th>Ubicación</th>
              <th>Actividades</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => verDetalle(b.dataset.ver)));
    cont.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => eliminarPlanificacion(b.dataset.del)));
  }, (err) => {
    console.error('Error al cargar planificaciones:', err);
    cont.innerHTML = '<p style="color:red;">Error al cargar planificaciones.</p>';
  });
}

/* ==================== VER DETALLE ==================== */

function wireModalDetalle() {
  document.getElementById('btnCerrarModalDetalle')?.addEventListener('click', cerrarModalDetalle);
  document.getElementById('btnCerrarDetalleBtn')?.addEventListener('click', cerrarModalDetalle);
}

async function verDetalle(id) {
  loader(true);
  try {
    const snap = await getDoc(doc(db, 'planificacion', id));
    if (!snap.exists()) return toast('Planificación no encontrada');

    const p = snap.data();
    const ubic = p.ubicacion || {};
    const ubicTexto = [ubic.estado, ubic.municipio, ubic.parroquia, ubic.comuna, ubic.consejo]
      .filter(Boolean)
      .join(' › ');

    const acts = (p.actividades || []).map((a, i) => {
      const ger = GERENCIAS.find(g => g.id === a.gerencia)?.nombre || a.gerencia || '—';
      return `
        <div class="subpanel" style="margin-bottom: 10px;">
          <strong style="color: var(--verde-oscuro);">📌 Actividad ${i + 1}</strong>
          <div style="font-size: 13px; margin-top: 6px; line-height: 1.6;">
            <div><strong>Fecha:</strong> ${escapeHTML(a.fecha || '—')} ${a.hora ? '· ' + escapeHTML(a.hora) : ''}</div>
            <div><strong>Gerencia:</strong> ${escapeHTML(ger)}</div>
            <div><strong>Tipo:</strong> ${escapeHTML(a.tipoActividad || '—')}</div>
            ${a.programa ? `<div><strong>Programa:</strong> ${escapeHTML(a.programa)}</div>` : ''}
            <div><strong>Lugar:</strong> ${escapeHTML(a.lugar || '—')}</div>
            <div><strong>Descripción:</strong> ${escapeHTML(a.descripcion || '—')}</div>
            ${a.objetivo ? `<div><strong>Objetivo:</strong> ${escapeHTML(a.objetivo)}</div>` : ''}
            <div><strong>Participantes esperados:</strong> ${a.participantesEsperados || 0}</div>
            ${a.responsable ? `<div><strong>Responsable:</strong> ${escapeHTML(a.responsable)}</div>` : ''}
            ${a.telefono ? `<div><strong>Teléfono:</strong> ${escapeHTML(a.telefono)}</div>` : ''}
            ${a.autoridades ? `<div><strong>Autoridades invitadas:</strong> ${escapeHTML(a.autoridades)}</div>` : ''}
            <div><strong>Estatus:</strong> ${escapeHTML(a.estatus || '—')}</div>
            ${(a.latitud || a.longitud) ? `<div><strong>Coordenadas:</strong> ${escapeHTML(a.latitud || '—')}, ${escapeHTML(a.longitud || '—')}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('detallePlanificacionContent').innerHTML = `
      <h3 style="color: var(--verde-oscuro); margin-bottom: 6px;">
        📅 Semana del ${escapeHTML(p.semanaInicio || '—')} al ${escapeHTML(p.semanaFin || '—')}
      </h3>
      <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
        <strong>Usuario:</strong> ${escapeHTML(p.nombreUsuario || '—')}<br>
        <strong>Ubicación:</strong> ${escapeHTML(ubicTexto || '—')}
      </p>
      ${acts || '<p style="text-align:center;color:#888;">Sin actividades.</p>'}
    `;

    document.getElementById('modalDetallePlanificacion').style.display = 'flex';
  } catch (e) {
    console.error(e);
    toast('Error al cargar el detalle');
  } finally {
    loader(false);
  }
}

function cerrarModalDetalle() {
  document.getElementById('modalDetallePlanificacion').style.display = 'none';
}

/* ==================== ELIMINAR ==================== */

async function eliminarPlanificacion(id) {
  if (!confirm('¿Eliminar esta planificación?')) return;
  try {
    await deleteDoc(doc(db, 'planificacion', id));
    toast('Planificación eliminada');
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  }
}

/* ==================== STATS DE PLANIFICACIÓN ==================== */

/**
 * Calcula y renderiza el resumen estadístico de planificaciones.
 * @param {Array} planificaciones
 */
function renderPlanificacionStats(planificaciones) {
  const cont = document.getElementById('planificacionStats');
  if (!cont) return;

  if (!planificaciones || planificaciones.length === 0) {
    cont.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <span class="empty-state-icon">📊</span>
        <div class="empty-state-msg">Sin datos para mostrar estadísticas</div>
        <div class="empty-state-hint">Cuando agregues planificaciones, verás aquí los KPIs y la gráfica.</div>
      </div>`;
    return;
  }

  // ---- Contadores ----
  let totalPlanificaciones = planificaciones.length;
  let ejecutadas = 0;
  let pendientes = 0;
  let canceladas = 0;
  let totalActividades = 0;
  let totalActividadesEjecutadas = 0;
  let totalParticipantesEsperados = 0;

  planificaciones.forEach(p => {
    const estado = p.estado || 'pendiente';
    if (estado === 'ejecutada') ejecutadas += 1;
    else if (estado === 'cancelada') canceladas += 1;
    else pendientes += 1;

    const acts = Array.isArray(p.actividades) ? p.actividades : [];
    totalActividades += acts.length;

    acts.forEach(a => {
      if (a.ejecutada === true) totalActividadesEjecutadas += 1;
      totalParticipantesEsperados += parseInt(a.participantesEsperados, 10) || 0;
    });
  });

  const porcentajePlanificaciones = totalPlanificaciones > 0
    ? Math.round((ejecutadas / totalPlanificaciones) * 100)
    : 0;

  const porcentajeActividades = totalActividades > 0
    ? Math.round((totalActividadesEjecutadas / totalActividades) * 100)
    : 0;

  // ---- Render ----
  cont.innerHTML = `
    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">

      <div class="stat-card" style="border-left-color: #1976d2;">
        <div class="stat-number" style="color: #1976d2;">${totalPlanificaciones}</div>
        <div class="stat-label">📅 Planificaciones totales</div>
      </div>

      <div class="stat-card" style="border-left-color: var(--verde-brillante);">
        <div class="stat-number" style="color: var(--verde-brillante);">${ejecutadas}</div>
        <div class="stat-label">✅ Ejecutadas</div>
      </div>

      <div class="stat-card" style="border-left-color: #ffc107;">
        <div class="stat-number" style="color: #ffa000;">${pendientes}</div>
        <div class="stat-label">⏳ Pendientes</div>
      </div>

      <div class="stat-card" style="border-left-color: #dc3545;">
        <div class="stat-number" style="color: #dc3545;">${canceladas}</div>
        <div class="stat-label">❌ Canceladas</div>
      </div>

    </div>

    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">

      <div class="stat-card" style="border-left-color: var(--verde-medio);">
        <div class="stat-number" style="color: var(--verde-medio);">${totalActividades}</div>
        <div class="stat-label">📝 Actividades planificadas</div>
      </div>

      <div class="stat-card" style="border-left-color: var(--verde-brillante);">
        <div class="stat-number" style="color: var(--verde-brillante);">${totalActividadesEjecutadas}</div>
        <div class="stat-label">🎯 Actividades ejecutadas</div>
      </div>

      <div class="stat-card" style="border-left-color: #1976d2;">
        <div class="stat-number" style="color: #1976d2;">${totalParticipantesEsperados}</div>
        <div class="stat-label">👥 Participantes esperados</div>
      </div>

    </div>

    <div class="mini-panel-resumen" style="margin-top: 8px;">
      <div class="kpi-resumen total">
        📊 ${porcentajePlanificaciones}% de planificaciones ejecutadas
      </div>
      <div class="kpi-resumen activo">
        🎯 ${porcentajeActividades}% de actividades ejecutadas
      </div>
      <div class="kpi-resumen porcentaje">
        ${ejecutadas}/${totalPlanificaciones} completadas
      </div>
    </div>

    <div style="margin-top: 18px;">
      <div class="chart-wrapper">
        <canvas id="chartPlanificacion"></canvas>
      </div>
    </div>
  `;

  // ---- Gráfica con Chart.js ----
  setTimeout(() => {
    if (typeof Chart === 'undefined') return;

    const canvas = document.getElementById('chartPlanificacion');
    if (!canvas) return;

    // Destruimos gráfico previo si existía
    if (window.__chartPlanificacion) {
      try { window.__chartPlanificacion.destroy(); } catch (_) {}
    }

    const ctx = canvas.getContext('2d');
    window.__chartPlanificacion = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['✅ Ejecutadas', '⏳ Pendientes', '❌ Canceladas'],
        datasets: [{
          data: [ejecutadas, pendientes, canceladas],
          backgroundColor: [
            'rgba(76, 175, 80, 0.85)',
            'rgba(255, 193, 7, 0.85)',
            'rgba(220, 53, 69, 0.85)'
          ],
          borderColor: ['#fff', '#fff', '#fff'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Inter', size: 12, weight: '600' },
              color: '#333',
              padding: 14
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const val = ctx.parsed;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return `${ctx.label}: ${val} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }, 100);
}

/* ==================== MARCAR ACTIVIDAD COMO EJECUTADA ==================== */

/**
 * Marca una actividad específica de una planificación como ejecutada.
 * Agrega `ejecutada: true`, `reporteId` y `fechaEjecucion` a la actividad
 * indicada. Si todas las actividades quedan ejecutadas, marca la
 * planificación completa como 'ejecutada'.
 *
 * @param {string} planificacionId
 * @param {number} actividadNumero  — índice 0-based de la actividad
 * @param {string} reporteId        — ID del reporte de cumplimiento
 */
export async function marcarActividadComoEjecutada(planificacionId, actividadNumero, reporteId) {
  if (!planificacionId) return;
  if (actividadNumero === null || actividadNumero === undefined) return;

  const snap = await getDoc(doc(db, 'planificacion', planificacionId));
  if (!snap.exists()) return;

  const data = snap.data();
  const actividades = Array.isArray(data.actividades) ? [...data.actividades] : [];

  if (actividadNumero < 0 || actividadNumero >= actividades.length) return;

  actividades[actividadNumero] = {
    ...actividades[actividadNumero],
    ejecutada: true,
    reporteId,
    fechaEjecucion: new Date().toISOString()
  };

  const todasEjecutadas = actividades.length > 0 &&
    actividades.every(a => a.ejecutada === true);

  const updatePayload = {
    actividades,
    fechaActualizacion: serverTimestamp()
  };

  if (todasEjecutadas) {
    updatePayload.estado = 'ejecutada';
  }

  await updateDoc(doc(db, 'planificacion', planificacionId), updatePayload);

  console.log('[Planificación] Actividad marcada como ejecutada:', planificacionId, 'idx', actividadNumero);
}

/* ==================== CLEANUP DE SUSCRIPCIONES AL CERRAR SESIÓN ==================== */
// H.1: auth.js::logout() dispara 'usuarioCerroSesion' antes de signOut().
// Esto libera el onSnapshot de /planificacion para evitar fugas de listeners
// de Firestore tras cerrar sesión.
document.addEventListener('usuarioCerroSesion', () => {
  if (unsubPlan) {
    try { unsubPlan(); } catch (_) {}
    unsubPlan = null;
  }
});