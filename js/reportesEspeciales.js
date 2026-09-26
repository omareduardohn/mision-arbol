// js/reportesEspeciales.js
// Módulo de Reportes Especiales — Misión Árbol
// Fase 7: constructor mejorado + editar + ver respuestas + exportar

import {
  collection, addDoc, getDocs, query, where,
  doc, updateDoc, deleteDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { toast, loader } from "./auth.js";
import {
  GERENCIAS,
  escapeHTML
} from "./datos.js";

/* ==================== CONSTANTES ==================== */

const TIPOS_PREGUNTA = [
  { id: 'texto',    label: 'Texto corto' },
  { id: 'textarea', label: 'Texto largo' },
  { id: 'numero',   label: 'Número' },
  { id: 'email',    label: 'Correo' },
  { id: 'tel',      label: 'Teléfono' },
  { id: 'fecha',    label: 'Fecha' },
  { id: 'si_no',    label: 'Sí / No' },
  { id: 'select',   label: 'Selección única' },
  { id: 'multi',    label: 'Selección múltiple' }
];

/* ==================== ESTADO GLOBAL ==================== */

let idReporteEditando = null;

/* ==================== ADMIN — PANEL PRINCIPAL ==================== */

export async function cargarAdminReportesEspeciales() {
  const cont = document.getElementById('adminReportesEspeciales');
  if (!cont) return;

  cont.innerHTML = `
    <div class="subpanel" id="subpanel-nuevo-reporte">
      <h4 style="margin-bottom: 12px;">✏️ Crear nuevo reporte especial</h4>

      <div class="form-group">
        <label>Título *</label>
        <input type="text" id="nuevoTitulo" placeholder="Ej: Censo de Brigadas 2026">
      </div>

      <div class="form-group">
        <label>Descripción</label>
        <textarea id="nuevaDescripcion" rows="2" placeholder="Breve descripción del objetivo del reporte..."></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Dirigido a</label>
          <select id="nuevoDirigidoA">
            <option value="ambos">Todos los reportes</option>
            <option value="nacional">Solo reportes nacionales</option>
            <option value="estadal">Solo reportes estadales</option>
          </select>
        </div>
        <div class="form-group">
          <label>Indicador vinculado (opcional)</label>
          <select id="nuevoIndicador">
            <option value="">Cualquiera</option>
            ${GERENCIAS.map(g => `<option value="${g.id}">${escapeHTML(g.nombre)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px;">
        <label style="font-weight: 700; color: var(--verde-oscuro); font-size: 14px;">
          Preguntas del reporte
        </label>
        <button class="btn btn-primary btn-sm" id="btnAddPregunta">+ Agregar pregunta</button>
      </div>

      <div id="preguntasContainer"></div>

      <div style="margin-top: 18px; display: flex; gap: 10px;">
        <button class="btn btn-success" id="btnPublicar">
          📢 Publicar reporte
        </button>
        <button class="btn btn-secondary" id="btnCancelarEdicion" style="display: none;">
          Cancelar edición
        </button>
      </div>
    </div>

    <div id="listaEspeciales" style="margin-top: 22px;"></div>
  `;

  document.getElementById('btnAddPregunta').addEventListener('click', () => {
    agregarPreguntaUI({});
  });
  document.getElementById('btnPublicar').addEventListener('click', publicarOActualizarReporte);
  document.getElementById('btnCancelarEdicion').addEventListener('click', cancelarEdicion);

  // Agregamos una pregunta inicial
  agregarPreguntaUI({});

  await listarReportes();
}

/* ==================== UI DE PREGUNTAS ==================== */

/**
 * Agrega una tarjeta de pregunta al contenedor.
 * @param {Object} pregunta — { texto, tipo, obligatorio, opciones }
 */
function agregarPreguntaUI(pregunta) {
  const cont = document.getElementById('preguntasContainer');
  if (!cont) return;

  const p = {
    texto: pregunta.texto || '',
    tipo: pregunta.tipo || 'texto',
    obligatorio: !!pregunta.obligatorio,
    opciones: Array.isArray(pregunta.opciones) ? pregunta.opciones : []
  };

  const idx = Date.now() + Math.random(); // identificador temporal

  const div = document.createElement('div');
  div.className = 'pregunta-card subpanel';
  div.dataset.pid = idx;
  div.style.cssText = 'position: relative; background: #fff; border-left: 4px solid var(--verde-brillante); margin-bottom: 10px;';

  const requiereOpciones = p.tipo === 'select' || p.tipo === 'multi';

  div.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
      <div style="flex: 1;">
        <label style="font-size: 12px; color: #666;">Pregunta</label>
        <input type="text" class="p-texto" value="${escapeHTML(p.texto)}"
               placeholder="Ej: ¿Cuántos brigadistas participaron?" style="width: 100%;">
      </div>
      <div style="display: flex; gap: 4px; margin-top: 20px;">
        <button class="btn btn-secondary btn-sm p-subir" title="Subir" style="padding: 4px 8px;">▲</button>
        <button class="btn btn-secondary btn-sm p-bajar" title="Bajar" style="padding: 4px 8px;">▼</button>
        <button class="btn btn-danger btn-sm p-eliminar" title="Eliminar" style="padding: 4px 8px;">✕</button>
      </div>
    </div>

    <div class="form-row" style="gap: 8px;">
      <div class="form-group" style="margin-bottom: 0;">
        <label style="font-size: 12px; color: #666;">Tipo de respuesta</label>
        <select class="p-tipo" style="width: 100%;">
          ${TIPOS_PREGUNTA.map(t => `
            <option value="${t.id}" ${t.id === p.tipo ? 'selected' : ''}>${t.label}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0; display: flex; align-items: center; padding-top: 18px;">
        <label style="display: flex; align-items: center; gap: 6px; font-weight: 500; font-size: 13px; cursor: pointer;">
          <input type="checkbox" class="p-oblig" ${p.obligatorio ? 'checked' : ''}>
          Obligatoria
        </label>
      </div>
    </div>

    <div class="p-opciones-wrapper" style="margin-top: 8px; ${requiereOpciones ? '' : 'display: none;'}">
      <label style="font-size: 12px; color: #666;">Opciones (una por línea)</label>
      <textarea class="p-opciones" rows="3"
                placeholder="Opción 1&#10;Opción 2&#10;Opción 3"
                style="width: 100%;">${escapeHTML(p.opciones.join('\n'))}</textarea>
    </div>
  `;

  // Wiring: eliminar
  div.querySelector('.p-eliminar').addEventListener('click', () => {
    if (cont.querySelectorAll('.pregunta-card').length <= 1) {
      toast('Debe haber al menos una pregunta');
      return;
    }
    div.remove();
  });

  // Wiring: subir
  div.querySelector('.p-subir').addEventListener('click', () => {
    const prev = div.previousElementSibling;
    if (prev) cont.insertBefore(div, prev);
  });

  // Wiring: bajar
  div.querySelector('.p-bajar').addEventListener('click', () => {
    const next = div.nextElementSibling;
    if (next) cont.insertBefore(next, div);
  });

  // Wiring: cambio de tipo
  div.querySelector('.p-tipo').addEventListener('change', (e) => {
    const tipo = e.target.value;
    const wrapper = div.querySelector('.p-opciones-wrapper');
    wrapper.style.display = (tipo === 'select' || tipo === 'multi') ? 'block' : 'none';
  });

  cont.appendChild(div);
}

/**
 * Lee las preguntas actuales del DOM.
 * @returns {Array} — preguntas listas para guardar
 */
function leerPreguntasDelDOM() {
  const preguntas = [];
  document.querySelectorAll('#preguntasContainer .pregunta-card').forEach(card => {
    const texto = card.querySelector('.p-texto').value.trim();
    if (!texto) return;

    const tipo = card.querySelector('.p-tipo').value;
    const obligatorio = card.querySelector('.p-oblig').checked;
    const opcionesRaw = card.querySelector('.p-opciones')?.value || '';
    const opciones = opcionesRaw.split('\n').map(s => s.trim()).filter(Boolean);

    preguntas.push({ texto, tipo, obligatorio, opciones });
  });
  return preguntas;
}

/* ==================== CREAR / EDITAR ==================== */

async function publicarOActualizarReporte() {
  const titulo = document.getElementById('nuevoTitulo').value.trim();
  if (!titulo) return toast('Ingresa un título');

  const descripcion = document.getElementById('nuevaDescripcion').value.trim();
  const dirigidoA = document.getElementById('nuevoDirigidoA').value;
  const indicador = document.getElementById('nuevoIndicador').value;

  const preguntas = leerPreguntasDelDOM();
  if (preguntas.length === 0) return toast('Agrega al menos una pregunta');

  // Validar que las preguntas de tipo select/multi tengan opciones
  for (const p of preguntas) {
    if ((p.tipo === 'select' || p.tipo === 'multi') && p.opciones.length === 0) {
      return toast(`La pregunta "${p.texto}" necesita al menos una opción`);
    }
  }

  loader(true);
  try {
    const payload = {
      titulo,
      descripcion,
      dirigidoA,
      indicador,
      preguntas,
      publicado: true,
      fechaModificacion: serverTimestamp()
    };

    if (idReporteEditando) {
      await updateDoc(doc(db, 'reportesEspeciales', idReporteEditando), payload);
      toast('✅ Reporte actualizado');
    } else {
      payload.respuestas = [];
      payload.fechaPublicacion = serverTimestamp();
      await addDoc(collection(db, 'reportesEspeciales'), payload);
      toast('✅ Reporte publicado');
    }

    limpiarFormulario();
    await listarReportes();
  } catch (e) {
    console.error(e);
    toast('Error al guardar: ' + (e.message || ''));
  } finally {
    loader(false);
  }
}

function limpiarFormulario() {
  document.getElementById('nuevoTitulo').value = '';
  document.getElementById('nuevaDescripcion').value = '';
  document.getElementById('nuevoDirigidoA').value = 'ambos';
  document.getElementById('nuevoIndicador').value = '';
  document.getElementById('preguntasContainer').innerHTML = '';
  agregarPreguntaUI({});
  idReporteEditando = null;
  document.querySelector('#subpanel-nuevo-reporte h4').textContent = '✏️ Crear nuevo reporte especial';
  document.getElementById('btnPublicar').innerHTML = '📢 Publicar reporte';
  document.getElementById('btnCancelarEdicion').style.display = 'none';
}

async function editarReporte(id) {
  loader(true);
  try {
    const snap = await getDoc(doc(db, 'reportesEspeciales', id));
    if (!snap.exists()) return toast('Reporte no encontrado');

    const r = snap.data();
    idReporteEditando = id;

    document.getElementById('nuevoTitulo').value = r.titulo || '';
    document.getElementById('nuevaDescripcion').value = r.descripcion || '';
    document.getElementById('nuevoDirigidoA').value = r.dirigidoA || 'ambos';
    document.getElementById('nuevoIndicador').value = r.indicador || '';

    const cont = document.getElementById('preguntasContainer');
    cont.innerHTML = '';
    (r.preguntas || []).forEach(p => agregarPreguntaUI(p));

    document.querySelector('#subpanel-nuevo-reporte h4').textContent = '✏️ Editando reporte especial';
    document.getElementById('btnPublicar').innerHTML = '💾 Guardar cambios';
    document.getElementById('btnCancelarEdicion').style.display = 'inline-flex';

    document.getElementById('subpanel-nuevo-reporte').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    toast('Error al cargar reporte');
  } finally {
    loader(false);
  }
}

function cancelarEdicion() {
  idReporteEditando = null;
  limpiarFormulario();
  toast('Edición cancelada');
}

/* ==================== LISTADO ==================== */

async function listarReportes() {
  const cont = document.getElementById('listaEspeciales');
  if (!cont) return;

  loader(true);
  try {
    const snap = await getDocs(collection(db, 'reportesEspeciales'));

    if (snap.empty) {
      cont.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📋</span>
          <div class="empty-state-msg">Sin reportes especiales publicados</div>
          <div class="empty-state-hint">Usa el formulario de arriba para crear el primer reporte especial.</div>
        </div>`;
      return;
    }

    const reportes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    cont.innerHTML = `
      <h4 style="margin-bottom: 12px;">📂 Reportes publicados (${reportes.length})</h4>
      <div class="table-container">
        <table class="tabla-dashboard">
          <thead>
            <tr>
              <th>Título</th>
              <th>Dirigido a</th>
              <th>Indicador</th>
              <th>Preguntas</th>
              <th>Respuestas</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${reportes.map(r => {
              const tituloSeguro = escapeHTML(r.titulo || 'Reporte sin título');
              return `
                <tr>
                  <td><strong>${tituloSeguro}</strong></td>
                  <td>${escapeHTML(r.dirigidoA || '')}</td>
                  <td>${r.indicador ? escapeHTML(GERENCIAS.find(g => g.id === r.indicador)?.corto || r.indicador) : '—'}</td>
                  <td>${(r.preguntas || []).length}</td>
                  <td>
                    <span class="badge bg-primary">${(r.respuestas || []).length}</span>
                  </td>
                  <td style="white-space: nowrap;">
                    <button class="btn btn-primary btn-sm" data-ver="${r.id}"
                            aria-label="Ver respuestas del reporte ${tituloSeguro}">👁️</button>
                    <button class="btn btn-warning btn-sm" data-edit="${r.id}"
                            aria-label="Editar reporte ${tituloSeguro}">✏️</button>
                    <button class="btn btn-success btn-sm" data-export="${r.id}"
                            aria-label="Exportar respuestas del reporte ${tituloSeguro}">📥</button>
                    <button class="btn btn-danger btn-sm" data-del="${r.id}"
                            aria-label="Eliminar reporte ${tituloSeguro}">🗑️</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Wiring
    cont.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editarReporte(b.dataset.edit)));
    cont.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => verRespuestas(b.dataset.ver)));
    cont.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => exportarRespuestas(b.dataset.export)));
    cont.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => eliminarReporte(b.dataset.del)));

  } catch (e) {
    console.error(e);
    cont.innerHTML = '<p style="color:red;">Error al cargar reportes.</p>';
  } finally {
    loader(false);
  }
}

