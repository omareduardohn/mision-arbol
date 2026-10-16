// js/comites.js
// Módulo de Comités Ecosocialistas — Gerencia de Organización
//
// Espejo de brigadas.js con código único COM-XXXXXX.
// Permisos: control + reporte_nacional (Organización) gestionan; el resto solo lectura.
//
// Colección Firestore: /comitesEcosocialistas
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
async function generarCodigoUnicoComite() {
  const contadorRef = doc(db, 'contadores', 'comites');
  const nuevo = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const ultimo = snap.exists() ? (Number(snap.data().ultimo) || 0) : 0;
    const siguiente = ultimo + 1;
    transaction.set(contadorRef, { ultimo: siguiente, actualizado: serverTimestamp() }, { merge: true });
    return siguiente;
  });
  return `COM-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */
export async function cargarPanelComites() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('comitesWarning');
  const formDiv = document.getElementById('formComite');
  const btnNueva = document.getElementById('btnNuevaComite');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);
  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Organización</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar comités ecosocialistas.
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

  if (!window.__comitesWired) {
    document.getElementById('btnNuevaComite')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarComite')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formComite')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarComite();
    });
    window.__comitesWired = true;
  }

  await cargarListaComites(perfil);
}

/* ==================== CASCADA ==================== */
function poblarEstados() {
  const sel = document.getElementById('cmt_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('cmt_estado');
  const selMunicipio = document.getElementById('cmt_municipio');
  const selParroquia = document.getElementById('cmt_parroquia');
  const selComuna    = document.getElementById('cmt_comuna');
  const selConsejo   = document.getElementById('cmt_consejo');
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
  document.getElementById('formComite').reset();
  document.getElementById('formComite').style.display = 'block';
  document.getElementById('btnNuevaComite').style.display = 'none';
  document.getElementById('btnGuardarComite').innerHTML = '💾 Guardar comité';
  resetSelect(document.getElementById('cmt_municipio'));
  resetSelect(document.getElementById('cmt_parroquia'));
  resetSelect(document.getElementById('cmt_comuna'));
  resetSelect(document.getElementById('cmt_consejo'));
  document.getElementById('formComite').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(c) {
  modoEdicionId = c.id;
  document.getElementById('cmt_nombre').value = c.nombre || '';
  document.getElementById('cmt_responsable').value = c.responsable || '';
  document.getElementById('cmt_telefono').value = c.telefono || '';
  document.getElementById('cmt_estatus').value = c.estatus || 'activo';
  document.getElementById('cmt_observaciones').value = c.observaciones || '';

  const ub = c.ubicacion || {};
  const selEstado = document.getElementById('cmt_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));
  setTimeout(() => {
    document.getElementById('cmt_municipio').value = ub.municipio || '';
    document.getElementById('cmt_municipio').dispatchEvent(new Event('change'));
    setTimeout(() => {
      document.getElementById('cmt_parroquia').value = ub.parroquia || '';
      document.getElementById('cmt_parroquia').dispatchEvent(new Event('change'));
      setTimeout(() => {
        document.getElementById('cmt_comuna').value = ub.comuna || '';
        document.getElementById('cmt_comuna').dispatchEvent(new Event('change'));
        setTimeout(() => {
          document.getElementById('cmt_consejo').value = ub.consejo || '';
        }, 30);
      }, 30);
    }, 30);
  }, 30);

  document.getElementById('formComite').style.display = 'block';
  document.getElementById('btnNuevaComite').style.display = 'none';
  document.getElementById('btnGuardarComite').innerHTML = '💾 Actualizar comité';
  document.getElementById('formComite').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formComite').reset();
  document.getElementById('formComite').style.display = 'none';
  document.getElementById('btnNuevaComite').style.display = 'inline-flex';
  resetSelect(document.getElementById('cmt_municipio'));
  resetSelect(document.getElementById('cmt_parroquia'));
  resetSelect(document.getElementById('cmt_comuna'));
  resetSelect(document.getElementById('cmt_consejo'));
}

/* ==================== GUARDAR ==================== */
async function guardarComite() {
  const perfil = window.__perfil;
  if (!perfil) return;
  if (!usuarioPuedeGestionar(perfil)) { toast('No tienes permisos para guardar comités'); return; }

  const nombre = document.getElementById('cmt_nombre').value.trim();
  const estado = document.getElementById('cmt_estado').value;
  const municipio = document.getElementById('cmt_municipio').value;
  const parroquia = document.getElementById('cmt_parroquia').value;
  const comuna = document.getElementById('cmt_comuna').value;
  const consejo = document.getElementById('cmt_consejo').value;
  const estatus = document.getElementById('cmt_estatus').value;

  if (!nombre) return toast('Ingresa el nombre del comité');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!comuna) return toast('Selecciona la comuna o "No Aplica"');
  if (!consejo) return toast('Selecciona el consejo comunal o "No Aplica"');

  const payload = {
    nombre,
    ubicacion: { estado, municipio, parroquia, comuna, consejo },
    estatus,
    responsable: document.getElementById('cmt_responsable').value.trim(),
    telefono: document.getElementById('cmt_telefono').value.trim(),
    observaciones: document.getElementById('cmt_observaciones').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarComite');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'comitesEcosocialistas', modoEdicionId), payload);
      toast('Comité actualizado');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      payload.codigoUnico = await generarCodigoUnicoComite();
      await addDoc(collection(db, 'comitesEcosocialistas'), payload);
      toast('Comité registrado: ' + payload.codigoUnico);
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
async function cargarListaComites(perfil) {
  const cont = document.getElementById('listaComites');
  if (!cont) return;
  loader(true);
  try {
    const snap = await getDocs(collection(db, 'comitesEcosocialistas'));
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🏛️</span>
          <div class="empty-state-msg">No hay comités ecosocialistas registrados</div>
          <div class="empty-state-hint">Usa el botón "Nuevo comité" para agregar el primero.</div>
        </div>`;
      return;
    }
    const comites = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    const puedeGestionar = usuarioPuedeGestionar(perfil);

    const filas = comites.map(c => {
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
        const c = comites.find(x => x.id === b.dataset.edit);
        if (c) abrirFormularioEdicion(c);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarComite(b.dataset.del));
    });
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar comités.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */
async function eliminarComite(id) {
  if (!confirm('¿Eliminar este comité? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'comitesEcosocialistas', id));
    toast('Comité eliminado');
    await cargarListaComites(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}
