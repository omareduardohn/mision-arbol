// js/formaciones.js
// Módulo de Formaciones — Núcleo de Formación
//
// Permite listar, crear, editar y eliminar formaciones (cursos, talleres,
// diplomados, charlas, seminarios, etc.) con código único FRM-XXXXXX.
//
// Permisos:
//   - control:                          gestiona (crear/editar/eliminar)
//   - reporte_nacional + Formación:    crea y edita (no elimina)
//   - visor_nacional, dashboard_*:     solo lectura
//
// Colección Firestore: /formaciones
//   {
//     codigoUnico: 'FRM-000001',
//     titulo, tipo, tema, descripcion,
//     fechaInicio, fechaFin, duracionHoras, modalidad, facilitador,
//     ubicacion: { estado, municipio, parroquia },
//     participantes: { total, totalM, totalF },
//     estatus, evidencia, observaciones,
//     creado, creadoPor, creadoPorNombre
//   }
//
// Cascada territorial: estado → municipio → parroquia.

import {
  collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader, setBotonCargando } from "./auth.js";
import {
  ESTADOS_VENEZUELA,
  municipiosDe,
  parroquiasDe,
  cargarTerritorio,
  escapeHTML,
  resetSelect
} from "./datos.js";

/* ==================== ESTADO GLOBAL ==================== */
let modoEdicionId = null;
let _territorioCargado = false;

/* ==================== PERMISOS ==================== */
function usuarioPuedeGestionar(perfil) {
  if (!perfil) return false;
  if (perfil.rol === 'control') return true;
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Formación') return true;
  return false;
}

function usuarioPuedeEliminar(perfil) {
  return perfil?.rol === 'control';
}

/* ==================== CÓDIGO ÚNICO ==================== */
async function generarCodigoUnicoFormacion() {
  const contadorRef = doc(db, 'contadores', 'formaciones');
  const nuevo = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const ultimo = snap.exists() ? (Number(snap.data().ultimo) || 0) : 0;
    const siguiente = ultimo + 1;
    transaction.set(
      contadorRef,
      { ultimo: siguiente, actualizado: serverTimestamp() },
      { merge: true }
    );
    return siguiente;
  });
  return `FRM-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */
export async function cargarPanelFormaciones() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('formacionesWarning');
  const formDiv = document.getElementById('formFormacion');
  const btnNueva = document.getElementById('btnNuevaFormacion');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);

  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Formación</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar formaciones.
        </p>
      </div>`;
  } else {
    warningDiv.innerHTML = '';
  }

  formDiv.style.display = 'none';
  btnNueva.style.display = puedeGestionar ? 'inline-flex' : 'none';

  if (!_territorioCargado) {
    await cargarTerritorio();
    _territorioCargado = true;
    poblarEstados();
    wireCascada();
  }

  if (!window.__formacionesWired) {
    document.getElementById('btnNuevaFormacion')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarFormacion')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formFormacion')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarFormacion();
    });
    window.__formacionesWired = true;
  }

  await cargarListaFormaciones(perfil);
}

/* ==================== CASCADA TERRITORIAL ==================== */
function poblarEstados() {
  const sel = document.getElementById('frm_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('frm_estado');
  const selMunicipio = document.getElementById('frm_municipio');
  const selParroquia = document.getElementById('frm_parroquia');

  if (!selEstado) return;

  selEstado.addEventListener('change', () => {
    const estado = selEstado.value;
    if (!estado) {
      resetSelect(selMunicipio);
      resetSelect(selParroquia);
      return;
    }
    const muns = municipiosDe(estado);
    selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
      muns.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    selMunicipio.disabled = false;
    resetSelect(selParroquia);
  });

  selMunicipio?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    if (!municipio) {
      resetSelect(selParroquia);
      return;
    }
    const parr = parroquiasDe(estado, municipio);
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parr.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = false;
  });
}

