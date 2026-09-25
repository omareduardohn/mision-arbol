// js/personal.js
// Panel de "Mi Personal" — permite a reporte_estadal y reporte_nacional
// gestionar su propia plantilla de personal (alta, edición, borrado).
//
// Colecciones Firestore:
//   - /personal  → documentos { nombreCompleto, cedula, cargo, ... }
//
// Filtros aplicados:
//   - reporte_estadal:  where('estado', '==', perfil.estado)
//   - reporte_nacional: where('gerencia', '==', perfil.gerencia)
//   - control:          sin filtro (ve todo, pero solo desde el Dashboard)
//
// Suscripción: onSnapshot — se limpia al cerrar sesión vía evento
// 'usuarioCerroSesion' (disparado por auth.js::logout).

import {
  collection, addDoc, deleteDoc, doc, updateDoc, query, where,
  serverTimestamp, onSnapshot, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader } from "./auth.js";
import { escapeHTML } from "./datos.js";

let unsubPersonal = null;

export async function cargarPanelPersonal() {
  const perfil = window.__perfil;
  if (!perfil) return;

  const form = document.getElementById('formAgregarPersonal');
  if (form && !form.dataset.wired) {
    form.dataset.wired = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      agregarPersonal(e);
    });
  }

  // Wire modal edición (una vez)
  if (!window.__personalModalWired) {
    document.getElementById('btnGuardarEdicionPersonal')?.addEventListener('click', guardarEdicionPersonal);
    document.getElementById('btnCancelarEdicionPersonal')?.addEventListener('click', cerrarModalEditar);
    document.getElementById('btnCerrarModalEditar')?.addEventListener('click', cerrarModalEditar);
    window.__personalModalWired = true;
  }

  await cargarListaPersonal(perfil);
}

async function cargarListaPersonal(perfil) {
  if (unsubPersonal) unsubPersonal();
  const cont = document.getElementById('panel-personal-content');
  if (!cont) return;

  let q = collection(db, 'personal');
  if (perfil.estado) q = query(q, where('estado', '==', perfil.estado));
  else if (perfil.gerencia) q = query(q, where('gerencia', '==', perfil.gerencia));

  unsubPersonal = onSnapshot(q, (snap) => {
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">👥</span>
          <div class="empty-state-msg">No hay personal registrado todavía</div>
          <div class="empty-state-hint">Agrega el primer miembro usando el formulario de arriba.</div>
        </div>`;
      return;
    }
    const rows = snap.docs.map(d => {
      const p = d.data();
      const nombreSeguro = escapeHTML(p.nombreCompleto || '');
      return `<tr>
        <td>${nombreSeguro}</td>
        <td>${escapeHTML(p.cedula || '')}</td>
        <td>${escapeHTML(p.cargo || '')}</td>
        <td>${escapeHTML(p.telefono || '')}</td>
        <td>${p.tieneWhatsapp ? '✓' : '—'}</td>
        <td>${p.tieneTelegram ? '✓' : '—'}</td>
        <td>${escapeHTML(p.tallaCamisa || '')} / ${escapeHTML(p.tallaPantalon || '')} / ${escapeHTML(p.tallaZapato || '')}</td>
        <td>
          <button class="btn btn-primary btn-sm" data-edit="${d.id}"
                  aria-label="Editar a ${nombreSeguro}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${d.id}"
                  aria-label="Borrar a ${nombreSeguro}">Borrar</button>
        </td>
      </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead><tr>
            <th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Teléfono</th>
            <th>WA</th><th>TG</th><th>Tallas</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editarPersonal(b.dataset.edit)));
    cont.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => eliminarPersonal(b.dataset.del)));
  });
}

