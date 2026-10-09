/* ============================================================
   app.js — Lógica del Portal de Clientes · Cortes Zahir
   Requiere: config.js, common.js
   ============================================================ */

'use strict';

// ── DATABASE ──────────────────────────────────────────────────
const DB = {
  /** Crea un nuevo turno. Devuelve el id generado. */
  async createAppointment(appt) {
    const id = crypto.randomUUID();
    if (IS_DEMO) {
      const taken = DemoStore.appointments.some(a =>
        a.appointment_date === appt.appointment_date &&
        a.appointment_time === appt.appointment_time &&
        a.status !== 'cancelled');
      if (taken) throw { code: '23505' };
      DemoStore.appointments = [...DemoStore.appointments, {
        ...appt, id, status: 'pending', created_at: new Date().toISOString()
      }];
      return id;
    }
    // Sin .select(): los clientes no tienen permiso de lectura sobre la tabla
    const { error } = await sb.from('appointments').insert({ ...appt, id });
    if (error) throw error;
    return id;
  }
};

// ── HELPERS ───────────────────────────────────────────────────
function formatDateLong(dateObj) {
  return dateObj.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(dateObj) {
  return dateObj.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function maxBookingDate() {
  const d = startOfToday();
  d.setDate(d.getDate() + CONFIG.maxBookingDaysAhead);
  return d;
}

/** Horarios libres de un día (excluye ocupados, bloqueados y ya pasados) */
function freeSlots(dateObj, busy) {
  const now = new Date();
  const isToday = toLocalDateStr(dateObj) === toLocalDateStr(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return generateSlots(dateObj).filter(slot =>
    !busy.taken.includes(slot) &&
    !findBlock(slot, busy.blocked) &&
    !(isToday && toMin(slot) <= nowMin)
  );
}

// ── STATE ─────────────────────────────────────────────────────
const state = {
  step: 1,
  service: null,   // objeto de CONFIG.services
  date: null,      // Date
  timeSlot: null,  // 'HH:MM'
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  loadToken: 0     // evita que una respuesta vieja pise una nueva
};

// ── CALENDAR ──────────────────────────────────────────────────
const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

function isDateBookable(dateObj) {
  return CONFIG.workingDays.includes(dateObj.getDay()) &&
    dateObj >= startOfToday() &&
    dateObj <= maxBookingDate() &&
    serviceAvailableOn(state.service, dateObj);
}

function renderCalendar() {
  const { calYear: y, calMonth: m } = state;
  $('calTitle').textContent = `${MONTHS[m]} ${y}`;

  // Solo se puede navegar entre el mes actual y el mes de la fecha máxima
  const today = startOfToday();
  const maxDate = maxBookingDate();
  const monthIdx = y * 12 + m;
  $('calPrev').disabled = monthIdx <= today.getFullYear() * 12 + today.getMonth();
  $('calNext').disabled = monthIdx >= maxDate.getFullYear() * 12 + maxDate.getMonth();

  const grid = $('calGrid');
  grid.innerHTML = '';

  ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-label';
    el.textContent = d;
    grid.appendChild(el);
  });

  const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  for (let i = startDow - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = daysInPrevMonth - i;
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(y, m, day);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cal-day';
    el.textContent = day;
    el.setAttribute('aria-label', formatDateLong(dateObj));

    if (dateObj.getTime() === today.getTime()) el.classList.add('today');

    if (!isDateBookable(dateObj)) {
      el.classList.add('disabled');
      el.disabled = true;
    } else {
      el.classList.add('working');
      if (state.date && toLocalDateStr(state.date) === toLocalDateStr(dateObj)) {
        el.classList.add('selected');
        el.setAttribute('aria-pressed', 'true');
      }
      el.addEventListener('click', () => selectDate(dateObj));
    }
    grid.appendChild(el);
  }

  const totalCells = startDow + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = i;
    grid.appendChild(el);
  }
}

