// js/bancosTierra.js
// Módulo de Bancos de Tierra — Gerencia de Plantación
//
// Permite listar, crear, editar y eliminar bancos de tierra.
//
// Permisos:
//   - control:               puede gestionar (crear/editar/eliminar)
//   - reporte_nacional + Plantación: puede gestionar
//   - cualquier otro rol:    solo lectura
//
// Colección Firestore: /bancosTierra
//   { nombre, superficie, tipoSuelo, afectacion,
//     ubicacion: { estado, municipio, parroquia, comuna, consejo },
//     vegetacion, estatus, responsable, telefono, observaciones,
//     latitud, longitud, creado, creadoPor, ... }
//
// Cascada territorial: estado → municipio → parroquia → comuna → consejo.

import {
  collection, addDoc, getDocs, query, doc, updateDoc, deleteDoc,
  serverTimestamp
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
  if (perfil.rol === 'reporte_nacional' && perfil.gerencia === 'Plantación') return true;
  return false;
}

/* ==================== CARGA PRINCIPAL ==================== */

export async function cargarPanelBancos() {
  const perfil = window.__perfil;
  const warningDiv = document.getElementById('bancosWarning');
  const formDiv = document.getElementById('formBanco');
  const btnNuevo = document.getElementById('btnNuevoBanco');

  if (!perfil || !warningDiv) return;

  const puedeGestionar = usuarioPuedeGestionar(perfil);

  if (!puedeGestionar) {
    warningDiv.innerHTML = `
      <div class="subpanel" style="background:#fff8e1; border-left: 5px solid #ffc107;">
        <strong style="color:#856404;">⚠️ Módulo solo lectura</strong>
        <p style="margin-top:4px; font-size:13px; color:#856404;">
          Solo la <strong>Gerencia de Plantación</strong> y el <strong>Control y
          Seguimiento</strong> pueden crear y modificar bancos de tierra. Vos podés
          ver la lista pero no editar.
        </p>
      </div>`;
  } else {
    warningDiv.innerHTML = '';
  }

  formDiv.style.display = 'none';
  btnNuevo.style.display = puedeGestionar ? 'inline-flex' : 'none';

  if (!_territorioCargado) {
    await cargarTerritorio();
    _territorioCargado = true;
    poblarEstados();
    wireCascada();
  }

  if (!window.__bancosWired) {
    document.getElementById('btnNuevoBanco')?.addEventListener('click', abrirFormularioNuevo);
    document.getElementById('btnCancelarBanco')?.addEventListener('click', cerrarFormulario);
    document.getElementById('formBanco')?.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarBanco();
    });
    window.__bancosWired = true;
  }

  await cargarListaBancos(perfil);
}

/* ==================== CASCADA ==================== */

