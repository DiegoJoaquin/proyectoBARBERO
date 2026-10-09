/* ============================================================
   common.js — Utilidades compartidas · Cortes Zahir
   Lo usan tanto el portal de clientes (app.js) como el panel
   del barbero (admin.js).
   ============================================================ */

'use strict';

const $ = id => document.getElementById(id);

// ── FECHAS Y HORAS ────────────────────────────────────────────
/** 'HH:MM' o 'HH:MM:SS' → minutos desde medianoche */
function toMin(t) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/** minutos → 'HH:MM' */
function toTimeStr(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** Date → 'YYYY-MM-DD' en hora LOCAL (no UTC) */
function toLocalDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → Date local a medianoche */
function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Horarios (HH:MM) de un día según la configuración */
function generateSlots(dateObj) {
  const dow = dateObj.getDay(); // 0=Dom
  if (!CONFIG.workingDays.includes(dow)) return [];

  const { start, end } = dow === 6
    ? CONFIG.workingHours.saturday
    : CONFIG.workingHours.weekdays;

  const slots = [];
  const endMin = toMin(end);
  for (let cur = toMin(start); cur + CONFIG.slotDuration <= endMin; cur += CONFIG.slotDuration) {
    slots.push(toTimeStr(cur));
  }
  return slots;
}

/** Devuelve el bloqueo que se superpone con el turno que empieza en timeStr (o undefined) */
function findBlock(timeStr, blocked) {
  const sStart = toMin(timeStr);
  const sEnd   = sStart + CONFIG.slotDuration;
  return blocked.find(b => sStart < toMin(b.end_time) && toMin(b.start_time) < sEnd);
}

/** ¿Se puede reservar este servicio ese día de la semana? */
function serviceAvailableOn(service, dateObj) {
  return !service?.days || service.days.includes(dateObj.getDay());
}

// ── TEXTO ─────────────────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normaliza un teléfono chileno para wa.me (solo dígitos, con 56) */
function waNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 8) digits = '9' + digits;          // 1234 5678 → 9 1234 5678
  if (digits.length === 9 && digits.startsWith('9')) digits = '56' + digits;
  return digits;
}

/** Teléfono válido: al menos 8 dígitos */
function isValidPhone(phone) {
  return String(phone || '').replace(/\D/g, '').length >= 8;
}

// ── TOASTS ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  const icon = document.createElement('span');
  icon.textContent = icons[type] || 'ℹ';
  const text = document.createElement('span');
  text.textContent = msg;
  el.append(icon, text);
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── SUPABASE ──────────────────────────────────────────────────
const IS_DEMO = !CONFIG.supabase.url || CONFIG.supabase.url.startsWith('TU_');

const sb = (!IS_DEMO && window.supabase)
  ? window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey)
  : null;

/** Almacenamiento local para el modo Demo */
const DemoStore = {
  get appointments() { return JSON.parse(localStorage.getItem('cz_appointments') || '[]'); },
  set appointments(v) { localStorage.setItem('cz_appointments', JSON.stringify(v)); },
  get blocked() { return JSON.parse(localStorage.getItem('cz_blocked') || '[]'); },
  set blocked(v) { localStorage.setItem('cz_blocked', JSON.stringify(v)); }
};

/** Error de Supabase → mensaje entendible */
function isSlotTakenError(err) {
  // 23505 = índice único (otro cliente tomó la hora) · P0001 = trigger (horario bloqueado)
  return err && (err.code === '23505' || err.code === 'P0001');
}

/**
 * Horarios ocupados de un día (turnos activos + bloqueos), SIN datos
 * personales de los clientes. Lanza error si falla la conexión.
 * @returns {Promise<{taken: string[], blocked: {start_time, end_time}[]}>}
 */
async function fetchBusy(dateStr) {
  if (IS_DEMO) {
    return {
      taken: DemoStore.appointments
        .filter(a => a.appointment_date === dateStr && a.status !== 'cancelled')
        .map(a => a.appointment_time.slice(0, 5)),
      blocked: DemoStore.blocked.filter(b => b.slot_date === dateStr)
    };
  }
  const { data, error } = await sb.rpc('get_busy_slots', { p_date: dateStr });
  if (error) throw error;
  return {
    taken:   data.filter(r => r.kind === 'appointment').map(r => r.start_time.slice(0, 5)),
    blocked: data.filter(r => r.kind === 'blocked')
  };
}
