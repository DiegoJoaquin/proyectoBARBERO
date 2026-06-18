/* ============================================================
   admin.js — Lógica del Panel del Barbero · Cortes Zahir
   ============================================================ */

'use strict';

// ── HELPERS ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = 'info') {
  const container = $('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function toLocalDateStr(dateObj) {
  return dateObj.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function isToday(dateStr) {
  return dateStr === toLocalDateStr(new Date());
}

function isTomorrow(dateStr) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === toLocalDateStr(tomorrow);
}

function isYesterday(dateStr) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === toLocalDateStr(yesterday);
}

function getNavLabel(dateStr) {
  if (isToday(dateStr))     return 'Hoy';
  if (isTomorrow(dateStr))  return 'Mañana';
  if (isYesterday(dateStr)) return 'Ayer';
  return '';
}

// ── DATABASE ABSTRACTION ──────────────────────────────────────
const DB = {
  _client: null,
  isDemo: false,

  _apptKey:    'cz_appointments',
  _blockedKey: 'cz_blocked',

  get _local()  { return JSON.parse(localStorage.getItem(this._apptKey)    || '[]'); },
  set _local(v) { localStorage.setItem(this._apptKey, JSON.stringify(v)); },
  get _blocked(){ return JSON.parse(localStorage.getItem(this._blockedKey) || '[]'); },
  set _blocked(v){ localStorage.setItem(this._blockedKey, JSON.stringify(v)); },

  init() {
    if (CONFIG.supabase.url.startsWith('TU_')) {
      this.isDemo = true;
      return;
    }
    this._client = window.supabase.createClient(
      CONFIG.supabase.url,
      CONFIG.supabase.anonKey
    );
  },

  async getAppointmentsForDate(dateStr) {
    if (this.isDemo) {
      return this._local
        .filter(a => a.appointment_date === dateStr)
        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    }
    const { data } = await this._client
      .from('appointments')
      .select('*')
      .eq('appointment_date', dateStr)
      .order('appointment_time');
    return data || [];
  },

  async getBlockedForDate(dateStr) {
    if (this.isDemo) {
      return this._blocked.filter(b => b.slot_date === dateStr);
    }
    const { data } = await this._client
      .from('blocked_slots')
      .select('*')
      .eq('slot_date', dateStr);
    return data || [];
  },

  async createAppointment(appt) {
    if (this.isDemo) {
      const newAppt = {
        ...appt,
        id: 'ADMIN-' + Math.random().toString(36).slice(2,8).toUpperCase(),
        status: 'confirmed',
        created_at: new Date().toISOString()
      };
      this._local = [...this._local, newAppt];
      return newAppt;
    }
    const { data, error } = await this._client
      .from('appointments').insert(appt).select().single();
    if (error) throw error;
    return data;
  },

  async updateStatus(id, status) {
    if (this.isDemo) {
      const list = this._local;
      const appt = list.find(a => a.id === id);
      if (appt) { appt.status = status; this._local = list; }
      return;
    }
    await this._client.from('appointments').update({ status }).eq('id', id);
  },

  async deleteAppointment(id) {
    if (this.isDemo) {
      this._local = this._local.filter(a => a.id !== id);
      return;
    }
    await this._client.from('appointments').delete().eq('id', id);
  },

  async blockSlot(slot) {
    if (this.isDemo) {
      const newSlot = {
        ...slot,
        id: 'BLK-' + Math.random().toString(36).slice(2,8).toUpperCase()
      };
      this._blocked = [...this._blocked, newSlot];
      return newSlot;
    }
    const { data, error } = await this._client
      .from('blocked_slots').insert(slot).select().single();
    if (error) throw error;
    return data;
  },

  async deleteBlockedSlot(id) {
    if (this.isDemo) {
      this._blocked = this._blocked.filter(b => b.id !== id);
      return;
    }
    await this._client.from('blocked_slots').delete().eq('id', id);
  },

  /** Suscripción a cambios en tiempo real (solo con Supabase) */
  subscribeToChanges(dateStr, callback) {
    if (this.isDemo || !this._client) return;
    return this._client
      .channel('admin-appts')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        payload => {
          if (payload.new?.appointment_date === dateStr ||
              payload.old?.appointment_date === dateStr) {
            callback();
          }
        })
      .subscribe();
  }
};

