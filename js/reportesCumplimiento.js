// js/reportesCumplimiento.js
// Nuevo Formulario de Cumplimiento — Misión Árbol
// Wizard de 5 pasos con secciones condicionales por gerencia

import { toast, loader, setBotonCargando } from "./auth.js";
import {
  collection, addDoc, serverTimestamp,
  getDocs, query, where, doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import {
  cargarTerritorio,
  ESTADOS_VENEZUELA,
  GERENCIAS,
  CATALOGO_PLANTAS,
  TIPOS_ACTIVIDAD_POR_GERENCIA,
  CATEGORIAS_PARTICIPANTES,
  calcularTotalParticipantes,
  ENTES_ADSCRITOS,
  MINISTERIOS,
  municipiosDe,
  parroquiasDe,
  comunasDe,
  consejosComunalesDe,
  escapeHTML
} from "./datos.js";

import { marcarActividadComoEjecutada } from "./planificacion.js";
import { esquemaDe, tiposActividadDe, CAMPOS_COMUNES } from "./esquemasActividades.js";

/* ==================== ESTADO GLOBAL ==================== */
let pasoActual = 1;
const TOTAL_PASOS = 5;

/* ----- Estado de vinculación plan ↔ cumplimiento ----- */
let planificacionesCoincidentes = [];
let planificacionVinculada = null; // { id, semanaInicio, semanaFin, actividadNumero }
let _pvCacheKey = '';              // cache para no re-buscar en cada render

/**
 * Estructura completa de formData del nuevo formulario de cumplimiento.
 * Se reinicia al cargar el panel.
 */
let formData = {};

function inicializarFormData(perfil) {
  return {
    // ─── Metadata ───
    indicadorBloqueado: false,
    gerenciaOriginal: '',

    // ─── Paso 1: Datos Generales ───
    datosGenerales: {
      email: perfil.email || '',
      fecha: '',
      hora: '',
      estado: perfil.estado || '',
      municipio: '',
      parroquia: '',
      comuna: '',
      consejoComunal: '',
      lugar: '',
      responsable: perfil.nombre || '',
      responsablePersonalId: '',
      telefono: ''
    },

    // ─── Paso 2: Indicador ───
    indicador: '',

    // ─── Paso 3: Campos condicionales ───
    condicional: {
      produccion: {
        tipoEspacio: '',
        tipoActividad: '',
        tipoArea: '',
        tipoPlanta: '',
        semillas: { forestal: 0, frutal: 0, ornamental: 0, medicinal: 0 },
        especies: { forestal: {}, frutal: {}, ornamental: {}, medicinal: {} },
        porte: '',
        conservacionEmpaque: '',
        conservacionEspacio: '',
        ubicacionAlmacenamiento: '',
        canterosLlenados: 0,
        bolsasLlenadas: 0,
        sustratoPreparado: 0,
        acarreoSustrato: 0,
        nombreBanco: '',
        capacidadBanco: 0,
        bolsasPlasticas: 0
      },
      formacion: {
        tipoDinamica: '',
        tema: '',
        personasSensibilizadas: 0,
        brigadaEcologica: '',
        modalidad: '',
        materialDidactico: [],
        seConformoBrigada: '',
        nombreBrigada: '',
        miembrosBrigada: 0,
        clasificacionBrigada: ''
      },
      organizacion: {
        tipoActividad: '',
        tipoBrigada: '',
        miembrosBrigada: 0,
        cantidadBrigadas: 0,
        nombreBrigada: '',
        clasificacionBrigada: '',
        alianzas: [],
        ministerios: [],
        comiteEcosocialista: '',
        consejoEcosocialista: '',
        conformacionConsejoComite: '',
        disgregacionFuerzas: 0,
        personalMovilizado: 0,
        acuerdos: ''
      },
      plantacion: {
        tipoActividad: '',
        tipoPlanta: '',
        especies: { forestal: {}, frutal: {}, ornamental: {}, medicinal: {} },
        cantidadTotalPlantas: 0,
        dimensionesArea: '',
        latitud: '',
        longitud: '',
        tipoZona: '',
        tipoArea: '',
        caracteristicasSuelo: '',
        afectacionBanco: '',
        arbolesRecuperados: 0,
        tipoActividad2: ''
      },
      politicas: {
        tipoActividad: '',
        organizaciones: [],
        convocatoria: '',
        cantidadAsistentes: 0,
        apoyoEnte: [],
        descripcion: '',
        objetivo: ''
      }
    },

    // ─── Paso 4: Participantes ───
    participantes: {
      ninos: 0, ninas: 0,
      adolescentes: 0, adolescentas: 0,
      adultos: 0, adultas: 0,
      adultos_mayores: 0, adultas_mayores: 0
    },

    // ─── Paso 5: Evidencia y Cierre ───
    cierre: {
      fuePlanificada: '',
      mediosComunicacion: [],
      apoyoEnteAdscrito: [],
      apoyoMinisterio: [],
      residuosSolidos: 0,
      observacion: '',
      registroFotografico: '',
      gerenciaVinculada2: '',
      gerenciaVinculada3: '',
      vinculaciones: []
    }
  };
}

/* ==================== CARGA PRINCIPAL ==================== */
export async function cargarFormularioCumplimiento() {
  const perfil = window.__perfil;
  if (!perfil) return;

  // El wizard se monta en el contenedor correcto según el rol
  const contenedorId = perfil.rol === 'reporte_nacional'
    ? 'formReporteNacional'
    : 'formReporteEstadal';

  const cont = document.getElementById(contenedorId);
  if (!cont) return;

  await cargarTerritorio();

  pasoActual = 1;
  formData = inicializarFormData(perfil);

  // Si es reporte_nacional, auto-seteamos su gerencia como indicador
  // y la bloqueamos. Buscamos la gerencia por "corto" o "id".
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia) {
    const gerenciaId = resolverGerenciaId(perfil.gerencia);
    if (gerenciaId) {
      formData.indicador = gerenciaId;
      formData.indicadorBloqueado = true;
      formData.gerenciaOriginal = perfil.gerencia;
    }
  }

  cont.innerHTML = `
    <div id="reporteEspecialBanner"></div>
    <div class="wizard-container">
      <div class="pasos-indicador">
        <div class="paso" data-paso="1">1. Datos Generales</div>
        <div class="paso" data-paso="2">2. Indicador</div>
        <div class="paso" data-paso="3">3. Actividad</div>
        <div class="paso" data-paso="4">4. Participantes</div>
        <div class="paso" data-paso="5">5. Cierre</div>
      </div>
      <div id="wizard-body" class="wizard-body"></div>
      <div class="wizard-buttons">
        <button id="btn-atras" class="btn btn-secondary">← Atrás</button>
        <button id="btn-siguiente" class="btn btn-success">Siguiente →</button>
      </div>
    </div>`;

  // Cargar reportes especiales pendientes (banner)
  cargarBannerReporteEspecial(perfil);

  document.getElementById('btn-atras').addEventListener('click', () => cambiarPaso(-1));

  renderizarPaso();
}

/**
 * Resuelve el id de la gerencia a partir del "corto", "id" o "nombre"
 * que viene en el perfil del usuario.
 * @param {string} gerenciaValor
 * @returns {string|null}
 */
function resolverGerenciaId(gerenciaValor) {
  if (!gerenciaValor) return null;
  const g = GERENCIAS.find(x =>
    x.id === gerenciaValor ||
    x.corto === gerenciaValor ||
    x.nombre === gerenciaValor
  );
  return g ? g.id : null;
}

