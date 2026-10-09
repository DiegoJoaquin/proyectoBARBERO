/* ============================================================
   admin.js — Lógica del Panel del Barbero · Cortes Zahir
   Requiere: config.js, common.js
   ============================================================ */

'use strict';

// ── HELPERS ───────────────────────────────────────────────────
const PIN_LENGTH = CONFIG.adminPinLength || 6;
const DEMO_PIN   = '123456'.slice(0, PIN_LENGTH);

function todayStr() { return toLocalDateStr(new Date()); }

function offsetDate(dateStr, days) {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + days);
  return toLocalDateStr(dt);
}

function formatDateDisplay(dateStr) {
  return parseDateStr(dateStr).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function getNavLabel(dateStr) {
  if (dateStr === todayStr())                return 'Hoy';
  if (dateStr === offsetDate(todayStr(), 1))  return 'Mañana';
  if (dateStr === offsetDate(todayStr(), -1)) return 'Ayer';
  return '';
}

/** Lanza el error de Supabase si lo hay (antes se ignoraban en silencio) */
function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ── DATABASE ──────────────────────────────────────────────────
const DB = {
  async getAppointmentsForDate(dateStr) {
    if (IS_DEMO) {
      return DemoStore.appointments
        .filter(a => a.appointment_date === dateStr)
        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    }
    return check(await sb.from('appointments')
      .select('*')
      .eq('appointment_date', dateStr)
      .order('appointment_time')) || [];
  },

  async getAppointment(id) {
    if (IS_DEMO) return DemoStore.appointments.find(a => a.id === id) || null;
    return check(await sb.from('appointments').select('*').eq('id', id).maybeSingle());
  },

  async getBlockedForDate(dateStr) {
    if (IS_DEMO) return DemoStore.blocked.filter(b => b.slot_date === dateStr);
    return check(await sb.from('blocked_slots').select('*').eq('slot_date', dateStr)) || [];
  },

  async createAppointment(appt) {
    if (IS_DEMO) {
      const taken = DemoStore.appointments.some(a =>
        a.appointment_date === appt.appointment_date &&
        a.appointment_time === appt.appointment_time &&
        a.status !== 'cancelled');
      if (taken) throw { code: '23505' };
      DemoStore.appointments = [...DemoStore.appointments, {
        ...appt, id: crypto.randomUUID(), created_at: new Date().toISOString()
      }];
      return;
    }
    check(await sb.from('appointments').insert(appt));
  },

  async updateStatus(id, status) {
    if (IS_DEMO) {
      DemoStore.appointments = DemoStore.appointments.map(a => a.id === id ? { ...a, status } : a);
      return;
    }
    check(await sb.from('appointments').update({ status }).eq('id', id));
  },

  async blockSlot(slot) {
    if (IS_DEMO) {
      DemoStore.blocked = [...DemoStore.blocked, { ...slot, id: crypto.randomUUID() }];
      return;
    }
    check(await sb.from('blocked_slots').insert(slot));
  },

  async deleteBlockedSlot(id) {
    if (IS_DEMO) {
      DemoStore.blocked = DemoStore.blocked.filter(b => b.id !== id);
      return;
    }
    check(await sb.from('blocked_slots').delete().eq('id', id));
  },

  /** Avisa de cualquier cambio en turnos o bloqueos (tiempo real) */
  subscribe(callback) {
    if (IS_DEMO) return null;
    return sb.channel('admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' }, callback)
      .subscribe();
  }
};

// ── AUTH ──────────────────────────────────────────────────────
const Auth = {
  _DEMO_KEY: 'cz_admin_demo_auth',

  async isAuthenticated() {
    if (IS_DEMO) return sessionStorage.getItem(this._DEMO_KEY) === '1';
    const { data } = await sb.auth.getSession();
    return !!data.session;
  },

  /** Devuelve true si el PIN es correcto */
  async login(pin) {
    if (IS_DEMO) {
      if (pin !== DEMO_PIN) return false;
      sessionStorage.setItem(this._DEMO_KEY, '1');
      return true;
    }
    const { error } = await sb.auth.signInWithPassword({ email: CONFIG.adminEmail, password: pin });
    if (!error) return true;
    if (error.status === 400) return false;   // credenciales inválidas
    throw error;                              // red caída, límite de intentos, etc.
  },

  async logout() {
    if (IS_DEMO) { sessionStorage.removeItem(this._DEMO_KEY); return; }
    await sb.auth.signOut();
  }
};

