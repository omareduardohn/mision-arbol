// js/viveros.js
// Módulo de Viveros — Gerencia de Producción
//
// Permite listar, crear, editar y eliminar viveros.
//
// Permisos:
//   - control:            puede gestionar (crear/editar/eliminar)
//   - reporte_nacional + Producción: puede gestionar
//   - cualquier otro rol: solo lectura
//
// Colección Firestore: /viveros
//   { nombre, tipo, ubicacion: { estado, municipio, parroquia, comuna, consejo },
//     capacidad, plantasActuales, estatus, responsable, telefono,
//     latitud, longitud, observaciones, creado, creadoPor, ... }
//
// Cascada territorial: estado → municipio → parroquia → comuna → consejo.

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
  comunasDe,
  consejosComunalesDe,
  cargarTerritorio,
  escapeHTML,
  resetSelect
} from "./datos.js";

/* ==================== ESTADO GLOBAL ==================== */
let modoEdicionId = null;
let _territorioCargado = false;

/* ==================== VERIFICACIÓN DE PERMISOS ==================== */

/**
 * Un usuario puede gestionar viveros si:
 * - Es control.
 * - Es reporte_nacional y su gerencia es Producción.
 */
function usuarioPuedeGestionar(perfil) {
  if (!perfil) return false;
  if (perfil.rol === 'control') return true;
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Producción') return true;
  return false;
}

/* ==================== CÓDIGO ÚNICO ==================== */

/**
 * Genera un código único VIV-XXXXXX usando una transacción atómica
 * sobre /contadores/viveros. Si dos usuarios crean al mismo tiempo,
 * Firestore serializa las transacciones y no se duplican números.
 *
 * @returns {Promise<string>} Ej: "VIV-000042"
 */
async function generarCodigoUnicoVivero() {
  const contadorRef = doc(db, 'contadores', 'viveros');
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
  return `VIV-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */

export async function cargarPanelViveros() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('viverosWarning');
  const formDiv = document.getElementById('formVivero');
  const btnNuevo = document.getElementById('btnNuevoVivero');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);

  // Si no puede gestionar, mostramos aviso y ocultamos el form
  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Producción</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar viveros. Vos podés ver la
          lista pero no editar.
        </p>
      </div>`;
  } else {
    warningDiv.innerHTML = '';
  }

  formDiv.style.display = 'none';
  btnNuevo.style.display = puedeGestionar ? 'inline-flex' : 'none';

  // Cargamos territorio una sola vez
  if (!_territorioCargado) {
    await cargarTerritorio();
    _territorioCargado = true;
    poblarEstados();
    wireCascada();
  }

  // Wiring del botón "Nuevo vivero"
  if (!window.__viverosWired) {
    document.getElementById('btnNuevoVivero')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarVivero')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formVivero')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarVivero();
    });
    window.__viverosWired = true;
  }

  await cargarListaViveros(perfil);
}

/* ==================== POBLAR ESTADOS + CASCADA ==================== */

