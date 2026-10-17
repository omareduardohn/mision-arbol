// js/auth.js
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  EmailAuthProvider,
  linkWithCredential,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import {
  ESTADOS_VENEZUELA,
  GERENCIAS,
  cargarTerritorio,
  municipiosDe,
  parroquiasDe
} from "./datos.js";

/* ---------- Configuración de session timeout ---------- */
const INACTIVIDAD_LIMITE_MS = 5 * 60 * 1000;
const AVISO_PREVIO_MS = 1 * 60 * 1000;
const ABSOLUTO_LIMITE_MS = 2 * 60 * 60 * 1000;

let ultimaActividad = Date.now();
let inicioSesion = Date.now();
let intervaloTimeout = null;
let intervaloAviso = null;
let sesionPorExpirar = false;

/* Registrar actividad del usuario */
function registrarActividad() {
  if (sesionPorExpirar) return;
  ultimaActividad = Date.now();
}

/* Iniciar el monitoreo de timeout (llamado tras login exitoso) */
function iniciarMonitoreoSesion() {
  detenerMonitoreoSesion();
  ultimaActividad = Date.now();
  inicioSesion = Date.now();
  sesionPorExpirar = false;

  ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, registrarActividad, { passive: true });
  });

  intervaloTimeout = setInterval(() => {
    const ahora = Date.now();
    const inactivo = ahora - ultimaActividad;
    const edadSesion = ahora - inicioSesion;

    if (edadSesion >= ABSOLUTO_LIMITE_MS) {
      toast('Tu sesión ha expirado por tiempo máximo. Inicia sesión de nuevo.', 5000);
      cerrarSesionPorTimeout();
      return;
    }

    if (inactivo >= INACTIVIDAD_LIMITE_MS) {
      toast('Tu sesión expiró por inactividad.', 5000);
      cerrarSesionPorTimeout();
      return;
    }

    const tiempoParaExpirar = INACTIVIDAD_LIMITE_MS - inactivo;
    if (tiempoParaExpirar <= AVISO_PREVIO_MS && !sesionPorExpirar) {
      mostrarAvisoSesion(tiempoParaExpirar);
    }
  }, 30 * 1000);
}

/* Detener el monitoreo (llamado al logout) */
function detenerMonitoreoSesion() {
  if (intervaloTimeout) clearInterval(intervaloTimeout);
  if (intervaloAviso) clearInterval(intervaloAviso);
  intervaloTimeout = null;
  intervaloAviso = null;
  ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.removeEventListener(evt, registrarActividad);
  });
}

/* Mostrar modal de aviso con countdown */
function mostrarAvisoSesion(msRestantes) {
  sesionPorExpirar = true;
  const modal = document.getElementById('modalSesionPorExpirar');
  if (!modal) return;
  modal.style.display = 'flex';

  let segundos = Math.max(1, Math.floor(msRestantes / 1000));
  const spanSeg = document.getElementById('segundosRestantes');
  if (spanSeg) spanSeg.textContent = segundos;

  if (intervaloAviso) clearInterval(intervaloAviso);
  intervaloAviso = setInterval(() => {
    segundos -= 1;
    if (spanSeg) spanSeg.textContent = Math.max(0, segundos);
    if (segundos <= 0) {
      clearInterval(intervaloAviso);
      cerrarSesionPorTimeout();
    }
  }, 1000);
}

/* Ocultar el aviso y extender la sesión */
function extenderSesion() {
  sesionPorExpirar = false;
  ultimaActividad = Date.now();
  if (intervaloAviso) {
    clearInterval(intervaloAviso);
    intervaloAviso = null;
  }
  const modal = document.getElementById('modalSesionPorExpirar');
  if (modal) modal.style.display = 'none';
  toast('Sesión extendida.');
}

/* Cerrar sesión por timeout (limpia todo) */
async function cerrarSesionPorTimeout() {
  sesionPorExpirar = false;
  if (intervaloAviso) {
    clearInterval(intervaloAviso);
    intervaloAviso = null;
  }
  const modal = document.getElementById('modalSesionPorExpirar');
  if (modal) modal.style.display = 'none';
  detenerMonitoreoSesion();
  await logout();
}