async function eliminarReporte(id) {
  if (!confirm('¿Eliminar este reporte especial y todas sus respuestas?')) return;
  try {
    await deleteDoc(doc(db, 'reportesEspeciales', id));
    toast('Reporte eliminado');
    await listarReportes();
  } catch (e) {
    console.error(e);
    toast('Error al eliminar');
  }
}

/* ==================== VER RESPUESTAS ==================== */

async function verRespuestas(id) {
  loader(true);
  try {
    const snap = await getDoc(doc(db, 'reportesEspeciales', id));
    if (!snap.exists()) return toast('Reporte no encontrado');

    const r = snap.data();
    const preguntas = r.preguntas || [];
    const respuestas = r.respuestas || [];

    // Crear modal dinámicamente
    const existente = document.getElementById('modalVerRespuestas');
    if (existente) existente.remove();

    const modal = document.createElement('div');
    modal.id = 'modalVerRespuestas';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';

    if (respuestas.length === 0) {
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
          <button class="modal-close" data-cerrar>&times;</button>
          <h3 style="margin-bottom: 10px;">📋 ${escapeHTML(r.titulo)}</h3>
          <p style="text-align: center; color: #888; padding: 30px;">
            Sin respuestas todavía.
          </p>
        </div>
      `;
    } else {
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 85vh; overflow-y: auto;">
          <button class="modal-close" data-cerrar>&times;</button>
          <h3 style="margin-bottom: 6px;">📋 ${escapeHTML(r.titulo)}</h3>
          <p style="font-size: 12px; color: #888; margin-bottom: 16px;">
            ${respuestas.length} respuesta${respuestas.length !== 1 ? 's' : ''}
          </p>

          <div class="table-container" style="max-height: 60vh;">
            <table class="tabla-dashboard">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Fecha</th>
                  ${preguntas.map(p => `<th>${escapeHTML(p.texto)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${respuestas.map(res => `
                  <tr>
                    <td>${escapeHTML(res.usuarioNombre || 'Anónimo')}</td>
                    <td style="font-size: 11px;">
                      ${res.fechaRespuesta
                        ? new Date(res.fechaRespuesta).toLocaleString('es-VE')
                        : '—'}
                    </td>
                    ${preguntas.map((p, i) => {
                      const val = (res.respuestas || [])[i];
                      return `<td>${escapeHTML(Array.isArray(val) ? val.join(', ') : (val ?? '—'))}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-cerrar]').forEach(b => {
      b.addEventListener('click', () => modal.remove());
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

  } catch (e) {
    console.error(e);
    toast('Error al cargar respuestas');
  } finally {
    loader(false);
  }
}

/* ==================== EXPORTAR RESPUESTAS ==================== */

async function exportarRespuestas(id) {
  loader(true);
  try {
    const snap = await getDoc(doc(db, 'reportesEspeciales', id));
    if (!snap.exists()) return toast('Reporte no encontrado');

    const r = snap.data();
    const preguntas = r.preguntas || [];
    const respuestas = r.respuestas || [];

    if (respuestas.length === 0) {
      return toast('Este reporte no tiene respuestas para exportar');
    }

    const escapar = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;

    // Header
    const header = [
      'Usuario',
      'Email',
      'Fecha respuesta',
      ...preguntas.map(p => p.texto)
    ].map(escapar).join(',');

    // Filas
    const filas = respuestas.map(res => {
      const base = [
        res.usuarioNombre || '',
        res.usuarioEmail || '',
        res.fechaRespuesta ? new Date(res.fechaRespuesta).toLocaleString('es-VE') : ''
      ];
      const valores = preguntas.map((p, i) => {
        const val = (res.respuestas || [])[i];
        return Array.isArray(val) ? val.join(' | ') : (val ?? '');
      });
      return [...base, ...valores].map(escapar).join(',');
    }).join('\n');

    const csv = header + '\n' + filas;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = (r.titulo || 'reporte').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    a.href = url;
    a.download = `${slug}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast(`✅ ${respuestas.length} respuestas exportadas`);
  } catch (e) {
    console.error(e);
    toast('Error al exportar');
  } finally {
    loader(false);
  }
}