// ── TIME SLOT GENERATOR ───────────────────────────────────────
function generateSlots(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dow = dateObj.getDay();

  if (!CONFIG.workingDays.includes(dow)) return [];

  const isSat = dow === 6;
  const { start, end } = isSat
    ? CONFIG.workingHours.saturday
    : CONFIG.workingHours.weekdays;

  const toMin = t => { const [h, mm] = t.split(':').map(Number); return h*60+mm; };
  const toStr = mins => {
    const h = Math.floor(mins/60).toString().padStart(2,'0');
    const m = (mins%60).toString().padStart(2,'0');
    return `${h}:${m}`;
  };

  const slots = [];
  let cur = toMin(start);
  const endMin = toMin(end);
  while (cur + CONFIG.slotDuration <= endMin) {
    slots.push(toStr(cur));
    cur += CONFIG.slotDuration;
  }
  return slots;
}

// ── PIN AUTH ──────────────────────────────────────────────────
const Auth = {
  _pin: '',
  _SESSION_KEY: 'cz_admin_auth',
  _SESSION_TTL: 8 * 60 * 60 * 1000, // 8 hours

  isAuthenticated() {
    const raw = sessionStorage.getItem(this._SESSION_KEY);
    if (!raw) return false;
    try {
      const { ts } = JSON.parse(raw);
      return Date.now() - ts < this._SESSION_TTL;
    } catch { return false; }
  },

  login() {
    sessionStorage.setItem(this._SESSION_KEY, JSON.stringify({ ts: Date.now() }));
  },

  logout() {
    sessionStorage.removeItem(this._SESSION_KEY);
  }
};

let pinEntry = '';

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = $(`pd${i}`);
    dot.classList.toggle('filled', i < pinEntry.length);
  }
}

function flashError() {
  for (let i = 0; i < 4; i++) {
    const dot = $(`pd${i}`);
    dot.classList.add('error');
    setTimeout(() => dot.classList.remove('error', 'filled'), 600);
  }
  $('pinError').classList.remove('hidden');
  setTimeout(() => $('pinError').classList.add('hidden'), 2000);
  pinEntry = '';
}

function checkPin() {
  if (pinEntry === CONFIG.adminPin) {
    Auth.login();
    showDashboard();
  } else {
    flashError();
  }
}

function initPinKeyboard() {
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === 'del')   { pinEntry = pinEntry.slice(0,-1); }
      else if (key === 'clear') { pinEntry = ''; }
      else if (pinEntry.length < 4) { pinEntry += key; }

      updatePinDots();
      if (pinEntry.length === 4) checkPin();
    });
  });

  // Physical keyboard support
  document.addEventListener('keydown', e => {
    if ($('loginScreen').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9' && pinEntry.length < 4) {
      pinEntry += e.key;
      updatePinDots();
      if (pinEntry.length === 4) checkPin();
    } else if (e.key === 'Backspace') {
      pinEntry = pinEntry.slice(0,-1);
      updatePinDots();
    }
  });
}

// ── DASHBOARD LOGIC ───────────────────────────────────────────
let currentDateStr = toLocalDateStr(new Date());
let realtimeSub = null;

function showDashboard() {
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');

  if (DB.isDemo) $('adminDemoBanner').classList.remove('hidden');

  loadDay(currentDateStr);
}