/* ---------- Hash de cédula para detectar duplicados ---------- */
async function hashCedula(cedula) {
  const norm = String(cedula).replace(/[^0-9]/g, '');
  if (!norm) return null;
  const data = new TextEncoder().encode('mision-arbol-salt-v1-' + norm);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashea un email con SHA-256 para usarlo como clave en /emails-lookup.
 * Devuelve el hash en hex minúsculas. Mismo patrón que hashCedula.
 */
async function hashEmail(email) {
  const norm = String(email).trim().toLowerCase();
  if (!norm) return null;
  const data = new TextEncoder().encode('mision-arbol-email-v1-' + norm);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Incrementa el contador de intentos fallidos para el dueño del email.
 * Silenciosa por diseño: si algo falla, no rompemos el flujo de login.
 */
async function registrarIntentoFallido(email) {
  try {
    const hash = await hashEmail(email);
    if (!hash) return;

    const lookupSnap = await getDoc(doc(db, 'emails-lookup', hash));
    if (!lookupSnap.exists()) return;
    const uid = lookupSnap.data().uid;
    if (!uid) return;

    const contadorRef = doc(db, 'intentos-publicos', uid);
    const contadorSnap = await getDoc(contadorRef);
    const actual = contadorSnap.exists() ? (Number(contadorSnap.data().contador) || 0) : 0;
    const siguiente = Math.min(actual + 1, 3);

    if (siguiente === 1 && !contadorSnap.exists()) {
      await setDoc(contadorRef, {
        contador: 1,
        ultimo: serverTimestamp()
      });
    } else if (siguiente > actual) {
      await updateDoc(contadorRef, {
        contador: siguiente,
        ultimo: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn('[Auth] No se pudo registrar el intento fallido:', e?.code || e);
  }
}

/**
 * Resetea el contador de intentos fallidos de un usuario autenticado
 * (se llama al loguearse con éxito).
 */
async function resetearIntentosFallidos(uid) {
  if (!uid) return;
  try {
    const contadorRef = doc(db, 'intentos-publicos', uid);
    const contadorSnap = await getDoc(contadorRef);
    if (contadorSnap.exists()) {
      await deleteDoc(contadorRef);
    }
    await updateDoc(doc(db, 'usuarios', uid), {
      intentosFallidos: 0,
      ultimoIntentoFallido: null,
      suspendido: false
    }).catch(() => {});
  } catch (e) {
    console.warn('[Auth] No se pudo resetear intentos fallidos:', e?.code || e);
  }
}

const proveedorGoogle = new GoogleAuthProvider();
let enRegistroEmailPass = false;
let usuarioGoogleTemporal = null;

/* ---------- UI helpers ---------- */
export function mostrarVista(id) {
  document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');
}

/**
 * Muestra un toast.
 * @param {string} msg
 * @param {number} ms
 * @param {string} tipo  'success' | 'error' | 'warning' | 'info'
 */
export function toast(msg, ms = 3500, tipo = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;

  const iconos = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️'
  };
  const icono = iconos[tipo] || '';
  const yaTieneEmoji = /^[\u2700-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF]/.test(msg);
  t.textContent = yaTieneEmoji ? msg : `${icono} ${msg}`;

  t.classList.remove('oculto', 'toast-success', 'toast-error', 'toast-warning', 'toast-info');
  t.classList.add(`toast-${tipo}`);

  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('oculto'), ms);
}

let _loaderCount = 0;
export function loader(on, mensaje = null) {
  _loaderCount = Math.max(0, _loaderCount + (on ? 1 : -1));
  const l = document.getElementById('loader');
  if (!l) return;

  if (_loaderCount > 0) {
    if (mensaje) l.textContent = mensaje;
    l.classList.remove('oculto');
    document.body.setAttribute('aria-busy', 'true');
  } else {
    l.classList.add('oculto');
    document.body.removeAttribute('aria-busy');
  }
}

export function setBotonCargando(btn, cargando, textoOriginal = null) {
  if (!btn) return;
  if (cargando) {
    if (!btn.dataset.textoOriginal) {
      btn.dataset.textoOriginal = textoOriginal || btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-inline"></span> Procesando...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = textoOriginal || btn.dataset.textoOriginal || 'Guardar';
    delete btn.dataset.textoOriginal;
  }
}

/* ---------- Poblar selects ---------- */
function poblarEstados() {
  const sel = document.getElementById('reg-estado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>';
  ESTADOS_VENEZUELA.forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = e;
    sel.appendChild(o);
  });
}

function poblarGerencias() {
  const sel = document.getElementById('reg-gerencia');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione...</option>';
  GERENCIAS.forEach(g => {
    const o = document.createElement('option');
    o.value = g.corto; o.textContent = g.nombre;
    sel.appendChild(o);
  });
}

/* ---------- Navegación ---------- */
function wireNavAuth() {
  document.getElementById('ir-registro')?.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarVista('vista-registro');
  });
  document.getElementById('ir-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    mostrarVista('vista-login');
  });
}

