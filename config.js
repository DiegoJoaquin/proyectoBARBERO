/**
 * ============================================================
 *  CORTES ZAHIR — Configuración Principal
 *  Edita este archivo para personalizar tu aplicación.
 * ============================================================
 */

const CONFIG = {

  // ============================================================
  //  🔑 SUPABASE — Base de datos en la nube
  //  Obtén estos valores en: https://supabase.com
  //  → Tu proyecto → Settings → API
  // ============================================================
  supabase: {
    url: 'sb_publishable_zirB8ry92qrSdD_Z6tscqg_Kp9G1-s2',          // Ej: https://abcxyz.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliZXd0aHp5cGZ1ZWZ6bGNwbWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjUyNjcsImV4cCI6MjA5NzE0MTI2N30.SNVxTiqURcl9E_SRaYM5QryEFC-Kqr8-KFJ8Upw5lUs'  // Tu clave anónima pública
  },

  // ============================================================
  //  🏪 INFORMACIÓN DEL NEGOCIO
  // ============================================================
  business: {
    name: 'Cortes Zahir',
    tagline: 'Estilo & Precisión',
    address: 'Tu dirección aquí',
    phone: '+56 9 0000 0000',
    instagram: '@corteszahir'
  },

  // ============================================================
  //  🔐 PIN DEL ADMINISTRADOR
  //  ¡IMPORTANTE: Cámbialo antes de usar la app!
  // ============================================================
  adminPin: '1234',

  // ============================================================
  //  ⏰ HORARIOS DE TRABAJO
  // ============================================================
  workingHours: {
    weekdays: { start: '10:00', end: '19:50' }, // Lunes–Viernes
    saturday: { start: '10:00', end: '17:45' }  // Sábados
  },

  // Días laborales: 0=Dom · 1=Lun · 2=Mar · 3=Mié · 4=Jue · 5=Vie · 6=Sáb
  workingDays: [1, 2, 3, 4, 5, 6],

  // Duración de cada turno en minutos
  slotDuration: 45,

  // Máximo de días en el futuro para permitir reservas
  maxBookingDaysAhead: 30,

  // ============================================================
  //  ✂️ SERVICIOS OFRECIDOS
  // ============================================================
  services: [
    {
      id: 'corte',
      name: 'Corte de pelo',
      description: 'Corte clásico o moderno a tu elección',
      duration: 45,
      price: null,   // null = no mostrar precio
      icon: '✂️'
    }
    // Agrega más servicios aquí si lo necesitás:
    // {
    //   id: 'barba', name: 'Arreglo de barba',
    //   description: 'Perfilado y arreglo de barba',
    //   duration: 30, price: 3000, icon: '🪒'
    // }
  ]
};