/* ==================== NAVEGACIÓN ENTRE PASOS ==================== */
function cambiarPaso(dir) {
  const nuevo = pasoActual + dir;
  if (nuevo < 1 || nuevo > TOTAL_PASOS) return;
  if (dir === 1 && !validarPaso(pasoActual)) return;
  pasoActual = nuevo;
  renderizarPaso();
  document.getElementById('wizard-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Valida el paso actual antes de avanzar.
 * Se irá completando en las siguientes sub-fases.
 */
function validarPaso(paso) {
  if (paso === 1) {
    const dg = formData.datosGenerales;
    if (!dg.fecha)               { toast('Ingresa la fecha de cumplimiento'); return false; }
    if (!dg.hora)                { toast('Ingresa la hora'); return false; }
    if (!dg.estado)              { toast('Selecciona el estado'); return false; }
    if (!dg.municipio)           { toast('Selecciona el municipio'); return false; }
    if (!dg.parroquia)           { toast('Selecciona la parroquia'); return false; }
    if (!dg.comuna)              { toast('Selecciona la comuna / circuito, o "No Aplica"'); return false; }
    if (!dg.consejoComunal)      { toast('Selecciona el consejo comunal, o "No Aplica"'); return false; }
    if (!dg.lugar?.trim())       { toast('Ingresa el lugar específico'); return false; }
    if (!dg.responsable?.trim()) { toast('Ingresa el responsable principal'); return false; }
    if (!dg.telefono?.trim())    { toast('Ingresa el teléfono de contacto'); return false; }
  }

  if (paso === 2) {
    if (!formData.indicador) {
      toast('Selecciona una gerencia / indicador para continuar');
      return false;
    }
  }

  if (paso === 3) {
    const ind = formData.indicador;
    const data = formData.condicional[ind] || {};

    if (!data.tipoActividad) {
      toast('Selecciona el tipo de actividad');
      return false;
    }

    // Validación genérica según el esquema declarativo.
    const esquema = esquemaDe(ind, data.tipoActividad);
    if (!esquema) {
      toast('Tipo de actividad no reconocido');
      return false;
    }

    for (const campo of (esquema.campos || [])) {
      if (!campo.requerido) continue;
      if (!campoVisible(campo, data)) continue; // no validar campos ocultos
      const val = data[campo.id];
      const vacio = val === undefined || val === null || val === '' ||
        (Array.isArray(val) && val.length === 0);
      if (vacio) {
        toast('Completa el campo: ' + (campo.label || campo.id));
        return false;
      }
    }

    // Validación del flujo "Otro (especificar)" para vínculos (brigada/comité/consejo)
    for (const campo of (esquema.campos || [])) {
      if (!['brigada', 'comite', 'consejo'].includes(campo.tipo)) continue;
      if (!campoVisible(campo, data)) continue;
      if (data[campo.id] !== '__otro__') continue;
      if (data[campo.id + 'Reportar'] !== 'sí') {
        toast('Para "Otro (especificar)" debe reportarlo a la nacional (Sí) para continuar');
        return false;
      }
      if (!(data[campo.id + 'OtroNombre'] || '').trim()) {
        toast('Ingresa el nombre para reportarlo a la nacional');
        return false;
      }
    }
  }

  if (paso === 4) {
    const total = calcularTotalParticipantes(formData.participantes);
    if (total.totalGeneral === 0) {
      toast('Ingresa al menos 1 participante (o continúa si no hubo participantes)');
      // No bloqueamos: algunas actividades no tienen participantes.
      // return false;
    }
  }

  if (paso === 5) {
    const c = formData.cierre;
    if (!c.fuePlanificada)         { toast('Indica si la actividad fue planificada'); return false; }
    if (!c.registroFotografico?.trim()) { toast('Ingresa el enlace del registro fotográfico'); return false; }
  }

  return true;
}

/* ==================== RENDER PRINCIPAL ==================== */
async function renderizarPaso() {
  document.querySelectorAll('.paso').forEach(p => p.classList.remove('paso-activo'));
  document.querySelector(`.paso[data-paso="${pasoActual}"]`)?.classList.add('paso-activo');

  const body = document.getElementById('wizard-body');
  const btnAtras = document.getElementById('btn-atras');
  const btnSig = document.getElementById('btn-siguiente');

  if (!body || !btnAtras || !btnSig) return;

  btnAtras.style.display = pasoActual === 1 ? 'none' : 'inline-flex';
  btnSig.textContent = pasoActual === TOTAL_PASOS ? '📤 Enviar' : 'Siguiente →';

  switch (pasoActual) {
    case 1: renderPaso1(body); break;
    case 2: renderPaso2(body); break;
    case 3: renderPaso3(body); break;
    case 4: renderPaso4(body); break;
    case 5: renderPaso5(body); break;
  }

  btnSig.onclick = pasoActual === TOTAL_PASOS
    ? () => enviarReporte()
    : () => cambiarPaso(1);
}

/* ==================== PASOS (placeholders — se completan en 3B-3E) ==================== */
function renderPaso1(body) {
  const dg = formData.datosGenerales;

  // Datos iniciales para cada select
  const municipios = dg.estado ? municipiosDe(dg.estado) : [];
  const parroquias = (dg.estado && dg.municipio) ? parroquiasDe(dg.estado, dg.municipio) : [];
  const comunas    = (dg.estado && dg.municipio && dg.parroquia) ? comunasDe(dg.estado, dg.municipio, dg.parroquia) : [];
  const consejos   = (dg.estado && dg.municipio && dg.parroquia && dg.comuna && dg.comuna !== 'No Aplica')
    ? consejosComunalesDe(dg.estado, dg.municipio, dg.parroquia, dg.comuna) : [];

  body.innerHTML = `
    <div class="subpanel">
      <h3>📅 Fecha y Hora</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Fecha de cumplimiento *</label>
          <input type="date" id="dg-fecha" value="${escapeHTML(dg.fecha)}">
        </div>
        <div class="form-group">
          <label>Hora *</label>
          <input type="time" id="dg-hora" value="${escapeHTML(dg.hora)}">
        </div>
      </div>
      <div class="form-group">
        <label>Correo del responsable</label>
        <input type="email" id="dg-email" value="${escapeHTML(dg.email)}" readonly
               style="background: #f5f5f5;">
      </div>
    </div>

    <div class="subpanel">
      <h3>📍 Ubicación Territorial</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Estado *</label>
          <select id="dg-estado">
            <option value="">Seleccione...</option>
            ${ESTADOS_VENEZUELA.map(e =>
              `<option value="${e}" ${e === dg.estado ? 'selected' : ''}>${e}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Municipio *</label>
          <select id="dg-municipio" ${!dg.estado ? 'disabled' : ''}>
            <option value="">Seleccione...</option>
            ${municipios.map(m =>
              `<option value="${escapeHTML(m)}" ${m === dg.municipio ? 'selected' : ''}>${escapeHTML(m)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Parroquia *</label>
          <select id="dg-parroquia" ${!dg.municipio ? 'disabled' : ''}>
            <option value="">Seleccione...</option>
            ${parroquias.map(p =>
              `<option value="${escapeHTML(p)}" ${p === dg.parroquia ? 'selected' : ''}>${escapeHTML(p)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Comuna / Circuito Comunal *</label>
          <select id="dg-comuna" ${!dg.parroquia ? 'disabled' : ''}>
            <option value="">Seleccione...</option>
            ${comunas.map(c =>
              `<option value="${escapeHTML(c)}" ${c === dg.comuna ? 'selected' : ''}>${escapeHTML(c)}</option>`
            ).join('')}
            <option value="No Aplica" ${dg.comuna === 'No Aplica' ? 'selected' : ''}>— No Aplica (no es territorio comunal) —</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Consejo Comunal *</label>
        <select id="dg-consejo" ${!dg.comuna || dg.comuna === 'No Aplica' ? 'disabled' : ''}>
          <option value="">Seleccione...</option>
          ${consejos.map(c =>
            `<option value="${escapeHTML(c)}" ${c === dg.consejoComunal ? 'selected' : ''}>${escapeHTML(c)}</option>`
          ).join('')}
          <option value="No Aplica" ${dg.consejoComunal === 'No Aplica' ? 'selected' : ''}>— No Aplica —</option>
        </select>
      </div>
      <div class="form-group">
        <label>Lugar específico *</label>
        <input type="text" id="dg-lugar" placeholder="Ej: Plaza Bolívar, Liceo, Vivero..."
               value="${escapeHTML(dg.lugar)}">
      </div>
    </div>

    <div class="subpanel">
      <h3>👤 Responsable</h3>
      <div class="form-row">
        <div class="form-group">
          <label>Responsable principal *</label>
          <select id="dg-responsable"><option value="">Cargando personal...</option></select>
        </div>
        <div class="form-group">
          <label>Teléfono de contacto *</label>
          <input type="tel" id="dg-telefono" placeholder="0412-1234567"
                 value="${escapeHTML(dg.telefono)}">
        </div>
      </div>
    </div>
  `;

  /* ===== Wiring de campos simples ===== */
  document.getElementById('dg-fecha').addEventListener('change', (e) => { dg.fecha = e.target.value; });
  document.getElementById('dg-hora').addEventListener('change',  (e) => { dg.hora = e.target.value; });
  document.getElementById('dg-lugar').addEventListener('input',   (e) => { dg.lugar = e.target.value; });
  // Responsable: ahora es un select precargado (ver cargarResponsableDesdePersonal).
  document.getElementById('dg-telefono').addEventListener('input',    (e) => { dg.telefono = e.target.value; });

  /* ===== Cascada territorial ===== */
  const selEstado    = document.getElementById('dg-estado');
  const selMunicipio = document.getElementById('dg-municipio');
  const selParroquia = document.getElementById('dg-parroquia');
  const selComuna    = document.getElementById('dg-comuna');
  const selConsejo   = document.getElementById('dg-consejo');

  // Estado cambia → recargar municipios, limpiar los demás
  selEstado.addEventListener('change', () => {
    dg.estado = selEstado.value;
    dg.municipio = '';
    dg.parroquia = '';
    dg.comuna = '';
    dg.consejoComunal = '';

    const muns = dg.estado ? municipiosDe(dg.estado) : [];
    selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
      muns.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    selMunicipio.disabled = !dg.estado;

    selParroquia.innerHTML = '<option value="">Seleccione...</option>';
    selParroquia.disabled = true;

    selComuna.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica">— No Aplica —</option>';
    selComuna.disabled = true;

    selConsejo.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = true;
  });

  // Municipio cambia → recargar parroquias, limpiar los demás
  selMunicipio.addEventListener('change', () => {
    dg.municipio = selMunicipio.value;
    dg.parroquia = '';
    dg.comuna = '';
    dg.consejoComunal = '';

    const parr = (dg.estado && dg.municipio) ? parroquiasDe(dg.estado, dg.municipio) : [];
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parr.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = !dg.municipio;

    selComuna.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica">— No Aplica —</option>';
    selComuna.disabled = true;

    selConsejo.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = true;
  });

  // Parroquia cambia → recargar comunas, limpiar consejo
  selParroquia.addEventListener('change', () => {
    dg.parroquia = selParroquia.value;
    dg.comuna = '';
    dg.consejoComunal = '';

    const coms = (dg.estado && dg.municipio && dg.parroquia)
      ? comunasDe(dg.estado, dg.municipio, dg.parroquia) : [];
    selComuna.innerHTML = '<option value="">Seleccione...</option>' +
      coms.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica (no es territorio comunal) —</option>';
    selComuna.disabled = !dg.parroquia;

    selConsejo.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = true;
  });

  // Comuna cambia → recargar consejos o auto-marcar "No Aplica"
  selComuna.addEventListener('change', () => {
    dg.comuna = selComuna.value;
    dg.consejoComunal = '';

    if (dg.comuna === 'No Aplica' || dg.comuna === '') {
      dg.consejoComunal = dg.comuna === 'No Aplica' ? 'No Aplica' : '';
      selConsejo.innerHTML = '<option value="">Seleccione...</option><option value="No Aplica" selected>— No Aplica —</option>';
      selConsejo.disabled = true;
      return;
    }

    const cons = (dg.estado && dg.municipio && dg.parroquia && dg.comuna)
      ? consejosComunalesDe(dg.estado, dg.municipio, dg.parroquia, dg.comuna) : [];
    selConsejo.innerHTML = '<option value="">Seleccione...</option>' +
      cons.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = false;
  });

  // Consejo cambia
  selConsejo.addEventListener('change', () => {
    dg.consejoComunal = selConsejo.value;
  });

  // Responsable: dropdown precargado desde /personal
  cargarResponsableDesdePersonal(dg);
}

/* Carga el personal del usuario (estado/gerencia) y lo pone en el select de responsable. */
async function cargarResponsableDesdePersonal(dg) {
  const sel = document.getElementById('dg-responsable');
  if (!sel) return;
  const perfil = window.__perfil;
  try {
    let q = collection(db, 'personal');
    if (perfil?.estado) q = query(q, where('estado', '==', perfil.estado));
    else if (perfil?.gerencia) q = query(q, where('gerencia', '==', perfil.gerencia));
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombreCompleto || '').localeCompare(b.nombreCompleto || ''));

    const idActual = dg.responsablePersonalId || '';
    const nombreActual = dg.responsable || '';

    if (docs.length === 0) {
      sel.innerHTML = '<option value="">No hay personal en "Mi Personal"</option>';
      return;
    }

    sel.innerHTML = '<option value="">Seleccione...</option>' +
      docs.map((d) => {
        const nom = d.nombreCompleto || d.nombre || '—';
        const seleccionado = (d.id === idActual) || (!idActual && nom === nombreActual);
        return `<option value="${escapeHTML(d.id)}" data-nombre="${escapeHTML(nom)}" ${seleccionado ? 'selected' : ''}>${escapeHTML(nom)}${d.cargo ? ' — ' + escapeHTML(d.cargo) : ''}</option>`;
      }).join('');

    sel.addEventListener('change', () => {
      const opt = sel.options[sel.selectedIndex];
      dg.responsablePersonalId = sel.value;
      dg.responsable = opt?.dataset.nombre || '';
      const pers = docs.find((d) => d.id === sel.value);
      if (pers?.telefono) {
        dg.telefono = pers.telefono;
        const telEl = document.getElementById('dg-telefono');
        if (telEl) telEl.value = pers.telefono;
      }
    });
  } catch (e) {
    console.warn('[Responsable] No se pudo cargar personal:', e);
    sel.innerHTML = '<option value="">No disponible</option>';
  }
}

function renderPaso2(body) {
  const infoIndicadores = {
    organizacion: {
      icono: 'fas fa-users',
      descripcion: 'Reuniones, brigadas, asambleas, inspecciones, alianzas, censos, movilizaciones comunitarias.'
    },
    produccion: {
      icono: 'fas fa-seedling',
      descripcion: 'Recolección de semillas, llenado de bolsas, germinación, viveros, sustrato, banco de germoplasma.'
    },
    formacion: {
      icono: 'fas fa-chalkboard-teacher',
      descripcion: 'Conversatorios, talleres, cine-foro, sensibilizaciones, aulas abiertas, capacitación.'
    },
    plantacion: {
      icono: 'fas fa-tree',
      descripcion: 'Reforestación, plantación, hoyaduras, avíos, mantenimiento fitosanitario, paisajismo.'
    },
    politicas: {
      icono: 'fas fa-bullhorn',
      descripcion: 'Actividades políticas, movilizaciones, marchas, actos, jornadas de calle, no adscritas a gerencia.'
    }
  };

  // ===== MODO BLOQUEADO (para reporte_nacional) =====
  if (formData.indicadorBloqueado && formData.indicador) {
    const g = GERENCIAS.find(x => x.id === formData.indicador);
    const info = infoIndicadores[formData.indicador] || { icono: 'fas fa-lock', descripcion: '' };

    body.innerHTML = `
      <div class="subpanel" style="background: #fff8e1; border-left: 5px solid #ffc107;">
        <h3 style="color: #856404; margin-bottom: 8px;">
          🔒 Gerencia Bloqueada
        </h3>
        <p style="font-size: 13px; color: #856404; margin-bottom: 0;">
          Como usuario de <strong>Reporte Nacional</strong>, solo puedes crear
          actividades para tu gerencia asignada. Si necesitas reportar otra
          gerencia, contacta al administrador.
        </p>
      </div>

      <div style="
        background: #f1f8e9;
        border: 2px solid var(--verde-brillante);
        border-left: 5px solid var(--verde-brillante);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 20px rgba(76, 175, 80, 0.2);
        margin-top: 8px;">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 10px;">
          <div style="
            width: 46px; height: 46px; border-radius: 50%;
            background: var(--primary-gradient);
            color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.3rem; flex-shrink: 0;">
            <i class="${info.icono}"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--verde-oscuro); font-size: 15px; margin-bottom: 2px;">
              ${escapeHTML(g?.nombre || 'Gerencia')}
            </div>
            <div style="font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              ${escapeHTML(g?.corto || '')}
            </div>
          </div>
          <div style="
            width: 22px; height: 22px; border-radius: 50%;
            background: var(--verde-brillante);
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 12px; flex-shrink: 0;">
            <i class="fas fa-lock"></i>
          </div>
        </div>
        <div style="font-size: 12px; color: #666; line-height: 1.4;">
          ${info.descripcion}
        </div>
      </div>
    `;
    return;
  }

  // ===== MODO NORMAL (para reporte_estadal) =====
  const cards = GERENCIAS.map((g) => {
    const info = infoIndicadores[g.id] || { icono: 'fas fa-circle', descripcion: '' };
    const seleccionado = formData.indicador === g.id;

    return `
      <div class="indicador-card ${seleccionado ? 'indicador-activo' : ''}"
           data-indicador="${g.id}"
           style="
             background: ${seleccionado ? '#f1f8e9' : '#fff'};
             border: 2px solid ${seleccionado ? 'var(--verde-brillante)' : '#e0e0e0'};
             border-left: 5px solid ${seleccionado ? 'var(--verde-brillante)' : '#ccc'};
             border-radius: 12px;
             padding: 18px;
             cursor: pointer;
             transition: all 0.2s;
             box-shadow: ${seleccionado ? '0 8px 20px rgba(76, 175, 80, 0.2)' : '0 2px 8px rgba(0,0,0,0.05)'};
           ">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 10px;">
          <div style="
            width: 46px; height: 46px; border-radius: 50%;
            background: ${seleccionado ? 'var(--primary-gradient)' : '#e8f5e9'};
            color: ${seleccionado ? '#fff' : 'var(--verde-medio)'};
            display: flex; align-items: center; justify-content: center;
            font-size: 1.3rem; flex-shrink: 0;">
            <i class="${info.icono}"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 700; color: var(--verde-oscuro); font-size: 15px; margin-bottom: 2px;">
              ${escapeHTML(g.nombre)}
            </div>
            <div style="font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
              ${escapeHTML(g.corto)}
            </div>
          </div>
          <div style="
            width: 22px; height: 22px; border-radius: 50%;
            border: 2px solid ${seleccionado ? 'var(--verde-brillante)' : '#ccc'};
            background: ${seleccionado ? 'var(--verde-brillante)' : '#fff'};
            display: flex; align-items: center; justify-content: center;
            color: #fff; font-size: 12px; flex-shrink: 0;">
            ${seleccionado ? '<i class="fas fa-check"></i>' : ''}
          </div>
        </div>
        <div style="font-size: 12px; color: #666; line-height: 1.4;">
          ${info.descripcion}
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div class="subpanel" style="background: #f9fdf7; border-left: 5px solid var(--verde-brillante);">
      <h3 style="color: var(--verde-medio); margin-bottom: 6px;">
        🎯 Selecciona la Gerencia / Indicador
      </h3>
      <p style="font-size: 13px; color: #666; margin-bottom: 0;">
        Según la opción que elijas, el siguiente paso mostrará los campos específicos
        que corresponden a esa área.
      </p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 6px;">
      ${cards}
    </div>
  `;

  body.querySelectorAll('.indicador-card').forEach((card) => {
    card.addEventListener('click', () => {
      const indicador = card.dataset.indicador;
      const anterior = formData.indicador;
      if (anterior && anterior !== indicador) {
        formData.condicional[anterior] = reiniciarCondicional(anterior);
      }
      formData.indicador = indicador;
      // Al cambiar de indicador, reseteamos el estado de vinculación
      planificacionVinculada = null;
      planificacionesCoincidentes = [];
      _pvCacheKey = '';
      renderizarPaso();
    });

    card.addEventListener('mouseenter', () => {
      if (formData.indicador !== card.dataset.indicador) {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      if (formData.indicador !== card.dataset.indicador) {
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
      }
    });
  });
}

/**
 * Devuelve la estructura vacía de un condicional según el indicador.
 * Usado para limpiar cuando el usuario cambia de gerencia.
 * @param {string} indicador
 * @returns {Object}
 */
function reiniciarCondicional(indicador) {
  const templates = {
    produccion: {
      tipoEspacio: '', tipoActividad: '', tipoArea: '', tipoPlanta: '',
      semillas: { forestal: 0, frutal: 0, ornamental: 0, medicinal: 0 },
      especies: { forestal: {}, frutal: {}, ornamental: {}, medicinal: {} },
      porte: '', conservacionEmpaque: '', conservacionEspacio: '',
      ubicacionAlmacenamiento: '', canterosLlenados: 0, bolsasLlenadas: 0,
      sustratoPreparado: 0, acarreoSustrato: 0, nombreBanco: '',
      capacidadBanco: 0, bolsasPlasticas: 0
    },
    formacion: {
      tipoDinamica: '', tema: '', personasSensibilizadas: 0,
      brigadaEcologica: '', modalidad: '', materialDidactico: [],
      seConformoBrigada: '', nombreBrigada: '', miembrosBrigada: 0,
      clasificacionBrigada: ''
    },
    organizacion: {
      tipoActividad: '', tipoBrigada: '', miembrosBrigada: 0,
      cantidadBrigadas: 0, nombreBrigada: '', clasificacionBrigada: '',
      alianzas: [], ministerios: [], comiteEcosocialista: '',
      consejoEcosocialista: '', conformacionConsejoComite: '',
      disgregacionFuerzas: 0, personalMovilizado: 0, acuerdos: ''
    },
    plantacion: {
      tipoActividad: '', tipoPlanta: '',
      especies: { forestal: {}, frutal: {}, ornamental: {}, medicinal: {} },
      cantidadTotalPlantas: 0, dimensionesArea: '', latitud: '', longitud: '',
      tipoZona: '', tipoArea: '', caracteristicasSuelo: '', afectacionBanco: '',
      arbolesRecuperados: 0, tipoActividad2: ''
    },
    politicas: {
      tipoActividad: '', organizaciones: [], convocatoria: '',
      cantidadAsistentes: 0, apoyoEnte: [], descripcion: '', objetivo: ''
    }
  };
  return JSON.parse(JSON.stringify(templates[indicador] || {}));
}

/* ==================== PASO 3 — DISPATCHER ==================== */
function renderPaso3(body) {
  if (!formData.indicador) {
    body.innerHTML = `
      <div style="padding: 30px; text-align: center; color: #666;">
        <p>Primero debes seleccionar una gerencia en el paso anterior.</p>
      </div>`;
    return;
  }

  // 1. Buscar planificaciones coincidentes (con cache)
  const dg = formData.datosGenerales;
  const cacheKey = `${formData.indicador}|${dg.estado}|${dg.municipio}|${dg.parroquia}|${dg.fecha}`;

  if (cacheKey !== _pvCacheKey && !planificacionVinculada) {
    _pvCacheKey = cacheKey;
    planificacionesCoincidentes = []; // limpiamos mientras buscamos
    buscarPlanificacionesCoincidentes(cacheKey).then(matches => {
      // Si el usuario ya cambió el contexto, ignoramos
      if (cacheKey !== _pvCacheKey) return;
      planificacionesCoincidentes = matches;
      // Re-render solo si seguimos en el paso 3
      if (pasoActual === 3) renderizarPaso();
    });
  }

  // 2. Render: banner + contenido específico del indicador
  body.innerHTML = '<div id="pv-banner-wrapper"></div><div id="paso3-content"></div>';

  const bannerWrapper = document.getElementById('pv-banner-wrapper');
  bannerWrapper.innerHTML = renderBannerVinculacion();
  wireBannerVinculacion();

  const inner = document.getElementById('paso3-content');
  renderPaso3Generico(inner);
}

/* ==================== PASO 3 — RENDERIZADOR GENÉRICO (esquema declarativo) ==================== */

function renderPaso3Generico(body) {
  const ind = formData.indicador;
  const data = formData.condicional[ind] || {};
  const tipos = tiposActividadDe(ind);

  body.innerHTML = `
    <div class="subpanel">
      <h3>📋 Actividad</h3>
      <div class="form-group">
        <label>Tipo de actividad *</label>
        ${htmlSelect('gen-tipoActividad', tipos, data.tipoActividad || '')}
      </div>
    </div>
    <div id="gen-campos"></div>
  `;

  document.getElementById('gen-tipoActividad')?.addEventListener('change', (e) => {
    limpiarCamposCondicional(data, e.target.value);
    renderizarPaso();
  });

  if (!data.tipoActividad) return;

  const esquema = esquemaDe(ind, data.tipoActividad);
  const cont = document.getElementById('gen-campos');
  if (!esquema) {
    cont.innerHTML = '<p style="padding:20px;color:#888;text-align:center;">Actividad sin esquema definido.</p>';
    return;
  }

  (esquema.campos || []).forEach((campo) => {
    if (!campoVisible(campo, data)) return;
    renderCampoGenerico(cont, campo, data);
  });

  renderAcompanamiento(cont, data);
}

function limpiarCamposCondicional(data, tipo) {
  Object.keys(data).forEach((k) => { if (k !== 'tipoActividad') delete data[k]; });
  data.tipoActividad = tipo;
}

function campoVisible(campo, data) {
  if (!campo.visibleSi) return true;
  // Evaluador seguro (sin eval/Function, compatible con la CSP estricta).
  // Soporta comparaciones simples:  campoId === 'valor'  (o ==).
  const m = String(campo.visibleSi).trim().match(/^(\w+)\s*===?\s*['"]([^'"]*)['"]$/);
  if (m) return data[m[1]] === m[2];
  console.warn('[esquema] visibleSi no soportado (se muestra):', campo.visibleSi);
  return true;
}

function renderCampoGenerico(cont, campo, data) {
  const wrapper = document.createElement('div');
  wrapper.className = 'form-group';
  const id = 'gen-' + campo.id;
  const req = campo.requerido ? ' *' : '';
  const hint = (campo.hint && campo.tipo !== 'text')
    ? `<small style="display:block;color:#888;font-size:12px;margin-top:2px;">${escapeHTML(campo.hint)}</small>`
    : '';
  let inputHTML = '';

  switch (campo.tipo) {
    case 'text':
      inputHTML = `<input type="text" id="${id}" value="${escapeHTML(data[campo.id] || '')}" placeholder="${escapeHTML(campo.hint || '')}">`;
      break;
    case 'textarea':
      inputHTML = `<textarea id="${id}" rows="3">${escapeHTML(data[campo.id] || '')}</textarea>`;
      break;
    case 'number':
      inputHTML = `<input type="number" id="${id}" min="0" value="${Number(data[campo.id]) || 0}">`;
      break;
    case 'date':
      inputHTML = `<input type="date" id="${id}" value="${escapeHTML(data[campo.id] || '')}">`;
      break;
    case 'select':
      inputHTML = htmlSelect(id, campo.opciones || [], data[campo.id] || '');
      break;
    case 'radio':
      inputHTML = htmlRadioGroup(id, campo.opciones || [], data[campo.id] || '');
      break;
    case 'checkbox':
      inputHTML = htmlCheckboxGroup(id, campo.opciones || [], data[campo.id] || []);
      break;
    case 'otro': {
      const opciones = campo.opciones || [];
      const val = data[campo.id] || '';
      inputHTML = htmlSelect(id, opciones, val);
      if (opciones.includes('Otro')) {
        const show = val === 'Otro';
        inputHTML += `<input type="text" id="${id}-otro" placeholder="Especificar..." value="${escapeHTML(data[campo.id + 'Otro'] || '')}" style="margin-top:6px;${show ? '' : 'display:none;'}">`;
      }
      break;
    }
    case 'coordenadas':
      inputHTML = `
        <div class="form-row">
          <div class="form-group"><label>Latitud</label><input type="text" id="${id}-lat" placeholder="Ej: 8.5" value="${escapeHTML(data.latitud || '')}"></div>
          <div class="form-group"><label>Longitud</label><input type="text" id="${id}-lng" placeholder="Ej: -66.9" value="${escapeHTML(data.longitud || '')}"></div>
        </div>`;
      break;
    case 'personal':
    case 'brigada':
    case 'comite':
    case 'consejo':
    case 'vivero':
      inputHTML = `<select id="${id}"><option value="">Cargando...</option></select>`;
      break;
    case 'especies_multi':
      inputHTML = `<div id="${id}"></div>`;
      break;
    default:
      inputHTML = `<input type="text" id="${id}" value="${escapeHTML(data[campo.id] || '')}">`;
  }

  // Notificación "Otro (especificar)" para vínculos (brigada/comité/consejo)
  if (['brigada', 'comite', 'consejo'].includes(campo.tipo) && data[campo.id] === '__otro__') {
    inputHTML += renderNotificacionVinculo(id, campo, data);
  }

  wrapper.innerHTML = `<label>${escapeHTML(campo.label)}${req}</label>${hint}${inputHTML}`;
  cont.appendChild(wrapper);

  if (['brigada', 'comite', 'consejo'].includes(campo.tipo) && data[campo.id] === '__otro__') {
    wireNotificacionVinculo(id, campo, data);
  }

  wireCampoGenerico(id, campo, data);
}

function wireCampoGenerico(id, campo, data) {
  const el = document.getElementById(id);
  if (!el) return;

  switch (campo.tipo) {
    case 'text':
    case 'textarea':
      el.addEventListener('input', (e) => { data[campo.id] = e.target.value; });
      break;
    case 'number':
      el.addEventListener('input', (e) => { data[campo.id] = parseInt(e.target.value, 10) || 0; });
      break;
    case 'date':
      el.addEventListener('change', (e) => { data[campo.id] = e.target.value; });
      break;
    case 'select':
      el.addEventListener('change', (e) => { data[campo.id] = e.target.value; renderizarPaso(); });
      break;
    case 'otro': {
      el.addEventListener('change', (e) => { data[campo.id] = e.target.value; renderizarPaso(); });
      document.getElementById(id + '-otro')?.addEventListener('input', (e) => { data[campo.id + 'Otro'] = e.target.value; });
      break;
    }
    case 'radio':
      wireRadioGroup(id, (val) => { data[campo.id] = val; renderizarPaso(); });
      break;
    case 'checkbox':
      wireCheckboxGroup(id, (vals) => { data[campo.id] = vals; });
      break;
    case 'coordenadas': {
      document.getElementById(id + '-lat')?.addEventListener('input', (e) => { data.latitud = e.target.value; });
      document.getElementById(id + '-lng')?.addEventListener('input', (e) => { data.longitud = e.target.value; });
      break;
    }
    case 'personal':
      cargarOpcionesColeccion('personal', id, data, campo);
      break;
    case 'brigada':
      cargarOpcionesColeccion('brigadas', id, data, campo);
      break;
    case 'comite':
      cargarOpcionesColeccion('comitesEcosocialistas', id, data, campo);
      break;
    case 'consejo':
      cargarOpcionesColeccion('consejosEcosocialistas', id, data, campo);
      break;
    case 'vivero':
      cargarOpcionesColeccion('viveros', id, data, campo);
      break;
    case 'especies_multi':
      renderEspeciesWidgetGenerico(id, data, campo);
      break;
  }
}

async function cargarOpcionesColeccion(coleccion, id, data, campo) {
  const el = document.getElementById(id);
  if (!el) return;

  const labelDe = {
    personal: (d) => d.nombreCompleto || d.nombre || '—',
    brigadas: (d) => (d.nombre || '—') + (d.codigoUnico ? ' (' + d.codigoUnico + ')' : ''),
    comitesEcosocialistas: (d) => d.nombre || '—',
    consejosEcosocialistas: (d) => d.nombre || '—',
    viveros: (d) => d.nombre || '—'
  };

  try {
    let q = collection(db, coleccion);
    const perfil = window.__perfil;
    if (coleccion === 'personal' && perfil) {
      if (perfil.estado) q = query(q, where('estado', '==', perfil.estado));
      else if (perfil.gerencia) q = query(q, where('gerencia', '==', perfil.gerencia));
    }
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (labelDe[coleccion](a)).localeCompare(labelDe[coleccion](b)));

    const esVinculo = ['brigadas', 'comitesEcosocialistas', 'consejosEcosocialistas'].includes(coleccion);
    const valorActual = data[campo.id] || '';
    const opcionOtro = esVinculo
      ? `<option value="__otro__" ${valorActual === '__otro__' ? 'selected' : ''}>Otro (especificar)</option>`
      : '';
    el.innerHTML = '<option value="">Seleccione...</option>' +
      docs.map((d) => `<option value="${escapeHTML(d.id)}" ${d.id === valorActual ? 'selected' : ''}>${escapeHTML(labelDe[coleccion](d))}</option>`).join('') +
      opcionOtro;

    if (docs.length === 0 && !esVinculo) el.innerHTML = '<option value="">Sin registros</option>';

    el.addEventListener('change', (e) => {
      data[campo.id] = e.target.value;
      const doc = docs.find((d) => d.id === e.target.value);
      data[campo.id + 'Label'] = doc ? labelDe[coleccion](doc) : '';
      if (e.target.value === '__otro__') renderizarPaso();
    });
  } catch (e) {
    console.warn('[esquema] No se pudo cargar ' + coleccion + ':', e);
    el.innerHTML = '<option value="">No disponible</option>';
  }
}

/* Notificación + formulario cuando se elige "Otro (especificar)" en un vínculo. */
function renderNotificacionVinculo(id, campo, data) {
  const tipoLabel = campo.label.replace(/\s*\*?$/, '');
  const reportar = data[campo.id + 'Reportar'] || '';
  const nombre = data[campo.id + 'OtroNombre'] || '';
  return `
    <div style="margin-top:8px;padding:10px 12px;background:#fff8e1;border-left:4px solid #ffc107;border-radius:8px;">
      <p style="margin:0;font-size:12px;color:#856404;line-height:1.4;">
        ⚠️ Este <strong>${escapeHTML(tipoLabel)}</strong> no está registrado. Debe estar
        debidamente reportado a la <strong>Gerencia Nacional de Organización</strong> para
        ser tomado en cuenta en la planificación y el cumplimiento.
      </p>
      <div class="form-group" style="margin-top:8px;">
        <label style="font-size:12px;">¿Desea reportarlo a la nacional?</label>
        <select id="${id}-reportar">
          <option value="">Seleccione...</option>
          <option value="sí" ${reportar === 'sí' ? 'selected' : ''}>Sí, reportar</option>
          <option value="no" ${reportar === 'no' ? 'selected' : ''}>No</option>
        </select>
      </div>
      ${reportar === 'sí' ? `
        <div class="form-group">
          <label style="font-size:12px;">Nombre del ${escapeHTML(tipoLabel)} *</label>
          <input type="text" id="${id}-otro-nombre" value="${escapeHTML(nombre)}" placeholder="Nombre...">
        </div>` : ''}
      ${reportar === 'no' ? `
        <p style="margin:8px 0 0;font-size:12px;color:#c62828;font-weight:600;">
          No puede continuar la carga sin reportarlo a la nacional.
        </p>` : ''}
    </div>`;
}

function wireNotificacionVinculo(id, campo, data) {
  document.getElementById(id + '-reportar')?.addEventListener('change', (e) => {
    data[campo.id + 'Reportar'] = e.target.value;
    renderizarPaso();
  });
  document.getElementById(id + '-otro-nombre')?.addEventListener('input', (e) => {
    data[campo.id + 'OtroNombre'] = e.target.value;
  });
}

function renderEspeciesWidgetGenerico(containerId, data, campo) {
  const cont = document.getElementById(containerId);
  if (!cont) return;

  const cats = ['Forestales', 'Frutales', 'Ornamentales', 'Medicinales'];
  const almacen = (data[campo.id] && typeof data[campo.id] === 'object') ? data[campo.id] : {};
  const unidad = data[campo.id + 'Unidad'] || campo.unidad || 'unidades';
  const unidades = ['unidades', 'kilogramos', 'gramos'];

  const total = () => Object.values(almacen).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);

  const filasHTML = () => {
    const f = Object.entries(almacen).map(([esp, cant]) => `
      <div style="display:grid;grid-template-columns:1fr 90px 70px 36px;gap:8px;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;">${escapeHTML(esp)}</span>
        <input type="number" min="0" class="ge-cantidad" data-esp="${escapeHTML(esp)}" value="${Number(cant) || 0}">
        <span style="font-size:11px;color:#666;">${escapeHTML(unidad)}</span>
        <button type="button" class="btn btn-danger btn-sm ge-quitar" data-esp="${escapeHTML(esp)}">✕</button>
      </div>`).join('');
    return f || '<p style="font-size:12px;color:#999;text-align:center;padding:10px;">Sin especies agregadas.</p>';
  };

  cont.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;">
      <div class="form-group" style="flex:1;"><label style="font-size:12px;color:#666;">Unidad</label>
        <select id="${containerId}-unidad">${unidades.map((u) => `<option value="${u}" ${u === unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="form-group" style="flex:1;"><label style="font-size:12px;color:#666;">Categoría</label>
        <select id="${containerId}-cat">${cats.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="form-group" style="flex:1.5;"><label style="font-size:12px;color:#666;">Especie</label>
        <select id="${containerId}-esp"><option value="">Seleccione...</option></select></div>
      <button type="button" class="btn btn-primary ge-agregar" style="margin-bottom:2px;">+</button>
    </div>
    <div id="${containerId}-lista">${filasHTML()}</div>
    <div style="margin-top:10px;padding:8px 12px;background:#e8f5e9;border-radius:8px;font-size:13px;color:var(--verde-oscuro);font-weight:600;" id="${containerId}-total">Total: ${total()} ${escapeHTML(unidad)}</div>
  `;

  const poblarEspecies = () => {
    const cat = document.getElementById(containerId + '-cat').value;
    const sel = document.getElementById(containerId + '-esp');
    sel.innerHTML = '<option value="">Seleccione...</option>' +
      (CATALOGO_PLANTAS[cat] || []).slice().sort().map((e) => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
  };
  poblarEspecies();

  const actualizarTotal = () => {
    document.getElementById(containerId + '-total').textContent = `Total: ${total()} ${unidad}`;
    data[campo.id] = almacen;
  };

  const refrescarLista = () => {
    document.getElementById(containerId + '-lista').innerHTML = filasHTML();
    actualizarTotal();
    cont.querySelectorAll('.ge-cantidad').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        almacen[e.target.dataset.esp] = parseInt(e.target.value, 10) || 0;
        actualizarTotal(); // NO re-renderiza: mantiene el foco mientras escribe
      });
    });
    cont.querySelectorAll('.ge-quitar').forEach((btn) => {
      btn.addEventListener('click', () => { delete almacen[btn.dataset.esp]; refrescarLista(); });
    });
  };
  refrescarLista();

  document.getElementById(containerId + '-unidad').addEventListener('change', (e) => {
    data[campo.id + 'Unidad'] = e.target.value;
    renderEspeciesWidgetGenerico(containerId, data, campo);
  });
  document.getElementById(containerId + '-cat').addEventListener('change', poblarEspecies);
  document.getElementById(containerId + '-esp').addEventListener('change', (e) => {
    const esp = e.target.value;
    if (!esp) return;
    if (almacen[esp] === undefined) almacen[esp] = 0;
    e.target.value = '';
    refrescarLista();
  });
}

function renderAcompanamiento(cont, data) {
  const sub = document.createElement('div');
  sub.className = 'subpanel';
  sub.innerHTML = '<h3>📢 Acompañamiento y Movilización</h3>';
  cont.appendChild(sub);

  if (!data.acompanamiento || typeof data.acompanamiento !== 'object') data.acompanamiento = {};
  data.acompanamiento.entes = data.acompanamiento.entes || {};
  data.acompanamiento.ministerios = data.acompanamiento.ministerios || {};
  if (data.acompanamiento.misionArbolMovilizado === undefined) data.acompanamiento.misionArbolMovilizado = 0;

  const entes = ENTES_ADSCRITOS.filter((e) => e !== 'Ninguno' && e !== 'Otro');
  const ministerios = MINISTERIOS.filter((m) => m !== 'Ninguno' && m !== 'Otro');

  const listaConCantidad = (titulo, opciones, clave) => {
    const filas = opciones.map((op) => `
      <div style="display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center;margin-bottom:4px;">
        <label style="font-size:13px;font-weight:500;">${escapeHTML(op)}</label>
        <input type="number" min="0" class="acc-cantidad" data-clave="${clave}" data-op="${escapeHTML(op)}" value="${Number(data.acompanamiento[clave][op]) || 0}" placeholder="0">
      </div>`).join('');
    sub.insertAdjacentHTML('beforeend', `
      <div class="form-group" style="margin-top:8px;">
        <label style="font-weight:600;">${escapeHTML(titulo)}</label>
        ${filas}
      </div>`);
  };

  listaConCantidad('Entes adscritos / UTEC (participantes)', entes, 'entes');
  listaConCantidad('Ministerios / Sistema de Misiones (participantes)', ministerios, 'ministerios');

  const totalFuerzas = () => {
    const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
    return sum(data.acompanamiento.entes) + sum(data.acompanamiento.ministerios);
  };

  sub.insertAdjacentHTML('beforeend', `
    <div class="form-row" style="margin-top:10px;">
      <div class="form-group">
        <label>Disgregación de fuerzas movilizadas (total)</label>
        <input type="number" id="gen-acc-total" value="${totalFuerzas()}" readonly style="background:#f1f8e9;font-weight:700;">
      </div>
      <div class="form-group">
        <label>Personal Misión Árbol movilizado</label>
        <input type="number" id="gen-acc-ma" min="0" value="${Number(data.acompanamiento.misionArbolMovilizado) || 0}">
      </div>
    </div>
  `);

  const actualizarTotal = () => {
    const t = document.getElementById('gen-acc-total');
    if (t) t.value = totalFuerzas();
  };

  sub.querySelectorAll('.acc-cantidad').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      data.acompanamiento[e.target.dataset.clave][e.target.dataset.op] = parseInt(e.target.value, 10) || 0;
      actualizarTotal();
    });
  });

  document.getElementById('gen-acc-ma')?.addEventListener('input', (e) => {
    data.acompanamiento.misionArbolMovilizado = parseInt(e.target.value, 10) || 0;
  });
}

/* ==================== VINCULACIÓN PLAN ↔ CUMPLIMIENTO ==================== */

/**
 * Busca planificaciones del usuario que coincidan con:
 * - misma parroquia
 * - fecha del reporte dentro de la semana
 * - al menos una actividad de la misma gerencia
 */
async function buscarPlanificacionesCoincidentes(cacheKey) {
  const perfil = window.__perfil;
  if (!perfil) return [];

  const dg = formData.datosGenerales;
  const ind = formData.indicador;
  const fecha = dg.fecha;

  if (!fecha || !dg.estado || !dg.municipio || !dg.parroquia || !ind) return [];

  try {
    const q = query(
      collection(db, 'planificacion'),
      where('usuarioId', '==', perfil.uid)
    );
    const snap = await getDocs(q);
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const fechaReporte = new Date(fecha + 'T00:00:00');

    return todas.filter(p => {
      const ub = p.ubicacion || {};
      if (ub.estado    !== dg.estado)    return false;
      if (ub.municipio !== dg.municipio) return false;
      if (ub.parroquia !== dg.parroquia) return false;

      if (!p.semanaInicio) return false;
      const inicio = new Date(p.semanaInicio + 'T00:00:00');
      const fin    = p.semanaFin
        ? new Date(p.semanaFin + 'T23:59:59')
        : new Date(inicio.getTime() + 6 * 24 * 60 * 60 * 1000);

      if (fechaReporte < inicio || fechaReporte > fin) return false;

      const acts = (p.actividades || []).filter(a => a.gerencia === ind);
      if (acts.length === 0) return false;

      return true;
    });

  } catch (e) {
    console.warn('[Plan vinculación] Error al buscar:', e);
    return [];
  }
}

/**
 * Encuentra el índice de la actividad de la planificación que mejor coincide
 * con el reporte actual. Si no hay match exacto de fecha, devuelve la primera
 * de la misma gerencia.
 */
function encontrarActividadCoincidente(plan) {
  if (!plan?.actividades) return 0;
  const fecha = formData.datosGenerales.fecha;
  const ind = formData.indicador;

  // Match exacto: misma gerencia + misma fecha
  const exacto = plan.actividades.findIndex(a =>
    a.gerencia === ind && a.fecha === fecha
  );
  if (exacto !== -1) return exacto;

  // Match por gerencia
  const porGerencia = plan.actividades.findIndex(a => a.gerencia === ind);
  if (porGerencia !== -1) return porGerencia;

  return 0;
}

/**
 * Renderiza el banner de sugerencias de vinculación.
 */
function renderBannerVinculacion() {
  // Ya vinculado
  if (planificacionVinculada) {
    const pv = planificacionVinculada;
    return `
      <div class="subpanel" style="background: #e8f5e9; border-left: 5px solid var(--verde-brillante); margin-bottom: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <div>
            <strong style="color: var(--verde-oscuro);">🔗 Vinculado a planificación</strong>
            <p style="margin:4px 0 0; font-size:13px; color:#555;">
              Semana del <strong>${escapeHTML(pv.semanaInicio)}</strong> al <strong>${escapeHTML(pv.semanaFin || '—')}</strong>
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="pv-desvincular">
            Desvincular
          </button>
        </div>
      </div>
    `;
  }

  // Sin sugerencias
  if (!planificacionesCoincidentes || planificacionesCoincidentes.length === 0) {
    return '';
  }

  // Sugerencias
  const items = planificacionesCoincidentes.map((p, i) => {
    const ub = p.ubicacion || {};
    const acts = (p.actividades || []).filter(a => a.gerencia === formData.indicador);
    const actPreview = acts.slice(0, 3).map(a => `
      <div style="font-size:12px; color:#444; margin-top:2px;">
        · ${escapeHTML(a.tipoActividad || '—')} <span style="color:#999;">(${escapeHTML(a.fecha || '')})</span>
      </div>
    `).join('');

    return `
      <div style="padding: 10px; border: 1px solid #c8e6c9; border-radius: 8px; margin-bottom: 8px; background: #fff;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:200px;">
            <strong style="color: var(--verde-oscuro);">📅 ${escapeHTML(p.semanaInicio)} al ${escapeHTML(p.semanaFin || '—')}</strong>
            <div style="font-size:12px; color:#666; margin-top:4px;">
              📍 ${escapeHTML(ub.parroquia || '')} · 🎯 ${acts.length} actividad${acts.length !== 1 ? 'es' : ''} de tu gerencia
            </div>
            ${actPreview}
          </div>
          <button type="button" class="btn btn-success btn-sm pv-vincular" data-idx="${i}">
            🔗 Vincular
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="subpanel" style="background: #fff8e1; border-left: 5px solid #ffc107; margin-bottom: 16px;">
      <strong style="color:#856404; font-size:14px;">🔎 ¿Esta actividad fue planificada?</strong>
      <p style="font-size:12px; color:#856404; margin: 6px 0 10px;">
        Encontramos ${planificacionesCoincidentes.length} planificación${planificacionesCoincidentes.length !== 1 ? 'es' : ''} que podrían corresponder a este cumplimiento.
        Vincular ayuda a medir el % de ejecución de tus planes.
      </p>
      ${items}
      <button type="button" class="btn btn-secondary btn-sm" id="pv-ninguna" style="margin-top:4px;">
        Ninguna de estas
      </button>
    </div>
  `;
}

/**
 * Wire de los botones del banner.
 */
function wireBannerVinculacion() {
  document.querySelectorAll('.pv-vincular').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const p = planificacionesCoincidentes[idx];
      if (!p) return;

      planificacionVinculada = {
        id: p.id,
        semanaInicio: p.semanaInicio || '',
        semanaFin: p.semanaFin || '',
        actividadNumero: encontrarActividadCoincidente(p)
      };

      planificacionesCoincidentes = [];
      _pvCacheKey = ''; // forzamos re-render limpio
      renderizarPaso();
    });
  });

  document.getElementById('pv-ninguna')?.addEventListener('click', () => {
    planificacionesCoincidentes = [];
    renderizarPaso();
  });

  document.getElementById('pv-desvincular')?.addEventListener('click', () => {
    planificacionVinculada = null;
    _pvCacheKey = ''; // forzamos re-búsqueda al desvincular
    renderizarPaso();
  });
}

/* ==================== HELPERS DE RENDER ==================== */
function htmlSelect(id, options, value, placeholder = 'Seleccione...') {
  const opts = options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return `<option value="${escapeHTML(v)}" ${v === value ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  }).join('');
  return `<select id="${id}"><option value="">${placeholder}</option>${opts}</select>`;
}

function htmlNumber(id, value, min = 0) {
  return `<input type="number" id="${id}" min="${min}" value="${Number(value) || 0}">`;
}

function htmlText(id, value, placeholder = '') {
  return `<input type="text" id="${id}" value="${escapeHTML(value || '')}" placeholder="${escapeHTML(placeholder)}">`;
}

function htmlTextarea(id, value, rows = 3) {
  return `<textarea id="${id}" rows="${rows}">${escapeHTML(value || '')}</textarea>`;
}

function htmlCheckboxGroup(id, options, selectedValues = []) {
  const set = new Set(selectedValues || []);
  return `
    <div id="${id}" class="checkbox-group">
      ${options.map(o => `
        <label>
          <input type="checkbox" value="${escapeHTML(o)}" ${set.has(o) ? 'checked' : ''}>
          ${escapeHTML(o)}
        </label>
      `).join('')}
    </div>`;
}

function htmlRadioGroup(name, options, selectedValue) {
  return `
    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-top: 4px;">
      ${options.map(o => `
        <label style="display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
          <input type="radio" name="${name}" value="${escapeHTML(o)}" ${o === selectedValue ? 'checked' : ''}>
          ${escapeHTML(o)}
        </label>
      `).join('')}
    </div>`;
}

function wireCheckboxGroup(id, onChange) {
  const cont = document.getElementById(id);
  if (!cont) return;
  const handler = () => {
    const vals = Array.from(cont.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
    onChange(vals);
  };
  cont.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', handler));
}

function wireRadioGroup(name, onChange) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
    r.addEventListener('change', (e) => onChange(e.target.value));
  });
}

/* ==================== PASO 3 — ORGANIZACIÓN ==================== */
function renderPaso3Organizacion(body) {
  const data = formData.condicional.organizacion;
  const tiposActividad = TIPOS_ACTIVIDAD_POR_GERENCIA.organizacion || [];

  // Secciones condicionales según tipo de actividad
  const esBrigada   = data.tipoActividad === 'Conformación de Brigada Ecológica'
                   || data.tipoActividad === 'Juramentación de Brigada';
  const esReunion   = data.tipoActividad === 'Reunión con Consejo Comunal'
                   || data.tipoActividad === 'Reunión con Comuna / Circuito Comunal'
                   || data.tipoActividad === 'Articulación Interinstitucional';
  const esAsamblea  = data.tipoActividad === 'Asamblea Comunitaria'
                   || data.tipoActividad === 'Conformación de Comité Ecosocialista'
                   || esReunion;
  const esDirectorio = data.tipoActividad === 'Directorio / Reunión de Planificación';

  body.innerHTML = `
    <div class="subpanel">
      <h3>👥 Actividad Organizativa</h3>
      <div class="form-group">
        <label>Tipo de actividad organizativa *</label>
        ${htmlSelect('org-tipoActividad', tiposActividad, data.tipoActividad)}
      </div>
    </div>

    ${esBrigada ? `
      <div class="subpanel">
        <h3>🎽 Conformación de Brigada</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Brigada *</label>
            ${htmlSelect('org-tipoBrigada', [
              'Eco-brigadas', 'Grupos de Trabajo', 'Brigada mixta', 'Guardianes del Árbol'
            ], data.tipoBrigada)}
          </div>
          <div class="form-group">
            <label>Cantidad de Brigadas conformadas *</label>
            ${htmlNumber('org-cantidadBrigadas', data.cantidadBrigadas)}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Miembros por Brigada *</label>
            ${htmlNumber('org-miembrosBrigada', data.miembrosBrigada)}
          </div>
          <div class="form-group">
            <label>Clasificación por edades *</label>
            ${htmlSelect('org-clasificacionBrigada', [
              'Araguaney I (0 a 5 años)',
              'Araguaney II (6 a 9 años)',
              'Araguaney III (10 a 11 años)',
              'Jacaranda I (12 a 14 años)',
              'Jacaranda II (15 a 17 años)',
              'Mango (Superior de 31 años)',
              'Distintas Edades'
            ], data.clasificacionBrigada)}
          </div>
        </div>
        <div class="form-group">
          <label>Nombre de la Brigada</label>
          ${htmlText('org-nombreBrigada', data.nombreBrigada, 'Ej: Brigada Ecológica Bolivariana')}
        </div>
      </div>
    ` : ''}

    ${esReunion ? `
      <div class="subpanel">
        <h3>🤝 Alianzas</h3>
        <div class="form-group">
          <label>Alianzas con la administración estadal</label>
          ${htmlCheckboxGroup('org-alianzas', [
            'Alcaldías', 'Gobernaciones', 'Diputados', 'Concejo Municipal', 'Partido Verde', 'Otro'
          ], data.alianzas)}
        </div>
      </div>
    ` : ''}

    ${esAsamblea ? `
      <div class="subpanel">
        <h3>🏛️ Consejo / Comité Ecosocialista</h3>
        <div class="form-group">
          <label>¿Existe Comité Ecosocialista?</label>
          ${htmlRadioGroup('org-comite', ['Sí', 'No', 'No Aplica'], data.comiteEcosocialista)}
        </div>
        <div class="form-group">
          <label>¿Existe Consejo Ecosocialista?</label>
          ${htmlRadioGroup('org-consejo', ['Sí', 'No', 'No Aplica'], data.consejoEcosocialista)}
        </div>
        <div class="form-group">
          <label>¿Se realizó conformación de Consejo o Comité Ecosocialista?</label>
          ${htmlRadioGroup('org-conformacion', ['Sí', 'No', 'No Aplica'], data.conformacionConsejoComite)}
        </div>
      </div>
    ` : ''}

    <div class="subpanel">
      <h3>📢 Acompañamiento y Movilización</h3>
      <div class="form-group">
        <label>Ministerios o Sistema de Misiones participantes</label>
        ${htmlCheckboxGroup('org-ministerios', MINISTERIOS.filter(m => m !== 'Otro' && m !== 'Ninguno'), data.ministerios)}
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Disgregación de fuerzas movilizadas</label>
          ${htmlNumber('org-disgregacion', data.disgregacionFuerzas)}
        </div>
        <div class="form-group">
          <label>Personal Misión Árbol movilizado</label>
          ${htmlNumber('org-personalMovilizado', data.personalMovilizado)}
        </div>
      </div>
    </div>

    ${esDirectorio ? `
      <div class="subpanel">
        <h3>📝 Acuerdos</h3>
        <div class="form-group">
          <label>Acuerdos alcanzados</label>
          ${htmlTextarea('org-acuerdos', data.acuerdos, 3)}
        </div>
      </div>
    ` : ''}
  `;

  /* ===== Wiring ===== */
  // Al cambiar tipo de actividad, re-render para mostrar/ocultar secciones
  document.getElementById('org-tipoActividad')?.addEventListener('change', (e) => {
    data.tipoActividad = e.target.value;
    renderizarPaso();
  });

  // Campos simples
  document.getElementById('org-tipoBrigada')?.addEventListener('change',        (e) => { data.tipoBrigada = e.target.value; });
  document.getElementById('org-cantidadBrigadas')?.addEventListener('input',    (e) => { data.cantidadBrigadas = parseInt(e.target.value, 10) || 0; });
  document.getElementById('org-miembrosBrigada')?.addEventListener('input',     (e) => { data.miembrosBrigada = parseInt(e.target.value, 10) || 0; });
  document.getElementById('org-clasificacionBrigada')?.addEventListener('change', (e) => { data.clasificacionBrigada = e.target.value; });
  document.getElementById('org-nombreBrigada')?.addEventListener('input',       (e) => { data.nombreBrigada = e.target.value; });
  document.getElementById('org-disgregacion')?.addEventListener('input',        (e) => { data.disgregacionFuerzas = parseInt(e.target.value, 10) || 0; });
  document.getElementById('org-personalMovilizado')?.addEventListener('input',  (e) => { data.personalMovilizado = parseInt(e.target.value, 10) || 0; });
  document.getElementById('org-acuerdos')?.addEventListener('input',            (e) => { data.acuerdos = e.target.value; });

  // Checkbox groups
  wireCheckboxGroup('org-alianzas', (vals) => { data.alianzas = vals; });
  wireCheckboxGroup('org-ministerios', (vals) => { data.ministerios = vals; });

  // Radio groups
  wireRadioGroup('org-comite',       (val) => { data.comiteEcosocialista = val; });
  wireRadioGroup('org-consejo',      (val) => { data.consejoEcosocialista = val; });
  wireRadioGroup('org-conformacion', (val) => { data.conformacionConsejoComite = val; });
}

/* ==================== PASO 3 — PLACEHOLDERS (se implementan en 3D.2 a 3D.5) ==================== */
/* ==================== PASO 3 — PRODUCCIÓN ==================== */

/**
 * Widget reutilizable: lista de especies + cantidad por cada una.
 * Permite agregar y quitar especies dinámicamente.
 *
 * @param {string} categoria  'Forestales' | 'Frutales' | 'Ornamentales' | 'Medicinales'
 * @param {string} containerId  ID del contenedor donde se renderiza
 * @param {Object} especiesData  Objeto mutable { especie: cantidad }
 * @param {Function} onChange  Callback tras cada cambio
 */
function renderEspeciesWidget(categoria, containerId, especiesData, onChange) {
  const cont = document.getElementById(containerId);
  if (!cont) return;

  const catalogo = (CATALOGO_PLANTAS[categoria] || []).slice().sort();
  const especiesSeleccionadas = Object.keys(especiesData || {});

  // Especies aún no agregadas (para el select)
  const disponibles = catalogo.filter(e => !especiesSeleccionadas.includes(e));

  const filas = especiesSeleccionadas.map(esp => `
    <div class="especie-row" style="
      display: grid;
      grid-template-columns: 1fr 110px 40px;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
      padding: 8px 10px;
      background: #f9fdf7;
      border-radius: 8px;
      border-left: 3px solid var(--verde-brillante);">
      <span style="font-size: 13px; color: #333; font-weight: 500;">
        ${escapeHTML(esp)}
      </span>
      <input type="number"
             class="esp-cantidad"
             data-especie="${escapeHTML(esp)}"
             min="0"
             value="${Number(especiesData[esp]) || 0}"
             style="padding: 6px 8px; border: 2px solid var(--verde-claro); border-radius: 8px; font-size: 13px;">
      <button type="button"
              class="btn btn-danger btn-sm btn-quitar-especie"
              data-especie="${escapeHTML(esp)}"
              style="padding: 6px 10px;">✕</button>
    </div>
  `).join('');

  cont.innerHTML = `
    <div class="form-group" style="margin-bottom: 10px;">
      <label style="font-size: 12px; color: #666;">
        Selecciona una especie y haz clic en "Agregar":
      </label>
      <div style="display: flex; gap: 8px; align-items: stretch;">
        <select class="esp-selector" style="flex: 1; padding: 10px; border: 2px solid var(--verde-claro); border-radius: 10px;">
          <option value="">Seleccione una especie...</option>
          ${disponibles.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-primary btn-agregar-especie" style="padding: 10px 18px;">
          + Agregar
        </button>
      </div>
    </div>
    <div id="${containerId}-lista">
      ${filas || '<p style="font-size:12px;color:#999;text-align:center;padding:10px;">No hay especies agregadas todavía.</p>'}
    </div>
    ${especiesSeleccionadas.length > 0 ? `
      <div style="margin-top: 10px; padding: 8px 12px; background: #e8f5e9; border-radius: 8px; font-size: 13px; color: var(--verde-oscuro); font-weight: 600;">
        Total ${categoria}: ${especiesSeleccionadas.reduce((acc, e) => acc + (parseInt(especiesData[e], 10) || 0), 0)} unidades
      </div>
    ` : ''}
  `;

  // Wiring: agregar especie
  cont.querySelector('.btn-agregar-especie')?.addEventListener('click', () => {
    const sel = cont.querySelector('.esp-selector');
    const esp = sel.value;
    if (!esp) return;

    especiesData[esp] = 0;
    onChange();
    renderEspeciesWidget(categoria, containerId, especiesData, onChange);
  });

  // Wiring: quitar especie
  cont.querySelectorAll('.btn-quitar-especie').forEach(btn => {
    btn.addEventListener('click', () => {
      const esp = btn.dataset.especie;
      delete especiesData[esp];
      onChange();
      renderEspeciesWidget(categoria, containerId, especiesData, onChange);
    });
  });

  // Wiring: cambiar cantidad
  cont.querySelectorAll('.esp-cantidad').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const esp = e.target.dataset.especie;
      especiesData[esp] = parseInt(e.target.value, 10) || 0;
      onChange();
    });
  });
}

