-- ============================================================
--  CORTES ZAHIR — Esquema de base de datos (Supabase)
--  Pegar completo en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar más de una vez sin problema (es idempotente),
--  y también sirve para actualizar una base creada con la versión anterior.
-- ============================================================

-- ── TABLAS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name      VARCHAR(100) NOT NULL,
  client_phone     VARCHAR(30)  NOT NULL,
  service          VARCHAR(80)  NOT NULL DEFAULT 'Corte de pelo',
  appointment_date DATE         NOT NULL,
  appointment_time TIME         NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_date  DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  reason     VARCHAR(100),
  CHECK (end_time > start_time)
);

-- Límite de largo para las notas (evita textos gigantes desde el formulario público)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_notes_length;
ALTER TABLE appointments ADD CONSTRAINT appointments_notes_length
  CHECK (notes IS NULL OR char_length(notes) <= 500);

-- ── EVITAR DOBLE RESERVA ─────────────────────────────────────
-- Dos turnos activos no pueden tener la misma fecha y hora.
-- (Si dos clientes reservan a la vez, el segundo recibe un error y elige otra hora.)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_slot
  ON appointments (appointment_date, appointment_time)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS blocked_slots_date_idx ON blocked_slots (slot_date);

-- ── VALIDACIÓN DE RESERVAS DE CLIENTES ───────────────────────
-- Las reservas hechas desde la web pública (rol "anon") deben ser
-- a futuro y no pueden caer en un horario bloqueado.
CREATE OR REPLACE FUNCTION check_public_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now TIMESTAMP := NOW() AT TIME ZONE 'America/Santiago';
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN NEW;  -- el barbero puede agendar sin restricciones
  END IF;

  IF NEW.appointment_date + NEW.appointment_time <= local_now THEN
    RAISE EXCEPTION 'Ese horario ya pasó' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.appointment_date > local_now::date + 60 THEN
    RAISE EXCEPTION 'Fecha demasiado lejana' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blocked_slots b
    WHERE b.slot_date = NEW.appointment_date
      AND NEW.appointment_time >= b.start_time
      AND NEW.appointment_time <  b.end_time
  ) THEN
    RAISE EXCEPTION 'Horario bloqueado' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_check_public_booking ON appointments;
CREATE TRIGGER appointments_check_public_booking
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_public_booking();

-- ── HORARIOS OCUPADOS (sin datos personales) ─────────────────
-- Los clientes solo necesitan saber QUÉ horas están ocupadas,
-- no los nombres ni teléfonos de los demás clientes.
CREATE OR REPLACE FUNCTION get_busy_slots(p_date DATE)
RETURNS TABLE (kind TEXT, start_time TIME, end_time TIME)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'appointment', a.appointment_time, a.appointment_time
    FROM appointments a
   WHERE a.appointment_date = p_date AND a.status <> 'cancelled'
  UNION ALL
  SELECT 'blocked', b.start_time, b.end_time
    FROM blocked_slots b
   WHERE b.slot_date = p_date;
$$;

REVOKE ALL ON FUNCTION get_busy_slots(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_busy_slots(DATE) TO anon, authenticated;

-- ── SEGURIDAD (Row Level Security) ───────────────────────────
ALTER TABLE appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;

-- Borrar políticas antiguas (versión anterior dejaba todo abierto)
DROP POLICY IF EXISTS "Public read appointments"   ON appointments;
DROP POLICY IF EXISTS "Public insert appointments" ON appointments;
DROP POLICY IF EXISTS "Open update appointments"   ON appointments;
DROP POLICY IF EXISTS "Open delete appointments"   ON appointments;
DROP POLICY IF EXISTS "Open blocked_slots"         ON blocked_slots;
DROP POLICY IF EXISTS "Clients can book"           ON appointments;
DROP POLICY IF EXISTS "Barber manages appointments" ON appointments;
DROP POLICY IF EXISTS "Barber manages blocked"     ON blocked_slots;

-- Clientes (anónimos): solo pueden CREAR turnos en estado "pendiente".
-- No pueden ver, modificar ni borrar turnos de nadie.
CREATE POLICY "Clients can book"
  ON appointments FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- Barbero (usuario autenticado): acceso completo.
CREATE POLICY "Barber manages appointments"
  ON appointments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Barber manages blocked"
  ON blocked_slots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── TIEMPO REAL (panel del barbero) ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'appointments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'blocked_slots') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE blocked_slots;
  END IF;
END $$;