function wireRolRegistro() {
  const rol = document.getElementById('reg-rol');
  if (!rol) return;
  rol.addEventListener('change', () => {
    const esEstadal  = rol.value === 'reporte_estadal';
    const esNacional = rol.value === 'reporte_nacional';
    document.getElementById('reg-campo-estado')?.classList.toggle('oculto', !esEstadal);
    document.getElementById('reg-campo-gerencia')?.classList.toggle('oculto', !esNacional);
  });

  const regEstado = document.getElementById('regEstado');
  regEstado?.addEventListener('change', () => {
    if (typeof window.cargarMunicipiosRegistro === 'function') {
      window.cargarMunicipiosRegistro();
    }
  });

  const regMunicipio = document.getElementById('regMunicipio');
  regMunicipio?.addEventListener('change', () => {
    if (typeof window.cargarParroquiasRegistro === 'function') {
      window.cargarParroquiasRegistro();
    }
  });
}

/* ---------- Registro público ---------- */
/* P1 FIX: la cédula se verifica DESPUÉS de createUserWithEmailAndPassword,
   porque /cedulas ahora requiere autenticación en las reglas.
   Si la cédula está duplicada, se borra el usuario de Auth (rollback). */
async function registrar(e) {
  e.preventDefault();
  const err = document.getElementById('reg-error');
  const ok  = document.getElementById('reg-ok');
  err.textContent = ''; ok.textContent = '';

  const nombre   = document.getElementById('reg-nombre').value.trim();
  const apellido = document.getElementById('reg-apellido').value.trim();
  const cedula   = document.getElementById('reg-cedula').value.trim();
  const telefono = document.getElementById('reg-telefono')?.value.trim() || '';
  const email    = document.getElementById('reg-email').value.trim();
  const pass     = document.getElementById('reg-pass').value;
  const rol      = document.getElementById('reg-rol').value;
  const estado   = document.getElementById('reg-estado').value;
  const gerencia = document.getElementById('reg-gerencia').value;

  if (!rol) { err.textContent = 'Seleccione un tipo de usuario.'; return; }
  if (!cedula) { err.textContent = 'La cédula es obligatoria.'; return; }
  if (rol === 'reporte_estadal'  && !estado)   { err.textContent = 'Seleccione un estado.';   return; }
  if (rol === 'reporte_nacional' && !gerencia) { err.textContent = 'Seleccione una gerencia.'; return; }

  const rolesPermitidos = ['reporte_estadal', 'reporte_nacional', 'visor_nacional', 'dashboard_nacional', 'dashboard_estadal'];
  if (!rolesPermitidos.includes(rol)) {
    err.textContent = 'Tipo de usuario no permitido.';
    return;
  }

  enRegistroEmailPass = true;
  let cred = null;
  try {
    loader(true);
    cred = await createUserWithEmailAndPassword(auth, email, pass);

    // P1: ahora estamos autenticados → la lectura de /cedulas funciona
    let hash = null;
    try {
      hash = await hashCedula(cedula);
      if (hash) {
        const cedulaSnap = await getDoc(doc(db, 'cedulas', hash));
        if (cedulaSnap.exists()) {
          err.textContent = 'Esa cédula ya está registrada. Contacta al administrador.';
          try { await cred.user.delete(); } catch (_) {}
          try { await signOut(auth); } catch (_) {}
          enRegistroEmailPass = false;
          return;
        }
      }
    } catch (errCed) {
      console.error('Error verificando cédula:', errCed);
      err.textContent = 'Error al verificar la cédula. Intenta de nuevo.';
      try { await cred.user.delete(); } catch (_) {}
      try { await signOut(auth); } catch (_) {}
      enRegistroEmailPass = false;
      return;
    }

    // Crear perfil
    await setDoc(doc(db, 'usuarios', cred.user.uid), {
      uid: cred.user.uid,
      nombre, apellido, cedula, telefono, email, rol,
      estado:   rol === 'reporte_estadal'  ? estado   : null,
      gerencia: rol === 'reporte_nacional' ? gerencia : null,
      estadoCuenta: 'pendiente',
      suspendido: false,
      creado: serverTimestamp()
    });

    // Crear emails-lookup
    const emailHash = await hashEmail(email);
    if (emailHash) {
      try {
        await setDoc(doc(db, 'emails-lookup', emailHash), {
          uid: cred.user.uid,
          creado: serverTimestamp()
        });
      } catch (exEmailLookup) {
        console.warn('No se pudo crear el email-lookup:', exEmailLookup);
      }
    }

    // Crear cedulas (con race protection)
    if (hash) {
      try {
        await setDoc(doc(db, 'cedulas', hash), {
          uid: cred.user.uid,
          creado: serverTimestamp()
        });
      } catch (exCedula) {
        console.warn('Cédula duplicada (race):', exCedula);
        try {
          await setDoc(doc(db, 'usuarios', cred.user.uid), {
            estadoCuenta: 'rechazado',
            motivo: 'Cédula duplicada (race condition)'
          }, { merge: true });
        } catch (_) {}
        err.textContent = 'Esa cédula acaba de ser registrada por otra persona. Contacta al administrador.';
        try { await signOut(auth); } catch (_) {}
        enRegistroEmailPass = false;
        return;
      }
    }

    ok.textContent = 'Registro exitoso. Espere aprobación del administrador.';
    e.target.reset();
    setTimeout(async () => {
      try { await signOut(auth); } catch (_) {}
      enRegistroEmailPass = false;
    }, 1200);
  } catch (ex) {
    console.error(ex);
    err.textContent = traducirError(ex.code);
    if (cred?.user) {
      try { await cred.user.delete(); } catch (_) {}
      try { await signOut(auth); } catch (_) {}
    }
    enRegistroEmailPass = false;
  } finally {
    loader(false);
  }
}