async function loadDay(dateStr) {
  currentDateStr = dateStr;
  updateDateNav(dateStr);

  $('timeline').innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon" style="font-size:1.5rem; animation: spin .8s linear infinite">⚙️</div>
      <div class="empty-state__title">Cargando agenda…</div>
    </div>`;

  // Unsubscribe old
  if (realtimeSub) {
    try { realtimeSub.unsubscribe(); } catch {}
  }

  try {
    const [appts, blocked] = await Promise.all([
      DB.getAppointmentsForDate(dateStr),
      DB.getBlockedForDate(dateStr)
    ]);

    renderTimeline(dateStr, appts, blocked);
    updateStats(appts);

    // Real-time sub for today
    if (isToday(dateStr)) {
      realtimeSub = DB.subscribeToChanges(dateStr, () => loadDay(dateStr));
    }
  } catch (err) {
    console.error(err);
    $('timeline').innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__title">Error al cargar</div>
        <div class="empty-state__desc">Verificá tu conexión y recargá la página.</div>
      </div>`;
  }
}

function updateDateNav(dateStr) {
  const label = getNavLabel(dateStr);
  $('navLabel').textContent = label || dateStr;

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m-1, d);
  $('navDate').textContent = dateObj.toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function updateStats(appts) {
  const active = appts.filter(a => a.status !== 'cancelled');
  $('statTotal').textContent     = active.length;
  $('statPending').textContent   = appts.filter(a => a.status === 'pending').length;
  $('statCompleted').textContent = appts.filter(a => a.status === 'completed').length;
}

// ── TIMELINE RENDERER ─────────────────────────────────────────
function isTimeBlocked(timeStr, blocked) {
  const toMin = t => { const [h,m] = t.slice(0,5).split(':').map(Number); return h*60+m; };
  const sMin = toMin(timeStr);
  return blocked.find(b => {
    const bS = toMin(b.start_time), bE = toMin(b.end_time);
    return sMin >= bS && sMin < bE;
  });
}

function statusLabel(status) {
  const map = {
    pending:   '<span class="badge badge--pending">⏳ Pendiente</span>',
    confirmed: '<span class="badge badge--confirmed">✓ Confirmado</span>',
    completed: '<span class="badge badge--completed">✅ Completado</span>',
    cancelled: '<span class="badge badge--cancelled">✕ Cancelado</span>'
  };
  return map[status] || map.pending;
}

