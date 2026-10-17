// js/nucleos.js
// Módulo de Núcleos Formativos — Gerencia de Formación
//
// Código único NUC-XXXXXX. Se vincula a una brigada, comité o consejo
// ecosocialista vía `vinculadoA: { tipo, id }`.
//
// Colección Firestore: /nucleos
//   { codigoUnico, nombre, territorio:{estado,municipio,parroquia},
//     vinculadoA:{tipo:'brigada'|'comite'|'consejo', id}, estatus,
//     responsable, telefono, observaciones, creado, creadoPor, creadoPorNombre }

import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  serverTimestamp, runTransaction, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader, setBotonCargando } from "./auth.js";
import {
  ESTADOS_VENEZUELA, municipiosDe, parroquiasDe,
  cargarTerritorio, escapeHTML, resetSelect
} from "./datos.js";

let modoEdicionId = null;
let _territorioCargado = false;

const TIPOS_VINCULO = [
  { id: 'brigada', label: 'Brigada Ecosocialista', coleccion: 'brigadas' },
  { id: 'comite',  label: 'Comité Ecosocialista', coleccion: 'comitesEcosocialistas' },
  { id: 'consejo', label: 'Consejo Ecosocialista', coleccion: 'consejosEcosocialistas' }
];

function usuarioPuedeGestionar(perfil) {
  if (!perfil) return false;
  if (perfil.rol === 'control') return true;
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Formación') return true;
  return false;
}

/* ==================== CÓDIGO ÚNICO ==================== */
async function generarCodigoUnicoNucleo() {
  const contadorRef = doc(db, 'contadores', 'nucleos');
  const nuevo = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(contadorRef);
    const ultimo = snap.exists() ? (Number(snap.data().ultimo) || 0) : 0;
    const siguiente = ultimo + 1;
    transaction.set(contadorRef, { ultimo: siguiente, actualizado: serverTimestamp() }, { merge: true });
    return siguiente;
  });
  return `NUC-${String(nuevo).padStart(6, '0')}`;
}

/* ==================== CARGA PRINCIPAL ==================== */
export async function cargarPanelNucleos() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('nucleosWarning');
  const formDiv = document.getElementById('formNucleo');
  const btnNueva = document.getElementById('btnNuevoNucleo');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);
  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Formación</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar núcleos formativos.
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
    wireVinculoTipo();
  }

  if (!window.__nucleosWired) {
    document.getElementById('btnNuevoNucleo')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarNucleo')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formNucleo')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarNucleo();
    });
    window.__nucleosWired = true;
  }

  await cargarListaNucleos(perfil);
}

