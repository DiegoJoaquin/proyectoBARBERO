/* ============================================================
   app.js — Lógica del Portal de Clientes · Cortes Zahir
   ============================================================ */

'use strict';

// ── DATABASE ABSTRACTION ──────────────────────────────────────
// Funciona con Supabase cuando está configurado,
// o con localStorage en modo Demo.
const DB = {
  _client: null,
  isDemo: false,

  _localKey: 'cz_appointments',
  _blockedKey: 'cz_blocked',

  get _local() {
    return JSON.parse(localStorage.getItem(this._localKey) || '[]');
  },
  set _local(v) {
    localStorage.setItem(this._localKey, JSON.stringify(v));
  },
  get _blocked() {
    return JSON.parse(localStorage.getItem(this._blockedKey) || '[]');
  },

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

  /** Obtiene todos los turnos de una fecha (YYYY-MM-DD) */
  async getAppointmentsForDate(dateStr) {
    if (this.isDemo) {
      return this._local.filter(a => a.appointment_date === dateStr);
    }
    const { data, error } = await this._client
      .from('appointments')
      .select('appointment_time, status')
      .eq('appointment_date', dateStr)
      .neq('status', 'cancelled');
    return error ? [] : (data || []);
  },

  /** Obtiene slots bloqueados de una fecha */
  async getBlockedForDate(dateStr) {
    if (this.isDemo) {
      return this._blocked.filter(b => b.slot_date === dateStr);
    }
    const { data } = await this._client
      .from('blocked_slots')
      .select('start_time, end_time')
      .eq('slot_date', dateStr);
    return data || [];
  },

  /** Crea un nuevo turno */
  async createAppointment(appt) {
    if (this.isDemo) {
      const newAppt = {
        ...appt,
        id: 'DEMO-' + Math.random().toString(36).slice(2,8).toUpperCase(),
        status: 'pending',
        created_at: new Date().toISOString()
      };
      this._local = [...this._local, newAppt];
      return newAppt;
    }
    const { data, error } = await this._client
      .from('appointments')
      .insert(appt)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// ── TIME SLOT GENERATOR ───────────────────────────────────────
function generateSlots(dateObj) {
  const dow = dateObj.getDay(); // 0=Dom
  if (!CONFIG.workingDays.includes(dow)) return [];

  const isSat = dow === 6;
  const { start, end } = isSat
    ? CONFIG.workingHours.saturday
    : CONFIG.workingHours.weekdays;

  const toMin = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toStr = mins => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
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

// ── HELPERS ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function formatDateLong(dateObj) {
  return dateObj.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function formatDateShort(dateObj) {
  return dateObj.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function toLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function genCode() {
  return 'ZHR-' + Math.random().toString(36).slice(2,6).toUpperCase();
}

function showToast(msg, type = 'info') {
  const container = $('toastContainer');
  const el = document.createElement('div');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── STATE ─────────────────────────────────────────────────────
const state = {
  step: 1,
  service: null,       // { id, name, duration, icon }
  date: null,          // Date object
  timeSlot: null,      // 'HH:MM'
  bookedSlots: [],     // ['HH:MM', ...]
  blockedSlots: [],    // [{ start_time, end_time }]
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth()
};

// ── CALENDAR ──────────────────────────────────────────────────
const DAY_LABELS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function renderCalendar() {
  const { calYear: y, calMonth: m } = state;
  $('calTitle').textContent = `${MONTHS[m]} ${y}`;

  const grid = $('calGrid');
  grid.innerHTML = '';

  // Day labels (starting Mon)
  const orderedDays = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  orderedDays.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-label';
    el.textContent = d;
    grid.appendChild(el);
  });

  const today = new Date();
  today.setHours(0,0,0,0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + CONFIG.maxBookingDaysAhead);

  // First day of month (adjust: Mon=0)
  const firstDay = new Date(y, m, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon-based

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  // Prev month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = daysInPrevMonth - i;
    grid.appendChild(el);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(y, m, day);
    dateObj.setHours(0,0,0,0);
    const dow = dateObj.getDay(); // 0=Sun

    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = day;
    el.setAttribute('role', 'gridcell');
    el.setAttribute('aria-label', formatDateLong(dateObj));

    const isWorking = CONFIG.workingDays.includes(dow);
    const isPast = dateObj < today;
    const isFuture = dateObj > maxDate;
    const isToday = dateObj.getTime() === today.getTime();

    if (isToday) el.classList.add('today');

    if (!isWorking || isPast || isFuture) {
      el.classList.add('disabled');
      el.setAttribute('aria-disabled', 'true');
    } else {
      el.classList.add('working');

      if (state.date && toLocalDateStr(state.date) === toLocalDateStr(dateObj)) {
        el.classList.add('selected');
        el.setAttribute('aria-selected', 'true');
      }

      el.addEventListener('click', () => selectDate(dateObj));
    }

    grid.appendChild(el);
  }

  // Next month padding
  const totalCells = startDow + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = i;
    grid.appendChild(el);
  }
}

async function selectDate(dateObj) {
  state.date = dateObj;
  state.timeSlot = null;
  $('step2Next').disabled = true;

  renderCalendar();

  // Show loading
  $('slotsSection').innerHTML = `
    <div class="slots-loading">
      <div class="spinner"></div>
      <span>Cargando horarios…</span>
    </div>`;

  const dateStr = toLocalDateStr(dateObj);

  try {
    const [booked, blocked] = await Promise.all([
      DB.getAppointmentsForDate(dateStr),
      DB.getBlockedForDate(dateStr)
    ]);

    state.bookedSlots = booked.map(a => a.appointment_time?.slice(0,5));
    state.blockedSlots = blocked;
    renderSlots(dateObj);
  } catch (err) {
    $('slotsSection').innerHTML = `
      <div class="slots-empty">
        <span>⚠️</span>
        <span>No se pudieron cargar los horarios. Intenta de nuevo.</span>
      </div>`;
  }
}

function isSlotBlocked(timeStr, blockedSlots) {
  const toMin = t => {
    const [h, m] = t.slice(0,5).split(':').map(Number);
    return h * 60 + m;
  };
  const slotMin = toMin(timeStr);
  return blockedSlots.some(b => {
    const bStart = toMin(b.start_time);
    const bEnd   = toMin(b.end_time);
    return slotMin >= bStart && slotMin < bEnd;
  });
}

function renderSlots(dateObj) {
  const allSlots = generateSlots(dateObj);
  const section = $('slotsSection');

  if (allSlots.length === 0) {
    section.innerHTML = `<div class="slots-empty"><span>🚫</span><span>No hay turnos disponibles este día.</span></div>`;
    return;
  }

  const now = new Date();
  const isToday = toLocalDateStr(dateObj) === toLocalDateStr(now);
  const currentMin = now.getHours() * 60 + now.getMinutes();

  const toMin = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const availableSlots = allSlots.filter(slot => {
    const isTaken = state.bookedSlots.includes(slot) || isSlotBlocked(slot, state.blockedSlots);
    if (isTaken) return false;

    if (isToday) {
      if (toMin(slot) <= currentMin) return false;
    }
    return true;
  });

  section.innerHTML = `
    <h4>Horarios disponibles — ${formatDateLong(dateObj)}</h4>
    <div class="slots-grid" id="slotsGrid" role="listbox" aria-label="Horarios disponibles"></div>
    ${availableSlots.length === 0 ? '<p class="slots-empty"><span>😔</span><span>No quedan turnos para este día.</span></p>' : ''}
  `;

  const grid = $('slotsGrid');
  availableSlots.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';
    btn.textContent = slot;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-label', `Horario ${slot}`);

    btn.addEventListener('click', () => selectSlot(slot, btn));
    grid.appendChild(btn);
  });
}