function renderPaso3Produccion(body) {
  const data = formData.condicional.produccion;

  const tiposEspacio = [
    'VIVERO INSTITUCIONAL',
    'VIVERO COMUNITARIO',
    'VIVERO ESCOLAR',
    'ESPACIO PRODUCTIVO',
    'ÁREA DE RECOLECCIÓN DE SEMILLAS Y BRINZALES',
    'BANCO DE GERMOPLASMA'
  ];

  const tiposActividad = TIPOS_ACTIVIDAD_POR_GERENCIA.produccion || [];

  // ===== Flags condicionales =====
  const esRecoleccionSemillas = data.tipoActividad === 'Recolección de Semillas'
                             || data.tipoActividad === 'Entrega de Semillas a Instituciones / Comunidades';
  const esRecoleccionBrinzales = data.tipoActividad === 'Recolección de Brinzales';
  const esGerminacion = data.tipoActividad === 'Germinación de Semillas';
  const esCorteEsquejes = data.tipoActividad === 'Corte de Esquejes';
  const esRecoleccionOGerminacion = esRecoleccionSemillas || esRecoleccionBrinzales || esGerminacion || esCorteEsquejes;
  const esLlenado = data.tipoActividad === 'Llenado de Bolsas'
                 || data.tipoActividad === 'Preparación de Canteros'
                 || data.tipoActividad === 'Creación y/o Monitoreo de Espacios Productivos';
  const esSustrato = data.tipoActividad === 'Producción de Sustrato / Abono / Biofertilizante';
  const esBancoGermoplasma = data.tipoActividad === 'Identificación de Espacios de Bancos de Germoplasma';
  const esPlastico = data.tipoActividad === 'Hagamos del Plástico un Árbol';

  // Categoría de especies según tipoPlanta
  const categoriaEspecies = data.tipoPlanta === 'Forestal' ? 'Forestales'
                          : data.tipoPlanta === 'Frutal' ? 'Frutales'
                          : data.tipoPlanta === 'Ornamental' ? 'Ornamentales'
                          : data.tipoPlanta === 'Medicinal' ? 'Medicinales'
                          : null;

  body.innerHTML = `
    <!-- ===== BLOQUE 1: Espacio + Actividad ===== -->
    <div class="subpanel">
      <h3>🌱 Información del Espacio Productivo</h3>
      <div class="form-group">
        <label>Tipo de espacio productivo *</label>
        ${htmlSelect('prod-tipoEspacio', tiposEspacio, data.tipoEspacio)}
      </div>
      <div class="form-group">
        <label>Tipo de actividad productiva *</label>
        ${htmlSelect('prod-tipoActividad', tiposActividad, data.tipoActividad)}
      </div>
    </div>

    ${esRecoleccionOGerminacion ? `
      <!-- ===== BLOQUE 2: Tipo de área + tipo de planta ===== -->
      <div class="subpanel">
        <h3>🌿 Tipo de Producción</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de área productiva *</label>
            ${htmlSelect('prod-tipoArea', ['Forestal', 'Frutal', 'Ornamental', 'Medicinal'], data.tipoArea)}
          </div>
          <div class="form-group">
            <label>Tipo de planta empleada *</label>
            ${htmlSelect('prod-tipoPlanta', ['Forestal', 'Frutal', 'Ornamental', 'Medicinal'], data.tipoPlanta)}
          </div>
        </div>
      </div>
    ` : ''}

    ${esRecoleccionSemillas ? `
      <!-- ===== BLOQUE 3: Cantidad de semillas por tipo ===== -->
      <div class="subpanel">
        <h3>⚖️ Semillas Recolectadas (Kg)</h3>
        <div class="form-row">
          <div class="form-group"><label>Forestales</label>${htmlNumber('prod-sem-forestal', data.semillas?.forestal)}</div>
          <div class="form-group"><label>Frutales</label>${htmlNumber('prod-sem-frutal', data.semillas?.frutal)}</div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Ornamentales</label>${htmlNumber('prod-sem-ornamental', data.semillas?.ornamental)}</div>
          <div class="form-group"><label>Medicinales</label>${htmlNumber('prod-sem-medicinal', data.semillas?.medicinal)}</div>
        </div>
      </div>

      <!-- ===== BLOQUE 4: Conservación ===== -->
      <div class="subpanel">
        <h3>📦 Conservación</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de conservación por empaque</label>
            ${htmlSelect('prod-consEmpaque', [
              'Bolsa de Papel', 'Bolsa de Plástico', 'Recipiente de Vidrio',
              'Recipiente Metálico', 'Saco', 'Caja de Cartón'
            ], data.conservacionEmpaque)}
          </div>
          <div class="form-group">
            <label>Tipo de conservación por espacio</label>
            ${htmlSelect('prod-consEspacio', [
              'Estantería', 'Residencia Personal', 'Refrigerada', 'Vivero', 'Otro'
            ], data.conservacionEspacio)}
          </div>
        </div>
        <div class="form-group">
          <label>Ubicación destinada del almacenamiento</label>
          ${htmlText('prod-ubicacionAlmacen', data.ubicacionAlmacenamiento, 'Ej: Vivero comunitario...')}
        </div>
      </div>
    ` : ''}

    ${esRecoleccionOGerminacion && categoriaEspecies ? `
      <!-- ===== BLOQUE 5: Especies + cantidad ===== -->
      <div class="subpanel">
        <h3>🌳 Especies ${data.tipoPlanta}s — Producción</h3>
        <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
          Agrega las especies que produjiste y la cantidad de cada una. La lista completa tiene
          ${(CATALOGO_PLANTAS[categoriaEspecies] || []).length} especies.
        </p>
        <div id="prod-especies-widget"></div>
      </div>

      <!-- ===== BLOQUE 6: Porte ===== -->
      <div class="subpanel">
        <h3>📏 Porte</h3>
        <div class="form-group">
          <label>Porte de las plantas producidas</label>
          ${htmlSelect('prod-porte', ['1cm a 30cm', '31cm a 50cm', '51cm a 1M'], data.porte)}
        </div>
      </div>
    ` : ''}

    ${esLlenado ? `
      <!-- ===== BLOQUE 7: Canteros y bolsas ===== -->
      <div class="subpanel">
        <h3>📦 Llenado</h3>
        <div class="form-row">
          <div class="form-group"><label>Canteros llenados</label>${htmlNumber('prod-canteros', data.canterosLlenados)}</div>
          <div class="form-group"><label>Bolsas llenadas</label>${htmlNumber('prod-bolsas', data.bolsasLlenadas)}</div>
        </div>
      </div>
    ` : ''}

    ${esSustrato ? `
      <!-- ===== BLOQUE 8: Sustrato ===== -->
      <div class="subpanel">
        <h3>🪴 Sustrato</h3>
        <div class="form-row">
          <div class="form-group"><label>Cantidad preparada</label>${htmlNumber('prod-sustrato', data.sustratoPreparado)}</div>
          <div class="form-group"><label>Cantidad de acarreo</label>${htmlNumber('prod-acarreo', data.acarreoSustrato)}</div>
        </div>
      </div>
    ` : ''}

    ${esBancoGermoplasma ? `
      <!-- ===== BLOQUE 9: Banco de germoplasma ===== -->
      <div class="subpanel">
        <h3>🧬 Banco de Germoplasma</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Nombre del espacio</label>
            ${htmlText('prod-nombreBanco', data.nombreBanco, 'Ej: Vivero Institucional del Sur')}
          </div>
          <div class="form-group">
            <label>Capacidad de almacenamiento (Kg)</label>
            ${htmlNumber('prod-capacidadBanco', data.capacidadBanco)}
          </div>
        </div>
      </div>
    ` : ''}

    ${esPlastico ? `
      <!-- ===== BLOQUE 10: Plástico ===== -->
      <div class="subpanel">
        <h3>♻️ Recolección de Plástico</h3>
        <div class="form-group">
          <label>Cantidad de bolsas plásticas recolectadas</label>
          ${htmlNumber('prod-bolsasPlasticas', data.bolsasPlasticas)}
        </div>
      </div>
    ` : ''}
  `;

  /* ===== Wiring ===== */
  // Selects que disparan re-render (para mostrar/ocultar secciones)
  document.getElementById('prod-tipoActividad')?.addEventListener('change', (e) => {
    data.tipoActividad = e.target.value;
    renderizarPaso();
  });
  document.getElementById('prod-tipoArea')?.addEventListener('change', (e) => {
    data.tipoArea = e.target.value;
    renderizarPaso();
  });
  document.getElementById('prod-tipoPlanta')?.addEventListener('change', (e) => {
    // Al cambiar el tipo de planta, reseteamos las especies de esa categoría
    data.tipoPlanta = e.target.value;
    renderizarPaso();
  });

  // Selects simples
  document.getElementById('prod-tipoEspacio')?.addEventListener('change', (e) => { data.tipoEspacio = e.target.value; });
  document.getElementById('prod-consEmpaque')?.addEventListener('change', (e) => { data.conservacionEmpaque = e.target.value; });
  document.getElementById('prod-consEspacio')?.addEventListener('change', (e) => { data.conservacionEspacio = e.target.value; });
  document.getElementById('prod-porte')?.addEventListener('change', (e) => { data.porte = e.target.value; });

  // Inputs de texto
  document.getElementById('prod-ubicacionAlmacen')?.addEventListener('input', (e) => { data.ubicacionAlmacenamiento = e.target.value; });
  document.getElementById('prod-nombreBanco')?.addEventListener('input', (e) => { data.nombreBanco = e.target.value; });

  // Inputs numéricos
  document.getElementById('prod-sem-forestal')?.addEventListener('input', (e) => { data.semillas.forestal = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-sem-frutal')?.addEventListener('input', (e) => { data.semillas.frutal = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-sem-ornamental')?.addEventListener('input', (e) => { data.semillas.ornamental = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-sem-medicinal')?.addEventListener('input', (e) => { data.semillas.medicinal = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-canteros')?.addEventListener('input', (e) => { data.canterosLlenados = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-bolsas')?.addEventListener('input', (e) => { data.bolsasLlenadas = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-sustrato')?.addEventListener('input', (e) => { data.sustratoPreparado = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-acarreo')?.addEventListener('input', (e) => { data.acarreoSustrato = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-capacidadBanco')?.addEventListener('input', (e) => { data.capacidadBanco = parseInt(e.target.value, 10) || 0; });
  document.getElementById('prod-bolsasPlasticas')?.addEventListener('input', (e) => { data.bolsasPlasticas = parseInt(e.target.value, 10) || 0; });

  // Widget de especies (solo si aplica)
  if (esRecoleccionOGerminacion && categoriaEspecies) {
    const keyEspecies = categoriaEspecies.toLowerCase().replace(/s$/, ''); // forestal, frutal, ornamental, medicinal
    // Mapeo correcto:
    const keyMap = {
      'Forestales': 'forestal',
      'Frutales': 'frutal',
      'Ornamentales': 'ornamental',
      'Medicinales': 'medicinal'
    };
    const key = keyMap[categoriaEspecies];
    if (!data.especies[key]) data.especies[key] = {};

    renderEspeciesWidget(
      categoriaEspecies,
      'prod-especies-widget',
      data.especies[key],
      () => { /* datos mutados en el mismo objeto */ }
    );
  }
}

/* ==================== PASO 3 — FORMACIÓN ==================== */
function renderPaso3Formacion(body) {
  const data = formData.condicional.formacion;

  const tiposDinamica = [
    'Taller Formativo',
    'Conversatorio',
    'Cineforo Ambiental',
    'Charla Educativa',
    'Seminario',
    'Foro Nacional',
    'Aulas Verdes para la Práctica Ecosocialista',
    'Aulas Abiertas Vivero Misión Árbol',
    'Rutas Pedagógicas "Árboles de mi Comunidad"',
    'Diplomado',
    'Eco-sendero',
    'Expedición Pedagógica',
    'Actividad Recreativa Ecológica',
    'Visita Técnica',
    'Jueves Eco Productivos para la Propagación Vegetal',
    'Despliegue Nacional 1E1A (Un Estudiante, Un Árbol)',
    'Conversatorio Programa 1E1A',
    'Otro'
  ];

  const brigadas = ['Ninguna', 'Eco-brigadas', 'Grupos de Trabajo', 'Guardianes del Árbol'];
  const modalidades = ['Presencial', 'Virtual', 'Mixta'];
  const materiales = ['Video', 'Presentación', 'Dinámica grupal', 'Juegos', 'Otro'];
  const clasifEdades = [
    'Araguaney I (0 a 5 años)',
    'Araguaney II (6 a 9 años)',
    'Araguaney III (10 a 11 años)',
    'Jacaranda I (12 a 14 años)',
    'Jacaranda II (15 a 17 años)',
    'Mango (Superior de 31 años)',
    'Distintas Edades'
  ];

  // Flags condicionales
  const esTallerOCiclo = data.tipoDinamica === 'Taller Formativo'
                      || data.tipoDinamica === 'Conversatorio'
                      || data.tipoDinamica === 'Cineforo Ambiental'
                      || data.tipoDinamica === 'Charla Educativa'
                      || data.tipoDinamica === 'Seminario';
  const mostrarBrigadaParticipante = data.tipoDinamica === 'Taller Formativo'
                                  || data.tipoDinamica === 'Conversatorio'
                                  || data.tipoDinamica === 'Seminario';
  const preguntarConformacion = data.tipoDinamica === 'Taller Formativo'
                             || data.tipoDinamica === 'Conversatorio'
                             || data.tipoDinamica === 'Seminario';
  const mostrarDatosBrigada = data.seConformoBrigada === 'Sí';

  body.innerHTML = `
    <!-- ===== BLOQUE 1: Actividad formativa ===== -->
    <div class="subpanel">
      <h3>🎓 Actividad Formativa</h3>
      <div class="form-group">
        <label>Tipo de dinámica empleada *</label>
        ${htmlSelect('for-tipoDinamica', tiposDinamica, data.tipoDinamica)}
      </div>
      <div class="form-group">
        <label>Tema formativo abordado *</label>
        ${htmlText('for-tema', data.tema, 'Ej: Importancia del reciclaje, Propagación vegetal...')}
      </div>
      <div class="form-group">
        <label>Cantidad de personas sensibilizadas *</label>
        ${htmlNumber('for-personas', data.personasSensibilizadas)}
      </div>
    </div>

    ${esTallerOCiclo ? `
      <!-- ===== BLOQUE 2: Modalidad y material ===== -->
      <div class="subpanel">
        <h3>💻 Modalidad y Material</h3>
        <div class="form-group">
          <label>Modalidad *</label>
          ${htmlRadioGroup('for-modalidad', modalidades, data.modalidad)}
        </div>
        <div class="form-group">
          <label>Material didáctico utilizado</label>
          ${htmlCheckboxGroup('for-material', materiales, data.materialDidactico)}
        </div>
      </div>
    ` : ''}

    ${mostrarBrigadaParticipante ? `
      <!-- ===== BLOQUE 3: Brigada participante ===== -->
      <div class="subpanel">
        <h3>👥 Brigada Participante</h3>
        <div class="form-group">
          <label>Brigada ecológica que participó *</label>
          ${htmlSelect('for-brigada', brigadas, data.brigadaEcologica)}
        </div>
      </div>
    ` : ''}

    ${preguntarConformacion ? `
      <!-- ===== BLOQUE 4: Conformación de brigada ===== -->
      <div class="subpanel">
        <h3>🎽 ¿Se conformó alguna brigada?</h3>
        <div class="form-group">
          ${htmlRadioGroup('for-conformo', ['Sí', 'No'], data.seConformoBrigada)}
        </div>
      </div>
    ` : ''}

    ${mostrarDatosBrigada ? `
      <!-- ===== BLOQUE 5: Datos de la brigada conformada ===== -->
      <div class="subpanel">
        <h3>📋 Datos de la Brigada Conformada</h3>
        <div class="form-group">
          <label>Nombre de la brigada *</label>
          ${htmlText('for-nombreBrigada', data.nombreBrigada, 'Ej: Eco-brigada Los Samanes')}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cantidad de miembros *</label>
            ${htmlNumber('for-miembros', data.miembrosBrigada)}
          </div>
          <div class="form-group">
            <label>Clasificación por edades *</label>
            ${htmlSelect('for-clasifEdades', clasifEdades, data.clasificacionBrigada)}
          </div>
        </div>
      </div>
    ` : ''}
  `;

  /* ===== Wiring ===== */
  // Selects que disparan re-render (para mostrar/ocultar secciones)
  document.getElementById('for-tipoDinamica')?.addEventListener('change', (e) => {
    data.tipoDinamica = e.target.value;
    // Al cambiar el tipo de dinámica, reseteamos las respuestas condicionales
    data.brigadaEcologica = '';
    data.modalidad = '';
    data.materialDidactico = [];
    data.seConformoBrigada = '';
    data.nombreBrigada = '';
    data.miembrosBrigada = 0;
    data.clasificacionBrigada = '';
    renderizarPaso();
  });

  // Campos simples
  document.getElementById('for-tema')?.addEventListener('input', (e) => {
    data.tema = e.target.value;
  });
  document.getElementById('for-personas')?.addEventListener('input', (e) => {
    data.personasSensibilizadas = parseInt(e.target.value, 10) || 0;
  });
  document.getElementById('for-brigada')?.addEventListener('change', (e) => {
    data.brigadaEcologica = e.target.value;
  });
  document.getElementById('for-nombreBrigada')?.addEventListener('input', (e) => {
    data.nombreBrigada = e.target.value;
  });
  document.getElementById('for-miembros')?.addEventListener('input', (e) => {
    data.miembrosBrigada = parseInt(e.target.value, 10) || 0;
  });
  document.getElementById('for-clasifEdades')?.addEventListener('change', (e) => {
    data.clasificacionBrigada = e.target.value;
  });

  // Radio: modalidad
  wireRadioGroup('for-modalidad', (val) => { data.modalidad = val; });

  // Radio: ¿se conformó brigada?
  document.querySelectorAll('input[name="for-conformo"]').forEach(r => {
    r.addEventListener('change', (e) => {
      data.seConformoBrigada = e.target.value;
      // Reset de datos de brigada si dice "No"
      if (e.target.value === 'No') {
        data.nombreBrigada = '';
        data.miembrosBrigada = 0;
        data.clasificacionBrigada = '';
      }
      renderizarPaso(); // re-render para mostrar/ocultar bloque de datos
    });
  });

  // Checkbox: material didáctico
  wireCheckboxGroup('for-material', (vals) => { data.materialDidactico = vals; });
}

/* ==================== PASO 3 — PLANTACIÓN ==================== */
function renderPaso3Plantacion(body) {
  const data = formData.condicional.plantacion;

  const tiposActividad = [
    'Jornada de Reforestación (Forestales)',
    'Jornada de Reforestación (Frutales)',
    'Jornada de Reforestación (Mixta)',
    'Plantación Ornamental / Paisajismo',
    'Identificación de Árboles Semilleros',
    'Conservación de Especies Establecidas',
    'Atención a Árboles (Mantenimiento Fitosanitario)',
    'Realización de Hoyaduras',
    'Lanzamiento de Avíos',
    'Aplicación de Instrumento para Bancos de Tierra',
    'Eco-senderismo / Expedición Pedagógica',
    'Ruta Pedagógica "Árboles de mi Comunidad"',
    'Jornada de Reforestación Preventiva (Ríos / Quebradas)',
    'Jornada de Conservación de Manglar',
    'Reforestación Conmemorativa',
    'Otro'
  ];

  const tiposZona = [
    'PARQUE NACIONAL',
    'PARQUES MUNICIPALES Y BOSQUES URBANOS',
    'ÁREAS RURALES DE DESARROLLO INTEGRAL',
    'ÁREAS BOSCOSAS BAJO PROTECCIÓN',
    'ÁREAS DE PROTECCIÓN Y RECUPERACIÓN AMBIENTAL',
    'ZONAS PROTECTORAS',
    'RESERVA FORESTAL NATURAL',
    'RESERVA DE FAUNA SILVESTRE',
    'BOSQUES Y ÁREAS BOSCOSAS PERIURBANAS',
    'ÁREAS CRÍTICAS CON PRIORIDAD DE TRATAMIENTO'
  ];

  const tiposArea  = ['NUEVA', 'REPOSICIÓN'];
  const tiposSuelo = ['Limoso', 'Arcilloso', 'Arenoso', 'Otro'];
  const afectaciones = ['Ninguna', 'Incendio Forestal', 'Aprovechamiento agrícola', 'Expansión periurbana', 'Otro'];
  const portes = ['1cm a 30cm', '31cm a 50cm', '51cm a 1M'];

  // ===== Flags condicionales =====
  const esPlantacion = data.tipoActividad?.startsWith('Jornada de Reforestación')
                    || data.tipoActividad === 'Plantación Ornamental / Paisajismo'
                    || data.tipoActividad === 'Reforestación Conmemorativa'
                    || data.tipoActividad === 'Jornada de Reforestación Preventiva (Ríos / Quebradas)'
                    || data.tipoActividad === 'Jornada de Conservación de Manglar'
                    || data.tipoActividad === 'Conservación de Especies Establecidas';

  const esAtencionArboles = data.tipoActividad === 'Atención a Árboles (Mantenimiento Fitosanitario)';
  const esHoyadura        = data.tipoActividad === 'Realización de Hoyaduras';
  const esAvio            = data.tipoActividad === 'Lanzamiento de Avíos';
  const esArbolesSemilleros = data.tipoActividad === 'Identificación de Árboles Semilleros';
  const esEcoSenderismo   = data.tipoActividad === 'Eco-senderismo / Expedición Pedagógica'
                         || data.tipoActividad === 'Ruta Pedagógica "Árboles de mi Comunidad"';
  const esBancoTierra     = data.tipoActividad === 'Aplicación de Instrumento para Bancos de Tierra';

  // Categoría de especies según tipoPlanta
  const categoriaEspecies = data.tipoPlanta === 'Forestal' ? 'Forestales'
                          : data.tipoPlanta === 'Frutal' ? 'Frutales'
                          : data.tipoPlanta === 'Ornamental' ? 'Ornamentales'
                          : data.tipoPlanta === 'Medicinal' ? 'Medicinales'
                          : null;

  body.innerHTML = `
    <!-- ===== BLOQUE 1: Actividad ===== -->
    <div class="subpanel">
      <h3>🌳 Actividad de Plantación</h3>
      <div class="form-group">
        <label>Tipo de actividad de plantación *</label>
        ${htmlSelect('pla-tipoActividad', tiposActividad, data.tipoActividad)}
      </div>
    </div>

    ${esPlantacion ? `
      <!-- ===== BLOQUE 2: Tipo de planta ===== -->
      <div class="subpanel">
        <h3>🌿 Tipo de Planta</h3>
        <div class="form-group">
          <label>Tipo de planta empleada *</label>
          ${htmlSelect('pla-tipoPlanta', ['Forestal', 'Frutal', 'Ornamental', 'Medicinal'], data.tipoPlanta)}
        </div>
      </div>
    ` : ''}

    ${esPlantacion && categoriaEspecies ? `
      <!-- ===== BLOQUE 3: Especies + cantidad ===== -->
      <div class="subpanel">
        <h3>🌱 Especies ${data.tipoPlanta}s — Establecidas</h3>
        <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
          Agrega las especies plantadas y la cantidad de cada una. La lista completa tiene
          ${(CATALOGO_PLANTAS[categoriaEspecies] || []).length} especies.
        </p>
        <div id="pla-especies-widget"></div>
      </div>

      <!-- ===== BLOQUE 4: Porte + Dimensiones ===== -->
      <div class="subpanel">
        <h3>📏 Porte y Área</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Porte de las plantas *</label>
            ${htmlSelect('pla-porte', portes, data.porte)}
          </div>
          <div class="form-group">
            <label>Dimensiones del área atendida (m²)</label>
            ${htmlText('pla-dimensiones', data.dimensionesArea, 'Ej: 300m2, 1ha')}
          </div>
        </div>
      </div>

      <!-- ===== BLOQUE 5: Coordenadas ===== -->
      <div class="subpanel">
        <h3>🗺️ Coordenadas</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Latitud</label>
            ${htmlText('pla-latitud', data.latitud, 'Ej: 8.5, -66.9')}
          </div>
          <div class="form-group">
            <label>Longitud</label>
            ${htmlText('pla-longitud', data.longitud, 'Ej: -66.9, -71.5')}
          </div>
        </div>
      </div>

      <!-- ===== BLOQUE 6: Zona y tipo de área ===== -->
      <div class="subpanel">
        <h3>🌍 Zona Atendida</h3>
        <div class="form-group">
          <label>Tipo de zona atendida *</label>
          ${htmlSelect('pla-tipoZona', tiposZona, data.tipoZona)}
        </div>
        <div class="form-group">
          <label>Tipo de área *</label>
          ${htmlRadioGroup('pla-tipoArea', tiposArea, data.tipoArea)}
        </div>
      </div>

      <!-- ===== BLOQUE 7: Suelo ===== -->
      <div class="subpanel">
        <h3>🌾 Suelo</h3>
        <div class="form-group">
          <label>Características del suelo *</label>
          ${htmlRadioGroup('pla-suelo', tiposSuelo, data.caracteristicasSuelo)}
        </div>
        <div class="form-group">
          <label>Afectación del banco de tierra *</label>
          ${htmlRadioGroup('pla-afectacion', afectaciones, data.afectacionBanco)}
        </div>
      </div>
    ` : ''}

    ${esAtencionArboles ? `
      <!-- ===== BLOQUE 8: Árboles recuperados ===== -->
      <div class="subpanel">
        <h3>🌳 Árboles Recuperados</h3>
        <div class="form-group">
          <label>Cantidad de árboles recuperados *</label>
          ${htmlNumber('pla-arbolesRecuperados', data.arbolesRecuperados)}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Latitud</label>
            ${htmlText('pla-latitud-at', data.latitud, 'Ej: 8.5')}
          </div>
          <div class="form-group">
            <label>Longitud</label>
            ${htmlText('pla-longitud-at', data.longitud, 'Ej: -66.9')}
          </div>
        </div>
      </div>
    ` : ''}

    ${esHoyadura ? `
      <!-- ===== BLOQUE 9: Hoyaduras ===== -->
      <div class="subpanel">
        <h3>⛏️ Hoyaduras</h3>
        <div class="form-group">
          <label>Cantidad de hoyaduras realizadas</label>
          ${htmlNumber('pla-cantidadHoyaduras', data.cantidadTotalPlantas)}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Latitud</label>
            ${htmlText('pla-latitud-hoy', data.latitud, 'Ej: 8.5')}
          </div>
          <div class="form-group">
            <label>Longitud</label>
            ${htmlText('pla-longitud-hoy', data.longitud, 'Ej: -66.9')}
          </div>
        </div>
      </div>
    ` : ''}

    ${esAvio ? `
      <!-- ===== BLOQUE 10: Avíos ===== -->
      <div class="subpanel">
        <h3>🪓 Avíos</h3>
        <div class="form-group">
          <label>Cantidad de avíos lanzados</label>
          ${htmlNumber('pla-cantidadAvios', data.cantidadTotalPlantas)}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Latitud</label>
            ${htmlText('pla-latitud-avio', data.latitud, 'Ej: 8.5')}
          </div>
          <div class="form-group">
            <label>Longitud</label>
            ${htmlText('pla-longitud-avio', data.longitud, 'Ej: -66.9')}
          </div>
        </div>
      </div>
    ` : ''}

    ${esArbolesSemilleros ? `
      <!-- ===== BLOQUE 11: Árboles semilleros ===== -->
      <div class="subpanel">
        <h3>🌰 Árboles Semilleros</h3>
        <div class="form-group">
          <label>Cantidad de árboles semilleros identificados</label>
          ${htmlNumber('pla-arbolesSemilleros', data.arbolesRecuperados)}
        </div>
        <div class="form-group">
          <label>Especies identificadas</label>
          ${htmlText('pla-especiesSemilleros', data.tipoActividad2, 'Ej: Samán, Apamate...')}
        </div>
      </div>
    ` : ''}

    ${esEcoSenderismo ? `
      <!-- ===== BLOQUE 12: Eco-senderismo ===== -->
      <div class="subpanel">
        <h3>🥾 Eco-senderismo / Ruta Pedagógica</h3>
        <div class="form-group">
          <label>Dimensiones del sendero / ruta (m² o km)</label>
          ${htmlText('pla-senderoDim', data.dimensionesArea, 'Ej: 500m, 2ha')}
        </div>
        <div class="form-group">
          <label>Tipo de zona atendida</label>
          ${htmlSelect('pla-senderoZona', tiposZona, data.tipoZona)}
        </div>
      </div>
    ` : ''}

    ${esBancoTierra ? `
      <!-- ===== BLOQUE 13: Banco de tierra ===== -->
      <div class="subpanel">
        <h3>🏞️ Banco de Tierra</h3>
        <div class="form-group">
          <label>Características del suelo</label>
          ${htmlRadioGroup('pla-bancoSuelo', tiposSuelo, data.caracteristicasSuelo)}
        </div>
        <div class="form-group">
          <label>Afectación</label>
          ${htmlRadioGroup('pla-bancoAfect', afectaciones, data.afectacionBanco)}
        </div>
      </div>
    ` : ''}
  `;

  /* ===== Wiring ===== */
  // Select que dispara re-render
  document.getElementById('pla-tipoActividad')?.addEventListener('change', (e) => {
    data.tipoActividad = e.target.value;
    // Reset condicionales
    data.tipoPlanta = '';
    data.especies = { forestal: {}, frutal: {}, ornamental: {}, medicinal: {} };
    data.porte = '';
    data.tipoZona = '';
    data.tipoArea = '';
    data.caracteristicasSuelo = '';
    data.afectacionBanco = '';
    data.arbolesRecuperados = 0;
    data.tipoActividad2 = '';
    renderizarPaso();
  });

  document.getElementById('pla-tipoPlanta')?.addEventListener('change', (e) => {
    data.tipoPlanta = e.target.value;
    renderizarPaso();
  });

  // Campos simples
  document.getElementById('pla-porte')?.addEventListener('change',       (e) => { data.porte = e.target.value; });
  document.getElementById('pla-dimensiones')?.addEventListener('input',  (e) => { data.dimensionesArea = e.target.value; });
  document.getElementById('pla-latitud')?.addEventListener('input',      (e) => { data.latitud = e.target.value; });
  document.getElementById('pla-longitud')?.addEventListener('input',     (e) => { data.longitud = e.target.value; });
  document.getElementById('pla-tipoZona')?.addEventListener('change',    (e) => { data.tipoZona = e.target.value; });
  document.getElementById('pla-arbolesRecuperados')?.addEventListener('input', (e) => { data.arbolesRecuperados = parseInt(e.target.value, 10) || 0; });
  document.getElementById('pla-cantidadHoyaduras')?.addEventListener('input', (e) => { data.cantidadTotalPlantas = parseInt(e.target.value, 10) || 0; });
  document.getElementById('pla-cantidadAvios')?.addEventListener('input',     (e) => { data.cantidadTotalPlantas = parseInt(e.target.value, 10) || 0; });
  document.getElementById('pla-arbolesSemilleros')?.addEventListener('input', (e) => { data.arbolesRecuperados = parseInt(e.target.value, 10) || 0; });
  document.getElementById('pla-especiesSemilleros')?.addEventListener('input',(e) => { data.tipoActividad2 = e.target.value; });
  document.getElementById('pla-senderoDim')?.addEventListener('input',        (e) => { data.dimensionesArea = e.target.value; });
  document.getElementById('pla-senderoZona')?.addEventListener('change',      (e) => { data.tipoZona = e.target.value; });

  // Latitud/longitud en bloques alternativos (para no pisarse)
  document.getElementById('pla-latitud-at')?.addEventListener('input', (e) => { data.latitud = e.target.value; });
  document.getElementById('pla-longitud-at')?.addEventListener('input',(e) => { data.longitud = e.target.value; });
  document.getElementById('pla-latitud-hoy')?.addEventListener('input', (e) => { data.latitud = e.target.value; });
  document.getElementById('pla-longitud-hoy')?.addEventListener('input',(e) => { data.longitud = e.target.value; });
  document.getElementById('pla-latitud-avio')?.addEventListener('input', (e) => { data.latitud = e.target.value; });
  document.getElementById('pla-longitud-avio')?.addEventListener('input',(e) => { data.longitud = e.target.value; });

  // Radio groups
  wireRadioGroup('pla-tipoArea',    (val) => { data.tipoArea = val; });
  wireRadioGroup('pla-suelo',       (val) => { data.caracteristicasSuelo = val; });
  wireRadioGroup('pla-afectacion',  (val) => { data.afectacionBanco = val; });
  wireRadioGroup('pla-bancoSuelo',  (val) => { data.caracteristicasSuelo = val; });
  wireRadioGroup('pla-bancoAfect',  (val) => { data.afectacionBanco = val; });

  // Widget de especies (solo si aplica)
  if (esPlantacion && categoriaEspecies) {
    const keyMap = {
      'Forestales': 'forestal',
      'Frutales': 'frutal',
      'Ornamentales': 'ornamental',
      'Medicinales': 'medicinal'
    };
    const key = keyMap[categoriaEspecies];
    if (!data.especies[key]) data.especies[key] = {};

    renderEspeciesWidget(
      categoriaEspecies,
      'pla-especies-widget',
      data.especies[key],
      () => { /* mutación directa */ }
    );
  }
}

/* ==================== PASO 3 — POLÍTICAS ==================== */
function renderPaso3Politicas(body) {
  const data = formData.condicional.politicas;

  const organizaciones = [
    'PSUV',
    'JPSUV',
    'Movimientos sociales',
    'Comunas',
    'Consejos Comunales',
    'Milicia Bolivariana',
    'Otro'
  ];

  const convocatorias = ['Nacional', 'Estadal', 'Municipal', 'Parroquial', 'Comunal'];
  const apoyos = ['Alcaldía', 'Gobernación', 'Ministerio', 'UTEC', 'Ninguno'];

  body.innerHTML = `
    <!-- ===== BLOQUE 1: Actividad política ===== -->
    <div class="subpanel">
      <h3>📢 Actividad Política</h3>
      <div class="form-group">
        <label>Tipo de actividad política *</label>
        ${htmlText('pol-tipoActividad', data.tipoActividad, 'Ej: Movilización, Marcha, Concentración, Acto político, Reunión política, Jornada de calle, Asamblea...')}
      </div>
    </div>

    <!-- ===== BLOQUE 2: Organizaciones y convocatoria ===== -->
    <div class="subpanel">
      <h3>🤝 Organizaciones y Convocatoria</h3>
      <div class="form-group">
        <label>Organizaciones participantes *</label>
        ${htmlCheckboxGroup('pol-organizaciones', organizaciones, data.organizaciones)}
      </div>
      <div class="form-group">
        <label>Convocatoria</label>
        ${htmlRadioGroup('pol-convocatoria', convocatorias, data.convocatoria)}
      </div>
    </div>

    <!-- ===== BLOQUE 3: Asistentes ===== -->
    <div class="subpanel">
      <h3>👥 Asistentes</h3>
      <div class="form-group">
        <label>Cantidad de asistentes *</label>
        ${htmlNumber('pol-asistentes', data.cantidadAsistentes)}
      </div>
      <div class="form-group">
        <label>¿Tuvo apoyo de algún ente?</label>
        ${htmlCheckboxGroup('pol-apoyos', apoyos, data.apoyoEnte)}
      </div>
    </div>

    <!-- ===== BLOQUE 4: Descripción y objetivo ===== -->
    <div class="subpanel">
      <h3>📝 Detalles de la Actividad</h3>
      <div class="form-group">
        <label>Descripción de la actividad *</label>
        ${htmlTextarea('pol-descripcion', data.descripcion, 3)}
      </div>
      <div class="form-group">
        <label>Objetivo o finalidad *</label>
        ${htmlTextarea('pol-objetivo', data.objetivo, 3)}
      </div>
    </div>
  `;

  /* ===== Wiring ===== */
  document.getElementById('pol-tipoActividad')?.addEventListener('input', (e) => {
    data.tipoActividad = e.target.value;
  });
  document.getElementById('pol-asistentes')?.addEventListener('input', (e) => {
    data.cantidadAsistentes = parseInt(e.target.value, 10) || 0;
  });
  document.getElementById('pol-descripcion')?.addEventListener('input', (e) => {
    data.descripcion = e.target.value;
  });
  document.getElementById('pol-objetivo')?.addEventListener('input', (e) => {
    data.objetivo = e.target.value;
  });

  // Checkbox groups
  wireCheckboxGroup('pol-organizaciones', (vals) => { data.organizaciones = vals; });
  wireCheckboxGroup('pol-apoyos',         (vals) => { data.apoyoEnte = vals; });

  // Radio group
  wireRadioGroup('pol-convocatoria', (val) => { data.convocatoria = val; });
}

/* ==================== PASO 4 — PARTICIPANTES ==================== */
function renderPaso4(body) {
  const p = formData.participantes;

  // Agrupamos las 8 categorías por grupo etario
  const grupos = {};
  CATEGORIAS_PARTICIPANTES.forEach(cat => {
    if (!grupos[cat.grupo]) grupos[cat.grupo] = [];
    grupos[cat.grupo].push(cat);
  });

  const filasGrupos = Object.entries(grupos).map(([grupo, cats]) => `
    <div class="form-row" style="margin-bottom: 4px;">
      <div class="form-group" style="margin-bottom: 0;">
        <label style="font-size: 12px; color: #666;">${escapeHTML(grupo)} — Masculino</label>
        <input type="number" class="part-input" data-id="${cats[0].id}" min="0"
               value="${Number(p[cats[0].id]) || 0}">
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <label style="font-size: 12px; color: #666;">${escapeHTML(grupo)} — Femenino</label>
        <input type="number" class="part-input" data-id="${cats[1].id}" min="0"
               value="${Number(p[cats[1].id]) || 0}">
      </div>
    </div>
  `).join('');

  const totales = calcularTotalParticipantes(p);

  body.innerHTML = `
    <div class="subpanel">
      <h3>👥 Distribución de Participantes</h3>
      <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
        Ingresa la cantidad de participantes por rango etario y género. Los totales se calculan automáticamente.
      </p>
      ${filasGrupos}
    </div>

    <div class="subpanel" style="background: #f1f8e9; border-left: 5px solid var(--verde-brillante);">
      <h3 style="color: var(--verde-oscuro);">📊 Totales Automáticos</h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px;">
        <div style="text-align: center; padding: 12px; background: #fff; border-radius: 10px;">
          <div style="font-size: 24px; font-weight: 800; color: var(--verde-medio);" id="tot-m">${totales.totalM}</div>
          <div style="font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase;">Total M</div>
        </div>
        <div style="text-align: center; padding: 12px; background: #fff; border-radius: 10px;">
          <div style="font-size: 24px; font-weight: 800; color: var(--verde-medio);" id="tot-f">${totales.totalF}</div>
          <div style="font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase;">Total F</div>
        </div>
        <div style="text-align: center; padding: 12px; background: var(--primary-gradient); border-radius: 10px;">
          <div style="font-size: 24px; font-weight: 800; color: #fff;" id="tot-g">${totales.totalGeneral}</div>
          <div style="font-size: 11px; color: #fff; font-weight: 600; text-transform: uppercase;">Total General</div>
        </div>
      </div>
    </div>
  `;

  /* ===== Wiring: recalcular totales al cambiar cualquier input ===== */
  const refrescarTotales = () => {
    const t = calcularTotalParticipantes(p);
    document.getElementById('tot-m').textContent = t.totalM;
    document.getElementById('tot-f').textContent = t.totalF;
    document.getElementById('tot-g').textContent = t.totalGeneral;
  };

  body.querySelectorAll('.part-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      p[id] = parseInt(e.target.value, 10) || 0;
      refrescarTotales();
    });
  });
}

/* ==================== PASO 5 — EVIDENCIA Y CIERRE ==================== */
function renderPaso5(body) {
  const c = formData.cierre;

  const mediosCom = ['Prensa local', 'Radio', 'TV', 'Redes sociales', 'Ninguno'];
  const gerenciaCortas = GERENCIAS.map(g => g.corto);

  // Según el indicador, la gerencia principal ya está definida.
  // Las gerencias vinculadas 2 y 3 son opcionales (si participaron varias).
  const gerenciaPrincipal = formData.indicador
    ? (GERENCIAS.find(g => g.id === formData.indicador)?.corto || '')
    : '';

  const gerenciasOtras = gerenciaCortas.filter(g => g !== gerenciaPrincipal);

  body.innerHTML = `
    <!-- ===== BLOQUE 1: Planificación ===== -->
    <div class="subpanel">
      <h3>🗓️ Planificación</h3>
      <div class="form-group">
        <label>¿Esta actividad fue planificada? *</label>
        ${htmlRadioGroup('cie-planificada', ['Sí', 'Cumplimiento Extra'], c.fuePlanificada)}
      </div>
    </div>

    <!-- ===== BLOQUE 2: Medios de comunicación ===== -->
    <div class="subpanel">
      <h3>📺 Medios de Comunicación</h3>
      <div class="form-group">
        <label>¿Cuáles medios estuvieron presentes?</label>
        ${htmlCheckboxGroup('cie-medios', mediosCom, c.mediosComunicacion)}
      </div>
    </div>

    <!-- ===== BLOQUE 3: Apoyos ===== -->
    <div class="subpanel">
      <h3>🤝 Apoyos</h3>
      <div class="form-group">
        <label>¿Tuvo apoyo de un ente adscrito o UTEC?</label>
        ${htmlCheckboxGroup('cie-entes', ENTES_ADSCRITOS, c.apoyoEnteAdscrito)}
      </div>
      <div class="form-group">
        <label>¿Tuvo apoyo de un ministerio o Sistema de Misiones?</label>
        ${htmlCheckboxGroup('cie-ministerios', MINISTERIOS, c.apoyoMinisterio)}
      </div>
    </div>

    <!-- ===== BLOQUE 4: Residuos y observaciones ===== -->
    <div class="subpanel">
      <h3>🗑️ Residuos y Observaciones</h3>
      <div class="form-group">
        <label>Cantidad de residuos sólidos recolectados (Kg)</label>
        ${htmlNumber('cie-residuos', c.residuosSolidos)}
      </div>
      <div class="form-group">
        <label>Observación o novedad</label>
        ${htmlTextarea('cie-observacion', c.observacion, 3)}
      </div>
    </div>

    <!-- ===== BLOQUE 5: Evidencia ===== -->
    <div class="subpanel">
      <h3>📸 Evidencia Fotográfica</h3>
      <div class="form-group">
        <label>Enlace del registro fotográfico (Drive, Dropbox, etc.) *</label>
        <input type="url" id="cie-foto" value="${escapeHTML(c.registroFotografico || '')}"
               placeholder="https://drive.google.com/...">
        <small style="display: block; margin-top: 6px; color: #888; font-size: 12px;">
          Sube las fotos a una carpeta compartida y pega el enlace acá.
        </small>
      </div>
    </div>

    <!-- ===== BLOQUE 6: Gerencias vinculadas adicionales ===== -->
    <div class="subpanel">
      <h3>🏢 Gerencias Vinculadas Adicionales</h3>
      <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
        Solo completa si <strong>otras gerencias</strong> también participaron en esta actividad.
        La gerencia principal ya está registrada como <strong>${escapeHTML(gerenciaPrincipal || '—')}</strong>.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Gerencia vinculada 2 (opcional)</label>
          ${htmlSelect('cie-ger2', gerenciasOtras, c.gerenciaVinculada2)}
        </div>
        <div class="form-group">
          <label>Gerencia vinculada 3 (opcional)</label>
          ${htmlSelect('cie-ger3', gerenciasOtras.filter(g => g !== c.gerenciaVinculada2), c.gerenciaVinculada3)}
        </div>
      </div>
    </div>

    <!-- ===== BLOQUE 7: Personal del equipo vinculado ===== -->
    <div class="subpanel">
      <h3>👥 Personal del equipo que participó</h3>
      <p style="font-size: 12px; color: #666; margin-bottom: 12px;">
        Selecciona el personal de tu equipo (cargado en "Mi Personal") que participó
        y especifica en qué ayudó cada uno.
      </p>
      <div class="form-group">
        <div style="display:flex;gap:8px;align-items:stretch;">
          <select id="cie-pers-add" style="flex:1;"><option value="">Cargando personal...</option></select>
          <button type="button" class="btn btn-primary" id="cie-pers-btn" style="white-space:nowrap;">+ Agregar</button>
        </div>
      </div>
      <div id="cie-pers-lista"></div>
    </div>
  `;

  /* ===== Wiring ===== */
  // Radio: planificada
  document.querySelectorAll('input[name="cie-planificada"]').forEach(r => {
    r.addEventListener('change', (e) => { c.fuePlanificada = e.target.value; });
  });

  // Inputs simples
  document.getElementById('cie-residuos')?.addEventListener('input', (e) => {
    c.residuosSolidos = parseInt(e.target.value, 10) || 0;
  });
  document.getElementById('cie-observacion')?.addEventListener('input', (e) => {
    c.observacion = e.target.value;
  });
  document.getElementById('cie-foto')?.addEventListener('input', (e) => {
    c.registroFotografico = e.target.value;
  });

  // Checkbox groups
  wireCheckboxGroup('cie-medios',      (vals) => { c.mediosComunicacion = vals; });
  wireCheckboxGroup('cie-entes',       (vals) => { c.apoyoEnteAdscrito = vals; });
  wireCheckboxGroup('cie-ministerios', (vals) => { c.apoyoMinisterio = vals; });

  // Gerencias vinculadas
  document.getElementById('cie-ger2')?.addEventListener('change', (e) => {
    c.gerenciaVinculada2 = e.target.value;
    // Al cambiar la 2, recargar opciones de la 3 (para no duplicar)
    renderizarPaso();
  });
  document.getElementById('cie-ger3')?.addEventListener('change', (e) => {
    c.gerenciaVinculada3 = e.target.value;
  });

  // Personal vinculado (precargado desde /personal)
  wireVinculacionPersonal(c);
}

/* Carga el personal del equipo y gestiona la lista de vinculados con su "qué hizo". */
function wireVinculacionPersonal(c) {
  const selectAdd = document.getElementById('cie-pers-add');
  const btnAdd = document.getElementById('cie-pers-btn');
  const lista = document.getElementById('cie-pers-lista');
  if (!selectAdd || !btnAdd || !lista) return;

  if (!Array.isArray(c.vinculaciones)) c.vinculaciones = [];

  const perfil = window.__perfil;
  let personalCache = [];

  const renderLista = () => {
    if (c.vinculaciones.length === 0) {
      lista.innerHTML = '<p style="font-size:12px;color:#999;text-align:center;padding:10px;">Sin personal vinculado.</p>';
      return;
    }
    lista.innerHTML = c.vinculaciones.map((v, i) => `
      <div style="display:grid;grid-template-columns:1fr 1.2fr 36px;gap:8px;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:500;">${escapeHTML(v.nombre || '—')}</span>
        <input type="text" class="cie-pers-quehizo" data-i="${i}" placeholder="¿En qué ayudó?" value="${escapeHTML(v.queHizo || '')}">
        <button type="button" class="btn btn-danger btn-sm cie-pers-quitar" data-i="${i}">✕</button>
      </div>`).join('');

    lista.querySelectorAll('.cie-pers-quehizo').forEach((inp) => {
      inp.addEventListener('input', (e) => { c.vinculaciones[Number(e.target.dataset.i)].queHizo = e.target.value; });
    });
    lista.querySelectorAll('.cie-pers-quitar').forEach((btn) => {
      btn.addEventListener('click', () => {
        c.vinculaciones.splice(Number(btn.dataset.i), 1);
        renderLista();
      });
    });
  };

  btnAdd.addEventListener('click', () => {
    const id = selectAdd.value;
    const pers = personalCache.find((d) => d.id === id);
    if (!id || !pers) return;
    if (c.vinculaciones.some((v) => v.personalId === id)) return; // evita duplicados
    c.vinculaciones.push({ personalId: id, nombre: pers.nombreCompleto || pers.nombre || '—', queHizo: '' });
    renderLista();
  });

  // Cargar personal del equipo
  (async () => {
    try {
      let q = collection(db, 'personal');
      if (perfil?.estado) q = query(q, where('estado', '==', perfil.estado));
      else if (perfil?.gerencia) q = query(q, where('gerencia', '==', perfil.gerencia));
      const snap = await getDocs(q);
      personalCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.nombreCompleto || '').localeCompare(b.nombreCompleto || ''));
      selectAdd.innerHTML = '<option value="">Seleccione...</option>' +
        personalCache.map((d) => {
          const nom = d.nombreCompleto || d.nombre || '—';
          return `<option value="${escapeHTML(d.id)}">${escapeHTML(nom)}${d.cargo ? ' — ' + escapeHTML(d.cargo) : ''}</option>`;
        }).join('');
      if (personalCache.length === 0) selectAdd.innerHTML = '<option value="">No hay personal en "Mi Personal"</option>';
    } catch (e) {
      console.warn('[Vinculación] No se pudo cargar personal:', e);
      selectAdd.innerHTML = '<option value="">No disponible</option>';
    }
  })();

  renderLista();
}