/* ---------- Login email/pass ---------- */
async function login(e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  try {
    loader(true);

    // Chequear suspensión por intentos fallidos antes de intentar
    const hash = await hashEmail(email);
    if (hash) {
      const lookupSnap = await getDoc(doc(db, 'emails-lookup', hash)).catch(() => null);
      if (lookupSnap?.exists()) {
        const uid = lookupSnap.data().uid;
        if (uid) {
          const contadorSnap = await getDoc(doc(db, 'intentos-publicos', uid)).catch(() => null);
          if (contadorSnap?.exists() && contadorSnap.data().contador >= 3) {
            err.textContent = 'Cuenta bloqueada por 3 intentos fallidos. Contactá al administrador.';
            loader(false);
            return;
          }
        }
      }
    }

    await signInWithEmailAndPassword(auth, email, pass);
  } catch (ex) {
    const erroresDeCredenciales = [
      'auth/invalid-credential',
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-login-credentials'
    ];
    if (erroresDeCredenciales.includes(ex.code)) {
      await registrarIntentoFallido(email);
    }
    err.textContent = traducirError(ex.code);
  } finally {
    loader(false);
  }
}

/* ---------- Login Google (con redirect) ---------- */
async function loginGoogle() {
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    loader(true);
    await signInWithRedirect(auth, proveedorGoogle);
  } catch (ex) {
    console.error(ex);
    err.textContent = traducirError(ex.code);
    loader(false);
  }
}

/* ---------- Recuperar contraseña ---------- */
async function recuperarPassword() {
  const err = document.getElementById('login-error');
  err.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  if (!email) { err.textContent = 'Escribe primero tu correo en el campo de arriba.'; return; }
  try {
    loader(true);
    await sendPasswordResetEmail(auth, email);
    toast('Te enviamos un correo para restablecer tu contraseña.');
  } catch (ex) {
    err.textContent = traducirError(ex.code);
  } finally {
    loader(false);
  }
}

async function logout() {
  detenerMonitoreoSesion();
  document.dispatchEvent(new CustomEvent('usuarioCerroSesion'));
  await signOut(auth);
  sessionStorage.removeItem('usuarioActual');
}