function resetSlotsSection() {
  $('slotsSection').innerHTML = `
    <div class="slots-empty">
      <span>📆</span>
      <span>Selecciona un día para ver los horarios</span>
    </div>`;
}

async function selectDate(dateObj) {
  state.date = dateObj;
  state.timeSlot = null;
  $('step2Next').disabled = true;
  renderCalendar();
  await loadSlots();
}

async function loadSlots() {
  const dateObj = state.date;
  const token = ++state.loadToken;

  $('slotsSection').innerHTML = `
    <div class="slots-loading">
      <div class="spinner"></div>
      <span>Cargando horarios…</span>
    </div>`;

  try {
    const busy = await fetchBusy(toLocalDateStr(dateObj));
    if (token !== state.loadToken) return;
    renderSlots(dateObj, freeSlots(dateObj, busy));
  } catch (err) {
    console.error(err);
    if (token !== state.loadToken) return;
    $('slotsSection').innerHTML = `
      <div class="slots-empty">
        <span>⚠️</span>
        <span>No se pudieron cargar los horarios. Revisa tu conexión.</span>
        <button class="btn btn--ghost btn--sm" id="retrySlots">Reintentar</button>
      </div>`;
    $('retrySlots').addEventListener('click', loadSlots);
  }
}

function renderSlots(dateObj, slots) {
  const section = $('slotsSection');

  if (slots.length === 0) {
    section.innerHTML = `
      <div class="slots-empty">
        <span>😔</span>
        <span>No quedan horarios libres para el ${escHtml(formatDateLong(dateObj))}. Prueba otro día.</span>
      </div>`;
    return;
  }

  section.innerHTML = `
    <h4>Horarios disponibles — ${escHtml(formatDateLong(dateObj))}</h4>
    <div class="slots-grid" id="slotsGrid" role="group" aria-label="Horarios disponibles"></div>`;

  const grid = $('slotsGrid');
  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    btn.textContent = slot;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `Horario ${slot}`);
    if (slot === state.timeSlot) {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }
    btn.addEventListener('click', () => selectSlot(slot, btn));
    grid.appendChild(btn);
  });

  // Si la hora elegida antes ya no está libre, se descarta
  if (state.timeSlot && !slots.includes(state.timeSlot)) state.timeSlot = null;
  $('step2Next').disabled = !state.timeSlot;
}

function selectSlot(slot, btnEl) {
  state.timeSlot = slot;
  document.querySelectorAll('.slot-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-pressed', 'false');
  });
  btnEl.classList.add('selected');
  btnEl.setAttribute('aria-pressed', 'true');
  $('step2Next').disabled = false;
}

// ── MULTI-STEP FORM ───────────────────────────────────────────
function setStep(step) {
  state.step = step;

  ['step1','step2','step3','stepConfirm'].forEach(id => $(id).classList.add('hidden'));
  const panels = { 1: 'step1', 2: 'step2', 3: 'step3', 4: 'stepConfirm' };
  $(panels[step]).classList.remove('hidden');

  for (let i = 1; i <= 3; i++) {
    const ps = $(`ps${i}`);
    ps.classList.remove('active', 'done');
    if (i < step) ps.classList.add('done');
    else if (i === step) ps.classList.add('active');
  }
  for (let i = 1; i <= 2; i++) $(`pl${i}`).classList.toggle('done', i < step);

  document.querySelector('.modal__progress').classList.toggle('hidden', step === 4);
  document.querySelector('.modal').scrollTop = 0;
}

function goToStep2() {
  // Si la fecha elegida ya no sirve para el servicio (ej: promo solo mar–jue), se limpia
  if (state.date && !isDateBookable(state.date)) {
    state.date = null;
    state.timeSlot = null;
  }
  setStep(2);
  renderCalendar();
  if (state.date) {
    loadSlots(); // refresca: alguien pudo haber reservado mientras tanto
  } else {
    resetSlotsSection();
    $('step2Next').disabled = true;
  }
}

