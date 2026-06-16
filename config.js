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
    url: 'TU_SUPABASE_URL',          // Ej: https://abcxyz.supabase.co
    anonKey: 'TU_SUPABASE_ANON_KEY'  // Tu clave anónima pública
  },

  // ============================================================
  //  🏪 INFORMACIÓN DEL NEGOCIO
  // ============================================================
  business: {
    name:      'Cortes Zahir',
    tagline:   'Estilo & Precisión',
    address:   'Tu dirección aquí',
    phone:     '+56 9 0000 0000',
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
      id:          'corte',
      name:        'Corte de pelo',
      description: 'Corte clásico o moderno a tu elección',
      duration:    45,
      price:       null,   // null = no mostrar precio
      icon:        '✂️'
    }
    // Agrega más servicios aquí si lo necesitás:
    // {
    //   id: 'barba', name: 'Arreglo de barba',
    //   description: 'Perfilado y arreglo de barba',
    //   duration: 30, price: 3000, icon: '🪒'
    // }
  ]
};
