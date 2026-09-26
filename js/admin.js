// js/admin.js
// Panel de Control y Seguimiento — funcionalidades de administrador.
//
// Responsabilidades:
//   - Descarga de reportes en CSV (con selección configurable de columnas).
//   - Descarga de planificaciones en CSV.
//   - Administración de usuarios (aprobar, rechazar, suspender, eliminar).
//   - Delegación a reportesEspeciales.js (constructor de reportes custom).
//
// Colecciones Firestore consultadas:
//   - /reportes          → exportación CSV
//   - /planificacion     → exportación CSV
//   - /usuarios          → gestión de cuentas (onSnapshot)
//
// Suscripción: onSnapshot sobre /usuarios — se limpia al cerrar sesión vía
// evento 'usuarioCerroSesion' (disparado por auth.js::logout).

import {
  collection, getDocs, getDoc, setDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { ROLES, GERENCIAS, GERENCIAS_CORTAS, ESTADOS_VENEZUELA, escapeHTML } from "./datos.js";
import { toast, loader } from "./auth.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { cargarAdminReportesEspeciales } from "./reportesEspeciales.js";

let unsubscribeUsuarios = null;
let uidPendienteAprobar = null;

export async function cargarPanelControl() {
  const perfil = window.__perfil;
  if (!perfil || perfil.rol !== 'control') return;

  inicializarDescargas();
  await cargarTablaUsuarios();
  await cargarAdminReportesEspeciales();

  // Listeners de botones (una sola vez)
  if (!window.__adminWired) {
    document.getElementById('btnDescargarReporte')?.addEventListener('click', descargarReporte);
    document.getElementById('btnDescargarPlanif')?.addEventListener('click', descargarPlanificaciones);
    document.getElementById('btnConfirmarAprobacion')?.addEventListener('click', confirmarAprobacion);
    document.getElementById('btnCancelarAprobacion')?.addEventListener('click', cerrarModalAprobar);
    document.getElementById('btnCerrarModalAprobar')?.addEventListener('click', cerrarModalAprobar);
    document.getElementById('btnBackfillLookups')?.addEventListener('click', backfillEmailsLookup);

    const rolModal = document.getElementById('rolModal');
    rolModal?.addEventListener('change', actualizarCamposModalAprobar);

    window.__adminWired = true;
  }
}

/* ==================== DESCARGAS ==================== */
/* ==================== ESTRUCTURA DE COLUMNAS V2.0 ==================== */

/**
 * Definición completa de columnas descargables, agrupadas por sección.
 * Cada columna tiene:
 *  - id:    clave única
 *  - label: nombre a mostrar en el UI y encabezado del CSV
 *  - ruta:  ruta en el documento (con puntos para anidar)
 *  - tipo:  'string' | 'array' | 'especies' | 'auto'
 */
const GRUPOS_COLUMNAS = [
  {
    id: 'basicos',
    label: '📋 Datos Básicos',
    columnas: [
      { id: 'id',            label: 'ID',              ruta: 'id',              tipo: 'auto' },
      { id: 'fechaRegistro', label: 'Fecha registro',  ruta: 'fechaRegistro',   tipo: 'auto' },
      { id: 'version',       label: 'Versión',         ruta: 'version',         tipo: 'auto' },
      { id: 'usuarioNombre', label: 'Usuario',         ruta: 'usuarioNombre',   tipo: 'string' },
      { id: 'usuarioEmail',  label: 'Email usuario',   ruta: 'usuarioEmail',    tipo: 'string' },
      { id: 'tipo',          label: 'Tipo reporte',    ruta: 'tipo',            tipo: 'string' }
    ]
  },
  {
    id: 'generales',
    label: '📍 Datos Generales (v2.0)',
    columnas: [
      { id: 'dg.email',       label: 'Email responsable',   ruta: 'datosGenerales.email',       tipo: 'string' },
      { id: 'dg.fecha',       label: 'Fecha cumplimiento',  ruta: 'datosGenerales.fecha',       tipo: 'string' },
      { id: 'dg.hora',        label: 'Hora',                ruta: 'datosGenerales.hora',        tipo: 'string' },
      { id: 'dg.estado',      label: 'Estado',              ruta: 'datosGenerales.estado',      tipo: 'string' },
      { id: 'dg.municipio',   label: 'Municipio',           ruta: 'datosGenerales.municipio',   tipo: 'string' },
      { id: 'dg.parroquia',   label: 'Parroquia',           ruta: 'datosGenerales.parroquia',   tipo: 'string' },
      { id: 'dg.comuna',      label: 'Comuna/Circuito',     ruta: 'datosGenerales.comuna',      tipo: 'string' },
      { id: 'dg.consejo',     label: 'Consejo Comunal',     ruta: 'datosGenerales.consejo',     tipo: 'string' },
      { id: 'dg.lugar',       label: 'Lugar específico',    ruta: 'datosGenerales.lugar',       tipo: 'string' },
      { id: 'dg.responsable', label: 'Responsable',         ruta: 'datosGenerales.responsable', tipo: 'string' },
      { id: 'dg.telefono',    label: 'Teléfono',            ruta: 'datosGenerales.telefono',    tipo: 'string' }
    ]
  },
  {
    id: 'ubicacion_v1',
    label: '📍 Ubicación (v1.0 compatibilidad)',
    columnas: [
      { id: 'ub.estado',    label: 'Estado (v1)',    ruta: 'ubicacion.estado',    tipo: 'string' },
      { id: 'ub.municipio', label: 'Municipio (v1)', ruta: 'ubicacion.municipio', tipo: 'string' },
      { id: 'ub.parroquia', label: 'Parroquia (v1)', ruta: 'ubicacion.parroquia', tipo: 'string' },
      { id: 'ub.comuna',    label: 'Comuna (v1)',    ruta: 'ubicacion.comuna',    tipo: 'string' },
      { id: 'ub.consejo',   label: 'Consejo (v1)',   ruta: 'ubicacion.consejo',   tipo: 'string' },
      { id: 'ub.lugar',     label: 'Lugar (v1)',     ruta: 'ubicacion.lugar',     tipo: 'string' }
    ]
  },
  {
    id: 'indicador',
    label: '🎯 Indicador / Gerencia',
    columnas: [
      { id: 'indicador', label: 'Indicador', ruta: 'indicador', tipo: 'string' },
      { id: 'gerencia',  label: 'Gerencia',  ruta: 'gerencia',  tipo: 'string' }
    ]
  },
  {
    id: 'actividad_v1',
    label: '📝 Actividad (v1.0 compatibilidad)',
    columnas: [
      { id: 'act.fecha',       label: 'Fecha (v1)',        ruta: 'actividad.fecha',       tipo: 'string' },
      { id: 'act.hora',        label: 'Hora (v1)',         ruta: 'actividad.hora',        tipo: 'string' },
      { id: 'act.tipo',        label: 'Tipo (v1)',         ruta: 'actividad.tipo',        tipo: 'string' },
      { id: 'act.descripcion', label: 'Descripción (v1)',  ruta: 'actividad.descripcion', tipo: 'string' },
      { id: 'act.objetivo',    label: 'Objetivo (v1)',     ruta: 'actividad.objetivo',    tipo: 'string' }
    ]
  },
  {
    id: 'det_organizacion',
    label: '👥 Detalle — Organización',
    columnas: [
      { id: 'org.tipoActividad',        label: 'Tipo de actividad',      ruta: 'detalleIndicador.organizacion.tipoActividad',        tipo: 'string' },
      { id: 'org.tipoBrigada',          label: 'Tipo de brigada',        ruta: 'detalleIndicador.organizacion.tipoBrigada',          tipo: 'string' },
      { id: 'org.cantidadBrigadas',     label: 'Cantidad brigadas',      ruta: 'detalleIndicador.organizacion.cantidadBrigadas',     tipo: 'string' },
      { id: 'org.miembrosBrigada',      label: 'Miembros por brigada',   ruta: 'detalleIndicador.organizacion.miembrosBrigada',      tipo: 'string' },
      { id: 'org.nombreBrigada',        label: 'Nombre de la brigada',   ruta: 'detalleIndicador.organizacion.nombreBrigada',        tipo: 'string' },
      { id: 'org.clasificacionBrigada', label: 'Clasificación edades',   ruta: 'detalleIndicador.organizacion.clasificacionBrigada', tipo: 'string' },
      { id: 'org.alianzas',             label: 'Alianzas',               ruta: 'detalleIndicador.organizacion.alianzas',             tipo: 'array' },
      { id: 'org.ministerios',          label: 'Ministerios',            ruta: 'detalleIndicador.organizacion.ministerios',          tipo: 'array' },
      { id: 'org.comiteEcosocialista',  label: 'Comité Ecosocialista',   ruta: 'detalleIndicador.organizacion.comiteEcosocialista',  tipo: 'string' },
      { id: 'org.consejoEcosocialista', label: 'Consejo Ecosocialista',  ruta: 'detalleIndicador.organizacion.consejoEcosocialista', tipo: 'string' },
      { id: 'org.conformacionConsejo',  label: 'Conformación consejo',   ruta: 'detalleIndicador.organizacion.conformacionConsejoComite', tipo: 'string' },
      { id: 'org.disgregacionFuerzas',  label: 'Disgregación fuerzas',   ruta: 'detalleIndicador.organizacion.disgregacionFuerzas',  tipo: 'string' },
      { id: 'org.personalMovilizado',   label: 'Personal movilizado',    ruta: 'detalleIndicador.organizacion.personalMovilizado',   tipo: 'string' },
      { id: 'org.acuerdos',             label: 'Acuerdos',               ruta: 'detalleIndicador.organizacion.acuerdos',             tipo: 'string' }
    ]
  },
  {
    id: 'det_produccion',
    label: '🌱 Detalle — Producción',
    columnas: [
      { id: 'prod.tipoEspacio',        label: 'Tipo de espacio',       ruta: 'detalleIndicador.produccion.tipoEspacio',        tipo: 'string' },
      { id: 'prod.tipoActividad',      label: 'Tipo de actividad',     ruta: 'detalleIndicador.produccion.tipoActividad',      tipo: 'string' },
      { id: 'prod.tipoArea',           label: 'Tipo de área',          ruta: 'detalleIndicador.produccion.tipoArea',           tipo: 'string' },
      { id: 'prod.tipoPlanta',         label: 'Tipo de planta',        ruta: 'detalleIndicador.produccion.tipoPlanta',         tipo: 'string' },
      { id: 'prod.semillas',           label: 'Semillas (kg) JSON',    ruta: 'detalleIndicador.produccion.semillas',           tipo: 'string' },
      { id: 'prod.especies',           label: 'Especies producidas',   ruta: 'detalleIndicador.produccion.especies',           tipo: 'especies' },
      { id: 'prod.porte',              label: 'Porte',                 ruta: 'detalleIndicador.produccion.porte',              tipo: 'string' },
      { id: 'prod.consEmpaque',        label: 'Conservación empaque',  ruta: 'detalleIndicador.produccion.conservacionEmpaque', tipo: 'string' },
      { id: 'prod.consEspacio',        label: 'Conservación espacio',  ruta: 'detalleIndicador.produccion.conservacionEspacio', tipo: 'string' },
      { id: 'prod.ubicacionAlmacen',   label: 'Ubicación almacén',     ruta: 'detalleIndicador.produccion.ubicacionAlmacenamiento', tipo: 'string' },
      { id: 'prod.canterosLlenados',   label: 'Canteros llenados',     ruta: 'detalleIndicador.produccion.canterosLlenados',   tipo: 'string' },
      { id: 'prod.bolsasLlenadas',     label: 'Bolsas llenadas',       ruta: 'detalleIndicador.produccion.bolsasLlenadas',     tipo: 'string' },
      { id: 'prod.sustratoPreparado',  label: 'Sustrato preparado',    ruta: 'detalleIndicador.produccion.sustratoPreparado',  tipo: 'string' },
      { id: 'prod.acarreoSustrato',    label: 'Acarreo sustrato',      ruta: 'detalleIndicador.produccion.acarreoSustrato',    tipo: 'string' },
      { id: 'prod.nombreBanco',        label: 'Nombre banco germop.',  ruta: 'detalleIndicador.produccion.nombreBanco',        tipo: 'string' },
      { id: 'prod.capacidadBanco',     label: 'Capacidad banco (kg)',  ruta: 'detalleIndicador.produccion.capacidadBanco',     tipo: 'string' },
      { id: 'prod.bolsasPlasticas',    label: 'Bolsas plásticas',      ruta: 'detalleIndicador.produccion.bolsasPlasticas',    tipo: 'string' }
    ]
  },
  {
    id: 'det_formacion',
    label: '🎓 Detalle — Formación',
    columnas: [
      { id: 'for.tipoDinamica',           label: 'Tipo de dinámica',       ruta: 'detalleIndicador.formacion.tipoDinamica',           tipo: 'string' },
      { id: 'for.tema',                   label: 'Tema formativo',         ruta: 'detalleIndicador.formacion.tema',                   tipo: 'string' },
      { id: 'for.personasSensibilizadas', label: 'Personas sensibilizadas', ruta: 'detalleIndicador.formacion.personasSensibilizadas', tipo: 'string' },
      { id: 'for.brigadaEcologica',       label: 'Brigada participante',   ruta: 'detalleIndicador.formacion.brigadaEcologica',       tipo: 'string' },
      { id: 'for.modalidad',              label: 'Modalidad',              ruta: 'detalleIndicador.formacion.modalidad',              tipo: 'string' },
      { id: 'for.materialDidactico',      label: 'Material didáctico',     ruta: 'detalleIndicador.formacion.materialDidactico',      tipo: 'array' },
      { id: 'for.seConformoBrigada',      label: '¿Se conformó brigada?',  ruta: 'detalleIndicador.formacion.seConformoBrigada',      tipo: 'string' },
      { id: 'for.nombreBrigada',          label: 'Nombre nueva brigada',   ruta: 'detalleIndicador.formacion.nombreBrigada',          tipo: 'string' },
      { id: 'for.miembrosBrigada',        label: 'Miembros brigada',       ruta: 'detalleIndicador.formacion.miembrosBrigada',        tipo: 'string' },
      { id: 'for.clasificacionBrigada',   label: 'Clasificación edades',   ruta: 'detalleIndicador.formacion.clasificacionBrigada',   tipo: 'string' }
    ]
  },
  {
    id: 'det_plantacion',
    label: '🌳 Detalle — Plantación',
    columnas: [
      { id: 'pla.tipoActividad',         label: 'Tipo de actividad',     ruta: 'detalleIndicador.plantacion.tipoActividad',         tipo: 'string' },
      { id: 'pla.tipoPlanta',            label: 'Tipo de planta',        ruta: 'detalleIndicador.plantacion.tipoPlanta',            tipo: 'string' },
      { id: 'pla.especies',              label: 'Especies establecidas', ruta: 'detalleIndicador.plantacion.especies',              tipo: 'especies' },
      { id: 'pla.cantidadTotalPlantas',  label: 'Total plantas',         ruta: 'detalleIndicador.plantacion.cantidadTotalPlantas',  tipo: 'string' },
      { id: 'pla.dimensionesArea',       label: 'Dimensiones área',      ruta: 'detalleIndicador.plantacion.dimensionesArea',       tipo: 'string' },
      { id: 'pla.latitud',               label: 'Latitud',               ruta: 'detalleIndicador.plantacion.latitud',               tipo: 'string' },
      { id: 'pla.longitud',              label: 'Longitud',              ruta: 'detalleIndicador.plantacion.longitud',              tipo: 'string' },
      { id: 'pla.tipoZona',              label: 'Tipo de zona',          ruta: 'detalleIndicador.plantacion.tipoZona',              tipo: 'string' },
      { id: 'pla.tipoArea',              label: 'Tipo de área',          ruta: 'detalleIndicador.plantacion.tipoArea',              tipo: 'string' },
      { id: 'pla.caracteristicasSuelo',  label: 'Características suelo', ruta: 'detalleIndicador.plantacion.caracteristicasSuelo',  tipo: 'string' },
      { id: 'pla.afectacionBanco',       label: 'Afectación banco',      ruta: 'detalleIndicador.plantacion.afectacionBanco',       tipo: 'string' },
      { id: 'pla.arbolesRecuperados',    label: 'Árboles recuperados',   ruta: 'detalleIndicador.plantacion.arbolesRecuperados',    tipo: 'string' },
      { id: 'pla.tipoActividad2',        label: 'Actividad 2 / especies', ruta: 'detalleIndicador.plantacion.tipoActividad2',       tipo: 'string' }
    ]
  },
  {
    id: 'det_politicas',
    label: '📢 Detalle — Políticas',
    columnas: [
      { id: 'pol.tipoActividad',      label: 'Tipo de actividad',     ruta: 'detalleIndicador.politicas.tipoActividad',      tipo: 'string' },
      { id: 'pol.organizaciones',     label: 'Organizaciones',        ruta: 'detalleIndicador.politicas.organizaciones',     tipo: 'array' },
      { id: 'pol.convocatoria',       label: 'Convocatoria',          ruta: 'detalleIndicador.politicas.convocatoria',       tipo: 'string' },
      { id: 'pol.cantidadAsistentes', label: 'Cantidad asistentes',   ruta: 'detalleIndicador.politicas.cantidadAsistentes', tipo: 'string' },
      { id: 'pol.apoyoEnte',          label: 'Apoyo recibido',        ruta: 'detalleIndicador.politicas.apoyoEnte',          tipo: 'array' },
      { id: 'pol.descripcion',        label: 'Descripción',           ruta: 'detalleIndicador.politicas.descripcion',        tipo: 'string' },
      { id: 'pol.objetivo',           label: 'Objetivo',              ruta: 'detalleIndicador.politicas.objetivo',           tipo: 'string' }
    ]
  },
  {
    id: 'participantes',
    label: '👥 Participantes',
    columnas: [
      { id: 'p.ninos',           label: 'Niños',            ruta: 'participantes.ninos',           tipo: 'string' },
      { id: 'p.ninas',           label: 'Niñas',            ruta: 'participantes.ninas',           tipo: 'string' },
      { id: 'p.adolescentes',    label: 'Adolescentes',     ruta: 'participantes.adolescentes',    tipo: 'string' },
      { id: 'p.adolescentas',    label: 'Adolescentas',     ruta: 'participantes.adolescentas',    tipo: 'string' },
      { id: 'p.adultos',         label: 'Adultos',          ruta: 'participantes.adultos',         tipo: 'string' },
      { id: 'p.adultas',         label: 'Adultas',          ruta: 'participantes.adultas',         tipo: 'string' },
      { id: 'p.adultos_mayores', label: 'Adultos mayores',  ruta: 'participantes.adultos_mayores', tipo: 'string' },
      { id: 'p.adultas_mayores', label: 'Adultas mayores',  ruta: 'participantes.adultas_mayores', tipo: 'string' },
      { id: 'p.totalM',          label: 'Total M',          ruta: 'participantes.totalM',          tipo: 'string' },
      { id: 'p.totalF',          label: 'Total F',          ruta: 'participantes.totalF',          tipo: 'string' },
      { id: 'p.totalGeneral',    label: 'Total general',    ruta: 'participantes.totalGeneral',    tipo: 'string' },
      { id: 'p.hombres',         label: 'Hombres (v1)',     ruta: 'participantes.hombres',         tipo: 'string' },
      { id: 'p.mujeres',         label: 'Mujeres (v1)',     ruta: 'participantes.mujeres',         tipo: 'string' }
    ]
  },
  {
    id: 'cierre',
    label: '🔒 Cierre',
    columnas: [
      { id: 'c.fuePlanificada',      label: '¿Planificada?',       ruta: 'cierre.fuePlanificada',      tipo: 'string' },
      { id: 'c.mediosComunicacion',  label: 'Medios comunicación', ruta: 'cierre.mediosComunicacion',  tipo: 'array' },
      { id: 'c.apoyoEnteAdscrito',   label: 'Apoyo entes/UTEC',    ruta: 'cierre.apoyoEnteAdscrito',   tipo: 'array' },
      { id: 'c.apoyoMinisterio',     label: 'Apoyo ministerios',   ruta: 'cierre.apoyoMinisterio',     tipo: 'array' },
      { id: 'c.residuosSolidos',     label: 'Residuos (kg)',       ruta: 'cierre.residuosSolidos',     tipo: 'string' },
      { id: 'c.observacion',         label: 'Observación',         ruta: 'cierre.observacion',         tipo: 'string' },
      { id: 'c.registroFotografico', label: 'Registro fotográfico',ruta: 'cierre.registroFotografico', tipo: 'string' },
      { id: 'c.gerenciaVinculada2',  label: 'Gerencia vinculada 2',ruta: 'cierre.gerenciaVinculada2',  tipo: 'string' },
      { id: 'c.gerenciaVinculada3',  label: 'Gerencia vinculada 3',ruta: 'cierre.gerenciaVinculada3',  tipo: 'string' }
    ]
  },
  {
    id: 'otros',
    label: '📎 Otros',
    columnas: [
      { id: 'observaciones', label: 'Observaciones', ruta: 'observaciones', tipo: 'string' }
    ]
  }
];

function inicializarDescargas() {
  const container = document.getElementById('columnasCheckboxes');
  if (!container || container.children.length > 0) return;

  container.innerHTML = GRUPOS_COLUMNAS.map(grupo => `
    <div class="grupo-columnas" style="
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 10px;
      background: #fafdf9;">

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <label style="font-weight: 700; color: var(--verde-oscuro); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          <input type="checkbox" class="chk-grupo" data-grupo="${grupo.id}" checked>
          ${grupo.label}
        </label>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-mini" data-accion="all" data-grupo="${grupo.id}"
                  style="font-size: 10px; padding: 2px 8px; border: 1px solid var(--verde-claro); background: #fff; border-radius: 6px; cursor: pointer;">
            Todos
          </button>
          <button type="button" class="btn-mini" data-accion="none" data-grupo="${grupo.id}"
                  style="font-size: 10px; padding: 2px 8px; border: 1px solid #ccc; background: #fff; border-radius: 6px; cursor: pointer;">
            Ninguno
          </button>
        </div>
      </div>

      <div class="checkbox-group columnas-grupo" data-grupo="${grupo.id}"
           style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${grupo.columnas.map(col => `
          <label style="display: flex; align-items: center; gap: 5px; padding: 4px 10px; background: #e8f5e9; border-radius: 14px; font-size: 11px; cursor: pointer;">
            <input type="checkbox" class="chk-columna" data-grupo="${grupo.id}" value="${col.id}" checked>
            ${escapeHTML(col.label)}
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');

  /* ===== Wiring: botones "Todos" y "Ninguno" por grupo ===== */
  container.querySelectorAll('.btn-mini').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const grupoId = btn.dataset.grupo;
      const accion = btn.dataset.accion;
      const checkboxes = container.querySelectorAll(`.chk-columna[data-grupo="${grupoId}"]`);
      checkboxes.forEach(cb => cb.checked = (accion === 'all'));
      // Actualizar el "select all" del grupo
      const grupoChk = container.querySelector(`.chk-grupo[data-grupo="${grupoId}"]`);
      if (grupoChk) grupoChk.checked = (accion === 'all');
    });
  });

  /* ===== Wiring: checkbox de grupo (marca/desmarca todos sus hijos) ===== */
  container.querySelectorAll('.chk-grupo').forEach(chkGrupo => {
    chkGrupo.addEventListener('change', () => {
      const grupoId = chkGrupo.dataset.grupo;
      const checkboxes = container.querySelectorAll(`.chk-columna[data-grupo="${grupoId}"]`);
      checkboxes.forEach(cb => cb.checked = chkGrupo.checked);
    });
  });

  /* ===== Wiring: checkbox individual (actualiza el grupo) ===== */
  container.querySelectorAll('.chk-columna').forEach(chkCol => {
    chkCol.addEventListener('change', () => {
      const grupoId = chkCol.dataset.grupo;
      const grupoChk = container.querySelector(`.chk-grupo[data-grupo="${grupoId}"]`);
      if (!grupoChk) return;
      const all = container.querySelectorAll(`.chk-columna[data-grupo="${grupoId}"]`);
      const checked = container.querySelectorAll(`.chk-columna[data-grupo="${grupoId}"]:checked`);
      grupoChk.checked = (all.length === checked.length);
      grupoChk.indeterminate = (checked.length > 0 && checked.length < all.length);
    });
  });
}

