# 🔧 Guía de Configuración — Cortes Zahir

Esta guía te explica cómo conectar la app a Supabase para que los datos
se guarden en la nube y el barbero los vea en tiempo real desde cualquier dispositivo.

---

## Paso 1 — Crear tu proyecto en Supabase (gratis)

1. Entrá a **https://supabase.com** y creá una cuenta gratuita (podés usar tu Gmail)
2. Hacé click en **"New project"**
3. Elegí un nombre (ej: `cortes-zahir`) y una contraseña segura para la base de datos
4. Seleccioná la región más cercana (ej: South America)
5. Esperá ~2 minutos a que se cree el proyecto

---

## Paso 2 — Crear las tablas de la base de datos

1. En tu proyecto de Supabase, andá a **SQL Editor** (menú izquierdo)
2. Hacé click en **"New query"**
3. Copiá y pegá este código SQL y hacé click en **"Run"**:

```sql
-- Tabla de turnos
CREATE TABLE appointments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name  VARCHAR(100) NOT NULL,
  client_phone VARCHAR(30)  NOT NULL,
  service      VARCHAR(80)  NOT NULL DEFAULT 'Corte de pelo',
  appointment_date DATE     NOT NULL,
  appointment_time TIME     NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes        TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Tabla de horarios bloqueados
CREATE TABLE blocked_slots (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_date  DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  reason     VARCHAR(100)
);

-- Habilitar Row Level Security
ALTER TABLE appointments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots  ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso:
-- Los clientes pueden VER y CREAR turnos
CREATE POLICY "Public read appointments"
  ON appointments FOR SELECT USING (true);

CREATE POLICY "Public insert appointments"
  ON appointments FOR INSERT WITH CHECK (true);

-- Solo usuarios autenticados pueden modificar/borrar
-- (por ahora abrimos todo — se puede restringir más adelante)
CREATE POLICY "Open update appointments"
  ON appointments FOR UPDATE USING (true);

CREATE POLICY "Open delete appointments"
  ON appointments FOR DELETE USING (true);

-- Horarios bloqueados: acceso completo (solo el barbero los usa)
CREATE POLICY "Open blocked_slots"
  ON blocked_slots FOR ALL USING (true);

-- Habilitar tiempo real para el panel del barbero
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
```

---

## Paso 3 — Obtener las credenciales

1. En Supabase, andá a **Settings → API** (menú izquierdo)
2. Copiá los siguientes valores:
   - **Project URL** → algo como `https://abcxyz.supabase.co`
   - **anon public** (bajo "Project API keys")

---

## Paso 4 — Actualizar config.js

Abrí el archivo `config.js` y reemplazá:

```javascript
supabase: {
  url: 'TU_SUPABASE_URL',          // ← pegá tu Project URL aquí
  anonKey: 'TU_SUPABASE_ANON_KEY'  // ← pegá tu anon key aquí
},
```

También **cambiá el PIN** del administrador:
```javascript
adminPin: '1234',  // ← cambialo a algo solo vos sabés
```

---

## Paso 5 — Poner la app online (gratis)

### Opción A: GitHub Pages (más fácil, 100% gratis)
1. Creá una cuenta en **https://github.com**
2. Creá un repositorio nuevo y subí todos los archivos del proyecto
3. Andá a **Settings → Pages** y activalo
4. Tu app estará en `https://tunombre.github.io/cortes-zahir`

### Opción B: Netlify (también gratis, dominio bonito)
1. Andá a **https://netlify.com** y creá cuenta
2. Arrastrá la carpeta del proyecto al sitio de Netlify
3. Listo — te da una URL tipo `cortes-zahir.netlify.app`

---

## Paso 6 — Instalar como app en el celular

### En Android (Chrome):
1. Abrí la URL en Chrome
2. Tocá el menú (⋮) → **"Agregar a pantalla de inicio"**
3. ¡Listo! Aparece como app nativa

### En iPhone (Safari):
1. Abrí la URL en Safari
2. Tocá el botón compartir (□↑) → **"Agregar a inicio"**

---

## ⚠️ Nota importante sobre Supabase gratis

El plan gratuito de Supabase **pausa el proyecto si no hay actividad por 7 días**.
Para evitarlo, podés:
- Acceder al admin al menos 1 vez por semana
- Configurar un "ping" automático (te explicamos si lo necesitás)
- Cuando el negocio crezca, upgradeás al plan Pro (~$25/mes) que nunca pausa

---

## ❓ ¿Necesitás ayuda?

Si tenés dudas con algún paso, no dudes en preguntar. Todo esto está
diseñado para ser lo más simple posible sin costo mensual. 💈
