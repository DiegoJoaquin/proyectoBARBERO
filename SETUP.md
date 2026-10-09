# 🔧 Guía de Configuración — Cortes Zahir

Cómo dejar la app funcionando en internet, con los datos guardados en la nube
(Supabase) para que el barbero vea las reservas en tiempo real desde su celular.

> Si `config.js` no tiene datos de Supabase, la app funciona en **Modo Demo**
> (los datos quedan solo en ese navegador; PIN demo: `123456`).

---

## Paso 1 — Proyecto en Supabase (gratis)

1. Entra a **https://supabase.com** con tu cuenta.
2. Si el proyecto anterior aparece **pausado**, haz click en **"Restore project"**.
   Si ya no existe, crea uno nuevo con **"New project"** (región: South America).
3. Espera ~2 minutos a que quede listo.

---

## Paso 2 — Crear las tablas y la seguridad

1. En Supabase, ve a **SQL Editor → New query**.
2. Copia **todo** el contenido del archivo [`supabase/schema.sql`](supabase/schema.sql), pégalo y haz click en **Run**.

Esto crea las tablas y deja la base segura:
- Los clientes **solo pueden crear** reservas. No pueden ver nombres ni teléfonos de otros clientes, ni modificar o borrar nada.
- Dos personas **no pueden reservar la misma hora** (aunque lo hagan al mismo tiempo).
- No se puede reservar en horas pasadas ni en horarios bloqueados.
- Solo el barbero (usuario autenticado) puede ver y administrar la agenda.

El script se puede ejecutar de nuevo sin problemas (sirve también para actualizar una base antigua).

---

## Paso 3 — Crear el usuario del barbero (su PIN)

1. Ve a **Authentication → Users → Add user → Create new user**.
2. **Email:** el mismo que está en `config.js` → `adminEmail` (por defecto `barbero@corteszahir.cl`; no necesita ser un correo real).
3. **Password:** el PIN de **6 dígitos** que usará el barbero (ej: `482915`). No uses `123456`.
4. Marca **"Auto Confirm User"** y crea el usuario.

### ⚠️ Muy importante: desactivar registros nuevos
Ve a **Authentication → Sign In / Providers → Email** (o *Authentication → Settings*)
y **desactiva "Allow new users to sign up"**. Si no, cualquier persona podría
crearse una cuenta y entrar a la agenda.

> Para cambiar el PIN más adelante: Authentication → Users → (el usuario) → **Reset password** / editar contraseña.

---

## Paso 4 — Conectar la app (config.js)

En Supabase ve a **Project Settings → API** y copia:
- **Project URL** → algo como `https://abcxyz.supabase.co`
- **anon public key**

Pégalos en `config.js`:

```javascript
supabase: {
  url: 'https://abcxyz.supabase.co',
  anonKey: 'eyJhbGciOi...'
},
```

La *anon key* es pública por diseño (va en el navegador); la seguridad la da el Paso 2.
**Nunca** pongas en este archivo la *service_role key*.

En `config.js` también puedes editar: servicios, precios, horarios, días laborales,
dirección y WhatsApp del local (aparece un botón para que el cliente avise su reserva).

---

## Paso 5 — Publicar la app (GitHub Pages, gratis)

1. Sube los cambios al repositorio: `git push`.
2. En GitHub → repositorio **proyectoBARBERO** → **Settings → Pages**.
3. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
4. En 1–2 minutos queda en:
   - Clientes: `https://diegojoaquin.github.io/proyectoBARBERO/`
   - Barbero: `https://diegojoaquin.github.io/proyectoBARBERO/admin.html`

---

## Paso 6 — Evitar que Supabase se pause

El plan gratis **pausa el proyecto tras 7 días sin actividad** (eso fue lo que pasó con la versión anterior).
El repositorio incluye `.github/workflows/keepalive.yml`, que hace una consulta cada 3 días automáticamente.

- Revisa que funcione en GitHub → **Actions → Supabase keep-alive → Run workflow**.
- GitHub desactiva las tareas programadas si el repositorio pasa 60 días sin commits; si te llega un correo avisando, entra a *Actions* y vuelve a activarla.

---

## Paso 7 — Instalar como app en el celular

- **Android (Chrome):** abre la URL → menú (⋮) → **"Agregar a pantalla de inicio"**.
- **iPhone (Safari):** abre la URL → botón compartir (□↑) → **"Agregar a inicio"**.

Para el barbero, instala directamente la URL de `admin.html`.
