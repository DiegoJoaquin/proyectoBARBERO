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
    url: 'https://haojrpixxqwetftyxqwv.supabase.co',  // ✅ URL de tu proyecto Supabase
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhhb2pycGl4eHF3ZXRmdHl4cXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NjQ2ODYsImV4cCI6MjEwNzE0MDY4Nn0.sapGsgXnjqjQ9VhV5qb-__IUaQ4mCUeAElObA_fYvzw'  // Tu clave anónima pública
  },

  // ============================================================
  //  🏪 INFORMACIÓN DEL NEGOCIO
  // ============================================================
  business: {
    name: 'Cortes Zahir',
    tagline: 'Estilo & Precisión',
    address: 'Av.Irarrázaval 3054, Local 105B-112B, Ñuñoa',          // Ej: 'Av. Siempre Viva 123, Santiago' (vacío = no se muestra)
    whatsapp: '+56945527756',         // Ej: '+56 9 1234 5678' (vacío = no se muestra el botón)
    instagram: '@zahirfade_',
    heroImage: ''         // Foto de portada propia, ej: 'portada.jpg' (vacío = fondo de diseño)
  },

  // ============================================================
  //  🔐 ACCESO DEL BARBERO
  //  El PIN NO se guarda aquí (este archivo es público).
  //  Se crea un usuario en Supabase → Authentication → Users con
  //  este email y como contraseña un PIN de 6 dígitos (ver SETUP.md).
  // ============================================================
  adminEmail: 'barbero@corteszahir.cl',
  adminPinLength: 6,

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
      id: 'corte_eminencia',
      name: 'CORTE DE EMINENCIA 👑',
      description: 'El Servicio incluye corte de cabello y perfilado de cejas',
      duration: 20,
      price: '$10.000',
      icon: '👑'
    },
    {
      id: 'barba',
      name: 'BARBA',
      description: 'El servicio incluye corte de largo de la barba, perfilado y degradado de la barba',
      duration: 25,
      price: '$9.000',
      icon: '🪒'
    },
    {
      id: 'corte_barba',
      name: 'Corte + Barba',
      description: 'El Servicio incluye arreglo de Barba, perfilado y Corte de cabello',
      duration: 30,
      price: '$15.000',
      icon: '💈'
    },
    {
      id: 'promo',
      name: 'Promo 2 X 15.000 ‼️',
      description: 'Promoción (MARTES-MIÉRCOLES-JUEVES). Agendar 2 veces para promoción',
      duration: 15,
      price: '$15.000',
      icon: '🔥',
      days: [2, 3, 4]   // Solo martes, miércoles y jueves (opcional en cualquier servicio)
    }
  ]
};
