// js/consejos.js
// Módulo de Consejos Ecosocialistas — Gerencia de Organización
//
// Espejo de comites.js con código único CON-XXXXXX.
// Permisos: control + reporte_nacional (Organización) gestionan; el resto solo lectura.
//
// Colección Firestore: /consejosEcosocialistas
//   { codigoUnico, nombre, ubicacion:{estado,municipio,parroquia,comuna,consejo},
//     estatus, responsable, telefono, observaciones, creado, creadoPor, creadoPorNombre }

import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader, setBotonCargando } from "./auth.js";
import {
  ESTADOS_VENEZUELA, municipiosDe, parroquiasDe, comunasDe, consejosComunalesDe,
  cargarTerritorio, escapeHTML, resetSelect
} from "./datos.js";

let modoEdicionId = null;
let _territorioCargado = false;

function usuarioPuedeGestionar(perfil) {
  if (!perfil) return false;
  if (perfil.rol === 'control') return true;
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Organización') return true;
  return false;
}

/* ==================== CÓDIGO ÚNICO ==================== */
async function generarCodigoUnicoConsejo() {
  const contadorRef = doc(db, 'contadores', 'consejos');
  const nuevo = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const ultimo = snap.exists() ? (Number(snap.data().ultimo) || 0) : 0;
    const siguiente = ultimo + 1;
    transaction.set(contadorRef, { ultimo: siguiente, actualizado: serverTimestamp() }, { merge: true });
    return siguiente;
  });
  return `CON-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */
export async function cargarPanelConsejos() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('consejosWarning');
  const formDiv = document.getElementById('formConsejo');
  const btnNueva = document.getElementById('btnNuevaConsejo');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);
  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Organización</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar consejos ecosocialistas.
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

  if (!window.__consejosWired) {
    document.getElementById('btnNuevaConsejo')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarConsejo')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formConsejo')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarConsejo();
    });
    window.__consejosWired = true;
  }

  await cargarListaConsejos(perfil);
}

/* ==================== CASCADA ==================== */
function poblarEstados() {
  const sel = document.getElementById('cjo_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('cjo_estado');
  const selMunicipio = document.getElementById('cjo_municipio');
  const selParroquia = document.getElementById('cjo_parroquia');
  const selComuna    = document.getElementById('cjo_comuna');
  const selConsejo   = document.getElementById('cjo_consejo');
  if (!selEstado) return;

  selEstado.addEventListener('change', () => {
    const estado = selEstado.value;
    if (!estado) {
      resetSelect(selMunicipio); resetSelect(selParroquia); resetSelect(selComuna); resetSelect(selConsejo);
      return;
    }
    selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
      municipiosDe(estado).map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    selMunicipio.disabled = false;
    resetSelect(selParroquia); resetSelect(selComuna); resetSelect(selConsejo);
  });

  selMunicipio?.addEventListener('change', () => {
    const estado = selEstado.value, municipio = selMunicipio.value;
    if (!municipio) { resetSelect(selParroquia); resetSelect(selComuna); resetSelect(selConsejo); return; }
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parroquiasDe(estado, municipio).map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = false;
    resetSelect(selComuna); resetSelect(selConsejo);
  });

  selParroquia?.addEventListener('change', () => {
    const estado = selEstado.value, municipio = selMunicipio.value, parroquia = selParroquia.value;
    if (!parroquia) { resetSelect(selComuna); resetSelect(selConsejo); return; }
    selComuna.innerHTML = '<option value="">Seleccione...</option>' +
      comunasDe(estado, municipio, parroquia).map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
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
    if (!comuna) { resetSelect(selConsejo); return; }
    const estado = selEstado.value, municipio = selMunicipio.value, parroquia = selParroquia.value;
    selConsejo.innerHTML = '<option value="">Seleccione...</option>' +
      consejosComunalesDe(estado, municipio, parroquia, comuna).map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
      '<option value="No Aplica">— No Aplica —</option>';
    selConsejo.disabled = false;
  });
}

/* ==================== ABRIR / CERRAR ==================== */
function abrirFormularioNuevo() {
  modoEdicionId = null;
  document.getElementById('formConsejo').reset();
  document.getElementById('formConsejo').style.display = 'block';
  document.getElementById('btnNuevaConsejo').style.display = 'none';
  document.getElementById('btnGuardarConsejo').innerHTML = '💾 Guardar consejo';
  resetSelect(document.getElementById('cjo_municipio'));
  resetSelect(document.getElementById('cjo_parroquia'));
  resetSelect(document.getElementById('cjo_comuna'));
  resetSelect(document.getElementById('cjo_consejo'));
  document.getElementById('formConsejo').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(c) {
  modoEdicionId = c.id;
  document.getElementById('cjo_nombre').value = c.nombre || '';
  document.getElementById('cjo_responsable').value = c.responsable || '';
  document.getElementById('cjo_telefono').value = c.telefono || '';
  document.getElementById('cjo_estatus').value = c.estatus || 'activo';
  document.getElementById('cjo_observaciones').value = c.observaciones || '';

  const ub = c.ubicacion || {};
  const selEstado = document.getElementById('cjo_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));
  setTimeout(() => {
    document.getElementById('cjo_municipio').value = ub.municipio || '';
    document.getElementById('cjo_municipio').dispatchEvent(new Event('change'));
    setTimeout(() => {
      document.getElementById('cjo_parroquia').value = ub.parroquia || '';
      document.getElementById('cjo_parroquia').dispatchEvent(new Event('change'));
      setTimeout(() => {
        document.getElementById('cjo_comuna').value = ub.comuna || '';
        document.getElementById('cjo_comuna').dispatchEvent(new Event('change'));
        setTimeout(() => {
          document.getElementById('cjo_consejo').value = ub.consejo || '';
        }, 30);
      }, 30);
    }, 30);
  }, 30);

  document.getElementById('formConsejo').style.display = 'block';
  document.getElementById('btnNuevaConsejo').style.display = 'none';
  document.getElementById('btnGuardarConsejo').innerHTML = '💾 Actualizar consejo';
  document.getElementById('formConsejo').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formConsejo').reset();
  document.getElementById('formConsejo').style.display = 'none';
  document.getElementById('btnNuevaConsejo').style.display = 'inline-flex';
  resetSelect(document.getElementById('cjo_municipio'));
  resetSelect(document.getElementById('cjo_parroquia'));
  resetSelect(document.getElementById('cjo_comuna'));
  resetSelect(document.getElementById('cjo_consejo'));
}

/* ==================== GUARDAR ==================== */
async function guardarConsejo() {
  const perfil = window.__perfil;
  if (!perfil) return;
  if (!usuarioPuedeGestionar(perfil)) { toast('No tienes permisos para guardar consejos'); return; }

  const nombre = document.getElementById('cjo_nombre').value.trim();
  const estado = document.getElementById('cjo_estado').value;
  const municipio = document.getElementById('cjo_municipio').value;
  const parroquia = document.getElementById('cjo_parroquia').value;
  const comuna = document.getElementById('cjo_comuna').value;
  const consejo = document.getElementById('cjo_consejo').value;
  const estatus = document.getElementById('cjo_estatus').value;

  if (!nombre) return toast('Ingresa el nombre del consejo');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!comuna) return toast('Selecciona la comuna o "No Aplica"');
  if (!consejo) return toast('Selecciona el consejo comunal o "No Aplica"');

  const payload = {
    nombre,
    ubicacion: { estado, municipio, parroquia, comuna, consejo },
    estatus,
    responsable: document.getElementById('cjo_responsable').value.trim(),
    telefono: document.getElementById('cjo_telefono').value.trim(),
    observaciones: document.getElementById('cjo_observaciones').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarConsejo');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'consejosEcosocialistas', modoEdicionId), payload);
      toast('Consejo actualizado');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      payload.codigoUnico = await generarCodigoUnicoConsejo();
      await addDoc(collection(db, 'consejosEcosocialistas'), payload);
      toast('Consejo registrado: ' + payload.codigoUnico);
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
async function cargarListaConsejos(perfil) {
  const cont = document.getElementById('listaConsejos');
  if (!cont) return;
  loader(true);
  try {
    const snap = await getDocs(collection(db, 'consejosEcosocialistas'));
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🏘️</span>
          <div class="empty-state-msg">No hay consejos ecosocialistas registrados</div>
          <div class="empty-state-hint">Usa el botón "Nuevo consejo" para agregar el primero.</div>
        </div>`;
      return;
    }
    const consejos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    const puedeGestionar = usuarioPuedeGestionar(perfil);

    const filas = consejos.map(c => {
      const ub = c.ubicacion || {};
      const ubicTexto = [ub.estado, ub.municipio, ub.parroquia].filter(Boolean).join(' › ');
      const badge = c.estatus === 'activo'
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-danger">Inactivo</span>';
      const nombreSeguro = escapeHTML(c.nombre || '');
      return `
        <tr>
          <td style="font-size: 11px; color: #666; font-family: monospace;">${escapeHTML(c.codigoUnico || '—')}</td>
          <td><strong>${nombreSeguro}</strong></td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td>${badge}</td>
          <td>${escapeHTML(c.responsable || '—')}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${c.id}" aria-label="Editar ${nombreSeguro}">✏️</button>
                 <button class="btn btn-danger btn-sm" data-del="${c.id}" aria-label="Eliminar ${nombreSeguro}">🗑️</button>`
              : '—'}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead><tr><th>Código</th><th>Nombre</th><th>Ubicación</th><th>Estatus</th><th>Responsable</th><th>Acciones</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const c = consejos.find(x => x.id === b.dataset.edit);
        if (c) abrirFormularioEdicion(c);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarConsejo(b.dataset.del));
    });
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar consejos.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */
async function eliminarConsejo(id) {
  if (!confirm('¿Eliminar este consejo? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'consejosEcosocialistas', id));
    toast('Consejo eliminado');
    await cargarListaConsejos(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}