function updateStep3Summary() {
  $('sumService').textContent = state.service?.name ?? '—';
  $('sumDate').textContent    = state.date ? formatDateShort(state.date) : '—';
  $('sumTime').textContent    = state.timeSlot ? `${state.timeSlot} hrs` : '—';
}

let submitting = false;

async function submitBooking() {
  if (submitting) return;

  const name  = $('clientName').value.trim();
  const phone = $('clientPhone').value.trim();
  const notes = $('clientNotes').value.trim();

  if (name.length < 2) { showToast('Por favor ingresa tu nombre.', 'error'); $('clientName').focus(); return; }
  if (!isValidPhone(phone)) { showToast('Ingresa un teléfono válido (ej: +56 9 1234 5678).', 'error'); $('clientPhone').focus(); return; }

  submitting = true;
  const submitBtn = $('step3Submit');
  submitBtn.disabled = true;
  $('submitLabel').classList.add('hidden');
  $('submitSpinner').classList.remove('hidden');

  try {
    const id = await DB.createAppointment({
      client_name:      name.slice(0, 100),
      client_phone:     phone.slice(0, 30),
      service:          state.service.name,
      appointment_date: toLocalDateStr(state.date),
      appointment_time: state.timeSlot + ':00',
      notes:            notes ? notes.slice(0, 500) : null
    });

    showConfirmation(id, name);
    setStep(4);
  } catch (err) {
    console.error(err);
    if (isSlotTakenError(err)) {
      showToast('Ese horario se acaba de ocupar. Elige otro, por favor.', 'error');
      state.timeSlot = null;
      goToStep2();
    } else {
      showToast('No se pudo reservar. Revisa tu conexión e intenta de nuevo.', 'error');
    }
  } finally {
    submitting = false;
    submitBtn.disabled = false;
    $('submitLabel').classList.remove('hidden');
    $('submitSpinner').classList.add('hidden');
  }
}

function showConfirmation(id, name) {
  const code = id.replace(/-/g, '').slice(-6).toUpperCase();
  $('confirmCode').textContent = code;

  const details = [
    ['✂️', state.service.name],
    ['📅', formatDateShort(state.date)],
    ['🕐', `${state.timeSlot} hrs`],
    ['👤', name]
  ];
  if (CONFIG.business.address) details.push(['📍', CONFIG.business.address]);

  $('confirmDetails').innerHTML = details.map(([icon, text]) => `
    <div class="confirm-detail">
      <span class="confirm-detail__icon">${icon}</span>
      <span class="confirm-detail__text">${escHtml(text)}</span>
    </div>`).join('');

  // Botón para avisar/consultar por WhatsApp al barbero (si está configurado)
  const wa = $('confirmWhatsapp');
  if (CONFIG.business.whatsapp) {
    const msg = `Hola! Reservé un turno en ${CONFIG.business.name}:\n` +
      `• ${state.service.name}\n• ${formatDateShort(state.date)} a las ${state.timeSlot} hrs\n` +
      `• A nombre de ${name}\nCódigo: ${code}`;
    wa.href = `https://wa.me/${waNumber(CONFIG.business.whatsapp)}?text=${encodeURIComponent(msg)}`;
    wa.classList.remove('hidden');
  } else {
    wa.classList.add('hidden');
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
  const now = new Date();
  Object.assign(state, {
    step: 1, service: null, date: null, timeSlot: null,
    calYear: now.getFullYear(), calMonth: now.getMonth()
  });
  state.loadToken++;
  $('contactForm').reset();
  document.querySelectorAll('.service-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-pressed', 'false');
  });
  $('step1Next').disabled = true;
  $('step2Next').disabled = true;
  resetSlotsSection();
  updateHeroHint();
}