function poblarEstados() {
  const sel = document.getElementById('ban_estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>' +
    ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
}

function wireCascada() {
  const selEstado    = document.getElementById('ban_estado');
  const selMunicipio = document.getElementById('ban_municipio');
  const selParroquia = document.getElementById('ban_parroquia');
  const selComuna    = document.getElementById('ban_comuna');
  const selConsejo   = document.getElementById('ban_consejo');

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
  document.getElementById('formBanco').reset();
  document.getElementById('formBanco').style.display = 'block';
  document.getElementById('btnNuevoBanco').style.display = 'none';
  document.getElementById('btnGuardarBanco').innerHTML = '💾 Guardar banco';

  resetSelect(document.getElementById('ban_municipio'));
  resetSelect(document.getElementById('ban_parroquia'));
  resetSelect(document.getElementById('ban_comuna'));
  resetSelect(document.getElementById('ban_consejo'));

  document.getElementById('formBanco').scrollIntoView({ behavior: 'smooth' });
}

function abrirFormularioEdicion(b) {
  modoEdicionId = b.id;

  document.getElementById('ban_nombre').value = b.nombre || '';
  document.getElementById('ban_superficie').value = b.superficie || 0;
  document.getElementById('ban_tipoSuelo').value = b.tipoSuelo || '';
  document.getElementById('ban_afectacion').value = b.afectacion || '';
  document.getElementById('ban_vegetacion').value = b.vegetacion || '';
  document.getElementById('ban_estatus').value = b.estatus || 'activo';
  document.getElementById('ban_responsable').value = b.responsable || '';
  document.getElementById('ban_telefono').value = b.telefono || '';
  document.getElementById('ban_observaciones').value = b.observaciones || '';
  document.getElementById('ban_lat').value = b.latitud || '';
  document.getElementById('ban_lng').value = b.longitud || '';

  const ub = b.ubicacion || {};
  const selEstado = document.getElementById('ban_estado');
  selEstado.value = ub.estado || '';
  selEstado.dispatchEvent(new Event('change'));

  setTimeout(() => {
    document.getElementById('ban_municipio').value = ub.municipio || '';
    document.getElementById('ban_municipio').dispatchEvent(new Event('change'));

    setTimeout(() => {
      document.getElementById('ban_parroquia').value = ub.parroquia || '';
      document.getElementById('ban_parroquia').dispatchEvent(new Event('change'));

      setTimeout(() => {
        document.getElementById('ban_comuna').value = ub.comuna || '';
        document.getElementById('ban_comuna').dispatchEvent(new Event('change'));

        setTimeout(() => {
          document.getElementById('ban_consejo').value = ub.consejo || '';
        }, 30);
      }, 30);
    }, 30);
  }, 30);

  document.getElementById('formBanco').style.display = 'block';
  document.getElementById('btnNuevoBanco').style.display = 'none';
  document.getElementById('btnGuardarBanco').innerHTML = '💾 Actualizar banco';
  document.getElementById('formBanco').scrollIntoView({ behavior: 'smooth' });
}

function cerrarFormulario() {
  modoEdicionId = null;
  document.getElementById('formBanco').reset();
  document.getElementById('formBanco').style.display = 'none';
  document.getElementById('btnNuevoBanco').style.display = 'inline-flex';
  resetSelect(document.getElementById('ban_municipio'));
  resetSelect(document.getElementById('ban_parroquia'));
  resetSelect(document.getElementById('ban_comuna'));
  resetSelect(document.getElementById('ban_consejo'));
}

/* ==================== GUARDAR ==================== */

async function guardarBanco() {
  const perfil = window.__perfil;
  if (!perfil) return;

  if (!usuarioPuedeGestionar(perfil)) {
    toast('No tienes permisos para guardar bancos de tierra');
    return;
  }

  const nombre = document.getElementById('ban_nombre').value.trim();
  const superficie = parseFloat(document.getElementById('ban_superficie').value) || 0;
  const tipoSuelo = document.getElementById('ban_tipoSuelo').value;
  const afectacion = document.getElementById('ban_afectacion').value;
  const estado = document.getElementById('ban_estado').value;
  const municipio = document.getElementById('ban_municipio').value;
  const parroquia = document.getElementById('ban_parroquia').value;
  const comuna = document.getElementById('ban_comuna').value;
  const consejo = document.getElementById('ban_consejo').value;
  const estatus = document.getElementById('ban_estatus').value;

  if (!nombre) return toast('Ingresa el nombre del banco');
  if (superficie <= 0) return toast('Ingresa la superficie en hectáreas');
  if (!tipoSuelo) return toast('Selecciona el tipo de suelo');
  if (!afectacion) return toast('Selecciona la afectación');
  if (!estado) return toast('Selecciona el estado');
  if (!municipio) return toast('Selecciona el municipio');
  if (!parroquia) return toast('Selecciona la parroquia');
  if (!comuna) return toast('Selecciona la comuna o "No Aplica"');
  if (!consejo) return toast('Selecciona el consejo comunal o "No Aplica"');

  const payload = {
    nombre,
    superficie,
    tipoSuelo,
    afectacion,
    ubicacion: { estado, municipio, parroquia, comuna, consejo },
    vegetacion: document.getElementById('ban_vegetacion').value.trim(),
    estatus,
    responsable: document.getElementById('ban_responsable').value.trim(),
    telefono: document.getElementById('ban_telefono').value.trim(),
    observaciones: document.getElementById('ban_observaciones').value.trim(),
    latitud: document.getElementById('ban_lat').value.trim(),
    longitud: document.getElementById('ban_lng').value.trim(),
    actualizado: serverTimestamp()
  };

  const btn = document.getElementById('btnGuardarBanco');
  setBotonCargando(btn, true);
  try {
    if (modoEdicionId) {
      await updateDoc(doc(db, 'bancosTierra', modoEdicionId), payload);
      toast('Banco de tierra actualizado');
    } else {
      payload.creado = serverTimestamp();
      payload.creadoPor = perfil.uid;
      payload.creadoPorNombre = perfil.nombre || perfil.email;
      await addDoc(collection(db, 'bancosTierra'), payload);
      toast('Banco de tierra registrado');
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

async function cargarListaBancos(perfil) {
  const cont = document.getElementById('listaBancos');
  if (!cont) return;

  loader(true);
  try {
    const snap = await getDocs(collection(db, 'bancosTierra'));

    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🌾</span>
          <div class="empty-state-msg">No hay bancos de tierra registrados</div>
          <div class="empty-state-hint">Usa el botón "Nuevo banco de tierra" para agregar el primero.</div>
        </div>`;
      return;
    }

    const bancos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const puedeGestionar = usuarioPuedeGestionar(perfil);

    const filas = bancos.map(b => {
      const ub = b.ubicacion || {};
      const ubicTexto = [ub.estado, ub.municipio, ub.parroquia].filter(Boolean).join(' › ');
      const badgeEstatus = b.estatus === 'activo'
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-danger">Inactivo</span>';
      const nombreSeguro = escapeHTML(b.nombre || '');

      return `
        <tr>
          <td><strong>${nombreSeguro}</strong></td>
          <td style="font-size: 12px;">${b.superficie || 0} ha</td>
          <td style="font-size: 12px;">${escapeHTML(b.tipoSuelo || '')}</td>
          <td style="font-size: 12px;">${escapeHTML(ubicTexto)}</td>
          <td>${badgeEstatus}</td>
          <td>${escapeHTML(b.responsable || '—')}</td>
          <td style="white-space:nowrap;">
            ${puedeGestionar
              ? `<button class="btn btn-primary btn-sm" data-edit="${b.id}"
                        aria-label="Editar banco de tierra ${nombreSeguro}">✏️</button>
                 <button class="btn btn-danger btn-sm" data-del="${b.id}"
                        aria-label="Eliminar banco de tierra ${nombreSeguro}">🗑️</button>`
              : '—'}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Superficie</th>
              <th>Tipo de suelo</th>
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
        const banco = bancos.find(x => x.id === b.dataset.edit);
        if (banco) abrirFormularioEdicion(banco);
      });
    });
    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarBanco(b.dataset.del));
    });

  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar bancos de tierra.</p>';
  } finally {
    loader(false);
  }
}

/* ==================== ELIMINAR ==================== */

async function eliminarBanco(id) {
  if (!confirm('¿Eliminar este banco de tierra? Esta acción no se puede deshacer.')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'bancosTierra', id));
    toast('Banco de tierra eliminado');
    await cargarListaBancos(window.__perfil);
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}