/* ==================== ENVÍO ==================== */

/**
 * Construye el documento final que se guarda en Firestore.
 * Incluye tanto campos nuevos como campos de compatibilidad con
 * los dashboards existentes (ubicacion.estado, gerencia, participantes.hombres, etc.)
 */
function construirDocumentoReporte(perfil) {
  const dg = formData.datosGenerales;
  const ind = formData.indicador;
  const condicionalData = formData.condicional[ind] || {};
  const participantes = formData.participantes;
  const cierre = formData.cierre;

  // Totales de participantes
  const totales = calcularTotalParticipantes(participantes);

  // Gerencia (corto) — mantiene compatibilidad con dashboards actuales
  const gerenciaCorto = GERENCIAS.find(g => g.id === ind)?.corto || '';

  // Determinar el tipo de reporte según el rol
  const tipo = perfil.rol === 'reporte_nacional' ? 'nacional' : 'estadal';

  // Descripción y objetivo según el indicador
  let descripcionActividad = '';
  let objetivoActividad = '';
  if (ind === 'politicas') {
    descripcionActividad = condicionalData.descripcion || '';
    objetivoActividad    = condicionalData.objetivo || '';
  } else {
    // Para los demás indicadores usamos los campos de descripción/tema disponibles
    descripcionActividad = condicionalData.descripcion
                        || condicionalData.tema
                        || condicionalData.tipoActividad
                        || '';
    objetivoActividad = condicionalData.objetivo || '';
  }

  // Tipo de actividad (nombre legible) según el indicador
  let tipoActividadLabel = condicionalData.tipoActividad || '';
  if (ind === 'politicas') tipoActividadLabel = condicionalData.tipoActividad || 'Actividad política';

  return {
    // ============ COMPATIBILIDAD CON DASHBOARDS ACTUALES ============
    usuarioId:     perfil.uid,
    usuarioEmail:  perfil.email,
    usuarioNombre: perfil.nombre || perfil.email,
    tipo,

    ubicacion: {
      estado:     dg.estado || '',
      municipio:  dg.municipio || '',
      parroquia:  dg.parroquia || '',
      comuna:     dg.comuna || '',
      consejo:    dg.consejoComunal || '',
      lugar:      dg.lugar || ''
    },

    gerencia: gerenciaCorto,

    actividad: {
      fecha:       dg.fecha || '',
      hora:        dg.hora || '',
      tipo:        tipoActividadLabel,
      programa:    '',
      descripcion: descripcionActividad,
      objetivo:    objetivoActividad
    },

    // Formato "hombres/mujeres" que usan los dashboards actuales
    participantes: {
      hombres: totales.totalM,
      mujeres: totales.totalF,

      // Formato nuevo (8 categorías + totales)
      ninos:           Number(participantes.ninos) || 0,
      ninas:           Number(participantes.ninas) || 0,
      adolescentes:    Number(participantes.adolescentes) || 0,
      adolescentas:    Number(participantes.adolescentas) || 0,
      adultos:         Number(participantes.adultos) || 0,
      adultas:         Number(participantes.adultas) || 0,
      adultos_mayores: Number(participantes.adultos_mayores) || 0,
      adultas_mayores: Number(participantes.adultas_mayores) || 0,
      totalM:          totales.totalM,
      totalF:          totales.totalF,
      totalGeneral:    totales.totalGeneral
    },

    observaciones: cierre.observacion || '',

    camposEspecificos: {},  // Reservado para compatibilidad futura

    fechaRegistro: serverTimestamp(),

    // ============ CAMPOS NUEVOS (v2.0) ============
    version: '2.0',

    datosGenerales: {
      email:       dg.email,
      fecha:       dg.fecha,
      hora:        dg.hora,
      estado:      dg.estado,
      municipio:   dg.municipio,
      parroquia:   dg.parroquia,
      comuna:      dg.comuna,
      consejo:     dg.consejoComunal,
      lugar:       dg.lugar,
      responsable: dg.responsable,
      responsablePersonalId: dg.responsablePersonalId || '',
      telefono:    dg.telefono
    },

    indicador: ind,

    // Guardamos los datos específicos del indicador elegido
    // bajo una clave con su propio nombre: { organizacion: {...} } o { produccion: {...} }
    detalleIndicador: {
      [ind]: JSON.parse(JSON.stringify(condicionalData))
    },

    cierre: {
      fuePlanificada:      cierre.fuePlanificada,
      mediosComunicacion:  cierre.mediosComunicacion || [],
      apoyoEnteAdscrito:   cierre.apoyoEnteAdscrito || [],
      apoyoMinisterio:     cierre.apoyoMinisterio || [],
      residuosSolidos:     Number(cierre.residuosSolidos) || 0,
      observacion:         cierre.observacion || '',
      registroFotografico: cierre.registroFotografico || '',
      gerenciaVinculada2:  cierre.gerenciaVinculada2 || '',
      gerenciaVinculada3:  cierre.gerenciaVinculada3 || '',
      vinculaciones:       cierre.vinculaciones || []
    },

        // 👇 NUEVOS CAMPOS
    planificacionId: planificacionVinculada?.id || null,
    planificacionActividadNumero: planificacionVinculada?.actividadNumero ?? null
  };
}