/* ==================== ABRIR / CERRAR FORMULARIO ==================== */
function abrirFormularioNuevo() {
  modoEdicionId = null;
  document.getElementById('formFormacion').reset();
  document.getElementById('formFormacion').style.display = 'block';
  document.getElementById('btnNuevaFormacion').style.display = 'none';
  document.getElementById('btnGuardarFormacion').innerHTML = '💾 Guardar formación';

  resetSelect(document.getElementById('frm_municipio'));
  resetSelect(document.getElementById('frm_parroquia'));

  document.getElementById('formFormacion').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(f) {
  modoEdicionId = f.id;

  document.getElementById('frm_titulo').value = f.titulo || '';
  document.getElementById('frm_tipo').value = f.tipo || '';
  document.getElementById('frm_tema').value = f.tema || '';
  document.getElementById('frm_descripcion').value = f.descripcion || '';
  document.getElementById('frm_fechaInicio').value = f.fechaInicio || '';
  document.getElementById('frm_fechaFin').value = f.fechaFin || '';
  document.getElementById('frm_duracionHoras').value = f.duracionHoras || 0;
  document.getElementById('frm_modalidad').value = f.modalidad || 'Presencial';
  document.getElementById('frm_facilitador').value = f.facilitador || '';
  document.getElementById('frm_participantesTotal').value = f.participantes?.total || 0;
  document.getElementById('frm_participantesM').value = f.participantes?.totalM || 0;
  document.getElementById('frm_participantesF').value = f.participantes?.totalF || 0;
  document.getElementById('frm_estatus').value = f.estatus || 'planificada';
  document.getElementById('frm_evidencia').value = f.evidencia || '';
  document.getElementById('frm_observaciones').value = f.observaciones || '';

  const ub = f.ubicacion || {};
  const selEstado = document.getElementById('frm_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));

  setTimeout(() => {
    document.getElementById('frm_municipio').value = ub.municipio || '';
    document.getElementById('frm_municipio').dispatchEvent(new Event('change'));

    setTimeout(() => {
      document.getElementById('frm_parroquia').value = ub.parroquia || '';
    }, 30);
  }, 30);

  document.getElementById('formFormacion').style.display = 'block';
  document.getElementById('btnNuevaFormacion').style.display = 'none';
  document.getElementById('btnGuardarFormacion').innerHTML = '💾 Actualizar formación';
  document.getElementById('formFormacion').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formFormacion').reset();
  document.getElementById('formFormacion').style.display = 'none';
  document.getElementById('btnNuevaFormacion').style.display = 'inline-flex';
  resetSelect(document.getElementById('frm_municipio'));
  resetSelect(document.getElementById('frm_parroquia'));
}

/* ==================== GUARDAR ==================== */
async function guardarFormacion() {
  const perfil = window.__perfil;
  if (!perfil) return;

  if (!usuarioPuedeGestionar(perfil)) {
    toast('No tienes permisos para guardar formaciones');
    return;
  }

  const titulo = document.getElementById('frm_titulo').value.trim();
  const tipo = document.getElementById('frm_tipo').value;
  const tema = document.getElementById('frm_tema').value.trim();
  const descripcion = document.getElementById('frm_descripcion').value.trim();
  const fechaInicio = document.getElementById('frm_fechaInicio').value;
  const fechaFin = document.getElementById('frm_fechaFin').value;
  const duracionHoras = parseInt(document.getElementById('frm_duracionHoras').value, 10) || 0;
  const modalidad = document.getElementById('frm_modalidad').value;
  const facilitador = document.getElementById('frm_facilitador').value.trim();
  const participantesTotal = parseInt(document.getElementById('frm_participantesTotal').value, 10) || 0;
  const participantesM = parseInt(document.getElementById('frm_participantesM').value, 10) || 0;
  const participantesF = parseInt(document.getElementById('frm_participantesF').value, 10) || 0;
  const estado = document.getElementById('frm_estado').value;
  const municipio = document.getElementById('frm_municipio').value;
  const parroquia = document.getElementById('frm_parroquia').value;
  const estatus = document.getElementById('frm_estatus').value;
  const evidencia = document.getElementById('frm_evidencia').value.trim();
  const observaciones = document.getElementById('frm_observaciones').value.trim();

  if (!titulo) return toast('Ingresa el título de la formación');
  if (!tipo) return toast('Selecciona el tipo');
  if (!fechaInicio) return toast('Ingresa la fecha de inicio');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');

  if (fechaFin && fechaFin < fechaInicio) {
    return toast('La fecha de fin no puede ser anterior a la de inicio');
  }

  const payload = {
    titulo,
    tipo,
    tema,
    descripcion,
    fechaInicio,
    fechaFin: fechaFin || null,
    duracionHoras,
    modalidad,
    facilitador,
    ubicacion: { estado, municipio, parroquia },
    participantes: {
      total: participantesTotal,
      totalM: participantesM,
      totalF: participantesF
    },
    estatus,
    evidencia,
    observaciones,
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarFormacion');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'formaciones', modoEdicionId), payload);
      toast('Formación actualizada');
    } else {
      payload.codigoUnico = await generarCodigoUnicoFormacion();
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      await addDoc(collection(db, 'formaciones'), payload);
      toast('Formación registrada: ' + payload.codigoUnico);
    }
    cerrarFormulario();
  } catch (e) {
    console.error(e);
    toast('Error al guardar: ' + (e.message || ''), 4000, 'error');
  } finally {
    setBotonCargando(btn, false);
  }
}

/* ==================== LISTA ==================== */
async function cargarListaFormaciones(perfil) {
  const cont = document.getElementById('listaFormaciones');
  if (!cont) return;

  loader(true);
  try {
    // F11: Filtro territorial.
    // - control / visor_nacional: ven todo
    // - reporte_nacional (Formación): ven todo (su gerencia ES Formación)
    // - reporte_estadal: solo de su estado
    let q = collection(db, 'formaciones');
    if (perfil.rol === 'reporte_estadal' && perfil.estado) {
      q = query(q, where('ubicacion.estado', '==', perfil.estado));
    }
    const snap = await getDocs(q);

    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🎓</span>
          <div class="empty-state-msg">No hay formaciones registradas</div>
          <div class="empty-state-hint">Usa el botón "Nueva formación" para agregar la primera.</div>
        </div>`;
      return;
    }

    const formaciones = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''));

    const puedeGestionar = usuarioPuedeGestionar(perfil);
    const puedeEliminar = usuarioPuedeEliminar(perfil);

    const badgeEstatus = (e) => {
      const map = {
        planificada: '<span class="badge bg-warning">Planificada</span>',
        en_curso:    '<span class="badge bg-primary">En curso</span>',
        finalizada:  '<span class="badge bg-success">Finalizada</span>',
        cancelada:   '<span class="badge bg-danger">Cancelada</span>'
      };
      return map[e] || '<span class="badge">—</span>';
    };

    const filas = formaciones.map(f => {
      const ub = f.ubicacion || {};
      const ubicTexto = [ub.estado, ub.municipio, ub.parroquia].filter(Boolean).join(' › ');
      const tituloSeguro = escapeHTML(f.titulo || '');
      const fechas = f.fechaFin ? `${f.fechaInicio} → ${f.fechaFin}` : (f.fechaInicio || '—');

      return `
        <tr>
          <td style="font-size: 11px; color: #666; font-family: monospace;">${escapeHTML(f.codigoUnico || '—')}</td>
          <td><strong>${tituloSeguro}</strong><br><small style="color:#888;">${escapeHTML(f.tema || '')}</small></td>
          <td style="font-size: 12px;">${escapeHTML(f.tipo || '')}</td>
          <td style="font-size: 12px;">${escapeHTML(fechas)}</td>
          <td style="font-size: 12px;">${escapeHTML(f.modalidad || '')}</td>
          <td>${f.participantes?.total || 0}</td>
          <td>${badgeEstatus(f.estatus)}</td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${f.id}"
                        aria-label="Editar formación ${tituloSeguro}">✏️</button>`
              : ''}
            ${puedeEliminar
              ? `<button class="btn btn-danger btn-sm" data-del="${f.id}"
                        aria-label="Eliminar formación ${tituloSeguro}">🗑️</button>`
              : ''}
            ${!puedeGestionar && !puedeEliminar ? '—' : ''}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Código</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Fechas</th>
              <th>Modalidad</th>
              <th>Part.</th>
              <th>Estatus</th>
              <th>Ubicación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const f = formaciones.find(x => x.id === b.dataset.edit);
        if (f) abrirFormularioEdicion(f);
      });
    });

    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarFormacion(b.dataset.del));
    });

  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar formaciones.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */
async function eliminarFormacion(id) {
  if (!confirm('¿Eliminar esta formación? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'formaciones', id));
    toast('Formación eliminada');
    await cargarListaFormaciones(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}