/* ---------- Observador de sesión ---------- */
function observar() {
  onAuthStateChanged(auth, async (user) => {
    if (enRegistroEmailPass) return;

    if (!user) {
      mostrarVista('vista-login');
      loader(false);
      return;
    }

    try {
      const snap = await getDoc(doc(db, 'usuarios', user.uid));

      if (!snap.exists()) {
        const esGoogle = user.providerData.some(p => p.providerId === 'google.com');
        if (esGoogle) {
          usuarioGoogleTemporal = user;
          await abrirModalRegistroGoogle();
          return;
        }
        toast('Tu cuenta no tiene perfil en el sistema. Contacta al administrador.', 5000);
        await signOut(auth);
        return;
      }

      const perfil = snap.data();

      if (perfil.estadoCuenta === 'pendiente') {
        toast('Tu cuenta está pendiente de aprobación por el administrador.', 5000);
        await signOut(auth);
        return;
      }
      if (perfil.estadoCuenta === 'rechazado') {
        toast('Tu cuenta ha sido rechazada. Contacta al administrador.', 5000);
        await signOut(auth);
        return;
      }
      if (perfil.suspendido) {
        toast('Tu cuenta está suspendida. Contacta al administrador.', 5000);
        await signOut(auth);
        return;
      }

      perfil.uid = user.uid;
      window.__perfil = perfil;

      resetearIntentosFallidos(user.uid);

      const perfilSeguro = { ...perfil };
      delete perfilSeguro.cedula;
      delete perfilSeguro.telefono;
      sessionStorage.setItem('usuarioActual', JSON.stringify(perfilSeguro));

      inicializarDashboard(perfil);

      if (typeof cargarTerritorio === 'function') {
        cargarTerritorio().catch((err) => console.warn('[Preload] fallo:', err));
      }
    } catch (err) {
      console.error('Error al cargar perfil:', err);
      toast('Error al cargar tu perfil.');
      await signOut(auth);
    } finally {
      loader(false);
    }
  });
}

/* ---------- Inicializar dashboard ---------- */
function inicializarDashboard(perfil) {
  const avatar = document.getElementById('userAvatar');
  const name   = document.getElementById('userName');
  const role   = document.getElementById('userRole');
  const nivel  = document.getElementById('nivelUsuario');

  const etiquetasRol = {
    control: 'Control y Seguimiento Nacional',
    visor_nacional: 'Visor Nacional',
    reporte_nacional: 'Reporte Nacional',
    reporte_estadal: 'Reporte Estadal',
    dashboard_nacional: 'Gestión Nacional',
    dashboard_estadal: 'Gestión Estadal'
  };

  if (avatar) avatar.textContent = (perfil.nombre || perfil.email || 'U').charAt(0).toUpperCase();
  if (name)   name.textContent   = perfil.nombre || perfil.email || 'Usuario';
  if (role)   role.textContent   = etiquetasRol[perfil.rol] || perfil.rol || 'Sin rol';

  const niveles = {
    'control': 'Control y Seguimiento',
    'visor_nacional': 'Visor Nacional',
    'reporte_nacional': 'Reporte Nacional',
    'reporte_estadal': 'Reporte Estadal',
    'dashboard_nacional': 'Dashboard Nacional',
    'dashboard_estadal': 'Dashboard Estadal'
  };
  if (nivel) nivel.textContent = niveles[perfil.rol] || (perfil.rol || '').toUpperCase();

  mostrarVista('vista-app');
  document.dispatchEvent(new CustomEvent('usuarioListo', { detail: perfil }));
  iniciarMonitoreoSesion();
}

/* ---------- Modal registro Google ampliado ---------- */
async function abrirModalRegistroGoogle() {
  loader(false);
  await cargarTerritorio();
  const sel = document.getElementById('regEstado');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione estado</option>';
  ESTADOS_VENEZUELA.forEach(estado => {
    const o = document.createElement('option');
    o.value = estado; o.textContent = estado;
    sel.appendChild(o);
  });
  document.getElementById('modalRegistroGoogle').style.display = 'flex';
}

window.cargarMunicipiosRegistro = function () {
  const estado = document.getElementById('regEstado').value;
  const selectMun = document.getElementById('regMunicipio');
  const selectPar = document.getElementById('regParroquia');

  selectMun.innerHTML = '<option value="">Seleccione municipio</option>';
  selectPar.innerHTML = '<option value="">Seleccione parroquia</option>';
  selectPar.disabled = true;

  if (estado) {
    municipiosDe(estado).forEach(mun => {
      const o = document.createElement('option');
      o.value = mun; o.textContent = mun;
      selectMun.appendChild(o);
    });
    selectMun.disabled = false;
  } else {
    selectMun.disabled = true;
  }
};