/**
 * Devuelve todas las columnas actualmente seleccionadas como array de
 * objetos { id, label, ruta, tipo }.
 */
function obtenerColumnasSeleccionadas() {
  const seleccionadas = [];
  const ids = new Set();

  document.querySelectorAll('#columnasCheckboxes .chk-columna:checked').forEach(chk => {
    ids.add(chk.value);
  });

  GRUPOS_COLUMNAS.forEach(grupo => {
    grupo.columnas.forEach(col => {
      if (ids.has(col.id)) seleccionadas.push(col);
    });
  });

  return seleccionadas;
}

/**
 * Extrae el valor de una ruta con puntos dentro de un objeto.
 * Ej: getByPath(obj, 'a.b.c') → obj.a.b.c
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Aplana una lista de especies del formato { categoria: { especie: cantidad } }
 * en un string legible tipo "Forestal: Acacia 10; Apamate 5 | Frutal: ...".
 */
function aplanarEspecies(especiesData) {
  if (!especiesData || typeof especiesData !== 'object') return '';
  const partes = [];
  Object.entries(especiesData).forEach(([categoria, especies]) => {
    if (!especies || typeof especies !== 'object') return;
    const items = Object.entries(especies)
      .filter(([, cant]) => Number(cant) > 0)
      .map(([nombre, cant]) => `${nombre} (${cant})`);
    if (items.length > 0) {
      partes.push(`${categoria}: ${items.join(', ')}`);
    }
  });
  return partes.join(' | ');
}

