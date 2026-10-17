// js/voluntariado-publico.js
// Script del formulario público de voluntariado.
// Externalizado para cumplir con la CSP estricta de Firebase Hosting
// (script-src sin 'unsafe-inline').

import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ESTADOS_VENEZUELA,
  municipiosDe,
  parroquiasDe,
  comunasDe,
  consejosComunalesDe,
  cargarTerritorio,
  escapeHTML
} from "./datos.js";

const form = document.getElementById('formVoluntario');
const btn = document.getElementById('btnEnviar');
const msg = document.getElementById('msg');

const selEstado    = document.getElementById('v_estado');
const selMunicipio = document.getElementById('v_municipio');
const selParroquia = document.getElementById('v_parroquia');
const selComuna    = document.getElementById('v_comuna');
const selConsejo   = document.getElementById('v_consejo');

// ===== Cargar catálogo territorial al abrir =====
(async () => {
  try {
    await cargarTerritorio();
    selEstado.innerHTML = '<option value="">Seleccione...</option>' +
      ESTADOS_VENEZUELA.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
  } catch (err) {
    console.error('Error cargando territorio:', err);
    selEstado.innerHTML = '<option value="">Error al cargar</option>';
  }
})();

// ===== Cascada territorial =====
selEstado.addEventListener('change', () => {
  const estado = selEstado.value;
  if (!estado) {
    selMunicipio.innerHTML = '<option value="">Seleccione estado primero</option>';
    selMunicipio.disabled = true;
    selParroquia.innerHTML = '<option value="">Seleccione municipio primero</option>';
    selParroquia.disabled = true;
    selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
    selComuna.disabled = true;
    selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
    selConsejo.disabled = true;
    return;
  }
  const muns = municipiosDe(estado);
  selMunicipio.innerHTML = '<option value="">Seleccione...</option>' +
    muns.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
  selMunicipio.disabled = false;

  selParroquia.innerHTML = '<option value="">Seleccione municipio primero</option>';
  selParroquia.disabled = true;
  selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
  selComuna.disabled = true;
  selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
  selConsejo.disabled = true;
});

selMunicipio.addEventListener('change', () => {
  const estado = selEstado.value;
  const municipio = selMunicipio.value;
  if (!municipio) {
    selParroquia.innerHTML = '<option value="">Seleccione municipio primero</option>';
    selParroquia.disabled = true;
    selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
    selComuna.disabled = true;
    selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
    selConsejo.disabled = true;
    return;
  }
  const parr = parroquiasDe(estado, municipio);
  selParroquia.innerHTML = '<option value="">Seleccione...</option>' +
    parr.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
  selParroquia.disabled = false;

  selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
  selComuna.disabled = true;
  selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
  selConsejo.disabled = true;
});

selParroquia.addEventListener('change', () => {
  const estado = selEstado.value;
  const municipio = selMunicipio.value;
  const parroquia = selParroquia.value;
  if (!parroquia) {
    selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
    selComuna.disabled = true;
    selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
    selConsejo.disabled = true;
    return;
  }
  const coms = comunasDe(estado, municipio, parroquia);
  selComuna.innerHTML = '<option value="">Seleccione...</option>' +
    coms.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('') +
    '<option value="No Aplica">— No Aplica —</option>';
  selComuna.disabled = false;

  selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
  selConsejo.disabled = true;
});

selComuna.addEventListener('change', () => {
  const comuna = selComuna.value;
  if (!comuna || comuna === 'No Aplica') {
    selConsejo.innerHTML = comuna === 'No Aplica'
      ? '<option value="No Aplica" selected>— No Aplica —</option>'
      : '<option value="">Seleccione comuna primero</option>';
    selConsejo.disabled = true;
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

// ===== Envío =====
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = '';
  msg.textContent = '';

  const nombre    = document.getElementById('v_nombre').value.trim();
  const cedula    = document.getElementById('v_cedula').value.trim();
  const telefono  = document.getElementById('v_telefono').value.trim();
  const correo    = document.getElementById('v_correo').value.trim();
  const estado    = selEstado.value;
  const municipio = selMunicipio.value;
  const parroquia = selParroquia.value;
  const comuna    = selComuna.value || '';
  const consejo   = selConsejo.value || '';
  const intereses = Array.from(document.querySelectorAll('#v_intereses input:checked')).map(c => c.value);
  const comentario = document.getElementById('v_comentario').value.trim();

  if (!nombre || !cedula || !telefono || !estado || !municipio || !parroquia) {
    msg.className = 'err';
    msg.textContent = 'Completa los campos obligatorios (*).';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    await addDoc(collection(db, 'voluntarios'), {
      nombre,
      cedula,
      telefono,
      correo,
      estado,
      municipio,
      parroquia,
      comuna,
      consejo,
      intereses,
      comentario,
      aprobado: false,
      creadoEn: serverTimestamp()
    });
    msg.className = 'ok';
    msg.textContent = '✅ ¡Gracias! Tu registro fue enviado. Te contactaremos pronto.';
    form.reset();
    // Reset cascade
    selMunicipio.innerHTML = '<option value="">Seleccione estado primero</option>';
    selMunicipio.disabled = true;
    selParroquia.innerHTML = '<option value="">Seleccione municipio primero</option>';
    selParroquia.disabled = true;
    selComuna.innerHTML = '<option value="">Seleccione parroquia primero</option>';
    selComuna.disabled = true;
    selConsejo.innerHTML = '<option value="">Seleccione comuna primero</option>';
    selConsejo.disabled = true;
  } catch (err) {
    console.error(err);
    msg.className = 'err';
    msg.textContent = 'No se pudo enviar. Intenta de nuevo más tarde.';
  } finally {
    btn.disabled = false;
    btn.textContent = '📝 Enviar registro';
  }
});