window.cargarParroquiasRegistro = function () {
  const estado    = document.getElementById('regEstado').value;
  const municipio = document.getElementById('regMunicipio').value;
  const selectPar = document.getElementById('regParroquia');

  selectPar.innerHTML = '<option value="">Seleccione parroquia</option>';

  if (estado && municipio) {
    parroquiasDe(estado, municipio).forEach(par => {
      const o = document.createElement('option');
      o.value = par; o.textContent = par;
      selectPar.appendChild(o);
    });
    selectPar.disabled = false;
  } else {
    selectPar.disabled = true;
  }
};

/* P4 + P5 FIX: perfil primero con merge (idempotente), luego link.
   Verificación de cédula sin tragar errores.
   Reintentos seguros si alguna escritura falla a mitad. */
async function completarRegistroGoogle() {
  const errEl = document.getElementById('regError');
  errEl.textContent = '';

  const email      = usuarioGoogleTemporal.email;
  const password   = document.getElementById('regPassword').value;
  const nombre     = document.getElementById('regNombre').value.trim();
  const apellido   = document.getElementById('regApellido').value.trim();
  const cedula     = document.getElementById('regCedula').value.trim();
  const telefono   = document.getElementById('regTelefono').value.trim();
  const direccion  = document.getElementById('regDireccion').value.trim();
  const cargo      = document.getElementById('regCargo').value.trim();
  const estado     = document.getElementById('regEstado').value;
  const municipio  = document.getElementById('regMunicipio').value;
  const parroquia  = document.getElementById('regParroquia').value;

  if (!nombre || !apellido || !cedula || !telefono || !estado || !municipio || !password) {
    errEl.textContent = 'Complete todos los campos obligatorios (*).';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }

  // P5: verificar cédula sin tragar el error. Google auth está activo → getDoc funciona.
  let hashCed = null;
  try {
    hashCed = await hashCedula(cedula);
    if (hashCed) {
      const cedulaSnap = await getDoc(doc(db, 'cedulas', hashCed));
      if (cedulaSnap.exists() && cedulaSnap.data().uid !== usuarioGoogleTemporal.uid) {
        errEl.textContent = 'Esa cédula ya está registrada en el sistema.';
        return;
      }
    }
  } catch (errCed) {
    console.error('Error verificando cédula:', errCed);
    errEl.textContent = 'No se pudo verificar la cédula. Intenta de nuevo.';
    return;
  }

  try {
    loader(true);

    // P4: perfil PRIMERO (idempotente con merge), luego link
    await setDoc(doc(db, 'usuarios', usuarioGoogleTemporal.uid), {
      uid: usuarioGoogleTemporal.uid,
      email,
      nombre: `${nombre} ${apellido}`,
      apellido,
      cedula,
      telefono,
      direccion,
      cargo,
      estado,
      municipio,
      parroquia,
      estadoCuenta: 'pendiente',
      suspendido: false,
      rol: 'reporte_estadal',
      gerencia: null,
      creado: serverTimestamp()
    }, { merge: true });

    // Link credencial email/password (idempotente)
    try {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(usuarioGoogleTemporal, credential);
    } catch (errLink) {
      if (errLink.code === 'auth/provider-already-linked' ||
          errLink.code === 'auth/credential-already-in-use') {
        console.warn('Credencial ya enlazada:', errLink.code);
      } else {
        throw errLink;
      }
    }

    // emails-lookup (idempotente con merge)
    const emailHashGoogle = await hashEmail(email);
    if (emailHashGoogle) {
      try {
        await setDoc(doc(db, 'emails-lookup', emailHashGoogle), {
          uid: usuarioGoogleTemporal.uid,
          creado: serverTimestamp()
        }, { merge: true });
      } catch (ex) {
        console.warn('No se pudo crear email-lookup:', ex);
      }
    }

    // cedulas (idempotente con merge)
    if (hashCed) {
      try {
        await setDoc(doc(db, 'cedulas', hashCed), {
          uid: usuarioGoogleTemporal.uid,
          creado: serverTimestamp()
        }, { merge: true });
      } catch (ex) {
        console.warn('No se pudo crear cedulas:', ex);
      }
    }

    document.getElementById('modalRegistroGoogle').style.display = 'none';
    toast('Registro exitoso. Su cuenta está pendiente de aprobación. Rol por defecto: Reporte Estadal (el administrador puede ajustarlo al aprobar).', 6000);
    usuarioGoogleTemporal = null;
    await signOut(auth);
  } catch (error) {
    console.error(error);
    errEl.textContent = 'Error: ' + error.message;
  } finally {
    loader(false);
  }
}