/**
 * Convierte el valor de un campo en string seguro para CSV.
 * - Maneja arrays, objetos Timestamp, null/undefined.
 * - Previene fórmulas (=, +, -, @).
 */
function formatearValorCSV(valor, tipo) {
  if (valor === null || valor === undefined) return '';

  // Timestamp de Firestore
  if (typeof valor?.toDate === 'function') {
    try {
      return valor.toDate().toLocaleString('es-VE');
    } catch (_) {
      return '';
    }
  }

  // Tipo especial: especies
  if (tipo === 'especies') {
    return aplanarEspecies(valor);
  }

  // Arrays
  if (Array.isArray(valor)) {
    return valor.join(' | ');
  }

  // Objetos genéricos (ej: semillas { forestal: 10, frutal: 5 })
  if (typeof valor === 'object') {
    try {
      return Object.entries(valor)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    } catch (_) {
      return '';
    }
  }

  // String / número / boolean
  return String(valor);
}

/**
 * Escapa un string para CSV.
 * - Dobla comillas internas.
 * - Protege contra inyección de fórmulas.
 * - Envuelve en comillas.
 */
function escaparCSV(str) {
  const s = String(str ?? '').replace(/"/g, '""');
  const safe = s.replace(/^[=+\-@\t\r]/, "'$&");
  return `"${safe}"`;
}

async function descargarReporte() {
  const desde = document.getElementById('fechaDesdeDescarga')?.value;
  const hasta = document.getElementById('fechaHastaDescarga')?.value;

  const columnas = obtenerColumnasSeleccionadas();
  if (columnas.length === 0) return toast('Selecciona al menos una columna');

  loader(true);
  try {
    let ref = collection(db, 'reportes');
    const snap = await getDocs(query(ref, orderBy('fechaRegistro', 'desc')));
    let reportes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (desde) reportes = reportes.filter(r => {
      const f = r.fechaRegistro?.toDate?.();
      return f && f >= new Date(desde);
    });
    if (hasta) reportes = reportes.filter(r => {
      const f = r.fechaRegistro?.toDate?.();
      return f && f <= new Date(hasta + 'T23:59:59');
    });

    // Header: usamos las etiquetas legibles, no las rutas
    const header = columnas.map(c => escaparCSV(c.label)).join(',');

    // Filas
    const filas = reportes.map(r => {
      return columnas.map(col => {
        const valor = getByPath(r, col.ruta);
        const formateado = formatearValorCSV(valor, col.tipo);
        return escaparCSV(formateado);
      }).join(',');
    }).join('\n');

    const csv = header + '\n' + filas;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reportes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast(`✅ ${reportes.length} reportes exportados (${columnas.length} columnas)`, 4000);
  } catch (e) {
    console.error(e);
    toast('Error al descargar: ' + (e.message || 'desconocido'));
  } finally {
    loader(false);
  }
}

async function descargarPlanificaciones() {
  const desde = document.getElementById('fechaDesdePlanif')?.value;
  const hasta = document.getElementById('fechaHastaPlanif')?.value;

  loader(true);
  try {
    const snap = await getDocs(query(collection(db, 'planificacion'), orderBy('semanaInicio', 'desc')));
    let planificaciones = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (desde) planificaciones = planificaciones.filter(p => {
      const f = p.semanaInicio?.toDate?.() || new Date(p.semanaInicio);
      return f >= new Date(desde);
    });
    if (hasta) planificaciones = planificaciones.filter(p => {
      const f = p.semanaInicio?.toDate?.() || new Date(p.semanaInicio);
      return f <= new Date(hasta + 'T23:59:59');
    });

    let csv = 'Usuario,Semana inicio,N° actividades,Estado\n';
    planificaciones.forEach(p => {
      const u = p.nombreUsuario || '';
      const semana = typeof p.semanaInicio === 'string'
        ? p.semanaInicio
        : (p.semanaInicio?.toDate?.()?.toLocaleDateString('es-VE') || '');
      const len = Array.isArray(p.actividades) ? p.actividades.length : 0;
      csv += `"${u.replace(/"/g, '""')}","${semana}","${len}","${p.estado || ''}"\n`;
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planificaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Descarga lista');
  } catch (e) {
    console.error(e);
    toast('Error al descargar');
  } finally {
    loader(false);
  }
}

/* ==================== TABLA USUARIOS ==================== */
async function cargarTablaUsuarios() {
  if (unsubscribeUsuarios) unsubscribeUsuarios();
  const tbody = document.querySelector('#tablaUsuarios tbody');
  if (!tbody) return;

  unsubscribeUsuarios = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
    tbody.innerHTML = '';
    let pendientes = 0;

    snapshot.forEach(docSnap => {
      const u = docSnap.data();
      const id = docSnap.id;
      const tr = document.createElement('tr');

      let infoExtra = u.gerencia || u.estado || '';
      if (u.estadoCuenta === 'pendiente') { infoExtra = '⏳ Pendiente'; pendientes++; }
      else if (u.rol) infoExtra += ` • ${u.rol}`;

      // Mostrar intentos fallidos si hay > 0
      const intentos = Number(u.intentosFallidos) || 0;
      if (intentos > 0 && intentos < 3) {
        infoExtra += ` • ⚠️ ${intentos}/3 intentos`;
      } else if (intentos >= 3) {
        infoExtra += ` • 🔒 ${intentos}/3 intentos`;
      }

      // Etiqueta legible para aria-label de los botones de acción
      const etiquetaUsuario = u.nombre || u.email || id;

      tr.innerHTML = `
        <td><strong>${escapeHTML(u.email || '')}</strong><br><small>${escapeHTML(u.nombre || '')}</small></td>
        <td><span class="badge ${u.rol === 'control' ? 'bg-danger' : (u.rol ? 'bg-primary' : 'bg-warning')}">${escapeHTML(ROLES[u.rol] || u.rol || 'Sin rol')}</span></td>
        <td>${escapeHTML(infoExtra)}</td>
        <td class="acciones"></td>`;

      const acc = tr.querySelector('.acciones');

      if (u.estadoCuenta === 'pendiente') {
        acc.appendChild(btn('Aprobar', 'btn-success', () => abrirModalAprobar(id, u), `Aprobar la cuenta de ${etiquetaUsuario}`));
        acc.appendChild(btn('Rechazar', 'btn-warning', () => rechazarUsuario(id), `Rechazar la cuenta de ${etiquetaUsuario}`));
      } else if (u.suspendido) {
        // Suspendido por intentos fallidos o por admin → ofrecer reset completo
        acc.appendChild(btn('🔓 Resetear intentos', 'btn-success', () => resetearIntentos(id, etiquetaUsuario), `Resetear intentos fallidos y reactivar la cuenta de ${etiquetaUsuario}`));
        acc.appendChild(btn('Eliminar', 'btn-danger', () => eliminarUsuario(id), `Eliminar la cuenta de ${etiquetaUsuario}`));
      } else {
        acc.appendChild(btn('Restablecer', 'btn-warning', () => cambiarPassword(u.email), `Enviar correo de restablecimiento a ${etiquetaUsuario}`));
        acc.appendChild(btn('Suspender', 'btn-danger', () => suspenderUsuario(id, true), `Suspender la cuenta de ${etiquetaUsuario}`));
      }

      tbody.appendChild(tr);
    });

    const badge = document.getElementById('pendingCount');
    if (badge) {
      badge.textContent = pendientes;
      badge.style.display = pendientes > 0 ? 'inline' : 'none';
    }
  }, (err) => console.error('Error en tabla usuarios:', err));
}

/**
 * Crea un botón de acción con estilos consistentes y aria-label opcional.
 * @param {string} txt        Texto visible
 * @param {string} cls        Clases CSS adicionales (ej: 'btn-success')
 * @param {Function} cb       Handler de click
 * @param {string} [ariaLabel] Descripción accesible para lectores de pantalla
 * @returns {HTMLButtonElement}
 */
function btn(txt, cls, cb, ariaLabel = null) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.className = `btn ${cls} btn-sm`;
  b.style.marginRight = '4px';
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', cb);
  return b;
}