// ── PIN SCREEN ────────────────────────────────────────────────
let pinEntry = '';
let pinBusy = false;
let failedAttempts = 0;
let lockedUntil = 0;

function renderPinDots() {
  const display = $('pinDisplay');
  display.innerHTML = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot';
    display.appendChild(dot);
  }
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinEntry.length);
  });
}

function showPinError(msg) {
  document.querySelectorAll('.pin-dot').forEach(dot => {
    dot.classList.add('error');
    setTimeout(() => dot.classList.remove('error', 'filled'), 600);
  });
  $('pinError').textContent = msg;
  $('pinError').classList.remove('hidden');
  setTimeout(() => $('pinError').classList.add('hidden'), 2500);
  pinEntry = '';
}

async function checkPin() {
  if (Date.now() < lockedUntil) {
    const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
    showPinError(`Demasiados intentos. Espera ${secs} s.`);
    return;
  }
  pinBusy = true;
  $('pinDisplay').classList.add('checking');
  try {
    if (await Auth.login(pinEntry)) {
      failedAttempts = 0;
      pinEntry = '';
      updatePinDots();
      showDashboard();
    } else {
      failedAttempts++;
      if (failedAttempts >= 5) {
        lockedUntil = Date.now() + 30_000;
        failedAttempts = 0;
        showPinError('Demasiados intentos. Espera 30 s.');
      } else {
        showPinError('PIN incorrecto. Intenta de nuevo.');
      }
    }
  } catch (err) {
    console.error(err);
    showPinError(err.status === 429
      ? 'Demasiados intentos. Espera unos minutos.'
      : 'Sin conexión con el servidor. Intenta de nuevo.');
  } finally {
    pinBusy = false;
    $('pinDisplay').classList.remove('checking');
  }
}

function pressPinKey(key) {
  if (pinBusy) return;
  if (key === 'del')        pinEntry = pinEntry.slice(0, -1);
  else if (key === 'clear') pinEntry = '';
  else if (pinEntry.length < PIN_LENGTH) pinEntry += key;

  updatePinDots();
  if (pinEntry.length === PIN_LENGTH) checkPin();
}

function initPinKeyboard() {
  renderPinDots();
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => pressPinKey(btn.dataset.key));
  });
  document.addEventListener('keydown', e => {
    if ($('loginScreen').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') pressPinKey(e.key);
    else if (e.key === 'Backspace') pressPinKey('del');
  });
}

// ── DASHBOARD ─────────────────────────────────────────────────
let currentDateStr = todayStr();
let loadToken = 0;
let realtimeChannel = null;
let refreshTimer = null;

function showDashboard() {
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  if (IS_DEMO) $('adminDemoBanner').classList.remove('hidden');

  if (!realtimeChannel) realtimeChannel = DB.subscribe(scheduleRefresh);
  loadDay(currentDateStr);
}

function hideDashboard() {
  if (realtimeChannel) { sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  ['addModal', 'blockModal', 'detailModal'].forEach(closeModal);
  $('dashboard').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  pinEntry = '';
  updatePinDots();
}

/** Recarga el día actual sin mostrar "cargando" (para cambios en tiempo real) */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadDay(currentDateStr, { silent: true }), 300);
}

