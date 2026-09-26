// js/brigadas.js
// Módulo de Brigadas — Gerencia de Organización
//
// Permite listar, crear, editar y eliminar brigadas ecológicas.
//
// Permisos:
//   - control:                  puede gestionar (crear/editar/eliminar)
//   - reporte_nacional + Organización: puede gestionar
//   - cualquier otro rol:       solo lectura
//
// Colección Firestore: /brigadas
//   { nombre, tipo, miembros, clasificacion, fechaConformacion,
//     ubicacion: { estado, municipio, parroquia, comuna, consejo },
//     estatus, responsable, telefono, observaciones,
//     creado, creadoPor, ... }
//
// Cascada territorial: estado → municipio → parroquia → comuna → consejo.

import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader, setBotonCargando } from "./auth.js";
import {
  ESTADOS_VENEZUELA,
  municipiosDe,
  parroquiasDe,
  comunasDe,
  consejosComunalesDe,
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
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Organización') return true;
  return false;
}

/* ==================== CÓDIGO ÚNICO ==================== */

/**
 * Genera un código único BRG-XXXXXX usando transacción atómica
 * sobre /contadores/brigadas.
 *
 * @returns {Promise<string>} Ej: "BRG-000007"
 */
async function generarCodigoUnicoBrigada() {
  const contadorRef = doc(db, 'contadores', 'brigadas');
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
  return `BRG-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */

export async function cargarPanelBrigadas() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('brigadasWarning');
  const formDiv = document.getElementById('formBrigada');
  const btnNueva = document.getElementById('btnNuevaBrigada');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);

  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Organización</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar brigadas. Vos podés ver la
          lista pero no editar.
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

  if (!window.__brigadasWired) {
    document.getElementById('btnNuevaBrigada')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarBrigada')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formBrigada')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarBrigada();
    });
    window.__brigadasWired = true;
  }

  await cargarListaBrigadas(perfil);
}

/* ==================== CASCADA ==================== */

function poblarEstados() {
  const sel = document.getElementById('bri_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('bri_estado');
  const selMunicipio = document.getElementById('bri_municipio');
  const selParroquia = document.getElementById('bri_parroquia');
  const selComuna    = document.getElementById('bri_comuna');
  const selConsejo   = document.getElementById('bri_consejo');

  if (!selEstado) return;

  selEstado.addEventListener('change', () => {
    const estado = selEstado.value;
    if (!estado) {
      resetSelect(selMunicipio);
      resetSelect(selParroquia);
      resetSelect(selComuna);
      resetSelect(selConsejo);
      return;
    }
    const muns = municipiosDe(estado);
    selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
      muns.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    selMunicipio.disabled = false;
    resetSelect(selParroquia);
    resetSelect(selComuna);
    resetSelect(selConsejo);
  });

  selMunicipio?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    if (!municipio) {
      resetSelect(selParroquia);
      resetSelect(selComuna);
      resetSelect(selConsejo);
      return;
    }
    const parr = parroquiasDe(estado, municipio);
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parr.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = false;
    resetSelect(selComuna);
    resetSelect(selConsejo);
  });

  selParroquia?.addEventListener('change', () => {
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    const parroquia = selParroquia.value;
    if (!parroquia) {
      resetSelect(selComuna);
      resetSelect(selConsejo);
      return;
    }
    const coms = comunasDe(estado, municipio, parroquia);
    selComuna.innerHTML = '<option value="">Seleccione...</option>' +
      coms.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selComuna.disabled = false;
    resetSelect(selConsejo);
  });

  selComuna?.addEventListener('change', () => {
    const comuna = selComuna.value;
    if (comuna === 'No Aplica') {
      selConsejo.innerHTML = '<option value="No Aplica" selected>— No Aplica —</option>';
      selConsejo.disabled = true;
      return;
    }
    if (!comuna) {
      resetSelect(selConsejo);
      return;
    }
    const estado = selEstado.value;
    const municipio = selMunicipio.value;
    const parroquia = selParroquia.value;
    const cons = consejosComunalesDe(estado, municipio, parroquia, comuna);
    selConsejo.innerHTML = '<option value="">Seleccione...</option>' +
      cons.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = false;
  });
}

/* ==================== ABRIR / CERRAR ==================== */

function abrirFormularioNuevo() {
  modoEdicionId = null;
  document.getElementById('formBrigada').reset();
  document.getElementById('formBrigada').style.display = 'block';
  document.getElementById('btnNuevaBrigada').style.display = 'none';
  document.getElementById('btnGuardarBrigada').innerHTML = '💾 Guardar brigada';

  resetSelect(document.getElementById('bri_municipio'));
  resetSelect(document.getElementById('bri_parroquia'));
  resetSelect(document.getElementById('bri_comuna'));
  resetSelect(document.getElementById('bri_consejo'));

  document.getElementById('formBrigada').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(b) {
  modoEdicionId = b.id;

  document.getElementById('bri_nombre').value = b.nombre || '';
  document.getElementById('bri_tipo').value = b.tipo || '';
  document.getElementById('bri_miembros').value = b.miembros || 1;
  document.getElementById('bri_clasificacion').value = b.clasificacion || '';
  document.getElementById('bri_fechaConformacion').value = b.fechaConformacion || '';
  document.getElementById('bri_responsable').value = b.responsable || '';
  document.getElementById('bri_telefono').value = b.telefono || '';
  document.getElementById('bri_estatus').value = b.estatus || 'activo';
  document.getElementById('bri_observaciones').value = b.observaciones || '';

  const ub = b.ubicacion || {};
  const selEstado = document.getElementById('bri_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));

  setTimeout(() => {
    document.getElementById('bri_municipio').value = ub.municipio || '';
    document.getElementById('bri_municipio').dispatchEvent(new Event('change'));

    setTimeout(() => {
      document.getElementById('bri_parroquia').value = ub.parroquia || '';
      document.getElementById('bri_parroquia').dispatchEvent(new Event('change'));

      setTimeout(() => {
        document.getElementById('bri_comuna').value = ub.comuna || '';
        document.getElementById('bri_comuna').dispatchEvent(new Event('change'));

        setTimeout(() => {
          document.getElementById('bri_consejo').value = ub.consejo || '';
        }, 30);
      }, 30);
    }, 30);
  }, 30);

  document.getElementById('formBrigada').style.display = 'block';
  document.getElementById('btnNuevaBrigada').style.display = 'none';
  document.getElementById('btnGuardarBrigada').innerHTML = '💾 Actualizar brigada';
  document.getElementById('formBrigada').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formBrigada').reset();
  document.getElementById('formBrigada').style.display = 'none';
  document.getElementById('btnNuevaBrigada').style.display = 'inline-flex';
  resetSelect(document.getElementById('bri_municipio'));
  resetSelect(document.getElementById('bri_parroquia'));
  resetSelect(document.getElementById('bri_comuna'));
  resetSelect(document.getElementById('bri_consejo'));
}

/* ==================== GUARDAR ==================== */

async function guardarBrigada() {
  const perfil = window.__perfil;
  if (!perfil) return;

  if (!usuarioPuedeGestionar(perfil)) {
    toast('No tienes permisos para guardar brigadas');
    return;
  }

  const nombre = document.getElementById('bri_nombre').value.trim();
  const tipo = document.getElementById('bri_tipo').value;
  const miembros = parseInt(document.getElementById('bri_miembros').value, 10) || 0;
  const clasificacion = document.getElementById('bri_clasificacion').value;
  const fechaConformacion = document.getElementById('bri_fechaConformacion').value;
  const estado = document.getElementById('bri_estado').value;
  const municipio = document.getElementById('bri_municipio').value;
  const parroquia = document.getElementById('bri_parroquia').value;
  const comuna = document.getElementById('bri_comuna').value;
  const consejo = document.getElementById('bri_consejo').value;
  const estatus = document.getElementById('bri_estatus').value;

  if (!nombre) return toast('Ingresa el nombre de la brigada');
  if (!tipo) return toast('Selecciona el tipo de brigada');
  if (miembros <= 0) return toast('Ingresa la cantidad de miembros');
  if (!clasificacion) return toast('Selecciona la clasificación por edades');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!comuna) return toast('Selecciona la comuna o "No Aplica"');
  if (!consejo) return toast('Selecciona el consejo comunal o "No Aplica"');

  const payload = {
    nombre,
    tipo,
    miembros,
    clasificacion,
    fechaConformacion: fechaConformacion || null,
    ubicacion: { estado, municipio, parroquia, comuna, consejo },
    estatus,
    responsable: document.getElementById('bri_responsable').value.trim(),
    telefono: document.getElementById('bri_telefono').value.trim(),
    observaciones: document.getElementById('bri_observaciones').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarBrigada');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'brigadas', modoEdicionId), payload);
      toast('Brigada actualizada');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      payload.codigoUnico = await generarCodigoUnicoBrigada();
      await addDoc(collection(db, 'brigadas'), payload);
      toast('Brigada registrada: ' + payload.codigoUnico);
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

async function cargarListaBrigadas(perfil) {
  const cont = document.getElementById('listaBrigadas');
  if (!cont) return;

  loader(true);
  try {
    const snap = await getDocs(collection(db, 'brigadas'));

    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">👥</span>
          <div class="empty-state-msg">No hay brigadas registradas</div>
          <div class="empty-state-hint">Usa el botón "Nueva brigada" para agregar la primera.</div>
        </div>`;
      return;
    }

    const brigadas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const puedeGestionar = usuarioPuedeGestionar(perfil);

    const filas = brigadas.map(b => {
      const ub = b.ubicacion || {};
      const ubicTexto = [ub.estado, ub.municipio, ub.parroquia].filter(Boolean).join(' › ');
      const badgeEstatus = b.estatus === 'activo'
        ? '<span class="badge bg-success">Activa</span>'
        : '<span class="badge bg-danger">Inactiva</span>';
      const nombreSeguro = escapeHTML(b.nombre || '');

      return `
        <tr>
          <td style="font-size: 11px; color: #666; font-family: monospace;">${escapeHTML(b.codigoUnico || '—')}</td>
          <td><strong>${nombreSeguro}</strong></td>
          <td style="font-size: 12px;">${escapeHTML(b.tipo || '')}</td>
          <td>${b.miembros || 0}</td>
          <td style="font-size: 12px;">${escapeHTML(b.clasificacion || '')}</td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td>${badgeEstatus}</td>
          <td>${escapeHTML(b.responsable || '—')}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${b.id}"
                        aria-label="Editar brigada ${nombreSeguro}">✏️</button>
                 <button class="btn btn-danger btn-sm" data-del="${b.id}"
                        aria-label="Eliminar brigada ${nombreSeguro}">🗑️</button>`
              : '—'}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Miembros</th>
              <th>Clasificación</th>
              <th>Ubicación</th>
              <th>Estatus</th>
              <th>Responsable</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const brigada = brigadas.find(x => x.id === b.dataset.edit);
        if (brigada) abrirFormularioEdicion(brigada);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarBrigada(b.dataset.del));
    });

  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar brigadas.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */

async function eliminarBrigada(id) {
  if (!confirm('¿Eliminar esta brigada? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'brigadas', id));
    toast('Brigada eliminada');
    await cargarListaBrigadas(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}