/* ==================== MODAL APROBAR ==================== */
function abrirModalAprobar(uid, u) {
  uidPendienteAprobar = uid;
  document.getElementById('rolModal').value = '';
  document.getElementById('extraFieldsModal').style.display = 'none';
  document.getElementById('extraFieldsModal').innerHTML = '';
  document.getElementById('modalAprobarUsuario').style.display = 'flex';
}

function cerrarModalAprobar() {
  document.getElementById('modalAprobarUsuario').style.display = 'none';
  uidPendienteAprobar = null;
}

function actualizarCamposModalAprobar() {
  const rol = document.getElementById('rolModal').value;
  const extra = document.getElementById('extraFieldsModal');
  extra.innerHTML = '';

  if (rol === 'reporte_estadal' || rol === 'dashboard_estadal') {
    extra.style.display = 'block';
    extra.innerHTML = `
      <label>Estado *</label>
      <select id="estadoModal">
        <option value="">Seleccione</option>
        ${ESTADOS_VENEZUELA.map(e => `<option>${e}</option>`).join('')}
      </select>`;
  } else if (rol === 'reporte_nacional' || rol === 'dashboard_nacional') {
    extra.style.display = 'block';
    extra.innerHTML = `
      <label>Gerencia *</label>
      <select id="gerenciaModal">
        <option value="">Seleccione</option>
        ${GERENCIAS_CORTAS.map(g => `<option>${g}</option>`).join('')}
      </select>`;
  } else if (rol === 'control' || rol === 'visor_nacional') {
    extra.style.display = 'none';
  } else {
    extra.style.display = 'none';
  }
}