async function loadDay(dateStr, { silent = false } = {}) {
  currentDateStr = dateStr;
  updateDateNav(dateStr);
  const token = ++loadToken;

  if (!silent) {
    $('timeline').innerHTML = `
      <div class="empty-state">
        <div class="spinner"></div>
        <div class="empty-state__title">Cargando agenda…</div>
      </div>`;
  }

  try {
    const [appts, blocked] = await Promise.all([
      DB.getAppointmentsForDate(dateStr),
      DB.getBlockedForDate(dateStr)
    ]);
    if (token !== loadToken) return; // el usuario ya cambió de día
    renderTimeline(dateStr, appts, blocked);
    updateStats(appts);
  } catch (err) {
    console.error(err);
    if (token !== loadToken) return;
    if (err?.code === 'PGRST301' || err?.status === 401) {   // sesión expirada
      showToast('Tu sesión expiró. Ingresa el PIN de nuevo.', 'error');
      hideDashboard();
      return;
    }
    if (silent) return;
    $('timeline').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__title">Error al cargar</div>
        <div class="empty-state__desc">Verifica tu conexión a internet.</div>
        <button class="btn btn--ghost btn--sm" data-action="retry">Reintentar</button>
      </div>`;
  }
}

function updateDateNav(dateStr) {
  $('navLabel').textContent = getNavLabel(dateStr) || ' ';
  $('navDate').textContent = parseDateStr(dateStr).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  $('navDatePicker').value = dateStr;
  $('goToday').classList.toggle('invisible', dateStr === todayStr());
}

function updateStats(appts) {
  $('statTotal').textContent     = appts.filter(a => a.status !== 'cancelled').length;
  $('statPending').textContent   = appts.filter(a => a.status === 'pending').length;
  $('statCompleted').textContent = appts.filter(a => a.status === 'completed').length;
}

// ── TIMELINE ──────────────────────────────────────────────────
function statusLabel(status) {
  const map = {
    pending:   '<span class="badge badge--pending">⏳ Pendiente</span>',
    confirmed: '<span class="badge badge--confirmed">✓ Confirmado</span>',
    completed: '<span class="badge badge--completed">✅ Hecho</span>',
    cancelled: '<span class="badge badge--cancelled">✕ Cancelado</span>'
  };
  return map[status] || map.pending;
}

function apptCardHTML(appt) {
  const id = escHtml(appt.id);
  const active = appt.status !== 'completed' && appt.status !== 'cancelled';
  return `
    <div class="appt-card appt-card--${escHtml(appt.status)}">
      <div class="appt-card__top">
        <div>
          <div class="appt-card__name">${escHtml(appt.client_name)}</div>
          <div class="appt-card__service">${escHtml(appt.service)}</div>
        </div>
        ${statusLabel(appt.status)}
      </div>
      <div class="appt-card__phone">
        📞 ${isValidPhone(appt.client_phone)
          ? `<a href="tel:${escHtml(appt.client_phone)}">${escHtml(appt.client_phone)}</a>`
          : escHtml(appt.client_phone)}
      </div>
      ${appt.notes ? `<div class="appt-card__notes">📝 ${escHtml(appt.notes)}</div>` : ''}
      <div class="appt-card__actions">
        ${appt.status === 'pending' ? `<button class="btn btn--success btn--sm" data-action="status" data-status="confirmed" data-id="${id}">✓ Confirmar</button>` : ''}
        ${active ? `<button class="btn btn--ghost btn--sm" data-action="status" data-status="completed" data-id="${id}">✅ Hecho</button>` : ''}
        <button class="btn btn--ghost btn--sm" data-action="detail" data-id="${id}">Ver más</button>
        ${active ? `<button class="btn btn--danger btn--sm" data-action="cancel" data-id="${id}" aria-label="Cancelar turno">✕</button>` : ''}
      </div>
    </div>`;
}

function renderTimeline(dateStr, appts, blocked) {
  const timeline = $('timeline');
  const active = appts.filter(a => a.status !== 'cancelled');
  const cancelled = appts.filter(a => a.status === 'cancelled');

  // Mapa de turnos activos por hora (los cancelados NO tapan a uno nuevo en la misma hora)
  const apptMap = {};
  active.forEach(a => { apptMap[a.appointment_time.slice(0, 5)] = a; });

  // Horarios del día + turnos fuera de la grilla (ej: si se cambió el horario en config.js)
  const slots = [...new Set([...generateSlots(parseDateStr(dateStr)), ...Object.keys(apptMap)])].sort();

  if (slots.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🚫</div>
        <div class="empty-state__title">${parseDateStr(dateStr).getDay() === 0 ? 'Domingo' : 'Día libre'}</div>
        <div class="empty-state__desc">No hay atención este día.</div>
      </div>`;
    return;
  }

  const now = new Date();
  const isPastSlot = slot => dateStr < todayStr() ||
    (dateStr === todayStr() && toMin(slot) + CONFIG.slotDuration <= now.getHours() * 60 + now.getMinutes());

  const fullyBlocked = slots.every(s => findBlock(s, blocked));
  let html = active.length === 0 && !fullyBlocked ? `
    <div class="empty-state empty-state--compact">
      <div class="empty-state__title">😌 Sin reservas este día</div>
      <div class="empty-state__desc">Toca un horario libre o el botón + para agregar.</div>
    </div>` : '';

  let lastBlockId = null;
  slots.forEach((slot, idx) => {
    const appt = apptMap[slot];
    const blk  = findBlock(slot, blocked);

    // Un bloqueo que abarca varios horarios se muestra una sola vez
    if (!appt && blk && blk.id === lastBlockId) return;
    lastBlockId = !appt && blk ? blk.id : null;
    let dotClass = '';
    let content;

    if (appt) {
      dotClass = `timeline-slot--${appt.status}`;
      content = apptCardHTML(appt);
    } else if (blk) {
      dotClass = 'timeline-slot--blocked';
      content = `
        <div class="blocked-slot">
          <div class="blocked-slot__info">
            🔒 <div>
              <div>Bloqueado ${escHtml(blk.start_time.slice(0, 5))}–${escHtml(blk.end_time.slice(0, 5))}</div>
              ${blk.reason ? `<div class="blocked-slot__reason">${escHtml(blk.reason)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn--danger btn--sm" data-action="unblock" data-id="${escHtml(blk.id)}">Quitar</button>
        </div>`;
    } else if (isPastSlot(slot)) {
      content = `<div class="free-slot free-slot--past">Libre</div>`;
    } else {
      content = `
        <button class="free-slot" data-action="quick-add" data-slot="${slot}">
          <span>＋</span><span>Libre — toca para agregar</span>
        </button>`;
    }

    html += `
      <div class="timeline-slot">
        <div class="timeline-slot__time">${slot}</div>
        <div class="timeline-slot__line ${dotClass}">
          <div class="timeline-slot__dot"></div>
          ${idx < slots.length - 1 ? '<div class="timeline-slot__vline"></div>' : ''}
        </div>
        <div class="timeline-slot__content">${content}</div>
      </div>`;
  });

  if (cancelled.length) {
    html += `
      <details class="cancelled-list">
        <summary>Cancelados (${cancelled.length})</summary>
        ${cancelled.map(a => `
          <div class="cancelled-item">
            <span>${escHtml(a.appointment_time.slice(0, 5))} · ${escHtml(a.client_name)}</span>
            <button class="btn btn--ghost btn--sm" data-action="detail" data-id="${escHtml(a.id)}">Ver</button>
          </div>`).join('')}
      </details>`;
  }

  timeline.innerHTML = html;
}

// Un solo listener para todos los botones de la agenda
$('timeline').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, status, slot } = btn.dataset;
  if (action === 'status')    changeStatus(id, status);
  if (action === 'cancel')    cancelAppt(id);
  if (action === 'detail')    openDetail(id);
  if (action === 'unblock')   unblockSlot(id);
  if (action === 'quick-add') openAddModal(currentDateStr, slot);
  if (action === 'retry')     loadDay(currentDateStr);
});

// ── APPOINTMENT ACTIONS ───────────────────────────────────────
async function changeStatus(id, status) {
  try {
    await DB.updateStatus(id, status);
    closeModal('detailModal');
    await loadDay(currentDateStr, { silent: true });
    const labels = {
      confirmed: 'Turno confirmado',
      completed: 'Turno marcado como hecho',
      pending:   'Turno restaurado'
    };
    showToast(labels[status] || 'Estado actualizado', 'success');
  } catch (err) {
    console.error(err);
    showToast(isSlotTakenError(err)
      ? 'Esa hora ya está ocupada por otro turno.'
      : 'Error al actualizar. Intenta de nuevo.', 'error');
  }
}

async function cancelAppt(id) {
  if (!confirm('¿Cancelar este turno? El horario quedará libre para otros clientes.')) return;
  try {
    await DB.updateStatus(id, 'cancelled');
    closeModal('detailModal');
    await loadDay(currentDateStr, { silent: true });
    showToast('Turno cancelado', 'info');
  } catch (err) {
    console.error(err);
    showToast('Error al cancelar. Intenta de nuevo.', 'error');
  }
}

async function unblockSlot(id) {
  try {
    await DB.deleteBlockedSlot(id);
    await loadDay(currentDateStr, { silent: true });
    showToast('Horario desbloqueado', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al desbloquear. Intenta de nuevo.', 'error');
  }
}

// ── DETAIL MODAL ──────────────────────────────────────────────
function detailRow(icon, label, valueHTML) {
  return `
    <div class="detail-row">
      <span class="detail-row__icon">${icon}</span>
      <div>
        <div class="detail-row__label">${label}</div>
        <div class="detail-row__value">${valueHTML}</div>
      </div>
    </div>`;
}

async function openDetail(id) {
  let appt;
  try {
    appt = await DB.getAppointment(id);
  } catch (err) {
    console.error(err);
    showToast('No se pudo abrir el turno.', 'error');
    return;
  }
  if (!appt) return;

  const time = appt.appointment_time.slice(0, 5);
  $('detailTitle').innerHTML = `<span>📋</span>${escHtml(appt.client_name)}`;
  $('detailBody').innerHTML = [
    detailRow('✂️', 'Servicio', escHtml(appt.service)),
    detailRow('📅', 'Fecha', escHtml(formatDateDisplay(appt.appointment_date))),
    detailRow('🕐', 'Hora', `${escHtml(time)} hrs`),
    detailRow('📞', 'Teléfono', `<a href="tel:${escHtml(appt.client_phone)}">${escHtml(appt.client_phone)}</a>`),
    appt.notes ? detailRow('📝', 'Notas', escHtml(appt.notes)) : '',
    detailRow('📌', 'Estado', statusLabel(appt.status)),
    detailRow('🕒', 'Reservado', escHtml(new Date(appt.created_at).toLocaleString('es-CL')))
  ].join('');

  const phone = waNumber(appt.client_phone);
  const firstName = appt.client_name.split(' ')[0];
  const reminder = `Hola ${firstName}! Te recuerdo tu hora en ${CONFIG.business.name} ` +
    `el ${formatDateDisplay(appt.appointment_date)} a las ${time} hrs (${appt.service}). ¡Te espero! 💈`;

  const id_ = escHtml(appt.id);
  $('detailActions').innerHTML = `
    ${isValidPhone(appt.client_phone) ? `
      <a href="https://wa.me/${phone}?text=${encodeURIComponent(reminder)}" target="_blank" rel="noopener"
         class="btn btn--gold-outline">💬 Recordatorio</a>` : ''}
    ${appt.status === 'cancelled'
      ? `<button class="btn btn--ghost" data-action="status" data-status="pending" data-id="${id_}">↺ Restaurar</button>`
      : ''}
    <button class="btn btn--ghost" data-action="close">Cerrar</button>
  `;

  openModal('detailModal');
}

$('detailActions').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'close')  closeModal('detailModal');
  if (btn.dataset.action === 'status') changeStatus(btn.dataset.id, btn.dataset.status);
});

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).classList.remove('open');
  if (!document.querySelector('.admin-modal-overlay.open')) document.body.style.overflow = '';
}

['addModal', 'blockModal', 'detailModal'].forEach(id => {
  $(id).addEventListener('click', e => { if (e.target === $(id)) closeModal(id); });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.admin-modal-overlay.open').forEach(m => closeModal(m.id));
});

// ── ADD APPOINTMENT MODAL ─────────────────────────────────────
function renderServiceSelect() {
  $('addService').innerHTML = CONFIG.services
    .map((s, i) => `<option value="${i}">${escHtml(s.name)} · ${s.duration} min${s.price ? ' · ' + escHtml(s.price) : ''}</option>`)
    .join('');
}

function openAddModal(dateStr = currentDateStr, preSlot = '') {
  $('addName').value  = '';
  $('addPhone').value = '';
  $('addNotes').value = '';
  $('addService').value = '0';
  $('addDate').value  = dateStr < todayStr() ? todayStr() : dateStr;
  $('addDate').min    = todayStr();
  populateFreeSlots(preSlot);
  openModal('addModal');
  setTimeout(() => $('addName').focus(), 150);
}

/** Llena el selector solo con horarios libres (no ocupados ni bloqueados) */
async function populateFreeSlots(preSlot = '') {
  const select = $('addTime');
  const dateStr = $('addDate').value;
  select.innerHTML = '<option value="">Cargando…</option>';
  if (!dateStr) { select.innerHTML = '<option value="">Selecciona primero la fecha</option>'; return; }

  try {
    const busy = await fetchBusy(dateStr);
    if ($('addDate').value !== dateStr) return; // cambió la fecha mientras cargaba
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const free = generateSlots(parseDateStr(dateStr)).filter(s =>
      !busy.taken.includes(s) && !findBlock(s, busy.blocked) &&
      !(dateStr === todayStr() && toMin(s) + CONFIG.slotDuration <= nowMin));

    select.innerHTML = free.length
      ? free.map(s => `<option value="${s}"${s === preSlot ? ' selected' : ''}>${s}</option>`).join('')
      : '<option value="">Sin horarios libres este día</option>';
  } catch (err) {
    console.error(err);
    select.innerHTML = '<option value="">Error al cargar horarios</option>';
  }
}

$('addDate').addEventListener('change', () => populateFreeSlots());
$('addModalCancel').addEventListener('click', () => closeModal('addModal'));

$('addModalConfirm').addEventListener('click', async () => {
  const name    = $('addName').value.trim();
  const phone   = $('addPhone').value.trim();
  const date    = $('addDate').value;
  const time    = $('addTime').value;
  const notes   = $('addNotes').value.trim();
  const service = CONFIG.services[Number($('addService').value)] || CONFIG.services[0];

  if (!name)  { showToast('Ingresa el nombre del cliente.', 'error'); return; }
  if (!date || !time) { showToast('Selecciona fecha y horario.', 'error'); return; }

  $('addBtnLabel').classList.add('hidden');
  $('addBtnSpinner').classList.remove('hidden');
  $('addModalConfirm').disabled = true;

  try {
    await DB.createAppointment({
      client_name:      name,
      client_phone:     phone || 'Sin teléfono',
      service:          service.name,
      appointment_date: date,
      appointment_time: time + ':00',
      notes:            notes || null,
      status:           'confirmed'
    });
    closeModal('addModal');
    if (date !== currentDateStr) await loadDay(date);
    else await loadDay(currentDateStr, { silent: true });
    showToast('Turno agregado', 'success');
  } catch (err) {
    console.error(err);
    if (isSlotTakenError(err)) {
      showToast('Esa hora se acaba de ocupar. Elige otra.', 'error');
      populateFreeSlots();
    } else {
      showToast('Error al guardar. Intenta de nuevo.', 'error');
    }
  } finally {
    $('addBtnLabel').classList.remove('hidden');
    $('addBtnSpinner').classList.add('hidden');
    $('addModalConfirm').disabled = false;
  }
});

// ── BLOCK SLOT MODAL ──────────────────────────────────────────
function dayBounds(dateStr) {
  const slots = generateSlots(parseDateStr(dateStr));
  if (!slots.length) return null;
  return { slots, end: toTimeStr(toMin(slots[slots.length - 1]) + CONFIG.slotDuration) };
}

function openBlockModal() {
  $('blockDate').value     = currentDateStr < todayStr() ? todayStr() : currentDateStr;
  $('blockDate').min       = todayStr();
  $('blockReason').value   = '';
  $('blockAllDay').checked = false;
  populateBlockSlots();
  openModal('blockModal');
}

function populateBlockSlots() {
  const bounds = dayBounds($('blockDate').value || todayStr());
  const allDay = $('blockAllDay').checked;
  $('blockRange').classList.toggle('hidden', allDay);

  if (!bounds) {
    $('blockStart').innerHTML = '<option value="">No se trabaja este día</option>';
    $('blockEnd').innerHTML   = '<option value="">—</option>';
    return;
  }
  $('blockStart').innerHTML = bounds.slots.map(s => `<option value="${s}">${s}</option>`).join('');
  populateBlockEnd();
}

/** "Hasta" solo ofrece horas posteriores a "Desde" */
function populateBlockEnd() {
  const bounds = dayBounds($('blockDate').value || todayStr());
  if (!bounds) return;
  const start = $('blockStart').value;
  const ends = [...bounds.slots, bounds.end].filter(s => s > start);
  $('blockEnd').innerHTML = ends.map(s => `<option value="${s}">${s}</option>`).join('');
}

$('blockDate').addEventListener('change', populateBlockSlots);
$('blockAllDay').addEventListener('change', populateBlockSlots);
$('blockStart').addEventListener('change', populateBlockEnd);
$('blockModalCancel').addEventListener('click', () => closeModal('blockModal'));

$('blockModalConfirm').addEventListener('click', async () => {
  const date   = $('blockDate').value;
  const bounds = date && dayBounds(date);
  const allDay = $('blockAllDay').checked;
  const start  = allDay ? bounds?.slots[0] : $('blockStart').value;
  const end    = allDay ? bounds?.end      : $('blockEnd').value;
  const reason = $('blockReason').value.trim();

  if (!bounds) { showToast('Ese día no se trabaja.', 'error'); return; }
  if (!start || !end || start >= end) { showToast('Revisa el rango de horas.', 'error'); return; }

  $('blockBtnLabel').classList.add('hidden');
  $('blockBtnSpinner').classList.remove('hidden');
  $('blockModalConfirm').disabled = true;

  try {
    await DB.blockSlot({
      slot_date:  date,
      start_time: start + ':00',
      end_time:   end + ':00',
      reason:     reason || (allDay ? 'Día completo' : null)
    });
    closeModal('blockModal');
    if (date !== currentDateStr) await loadDay(date);
    else await loadDay(currentDateStr, { silent: true });
    showToast('Horario bloqueado', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al bloquear. Intenta de nuevo.', 'error');
  } finally {
    $('blockBtnLabel').classList.remove('hidden');
    $('blockBtnSpinner').classList.add('hidden');
    $('blockModalConfirm').disabled = false;
  }
});

// ── DATE NAVIGATION ───────────────────────────────────────────
$('prevDay').addEventListener('click', () => loadDay(offsetDate(currentDateStr, -1)));
$('nextDay').addEventListener('click', () => loadDay(offsetDate(currentDateStr, +1)));
$('goToday').addEventListener('click', () => loadDay(todayStr()));
$('navDatePicker').addEventListener('change', e => { if (e.target.value) loadDay(e.target.value); });
$('navCenter').addEventListener('click', () => {
  try { $('navDatePicker').showPicker(); } catch { $('navDatePicker').focus(); }
});

$('logoutBtn').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión?')) return;
  await Auth.logout();
  hideDashboard();
});

$('addApptBtn').addEventListener('click', () => openAddModal());
$('blockSlotBtn').addEventListener('click', openBlockModal);

// Al volver a la app (el celular la suspende), se recarga la agenda
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('dashboard').classList.contains('hidden')) {
    scheduleRefresh();
  }
});

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  initPinKeyboard();
  renderServiceSelect();

  if (!IS_DEMO) {
    sb.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && !$('dashboard').classList.contains('hidden')) hideDashboard();
    });
  }

  try {
    if (await Auth.isAuthenticated()) showDashboard();
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', init);