/* ---------- Traducción de errores ---------- */
function traducirError(code) {
  const m = {
    'auth/email-already-in-use':   'Este correo ya está registrado. Inicia sesión o usa otro.',
    'auth/invalid-email':          'Correo inválido.',
    'auth/weak-password':          'Contraseña muy débil (mínimo 6 caracteres).',
    'auth/user-not-found':         'No existe una cuenta con ese correo.',
    'auth/wrong-password':         'Contraseña incorrecta.',
    'auth/invalid-credential':     'Correo o contraseña incorrectos.',
    'auth/too-many-requests':      'Demasiados intentos. Intenta más tarde.',
    'auth/popup-closed-by-user':   'Cerraste la ventana de Google.',
    'auth/popup-blocked':          'El navegador bloqueó la ventana de Google.',
    'auth/network-request-failed': 'Sin conexión. Verifica tu internet.',
    'auth/account-exists-with-different-credential': 'Ese correo ya está registrado con otro método.'
  };
  return m[code] || 'Error: ' + code;
}

/* ---------- Inicializar ---------- */
export function initAuth() {
  setPersistence(auth, browserSessionPersistence).catch((err) => {
    console.warn('No se pudo configurar la persistencia de sesión:', err);
  });

  poblarEstados();
  poblarGerencias();
  wireNavAuth();
  wireRolRegistro();

  document.getElementById('form-login')?.addEventListener('submit', login);
  document.getElementById('form-registro')?.addEventListener('submit', registrar);
  document.getElementById('btn-google')?.addEventListener('click', loginGoogle);
  document.getElementById('btn-forgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    recuperarPassword();
  });
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  document.getElementById('btnCompletarRegistroGoogle')?.addEventListener('click', completarRegistroGoogle);
  document.getElementById('btnCancelarRegistroGoogle')?.addEventListener('click', async () => {
    document.getElementById('modalRegistroGoogle').style.display = 'none';
    usuarioGoogleTemporal = null;
    await signOut(auth);
  });
  document.getElementById('btnCerrarModalRegistro')?.addEventListener('click', async () => {
    document.getElementById('modalRegistroGoogle').style.display = 'none';
    usuarioGoogleTemporal = null;
    await signOut(auth);
  });
  document.getElementById('btnExtenderSesion')?.addEventListener('click', extenderSesion);
  document.getElementById('btnCerrarSesionAhora')?.addEventListener('click', cerrarSesionPorTimeout);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modalSesionPorExpirar');
      if (modal && modal.style.display === 'flex') {
        extenderSesion();
      }
    }
  });

  // Restaurar sesión si hay
  setTimeout(() => {
    const guardado = sessionStorage.getItem('usuarioActual');
    if (guardado) {
      try {
        const perfil = JSON.parse(guardado);
        getDoc(doc(db, 'usuarios', perfil.uid)).then(snap => {
          if (!snap.exists()) {
            sessionStorage.removeItem('usuarioActual');
            signOut(auth);
            return;
          }
          const fresco = snap.data();
          if (fresco.estadoCuenta === 'pendiente' ||
              fresco.estadoCuenta === 'rechazado' ||
              fresco.suspendido) {
            sessionStorage.removeItem('usuarioActual');
            signOut(auth);
            return;
          }
          fresco.uid = perfil.uid;
          window.__perfil = fresco;
          const frescoSeguro = { ...fresco };
          delete frescoSeguro.cedula;
          delete frescoSeguro.telefono;
          sessionStorage.setItem('usuarioActual', JSON.stringify(frescoSeguro));
          inicializarDashboard(fresco);
        }).catch(() => {
          sessionStorage.removeItem('usuarioActual');
        });
      } catch (_) {
        sessionStorage.removeItem('usuarioActual');
      }
    }
  }, 0);

  getRedirectResult(auth).catch(err => {
    if (err?.code) {
      console.error('Error en redirect Google:', err.code);
      toast(traducirError(err.code), 5000);
    }
  });

  observar();
}

initAuth();