async function confirmarAprobacion() {
  const rol = document.getElementById('rolModal').value;
  if (!rol) return toast('Seleccione un rol');

  let estado = null, gerencia = null;

  if (rol === 'reporte_estadal' || rol === 'dashboard_estadal') {
    estado = document.getElementById('estadoModal')?.value;
    if (!estado) return toast('Seleccione el estado');
  }
  if (rol === 'reporte_nacional' || rol === 'dashboard_nacional') {
    gerencia = document.getElementById('gerenciaModal')?.value;
    if (!gerencia) return toast('Seleccione la gerencia');
  }

  // Para 'control' y 'visor_nacional' no se pide nada extra

  try {
    await updateDoc(doc(db, 'usuarios', uidPendienteAprobar), {
      rol,
      estado: estado,
      gerencia: gerencia,
      estadoCuenta: 'aprobado',
      aprobadoEn: new Date()
    });
    toast('Usuario aprobado');
    cerrarModalAprobar();
  } catch (e) {
    console.error(e);
    toast('Error al aprobar');
  }
}

async function rechazarUsuario(uid) {
  if (!confirm('¿Rechazar esta cuenta?')) return;
  await updateDoc(doc(db, 'usuarios', uid), { estadoCuenta: 'rechazado', suspendido: true });
  toast('Usuario rechazado');
}