function selectSlot(slot, btnEl) {
  state.timeSlot = slot;
  document.querySelectorAll('.slot-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-selected', 'false');
  });
  btnEl.classList.add('selected');
  btnEl.setAttribute('aria-selected', 'true');
  $('step2Next').disabled = false;
}

// ── MULTI-STEP FORM ───────────────────────────────────────────
function setStep(step) {
  state.step = step;

  // Hide all panels
  ['step1','step2','step3','stepConfirm'].forEach(id => {
    $(id)?.classList.add('hidden');
  });

  // Show current
  const panels = { 1: 'step1', 2: 'step2', 3: 'step3', 4: 'stepConfirm' };
  $(panels[step])?.classList.remove('hidden');

  // Progress indicators
  for (let i = 1; i <= 3; i++) {
    const ps = $(`ps${i}`);
    ps?.classList.remove('active','done');
    if (i < step) ps?.classList.add('done');
    else if (i === step) ps?.classList.add('active');
  }
  for (let i = 1; i <= 2; i++) {
    const pl = $(`pl${i}`);
    pl?.classList.toggle('done', i < step);
  }

  // Show/hide progress bar
  const progressEl = document.querySelector('.modal__progress');
  if (step === 4) {
    progressEl?.classList.add('hidden');
  } else {
    progressEl?.classList.remove('hidden');
  }
}