/**
 * Envía el reporte completo a Firestore.
 * Valida todos los pasos, guarda y resetea el wizard.
 */
async function enviarReporte() {
  const perfil = window.__perfil;
  if (!perfil) { toast('Error: perfil no disponible'); return; }

  // === Validación global ===
  // Corremos validarPaso() de todos los pasos para asegurar integridad
  for (let p = 1; p <= TOTAL_PASOS; p++) {
    const ok = validarPaso(p);
    if (!ok) {
      toast('Hay datos incompletos en el paso ' + p);
      pasoActual = p;
      renderizarPaso();
      return;
    }
  }

  // Doble check del paso 4: permitimos 0 participantes (no bloquea)
  // y del paso 5: foto obligatoria.
  if (!formData.cierre.registroFotografico?.trim()) {
    toast('Ingresa el enlace del registro fotográfico');
    pasoActual = 5;
    renderizarPaso();
    return;
  }

  // === Guardar en Firestore ===
  const btnSig = document.getElementById('btn-siguiente');
  setBotonCargando(btnSig, true, '📤 Enviar');
  try {
    const doc = construirDocumentoReporte(perfil);
    const ref = await addDoc(collection(db, 'reportes'), doc);

    console.log('[Cumplimiento] Reporte guardado con ID:', ref.id);

    // ===== Marcar la actividad planificada como ejecutada =====
    if (planificacionVinculada?.id) {
      try {
        await marcarActividadComoEjecutada(
          planificacionVinculada.id,
          planificacionVinculada.actividadNumero,
          ref.id
        );
      } catch (errPV) {
        console.warn('[Cumplimiento] No se pudo actualizar planificación:', errPV);
        // No bloqueamos el flujo — el reporte ya está guardado
      }
    }

    toast('✅ Reporte enviado correctamente', 4000);

    // Resetear wizard + estado de vinculación
    pasoActual = 1;
    formData = inicializarFormData(perfil);

    // Re-aplicar bloqueo de indicador para reporte_nacional
    if (perfil.rol === 'reporte_nacional' && perfil.gerencia) {
      const gid = resolverGerenciaId(perfil.gerencia);
      if (gid) {
        formData.indicador = gid;
        formData.indicadorBloqueado = true;
        formData.gerenciaOriginal = perfil.gerencia;
      }
    }

    planificacionVinculada = null;
    planificacionesCoincidentes = [];
    _pvCacheKey = '';
    renderizarPaso();

  } catch (err) {
    console.error('[Cumplimiento] Error al guardar:', err);

    if (err.code === 'permission-denied') {
      toast('No tienes permisos para guardar este reporte. Contacta al administrador.', 5000, 'error');
    } else if (err.code === 'unavailable') {
      toast('Sin conexión. Verifica tu internet e intenta de nuevo.', 5000, 'warning');
    } else {
      toast('Error al enviar el reporte: ' + (err.message || err.code || 'desconocido'), 5000, 'error');
    }
  } finally {
    const textoBoton = pasoActual === TOTAL_PASOS ? '📤 Enviar' : 'Siguiente →';
    setBotonCargando(btnSig, false, textoBoton);
  }
}