/**
 * Resetea el contador de intentos fallidos y reactiva al usuario.
 * Solo aplicable desde el panel de control.
 */
async function resetearIntentos(uid, etiqueta) {
  if (!confirm(`¿Resetear los intentos fallidos y reactivar la cuenta de ${etiqueta}?`)) return;
  try {
    // Borrar contador público
    const contadorRef = doc(db, 'intentos-publicos', uid);
    const contadorSnap = await getDoc(contadorRef);
    if (contadorSnap.exists()) {
      await deleteDoc(contadorRef);
    }
    // Resetear /usuarios
    await updateDoc(doc(db, 'usuarios', uid), {
      intentosFallidos: 0,
      ultimoIntentoFallido: null,
      suspendido: false
    });
    toast(`Cuenta de ${etiqueta} reactivada`);
  } catch (e) {
    console.error(e);
    toast('Error al resetear intentos');
  }
}

async function suspenderUsuario(uid, suspender) {
  await updateDoc(doc(db, 'usuarios', uid), { suspendido: suspender });
  toast(suspender ? 'Usuario suspendido' : 'Usuario reactivado');
}

async function eliminarUsuario(uid) {
  if (!confirm('¿Eliminar este usuario de Firestore? (Auth debe borrarse manualmente)')) return;
  await deleteDoc(doc(db, 'usuarios', uid));
  toast('Usuario eliminado');
}