async function agregarPersonal(e) {
  const perfil = window.__perfil;
  const data = {
    nombreCompleto: document.getElementById('personal_nombre').value.trim(),
    cedula: document.getElementById('personal_cedula').value.trim(),
    telefono: document.getElementById('personal_telefono').value.trim(),
    correo: document.getElementById('personal_correo').value.trim(),
    tieneWhatsapp: document.getElementById('personal_whatsapp').checked,
    tieneTelegram: document.getElementById('personal_telegram').checked,
    tallaCamisa: document.getElementById('personal_tallaCamisa').value.trim(),
    tallaPantalon: document.getElementById('personal_tallaPantalon').value.trim(),
    tallaZapato: document.getElementById('personal_tallaZapato').value.trim(),
    tallaGorra: document.getElementById('personal_tallaGorra').value.trim(),
    cargo: document.getElementById('personal_cargo').value.trim(),
    estado: perfil.estado || null,
    gerencia: perfil.gerencia || null,
    activo: true,
    creado: serverTimestamp(),
    creadoPor: perfil.uid
  };

  if (!data.nombreCompleto || !data.cedula || !data.telefono || !data.cargo) {
    return toast('Complete los campos obligatorios');
  }

  try {
    await addDoc(collection(db, 'personal'), data);
    toast('Personal agregado');
    e.target.reset();
  } catch (err) {
    console.error(err);
    toast('Error al guardar');
  }
}

async function editarPersonal(id) {
  const snap = await getDoc(doc(db, 'personal', id));
  if (!snap.exists()) return;
  const p = snap.data();
  document.getElementById('edit_personal_id').value = id;
  document.getElementById('edit_nombre').value = p.nombreCompleto || '';
  document.getElementById('edit_cedula').value = p.cedula || '';
  document.getElementById('edit_telefono').value = p.telefono || '';
  document.getElementById('edit_correo').value = p.correo || '';
  document.getElementById('edit_whatsapp').checked = !!p.tieneWhatsapp;
  document.getElementById('edit_telegram').checked = !!p.tieneTelegram;
  document.getElementById('edit_tallaCamisa').value = p.tallaCamisa || '';
  document.getElementById('edit_tallaPantalon').value = p.tallaPantalon || '';
  document.getElementById('edit_tallaZapato').value = p.tallaZapato || '';
  document.getElementById('edit_tallaGorra').value = p.tallaGorra || '';
  document.getElementById('edit_cargo').value = p.cargo || '';
  document.getElementById('modalEditarPersonal').style.display = 'flex';
}

async function guardarEdicionPersonal() {
  const id = document.getElementById('edit_personal_id').value;
  const data = {
    nombreCompleto: document.getElementById('edit_nombre').value.trim(),
    cedula: document.getElementById('edit_cedula').value.trim(),
    telefono: document.getElementById('edit_telefono').value.trim(),
    correo: document.getElementById('edit_correo').value.trim(),
    tieneWhatsapp: document.getElementById('edit_whatsapp').checked,
    tieneTelegram: document.getElementById('edit_telegram').checked,
    tallaCamisa: document.getElementById('edit_tallaCamisa').value.trim(),
    tallaPantalon: document.getElementById('edit_tallaPantalon').value.trim(),
    tallaZapato: document.getElementById('edit_tallaZapato').value.trim(),
    tallaGorra: document.getElementById('edit_tallaGorra').value.trim(),
    cargo: document.getElementById('edit_cargo').value.trim()
  };
  await updateDoc(doc(db, 'personal', id), data);
  toast('Personal actualizado');
  cerrarModalEditar();
}

function cerrarModalEditar() {
  document.getElementById('modalEditarPersonal').style.display = 'none';
}

async function eliminarPersonal(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  await deleteDoc(doc(db, 'personal', id));
  toast('Personal eliminado');
}

/* ==================== CLEANUP DE SUSCRIPCIONES AL CERRAR SESIÓN ==================== */
// H.1: auth.js::logout() dispara 'usuarioCerroSesion' antes de signOut().
// Esto libera el onSnapshot de /personal para evitar fugas de listeners
// de Firestore tras cerrar sesión.
document.addEventListener('usuarioCerroSesion', () => {
  if (unsubPersonal) {
    try { unsubPersonal(); } catch (_) {}
    unsubPersonal = null;
  }
});