function updateStep3Summary() {
  $('sumService').textContent = state.service?.name ?? '—';
  $('sumDate').textContent    = state.date ? formatDateShort(state.date) : '—';
  $('sumTime').textContent    = state.timeSlot ?? '—';
}

async function submitBooking() {
  const name  = $('clientName').value.trim();
  const phone = $('clientPhone').value.trim();
  const notes = $('clientNotes').value.trim();

  if (!name)  { showToast('Por favor ingresa tu nombre.', 'error'); $('clientName').focus(); return; }
  if (!phone) { showToast('Por favor ingresa tu teléfono.', 'error'); $('clientPhone').focus(); return; }

  const submitBtn = $('step3Submit');
  const label     = $('submitLabel');
  const spinner   = $('submitSpinner');
  submitBtn.disabled = true;
  label.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const appt = await DB.createAppointment({
      client_name:      name,
      client_phone:     phone,
      service:          state.service.name,
      appointment_date: toLocalDateStr(state.date),
      appointment_time: state.timeSlot + ':00',
      notes:            notes || null
    });

    // Show confirmation
    $('confirmCode').textContent = appt.id?.slice(-8).toUpperCase() ?? genCode();

    $('confirmDetails').innerHTML = `
      <div class="confirm-detail">
        <span class="confirm-detail__icon">✂️</span>
        <span class="confirm-detail__text">${state.service.name}</span>
      </div>
      <div class="confirm-detail">
        <span class="confirm-detail__icon">📅</span>
        <span class="confirm-detail__text">${formatDateShort(state.date)}</span>
      </div>
      <div class="confirm-detail">
        <span class="confirm-detail__icon">🕐</span>
        <span class="confirm-detail__text">${state.timeSlot} hs</span>
      </div>
      <div class="confirm-detail">
        <span class="confirm-detail__icon">👤</span>
        <span class="confirm-detail__text">${name}</span>
      </div>
    `;

    setStep(4);
  } catch (err) {
    console.error(err);
    showToast('Hubo un error al reservar. Intenta de nuevo.', 'error');
  } finally {
    submitBtn.disabled = false;
    label.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// ── MODAL CONTROL ─────────────────────────────────────────────
function openModal() {
  $('bookingModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setStep(1);
}

function closeModal() {
  $('bookingModal').classList.remove('open');
  document.body.style.overflow = '';
  // Reset state
  Object.assign(state, {
    step: 1, service: null, date: null,
    timeSlot: null, bookedSlots: [], blockedSlots: []
  });
  $('contactForm')?.reset();
  document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
  $('step1Next').disabled = true;
  $('step2Next').disabled = true;
}

// ── SERVICES RENDER ───────────────────────────────────────────
function renderServices() {
  const grid = $('servicesGrid');
  grid.innerHTML = '';
  CONFIG.services.forEach(svc => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', 'false');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <span class="service-card__icon" aria-hidden="true">${svc.icon}</span>
      <div class="service-card__info">
        <div class="service-card__name">${svc.name}</div>
        <div class="service-card__desc">${svc.description}</div>
      </div>
      <div class="service-card__meta">
        <span class="service-card__duration">${svc.duration} min</span>
        ${svc.price ? `<span class="service-card__price">${svc.price}</span>` : ''}
        <span class="service-card__check" aria-hidden="true">✓</span>
      </div>
    `;
    card.addEventListener('click', () => selectService(svc, card));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectService(svc, card); }
    });
    grid.appendChild(card);
  });
}

function selectService(svc, cardEl) {
  state.service = svc;
  document.querySelectorAll('.service-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-selected', 'false');
  });
  cardEl.classList.add('selected');
  cardEl.setAttribute('aria-selected', 'true');
  $('step1Next').disabled = false;
}

// ── HERO HINT ─────────────────────────────────────────────────
async function updateHeroHint() {
  const today = new Date();
  const dow = today.getDay();
  if (!CONFIG.workingDays.includes(dow)) {
    $('heroHint').textContent = 'Hoy no hay atención. Reserva para otro día.';
    return;
  }
  try {
    const dateStr = toLocalDateStr(today);
    const [booked, blocked] = await Promise.all([
      DB.getAppointmentsForDate(dateStr),
      DB.getBlockedForDate(dateStr)
    ]);
    const slots  = generateSlots(today);
    const taken  = booked.map(a => a.appointment_time?.slice(0,5));
    
    const currentMin = today.getHours() * 60 + today.getMinutes();
    const toMin = t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const avail = slots.filter(s => {
      if (taken.includes(s)) return false;
      if (isSlotBlocked(s, blocked)) return false;
      if (toMin(s) <= currentMin) return false;
      return true;
    });

    $('heroHint').textContent = avail.length > 0
      ? `${avail.length} turno${avail.length !== 1 ? 's' : ''} disponible${avail.length !== 1 ? 's' : ''} hoy`
      : 'Sin turnos disponibles hoy — reserva para mañana';
  } catch {
    $('heroHint').textContent = 'Ver turnos disponibles →';
  }
}

// ── EVENT LISTENERS ───────────────────────────────────────────
function initEvents() {
  $('openBookingBtn').addEventListener('click', openModal);
  $('closeModalBtn').addEventListener('click', closeModal);

  // Close on overlay click
  $('bookingModal').addEventListener('click', e => {
    if (e.target === $('bookingModal')) closeModal();
  });

  // Step navigation
  $('step1Next').addEventListener('click', () => setStep(2));
  $('step2Back').addEventListener('click', () => setStep(1));
  $('step2Next').addEventListener('click', () => { updateStep3Summary(); setStep(3); });
  $('step3Back').addEventListener('click', () => setStep(2));
  $('step3Submit').addEventListener('click', submitBooking);
  $('confirmClose').addEventListener('click', closeModal);

  // Calendar navigation
  $('calPrev').addEventListener('click', () => {
    state.calMonth--;
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    renderCalendar();
  });
  $('calNext').addEventListener('click', () => {
    state.calMonth++;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    renderCalendar();
  });

  // ESC to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('bookingModal').classList.contains('open')) closeModal();
  });
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  DB.init();

  if (DB.isDemo) {
    $('demoBanner').classList.remove('hidden');
  }

  renderServices();
  renderCalendar();
  initEvents();
  await updateHeroHint();
}

document.addEventListener('DOMContentLoaded', init);