async function cambiarPassword(email) {
  if (!confirm(`¿Enviar correo de restablecimiento a ${email}?`)) return;
  try {
    await sendPasswordResetEmail(auth, email);
    toast('Correo enviado');
  } catch (e) {
    toast('Error al enviar correo');
  }
}

/* ==================== CLEANUP DE SUSCRIPCIONES AL CERRAR SESIÓN ==================== */
// H.1: auth.js::logout() dispara 'usuarioCerroSesion' antes de signOut().
// Esto libera el onSnapshot de /usuarios para evitar fugas de listeners
// de Firestore tras cerrar sesión.
document.addEventListener('usuarioCerroSesion', () => {
  if (unsubscribeUsuarios) {
    try { unsubscribeUsuarios(); } catch (_) {}
    unsubscribeUsuarios = null;
  }
});

/* ==================== BACKFILL EMAILS-LOOKUP ==================== */
/**
 * Recorre todos los usuarios y crea (si no existe) su documento en
 * /emails-lookup con el hash del email. Necesario para que el contador
 * de intentos fallidos funcione con usuarios creados ANTES de implementar
 * esta funcionalidad.
 *
 * Es idempotente: si el lookup ya existe, no lo toca. Se puede ejecutar
 * varias veces sin problema.
 */
async function backfillEmailsLookup() {
  if (!confirm('Esto va a recorrer TODOS los usuarios y crear sus lookups de email. ¿Continuar?')) return;

  loader(true);
  try {
    const usersSnap = await getDocs(collection(db, 'usuarios'));
    let creados = 0;
    let existentes = 0;
    let omitidos = 0;
    let errores = 0;

    for (const userDoc of usersSnap.docs) {
      const u = userDoc.data();
      const email = u.email;
      if (!email) { omitidos++; continue; }

      const norm = String(email).trim().toLowerCase();
      const encoded = new TextEncoder().encode('mision-arbol-email-v1-' + norm);
      const buf = await crypto.subtle.digest('SHA-256', encoded);
      const hash = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      try {
        const lookupRef = doc(db, 'emails-lookup', hash);
        const lookupSnap = await getDoc(lookupRef);
        if (lookupSnap.exists()) {
          existentes++;
        } else {
          await setDoc(lookupRef, {
            uid: userDoc.id,
            creado: serverTimestamp(),
            backfilled: true
          });
          creados++;
        }
      } catch (e) {
        console.warn('Error con', email, e?.code || e);
        errores++;
      }
    }

    toast(`Backfill: ${creados} creados, ${existentes} ya existían, ${omitidos} sin email, ${errores} errores`, 6000);
  } catch (e) {
    console.error(e);
    toast('Error en el backfill: ' + (e.message || ''));
  } finally {
    loader(false);
  }
}