/* ==================== CASCADA TERRITORIAL ==================== */
function poblarEstados() {
  const sel = document.getElementById('nuc_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('nuc_estado');
  const selMunicipio = document.getElementById('nuc_municipio');
  const selParroquia = document.getElementById('nuc_parroquia');
  if (!selEstado) return;

  selEstado.addEventListener('change', () => {
    const estado = selEstado.value;
    if (!estado) { resetSelect(selMunicipio); resetSelect(selParroquia); return; }
    selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
      municipiosDe(estado).map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    selMunicipio.disabled = false;
    resetSelect(selParroquia);
  });

  selMunicipio?.addEventListener('change', () => {
    const estado = selEstado.value, municipio = selMunicipio.value;
    if (!municipio) { resetSelect(selParroquia); return; }
    selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
      parroquiasDe(estado, municipio).map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    selParroquia.disabled = false;
  });
}

/* ==================== VINCULACIÓN (brigada/comité/consejo) ==================== */
function wireVinculoTipo() {
  const selTipo = document.getElementById('nuc_vinculo_tipo');
  if (!selTipo) return;
  selTipo.addEventListener('change', () => poblarVinculoId(selTipo.value));
}

async function poblarVinculoId(tipo, idSeleccionado) {
  const sel = document.getElementById('nuc_vinculo_id');
  if (!sel) return;
  const tipoVinculo = TIPOS_VINCULO.find(t => t.id === tipo);
  if (!tipoVinculo) {
    sel.innerHTML = '<option value="">Seleccione el tipo primero...</option>';
    sel.disabled = true;
    return;
  }
  sel.innerHTML = '<option value="">Cargando...</option>';
  sel.disabled = false;
  try {
    // F12: Las reglas de Fase 6 permiten a Formación leer brigadas/comités/consejos,
    // así que la lectura debería funcionar sin problemas.
    const snap = await getDocs(collection(db, tipoVinculo.coleccion));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    if (docs.length === 0) {
      sel.innerHTML = '<option value="">Sin registros</option>';
      return;
    }
    sel.innerHTML = '<option value="">Seleccione...</option>' +
      docs.map(d => {
        const nom = d.nombre || '—';
        return `<option value="${escapeHTML(d.id)}" ${d.id === idSeleccionado ? 'selected' : ''}>${escapeHTML(nom)}${d.codigoUnico ? ' (' + escapeHTML(d.codigoUnico) + ')' : ''}</option>`;
      }).join('');
  } catch (e) {
    console.warn('[Núcleos] No se pudo cargar vínculos:', e);
    sel.innerHTML = '<option value="">No disponible (verifica permisos)</option>';
  }
}

/* ==================== ABRIR / CERRAR ==================== */
function abrirFormularioNuevo() {
  modoEdicionId = null;
  document.getElementById('formNucleo').reset();
  document.getElementById('formNucleo').style.display = 'block';
  document.getElementById('btnNuevoNucleo').style.display = 'none';
  document.getElementById('btnGuardarNucleo').innerHTML = '💾 Guardar núcleo';
  resetSelect(document.getElementById('nuc_municipio'));
  resetSelect(document.getElementById('nuc_parroquia'));
  const selId = document.getElementById('nuc_vinculo_id');
  selId.innerHTML = '<option value="">Seleccione el tipo primero...</option>';
  selId.disabled = true;
  document.getElementById('formNucleo').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(n) {
  modoEdicionId = n.id;
  document.getElementById('nuc_nombre').value = n.nombre || '';
  document.getElementById('nuc_responsable').value = n.responsable || '';
  document.getElementById('nuc_telefono').value = n.telefono || '';
  document.getElementById('nuc_estatus').value = n.estatus || 'activo';
  document.getElementById('nuc_observaciones').value = n.observaciones || '';

  const ter = n.territorio || {};
  const selEstado = document.getElementById('nuc_estado');
  selEstado.value = ter.estado || '';
  selEstado.dispatchEvent(new Event('change'));
  setTimeout(() => {
    document.getElementById('nuc_municipio').value = ter.municipio || '';
    document.getElementById('nuc_municipio').dispatchEvent(new Event('change'));
    setTimeout(() => {
      document.getElementById('nuc_parroquia').value = ter.parroquia || '';
    }, 30);
  }, 30);

  const vin = n.vinculadoA || {};
  document.getElementById('nuc_vinculo_tipo').value = vin.tipo || '';
  if (vin.tipo) poblarVinculoId(vin.tipo, vin.id);

  document.getElementById('formNucleo').style.display = 'block';
  document.getElementById('btnNuevoNucleo').style.display = 'none';
  document.getElementById('btnGuardarNucleo').innerHTML = '💾 Actualizar núcleo';
  document.getElementById('formNucleo').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formNucleo').reset();
  document.getElementById('formNucleo').style.display = 'none';
  document.getElementById('btnNuevoNucleo').style.display = 'inline-flex';
  resetSelect(document.getElementById('nuc_municipio'));
  resetSelect(document.getElementById('nuc_parroquia'));
  const selId = document.getElementById('nuc_vinculo_id');
  selId.innerHTML = '<option value="">Seleccione el tipo primero...</option>';
  selId.disabled = true;
}

/* ==================== GUARDAR ==================== */
async function guardarNucleo() {
  const perfil = window.__perfil;
  if (!perfil) return;
  if (!usuarioPuedeGestionar(perfil)) { toast('No tienes permisos para guardar núcleos'); return; }

  const nombre = document.getElementById('nuc_nombre').value.trim();
  const estado = document.getElementById('nuc_estado').value;
  const municipio = document.getElementById('nuc_municipio').value;
  const parroquia = document.getElementById('nuc_parroquia').value;
  const estatus = document.getElementById('nuc_estatus').value;
  const vinculoTipo = document.getElementById('nuc_vinculo_tipo').value;
  const vinculoId = document.getElementById('nuc_vinculo_id').value;

  if (!nombre) return toast('Ingresa el nombre del núcleo');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!vinculoTipo) return toast('Selecciona el tipo de vínculo');
  if (!vinculoId) return toast('Selecciona la brigada/comité/consejo vinculado');

  const payload = {
    nombre,
    territorio: { estado, municipio, parroquia },
    vinculadoA: { tipo: vinculoTipo, id: vinculoId },
    estatus,
    responsable: document.getElementById('nuc_responsable').value.trim(),
    telefono: document.getElementById('nuc_telefono').value.trim(),
    observaciones: document.getElementById('nuc_observaciones').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarNucleo');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'nucleos', modoEdicionId), payload);
      toast('Núcleo actualizado');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      payload.codigoUnico = await generarCodigoUnicoNucleo();
      await addDoc(collection(db, 'nucleos'), payload);
      toast('Núcleo registrado: ' + payload.codigoUnico);
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
async function cargarListaNucleos(perfil) {
  const cont = document.getElementById('listaNucleos');
  if (!cont) return;
  loader(true);
  try {
    // F11: filtro territorial para reporte_estadal (las reglas ya limitan)
    let q = collection(db, 'nucleos');
    if (perfil.rol === 'reporte_estadal' && perfil.estado) {
      q = query(q, where('territorio.estado', '==', perfil.estado));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🎓</span>
          <div class="empty-state-msg">No hay núcleos formativos registrados</div>
          <div class="empty-state-hint">Usa el botón "Nuevo núcleo" para agregar el primero.</div>
        </div>`;
      return;
    }
    const nucleos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    const puedeGestionar = usuarioPuedeGestionar(perfil);
    const puedeEliminar = perfil?.rol === 'control' ||
                          (perfil?.rol === 'reporte_nacional' && perfil?.gerencia === 'Formación');

    const filas = nucleos.map(n => {
      const ter = n.territorio || {};
      const terTexto = [ter.estado, ter.municipio, ter.parroquia].filter(Boolean).join(' › ');
      const vin = n.vinculadoA || {};
      const tipoVinculo = TIPOS_VINCULO.find(t => t.id === vin.tipo)?.label || vin.tipo || '—';
      const badge = n.estatus === 'activo'
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-danger">Inactivo</span>';
      const nombreSeguro = escapeHTML(n.nombre || '');
      return `
        <tr>
          <td style="font-size: 11px; color: #666; font-family: monospace;">${escapeHTML(n.codigoUnico || '—')}</td>
          <td><strong>${nombreSeguro}</strong></td>
          <td style="font-size: 12px;">${escapeHTML(terTexto)}</td>
          <td style="font-size: 12px;">${escapeHTML(tipoVinculo)}</td>
          <td>${badge}</td>
          <td>${escapeHTML(n.responsable || '—')}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${n.id}" aria-label="Editar ${nombreSeguro}">✏️</button>`
              : ''}
            ${puedeEliminar
              ? `<button class="btn btn-danger btn-sm" data-del="${n.id}" aria-label="Eliminar ${nombreSeguro}">🗑️</button>`
              : ''}
            ${!puedeGestionar && !puedeEliminar ? '—' : ''}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead><tr><th>Código</th><th>Nombre</th><th>Territorio</th><th>Vinculado a</th><th>Estatus</th><th>Responsable</th><th>Acciones</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-edit]').forEach(b => {
      b.addEventListener('click', () => {
        const n = nucleos.find(x => x.id === b.dataset.edit);
        if (n) abrirFormularioEdicion(n);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarNucleo(b.dataset.del));
    });
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar núcleos.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */
async function eliminarNucleo(id) {
  if (!confirm('¿Eliminar este núcleo? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'nucleos', id));
    toast('Núcleo eliminado');
    await cargarListaNucleos(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}
