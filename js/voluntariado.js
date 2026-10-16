// js/voluntariado.js
// Módulo de Voluntariado — vista administrativa (solo lectura)
//
// Muestra los registros del formulario público /voluntarios.
// Visible para: control + visor_nacional.
//
// Colección Firestore: /voluntarios
//   { nombre, cedula, telefono, correo, estado, municipio, parroquia,
//     intereses, comentario, aprobado, creadoEn }

import { collection, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader } from "./auth.js";
import { escapeHTML, toDateValue } from "./datos.js";

function usuarioPuedeVer(perfil) {
  return perfil && (perfil.rol === 'control' || perfil.rol === 'visor_nacional');
}

export async function cargarPanelVoluntariado() {
  const perfil = window.__perfil;
  const cont = document.getElementById('listaVoluntarios');
  if (!cont) return;

  if (!usuarioPuedeVer(perfil)) {
    cont.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔒</span>
        <div class="empty-state-msg">No tienes acceso a este módulo</div>
        <div class="empty-state-hint">Solo Control y Visor Nacional pueden ver los voluntarios registrados.</div>
      </div>`;
    return;
  }

  loader(true);
  try {
    const snap = await getDocs(collection(db, 'voluntarios'));
    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🌱</span>
          <div class="empty-state-msg">No hay voluntarios registrados</div>
          <div class="empty-state-hint">Cuando alguien llene el formulario público, aparecerá aquí.</div>
        </div>`;
      return;
    }

    const voluntarios = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDateValue(b.creadoEn) || 0) - (toDateValue(a.creadoEn) || 0));

    const filas = voluntarios.map(v => {
      const fecha = toDateValue(v.creadoEn);
      const fechaStr = fecha ? fecha.toLocaleDateString('es-VE') : '—';
      const interes = Array.isArray(v.intereses) ? v.intereses.join(', ') : '';
      const nombreSeguro = escapeHTML(v.nombre || '—');
      return `
        <tr>
          <td><strong>${nombreSeguro}</strong></td>
          <td>${escapeHTML(v.cedula || '—')}</td>
          <td>${escapeHTML(v.telefono || '—')}</td>
          <td style="font-size: 12px;">${escapeHTML([v.estado, v.municipio].filter(Boolean).join(' › ') || '—')}</td>
          <td style="font-size: 12px;">${escapeHTML(interes || '—')}</td>
          <td style="font-size: 12px;">${escapeHTML(fechaStr)}</td>
          <td style="white-space:nowrap;">
            ${perfil.rol === 'control'
              ? `<button class="btn btn-danger btn-sm" data-del="${v.id}" aria-label="Eliminar registro de ${nombreSeguro}">🗑️</button>`
              : '—'}
          </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead><tr>
            <th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Ubicación</th><th>Intereses</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => eliminarVoluntario(b.dataset.del));
    });
  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar voluntarios.</p>';
  } finally {
    loader(false);
  }
}

async function eliminarVoluntario(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  loader(true);
  try {
    await deleteDoc(doc(db, 'voluntarios', id));
    toast('Registro eliminado');
    await cargarPanelVoluntariado();
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  } finally {
    loader(false);
  }
}