// ── SERVICES RENDER ───────────────────────────────────────────
const DAY_NAMES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function renderServices() {
  const grid = $('servicesGrid');
  grid.innerHTML = '';
  CONFIG.services.forEach(svc => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('tabindex', '0');
    const daysNote = svc.days
      ? `<div class="service-card__days">Solo ${svc.days.map(d => DAY_NAMES[d]).join(', ')}</div>`
      : '';
    card.innerHTML = `
      <span class="service-card__icon" aria-hidden="true">${escHtml(svc.icon)}</span>
      <div class="service-card__info">
        <div class="service-card__name">${escHtml(svc.name)}</div>
        <div class="service-card__desc">${escHtml(svc.description)}</div>
        ${daysNote}
        <div class="service-card__meta">
          ${svc.price ? `<span class="service-card__price">${escHtml(svc.price)}</span>` : ''}
          <span class="service-card__duration">⏱ ${svc.duration} min</span>
        </div>
      </div>
      <span class="service-card__check" aria-hidden="true">✓</span>
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
    c.setAttribute('aria-pressed', 'false');
  });
  cardEl.classList.add('selected');
  cardEl.setAttribute('aria-pressed', 'true');
  $('step1Next').disabled = false;
}

// ── HERO HINT ─────────────────────────────────────────────────
async function updateHeroHint() {
  const today = new Date();
  if (!CONFIG.workingDays.includes(today.getDay())) {
    $('heroHint').textContent = 'Hoy no hay atención · Reserva para otro día';
    return;
  }
  try {
    const avail = freeSlots(today, await fetchBusy(toLocalDateStr(today))).length;
    $('heroHint').textContent = avail > 0
      ? `${avail} horario${avail !== 1 ? 's' : ''} disponible${avail !== 1 ? 's' : ''} hoy`
      : 'Sin horarios hoy · Reserva para otro día';
  } catch {
    $('heroHint').textContent = 'Agenda tu hora en segundos';
  }
}

/** Dirección e Instagram bajo el botón (solo si están configurados) */
function renderHeroInfo() {
  const { address, instagram } = CONFIG.business;
  const parts = [];
  if (address) parts.push(`<span>📍 ${escHtml(address)}</span>`);
  if (instagram) {
    const user = instagram.replace(/^@/, '');
    parts.push(`<a href="https://instagram.com/${encodeURIComponent(user)}" target="_blank" rel="noopener">📸 @${escHtml(user)}</a>`);
  }
  $('heroInfo').innerHTML = parts.join('');
}

// ── EVENT LISTENERS ───────────────────────────────────────────
function initEvents() {
  $('openBookingBtn').addEventListener('click', openModal);
  $('closeModalBtn').addEventListener('click', closeModal);
  $('bookingModal').addEventListener('click', e => {
    if (e.target === $('bookingModal')) closeModal();
  });

  $('step1Next').addEventListener('click', goToStep2);
  $('step2Back').addEventListener('click', () => setStep(1));
  $('step2Next').addEventListener('click', () => { updateStep3Summary(); setStep(3); });
  $('step3Back').addEventListener('click', goToStep2);
  $('step3Submit').addEventListener('click', submitBooking);
  $('contactForm').addEventListener('submit', e => { e.preventDefault(); submitBooking(); });
  $('confirmClose').addEventListener('click', closeModal);

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

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('bookingModal').classList.contains('open')) closeModal();
  });
}

// ── INIT ──────────────────────────────────────────────────────
function init() {
  if (IS_DEMO) $('demoBanner').classList.remove('hidden');

  renderHeroInfo();
  if (CONFIG.business.heroImage) {
    const bg = $('heroBg');
    bg.style.backgroundImage = `url("${encodeURI(CONFIG.business.heroImage)}")`;
    bg.classList.add('has-photo');
  }
  renderServices();
  renderCalendar();
  initEvents();
  updateHeroHint();
}

document.addEventListener('DOMContentLoaded', init);