function poblarEstados() {
  const sel = document.getElementById('viv_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('viv_estado');
  const selMunicipio = document.getElementById('viv_municipio');
  const selParroquia = document.getElementById('viv_parroquia');
  const selComuna    = document.getElementById('viv_comuna');
  const selConsejo   = document.getElementById('viv_consejo');

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

/* ==================== ABRIR / CERRAR FORM ==================== */

function abrirFormularioNuevo() {
  modoEdicionId = null;
  document.getElementById('formVivero').reset();
  document.getElementById('formVivero').style.display = 'block';
  document.getElementById('btnNuevoVivero').style.display = 'none';
  document.getElementById('btnGuardarVivero').innerHTML = '💾 Guardar vivero';

  // Reset selects cascade
  resetSelect(document.getElementById('viv_municipio'));
  resetSelect(document.getElementById('viv_parroquia'));
  resetSelect(document.getElementById('viv_comuna'));
  resetSelect(document.getElementById('viv_consejo'));

  document.getElementById('formVivero').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(v) {
  modoEdicionId = v.id;

  document.getElementById('viv_nombre').value = v.nombre || '';
  document.getElementById('viv_tipo').value = v.tipo || '';
  document.getElementById('viv_capacidad').value = v.capacidad || 0;
  document.getElementById('viv_plantasActuales').value = v.plantasActuales || 0;
  document.getElementById('viv_estatus').value = v.estatus || 'activo';
  document.getElementById('viv_responsable').value = v.responsable || '';
  document.getElementById('viv_telefono').value = v.telefono || '';
  document.getElementById('viv_observaciones').value = v.observaciones || '';
  document.getElementById('viv_lat').value = v.latitud || '';
  document.getElementById('viv_lng').value = v.longitud || '';

  // Cargar cascada territorial
  const ub = v.ubicacion || {};
  const selEstado = document.getElementById('viv_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));

  setTimeout(() => {
    document.getElementById('viv_municipio').value = ub.municipio || '';
    document.getElementById('viv_municipio').dispatchEvent(new Event('change'));

    setTimeout(() => {
      document.getElementById('viv_parroquia').value = ub.parroquia || '';
      document.getElementById('viv_parroquia').dispatchEvent(new Event('change'));

      setTimeout(() => {
        document.getElementById('viv_comuna').value = ub.comuna || '';
        document.getElementById('viv_comuna').dispatchEvent(new Event('change'));

        setTimeout(() => {
          document.getElementById('viv_consejo').value = ub.consejo || '';
        }, 30);
      }, 30);
    }, 30);
  }, 30);

  document.getElementById('formVivero').style.display = 'block';
  document.getElementById('btnNuevoVivero').style.display = 'none';
  document.getElementById('btnGuardarVivero').innerHTML = '💾 Actualizar vivero';
  document.getElementById('formVivero').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formVivero').reset();
  document.getElementById('formVivero').style.display = 'none';
  document.getElementById('btnNuevoVivero').style.display = 'inline-flex';
  resetSelect(document.getElementById('viv_municipio'));
  resetSelect(document.getElementById('viv_parroquia'));
  resetSelect(document.getElementById('viv_comuna'));
  resetSelect(document.getElementById('viv_consejo'));
}

/* ==================== GUARDAR ==================== */

async function guardarVivero() {
  const perfil = window.__perfil;
  if (!perfil) return;

  if (!usuarioPuedeGestionar(perfil)) {
    toast('No tienes permisos para guardar viveros');
    return;
  }

  // Validaciones
  const nombre = document.getElementById('viv_nombre').value.trim();
  const tipo = document.getElementById('viv_tipo').value;
  const estado = document.getElementById('viv_estado').value;
  const municipio = document.getElementById('viv_municipio').value;
  const parroquia = document.getElementById('viv_parroquia').value;
  const comuna = document.getElementById('viv_comuna').value;
  const consejo = document.getElementById('viv_consejo').value;
  const estatus = document.getElementById('viv_estatus').value;

  if (!nombre) return toast('Ingresa el nombre del vivero');
  if (!tipo) return toast('Selecciona el tipo de vivero');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!comuna) return toast('Selecciona la comuna o "No Aplica"');
  if (!consejo) return toast('Selecciona el consejo comunal o "No Aplica"');

  const payload = {
    nombre,
    tipo,
    ubicacion: { estado, municipio, parroquia, comuna, consejo },
    capacidad: parseInt(document.getElementById('viv_capacidad').value, 10) || 0,
    plantasActuales: parseInt(document.getElementById('viv_plantasActuales').value, 10) || 0,
    estatus,
    responsable: document.getElementById('viv_responsable').value.trim(),
    telefono: document.getElementById('viv_telefono').value.trim(),
    observaciones: document.getElementById('viv_observaciones').value.trim(),
    latitud: document.getElementById('viv_lat').value.trim(),
    longitud: document.getElementById('viv_lng').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarVivero');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'viveros', modoEdicionId), payload);
      toast('Vivero actualizado');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      // 🔑 Código único: se genera justo antes de crear el doc.
      // Si el addDoc falla después, el número se "quema" (no se reutiliza),
      // lo cual es aceptable — solo necesitamos unicidad, no secuencia perfecta.
      payload.codigoUnico = await generarCodigoUnicoVivero();
      await addDoc(collection(db, 'viveros'), payload);
      toast('Vivero registrado: ' + payload.codigoUnico);
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

async function cargarListaViveros(perfil) {
  const cont = document.getElementById('listaViveros');
  if (!cont) return;

  loader(true);
  try {
    // Filtro según rol:
    // - control: todos
    // - reporte_nacional (Producción): solo viveros del mismo estado
    let ref = collection(db, 'viveros');
    let q = ref;
    if (perfil.rol === 'reporte_nacional' && perfil.estado) {
      q = query(ref, where('ubicacion.estado', '==', perfil.estado));
    }
    const snap = await getDocs(q);

    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🏡</span>
          <div class="empty-state-msg">No hay viveros registrados</div>
          <div class="empty-state-hint">Usa el botón "Nuevo vivero" para agregar el primero.</div>
        </div>`;
      return;
    }

    const viveros = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const puedeGestionar = usuarioPuedeGestionar(perfil);

    const filas = viveros.map(v => {
      const ub = v.ubicacion || {};
      const ubicTexto = [ub.estado, ub.municipio, ub.parroquia].filter(Boolean).join(' › ');
      const badgeEstatus = v.estatus === 'activo'
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-danger">Inactivo</span>';
      const nombreSeguro = escapeHTML(v.nombre || '');

      return `
        <tr>
          <td style="font-size: 11px; color: #666; font-family: monospace;">${escapeHTML(v.codigoUnico || '—')}</td>
          <td><strong>${nombreSeguro}</strong></td>
          <td style="font-size: 12px;">${escapeHTML(v.tipo || '')}</td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td>${v.plantasActuales || 0} / ${v.capacidad || 0}</td>
          <td>${badgeEstatus}</td>
          <td>${escapeHTML(v.responsable || '—')}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${v.id}"
                        aria-label="Editar vivero ${nombreSeguro}">✏️</button>
                 <button class="btn btn-danger btn-sm" data-del="${v.id}"
                        aria-label="Eliminar vivero ${nombreSeguro}">🗑️</button>`
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
              <th>Ubicación</th>
              <th>Plantas</th>
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
        const v = viveros.find(x => x.id === b.dataset.edit);
        if (v) abrirFormularioEdicion(v);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarVivero(b.dataset.del));
    });

  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar viveros.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */

async function eliminarVivero(id) {
  if (!confirm('¿Eliminar este vivero? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'viveros', id));
    toast('Vivero eliminado');
    await cargarListaViveros(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}