/* ==================== REPORTES ESPECIALES ==================== */

/**
 * Carga los reportes especiales pendientes para el usuario actual
 * y los muestra como banner arriba del wizard.
 *
 * Filtros aplicados:
 *  - dirigidoA: 'nacional' | 'estadal' | 'ambos' según el rol
 *  - indicador: si el reporte tiene indicador, debe coincidir con el del usuario
 *    (para reporte_estadal se valida DESPUÉS de elegir el indicador)
 *  - El usuario no debe haber respondido todavía
 *
 * @param {Object} perfil
 */
async function cargarBannerReporteEspecial(perfil) {
  const banner = document.getElementById('reporteEspecialBanner');
  if (!banner) return;

  try {
    const q = query(
      collection(db, 'reportesEspeciales'),
      where('publicado', '==', true)
    );
    const snap = await getDocs(q);

    const dirigidoA = perfil.rol === 'reporte_nacional' ? 'nacional' : 'estadal';

    const candidatos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.dirigidoA === dirigidoA || r.dirigidoA === 'ambos')
      .filter(r => !(r.respuestas || []).some(x => x.usuarioId === perfil.uid));

    if (candidatos.length === 0) {
      banner.innerHTML = '';
      return;
    }

    // Guardamos globalmente para que el usuario pueda abrirlos después
    window.__reportesEspecialesPendientes = candidatos;

    // Render del banner
    banner.innerHTML = `
      <div class="subpanel" style="
        background: #fff8e1;
        border-left: 5px solid #ffc107;
        margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 200px;">
            <h4 style="color: #856404; margin-bottom: 4px; font-size: 15px;">
              📋 Tienes ${candidatos.length} reporte${candidatos.length !== 1 ? 's' : ''} especial${candidatos.length !== 1 ? 'es' : ''} pendiente${candidatos.length !== 1 ? 's' : ''}
            </h4>
            <p style="font-size: 12px; color: #856404; margin: 0;">
              Son opcionales, pero ayudan al seguimiento institucional.
            </p>
          </div>
          <button class="btn btn-warning" id="btnAbrirRepEspBanner">
            📝 Responder
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnAbrirRepEspBanner')?.addEventListener('click', () => {
      // Abrimos el primero disponible
      const primero = candidatos[0];
      abrirModalReporteEspecial(primero, perfil);
    });

  } catch (e) {
    console.warn('[Cumplimiento] No se pudieron cargar reportes especiales:', e);
    banner.innerHTML = '';
  }
}

/**
 * Abre el modal con las preguntas del reporte especial y permite responderlo.
 *
 * @param {Object} reporte  — el reporte especial { id, titulo, descripcion, preguntas }
 * @param {Object} perfil   — el usuario actual
 */
function abrirModalReporteEspecial(reporte, perfil) {
  const modal = document.getElementById('modalReporteEspecial');
  if (!modal) return;

  document.getElementById('repEspTitulo').textContent = '📋 ' + (reporte.titulo || 'Reporte Especial');
  document.getElementById('repEspDescripcion').textContent = reporte.descripcion || '';

  const contenedor = document.getElementById('repEspCampos');
  contenedor.innerHTML = '';

  (reporte.preguntas || []).forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'form-group';

    let inputHTML = '';
    switch (p.tipo) {
      case 'textarea':
        inputHTML = `<textarea data-idx="${i}" rows="3" style="width: 100%;"></textarea>`;
        break;
      case 'numero':
        inputHTML = `<input type="number" data-idx="${i}" style="width: 100%;">`;
        break;
      case 'email':
        inputHTML = `<input type="email" data-idx="${i}" style="width: 100%;">`;
        break;
      case 'tel':
        inputHTML = `<input type="tel" data-idx="${i}" style="width: 100%;">`;
        break;
      case 'fecha':
        inputHTML = `<input type="date" data-idx="${i}" style="width: 100%;">`;
        break;
      case 'si_no':
        inputHTML = `
          <div style="display: flex; gap: 16px; margin-top: 4px;">
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" name="resp-${i}" value="Sí"> Sí
            </label>
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="radio" name="resp-${i}" value="No"> No
            </label>
          </div>`;
        break;
      case 'select':
        inputHTML = `
          <select data-idx="${i}" style="width: 100%;">
            <option value="">Seleccione...</option>
            ${(p.opciones || []).map(o => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join('')}
          </select>`;
        break;
      case 'multi':
        inputHTML = `
          <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 4px;">
            ${(p.opciones || []).map((o, j) => `
              <label style="display: flex; align-items: center; gap: 6px;">
                <input type="checkbox" value="${escapeHTML(o)}" data-idx="${i}" data-multi="${j}">
                ${escapeHTML(o)}
              </label>
            `).join('')}
          </div>`;
        break;
      default:
        inputHTML = `<input type="text" data-idx="${i}" style="width: 100%;">`;
    }

    div.innerHTML = `
      <label style="font-weight: 600; color: var(--verde-medio);">
        ${escapeHTML(p.texto)} ${p.obligatorio ? '<span style="color: red;">*</span>' : ''}
      </label>
      ${inputHTML}
    `;
    contenedor.appendChild(div);
  });

  // Wire: cerrar
  const cerrar = () => { modal.style.display = 'none'; };
  document.getElementById('btnCerrarModalRepEsp').onclick = cerrar;
  document.getElementById('btnCerrarRepEsp2').onclick = cerrar;
  modal.onclick = (e) => { if (e.target === modal) cerrar(); };

  // Wire: enviar
  document.getElementById('btnEnviarRepEsp').onclick = async () => {
    await responderReporteEspecial(reporte, perfil, contenedor, cerrar);
  };

  modal.style.display = 'flex';
}

/**
 * Guarda la respuesta del usuario al reporte especial.
 */
async function responderReporteEspecial(reporte, perfil, contenedor, cerrarModal) {
  const respuestas = [];
  let valid = true;

  for (let i = 0; i < (reporte.preguntas || []).length; i++) {
    const p = reporte.preguntas[i];
    let valor = '';

    if (p.tipo === 'multi') {
      const checks = contenedor.querySelectorAll(`input[type="checkbox"][data-idx="${i}"]:checked`);
      valor = Array.from(checks).map(c => c.value);
      if (p.obligatorio && valor.length === 0) valid = false;
    } else if (p.tipo === 'si_no') {
      const radio = contenedor.querySelector(`input[name="resp-${i}"]:checked`);
      valor = radio ? radio.value : '';
      if (p.obligatorio && !valor) valid = false;
    } else {
      const input = contenedor.querySelector(`[data-idx="${i}"]`);
      valor = input ? input.value.trim() : '';
      if (p.obligatorio && !valor) valid = false;
    }

    respuestas.push(valor);
  }

  if (!valid) {
    toast('Completa las preguntas obligatorias');
    return;
  }

  try {
    loader(true);

    // Releemos el doc actual para no pisar respuestas nuevas (race condition)
    const snap = await getDocs(query(collection(db, 'reportesEspeciales')));
    const actual = snap.docs.find(d => d.id === reporte.id);
    if (!actual) return toast('Reporte no encontrado');

    const existentes = actual.data().respuestas || [];
    const nueva = {
      usuarioId: perfil.uid,
      usuarioNombre: perfil.nombre || perfil.email,
      usuarioEmail: perfil.email || '',
      respuestas,
      fechaRespuesta: new Date().toISOString()
    };

    await updateDoc(doc(db, 'reportesEspeciales', reporte.id), {
      respuestas: [...existentes, nueva]
    });

    toast('✅ Respuesta al reporte especial guardada');
    cerrarModal();

    // Removemos el reporte de la lista pendiente en memoria
    if (window.__reportesEspecialesPendientes) {
      window.__reportesEspecialesPendientes = window.__reportesEspecialesPendientes
        .filter(r => r.id !== reporte.id);
    }

    // Recargamos el banner
    await cargarBannerReporteEspecial(perfil);

  } catch (e) {
    console.error('[RepEsp] Error al guardar:', e);
    toast('Error al guardar la respuesta', 4000, 'error');
  } finally {
    loader(false);
  }
}