function renderTimeline(dateStr, appts, blocked) {
  const slots = generateSlots(dateStr);
  const timeline = $('timeline');

  if (slots.length === 0) {
    const [y,m,d] = dateStr.split('-').map(Number);
    const dow = new Date(y,m-1,d).getDay();
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🚫</div>
        <div class="empty-state__title">${dow === 0 ? 'Domingo' : 'Día libre'}</div>
        <div class="empty-state__desc">No hay atención este día.</div>
      </div>`;
    return;
  }

  const apptMap = {};
  appts.forEach(a => {
    const key = a.appointment_time.slice(0,5);
    apptMap[key] = a;
  });

  timeline.innerHTML = '';
  let hasContent = false;

  slots.forEach((slot, idx) => {
    const appt    = apptMap[slot];
    const blkData = isTimeBlocked(slot, blocked);
    const isLast  = idx === slots.length - 1;

    const slotEl = document.createElement('div');
    slotEl.className = 'timeline-slot';

    let dotClass  = '';
    let contentHTML = '';

    if (appt && appt.status !== 'cancelled') {
      hasContent = true;
      dotClass = `timeline-slot--${appt.status}`;

      contentHTML = `
        <div class="appt-card appt-card--${appt.status}" data-id="${appt.id}">
          <div class="appt-card__top">
            <div>
              <div class="appt-card__name">${escHtml(appt.client_name)}</div>
              <div class="appt-card__service">${escHtml(appt.service)}</div>
            </div>
            ${statusLabel(appt.status)}
          </div>
          <div class="appt-card__phone">
            📞 <a href="tel:${escHtml(appt.client_phone)}" style="color:inherit">${escHtml(appt.client_phone)}</a>
          </div>
          <div class="appt-card__actions">
            ${appt.status === 'pending' ? `
              <button class="btn btn--success btn--sm" onclick="changeStatus('${appt.id}','confirmed')">✓ Confirmar</button>
            ` : ''}
            ${appt.status !== 'completed' && appt.status !== 'cancelled' ? `
              <button class="btn btn--ghost btn--sm" onclick="changeStatus('${appt.id}','completed')">✅ Hecho</button>
            ` : ''}
            <button class="btn btn--ghost btn--sm" onclick="openDetail('${appt.id}')">Ver más</button>
            ${appt.status !== 'cancelled' ? `
              <button class="btn btn--danger btn--sm" onclick="cancelAppt('${appt.id}')">✕</button>
            ` : ''}
          </div>
        </div>`;
    } else if (blkData) {
      hasContent = true;
      dotClass = 'timeline-slot--blocked';
      contentHTML = `
        <div class="blocked-slot">
          <div class="blocked-slot__info">
            🔒 <div>
              <div>Bloqueado</div>
              ${blkData.reason ? `<div class="blocked-slot__reason">${escHtml(blkData.reason)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn--danger btn--sm" onclick="unblockSlot('${blkData.id}')">Quitar</button>
        </div>`;
    } else {
      contentHTML = `
        <div class="free-slot" onclick="quickAddAppt('${slot}')">
          <span>＋</span>
          <span>Libre — toca para agregar</span>
        </div>`;
    }

    slotEl.innerHTML = `
      <div class="timeline-slot__time">${slot}</div>
      <div class="timeline-slot__line ${dotClass}">
        <div class="timeline-slot__dot"></div>
        ${!isLast ? '<div class="timeline-slot__vline"></div>' : ''}
      </div>
      <div class="timeline-slot__content">${contentHTML}</div>
    `;

    timeline.appendChild(slotEl);
  });

  if (!hasContent && appts.filter(a => a.status !== 'cancelled').length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state__icon">😌</div>
      <div class="empty-state__title">Día libre de reservas</div>
      <div class="empty-state__desc">No hay turnos agendados. Puedes agregar uno con el botón +</div>
    `;
    timeline.appendChild(empty);
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── APPOINTMENT ACTIONS ───────────────────────────────────────
async function changeStatus(id, status) {
  try {
    await DB.updateStatus(id, status);
    await loadDay(currentDateStr);
    const labels = { confirmed: 'Turno confirmado', completed: 'Turno marcado como hecho' };
    showToast(labels[status] || 'Estado actualizado', 'success');
  } catch { showToast('Error al actualizar. Intenta de nuevo.', 'error'); }
}

async function cancelAppt(id) {
  if (!confirm('¿Cancelar este turno?')) return;
  try {
    await DB.updateStatus(id, 'cancelled');
    await loadDay(currentDateStr);
    showToast('Turno cancelado', 'info');
  } catch { showToast('Error al cancelar.', 'error'); }
}

async function unblockSlot(id) {
  try {
    await DB.deleteBlockedSlot(id);
    await loadDay(currentDateStr);
    showToast('Horario desbloqueado', 'success');
  } catch { showToast('Error al desbloquear.', 'error'); }
}

function quickAddAppt(slot) {
  openAddModal(currentDateStr, slot);
}

// ── DETAIL MODAL ──────────────────────────────────────────────
let _detailAppts = [];

async function openDetail(id) {
  const appts = await DB.getAppointmentsForDate(currentDateStr);
  const appt  = appts.find(a => a.id === id);
  if (!appt) return;

  _detailAppts = appts;

  $('detailTitle').innerHTML = `<span>📋</span>${appt.client_name}`;
  $('detailBody').innerHTML = `
    <div class="detail-row">
      <span class="detail-row__icon">✂️</span>
      <div>
        <div class="detail-row__label">Servicio</div>
        <div class="detail-row__value">${escHtml(appt.service)}</div>
      </div>
    </div>
    <div class="detail-row">
      <span class="detail-row__icon">📅</span>
      <div>
        <div class="detail-row__label">Fecha</div>
        <div class="detail-row__value">${formatDateDisplay(appt.appointment_date)}</div>
      </div>
    </div>
    <div class="detail-row">
      <span class="detail-row__icon">🕐</span>
      <div>
        <div class="detail-row__label">Hora</div>
        <div class="detail-row__value">${appt.appointment_time.slice(0,5)} hs</div>
      </div>
    </div>
    <div class="detail-row">
      <span class="detail-row__icon">📞</span>
      <div>
        <div class="detail-row__label">Teléfono</div>
        <div class="detail-row__value">
          <a href="tel:${escHtml(appt.client_phone)}" style="color:var(--gold)">${escHtml(appt.client_phone)}</a>
        </div>
      </div>
    </div>
    ${appt.notes ? `
    <div class="detail-row">
      <span class="detail-row__icon">📝</span>
      <div>
        <div class="detail-row__label">Notas</div>
        <div class="detail-row__value">${escHtml(appt.notes)}</div>
      </div>
    </div>` : ''}
    <div class="detail-row">
      <span class="detail-row__icon">📌</span>
      <div>
        <div class="detail-row__label">Estado</div>
        <div class="detail-row__value">${statusLabel(appt.status)}</div>
      </div>
    </div>
    <div class="detail-row">
      <span class="detail-row__icon">🕒</span>
      <div>
        <div class="detail-row__label">Reservado</div>
        <div class="detail-row__value">${new Date(appt.created_at).toLocaleString('es-CL')}</div>
      </div>
    </div>
  `;

  $('detailActions').innerHTML = `
    <button class="btn btn--ghost" onclick="closeModal('detailModal')">Cerrar</button>
    <a href="https://wa.me/${escHtml(appt.client_phone?.replace(/\D/g,''))}"
       target="_blank" rel="noopener"
       class="btn btn--gold-outline">💬 WhatsApp</a>
  `;

  openModal('detailModal');
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close on overlay click
['addModal','blockModal','detailModal'].forEach(id => {
  $(id)?.addEventListener('click', e => {
    if (e.target === $(id)) closeModal(id);
  });
});

// ── ADD APPOINTMENT MODAL ─────────────────────────────────────
function openAddModal(dateStr = currentDateStr, preSlot = '') {
  $('addName').value  = '';
  $('addPhone').value = '';
  $('addNotes').value = '';
  $('addDate').value  = dateStr;
  $('addDate').min    = toLocalDateStr(new Date());
  populateSlotSelect('addDate', 'addTime', dateStr, preSlot);
  openModal('addModal');
}

function populateSlotSelect(dateInputId, selectId, dateStr, preSlot = '') {
  const slots  = generateSlots(dateStr);
  const select = $(selectId);
  select.innerHTML = '';

  if (slots.length === 0) {
    select.innerHTML = '<option value="">Sin horarios disponibles</option>';
    return;
  }

  slots.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === preSlot) opt.selected = true;
    select.appendChild(opt);
  });
}

$('addDate').addEventListener('change', () => {
  populateSlotSelect('addDate', 'addTime', $('addDate').value);
});

$('addModalCancel').addEventListener('click', () => closeModal('addModal'));

$('addModalConfirm').addEventListener('click', async () => {
  const name  = $('addName').value.trim();
  const phone = $('addPhone').value.trim();
  const date  = $('addDate').value;
  const time  = $('addTime').value;
  const notes = $('addNotes').value.trim();

  if (!name)  { showToast('Ingresa el nombre del cliente.', 'error'); return; }
  if (!phone) { showToast('Ingresa el teléfono.', 'error'); return; }
  if (!date || !time) { showToast('Selecciona fecha y horario.', 'error'); return; }

  $('addBtnLabel').classList.add('hidden');
  $('addBtnSpinner').classList.remove('hidden');
  $('addModalConfirm').disabled = true;

  try {
    await DB.createAppointment({
      client_name:      name,
      client_phone:     phone,
      service:          CONFIG.services[0].name,
      appointment_date: date,
      appointment_time: time + ':00',
      notes:            notes || null,
      status:           'confirmed'
    });

    closeModal('addModal');
    await loadDay(currentDateStr);
    showToast('Turno agregado correctamente', 'success');
  } catch (err) {
    console.error(err);
    showToast('Error al guardar. Intenta de nuevo.', 'error');
  } finally {
    $('addBtnLabel').classList.remove('hidden');
    $('addBtnSpinner').classList.add('hidden');
    $('addModalConfirm').disabled = false;
  }
});

// ── BLOCK SLOT MODAL ──────────────────────────────────────────
function openBlockModal() {
  $('blockDate').value   = currentDateStr;
  $('blockDate').min     = toLocalDateStr(new Date());
  $('blockReason').value = '';
  populateBlockSlots($('blockDate').value);
  openModal('blockModal');
}

function populateBlockSlots(dateStr) {
  const slots = generateSlots(dateStr);
  const selectStart = $('blockStart');
  const selectEnd   = $('blockEnd');

  selectStart.innerHTML = '<option value="">-- Desde --</option>';
  selectEnd.innerHTML   = '<option value="">-- Hasta --</option>';

  slots.forEach(s => {
    const opt1 = document.createElement('option');
    opt1.value = s; opt1.textContent = s;
    selectStart.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = s; opt2.textContent = s;
    selectEnd.appendChild(opt2);
  });

  // Add one extra end option (after last slot)
  if (slots.length > 0) {
    const lastSlot = slots[slots.length - 1];
    const [h, m]   = lastSlot.split(':').map(Number);
    const nextMin  = h * 60 + m + CONFIG.slotDuration;
    const extraH   = Math.floor(nextMin/60).toString().padStart(2,'0');
    const extraM   = (nextMin%60).toString().padStart(2,'0');
    const extra    = `${extraH}:${extraM}`;
    const opt = document.createElement('option');
    opt.value = extra; opt.textContent = extra;
    selectEnd.appendChild(opt);
  }
}

$('blockDate').addEventListener('change', () => populateBlockSlots($('blockDate').value));
$('blockModalCancel').addEventListener('click', () => closeModal('blockModal'));

$('blockModalConfirm').addEventListener('click', async () => {
  const date   = $('blockDate').value;
  const start  = $('blockStart').value;
  const end    = $('blockEnd').value;
  const reason = $('blockReason').value.trim();

  if (!date || !start || !end) { showToast('Completa todos los campos.', 'error'); return; }
  if (start >= end) { showToast('La hora de fin debe ser mayor a la de inicio.', 'error'); return; }

  $('blockBtnLabel').classList.add('hidden');
  $('blockBtnSpinner').classList.remove('hidden');
  $('blockModalConfirm').disabled = true;

  try {
    await DB.blockSlot({
      slot_date:  date,
      start_time: start + ':00',
      end_time:   end + ':00',
      reason:     reason || null
    });

    closeModal('blockModal');
    await loadDay(currentDateStr);
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
function offsetDate(dateStr, days) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateStr(dt);
}

$('prevDay').addEventListener('click', () => loadDay(offsetDate(currentDateStr, -1)));
$('nextDay').addEventListener('click', () => loadDay(offsetDate(currentDateStr, +1)));
$('goToday').addEventListener('click', () => loadDay(toLocalDateStr(new Date())));

$('logoutBtn').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión?')) {
    Auth.logout();
    $('dashboard').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    pinEntry = '';
    updatePinDots();
  }
});

$('addApptBtn').addEventListener('click', () => openAddModal());
$('blockSlotBtn').addEventListener('click', openBlockModal);

// ── INIT ──────────────────────────────────────────────────────
function init() {
  DB.init();
  initPinKeyboard();

  if (Auth.isAuthenticated()) {
    showDashboard();
  }
}

document.addEventListener('DOMContentLoaded', init);
