-- 067: el sector del negocio (agent_profile.sector). Aditiva y anulable: una
-- instalación que actualiza queda en null = General, sin reglas de sector, y
-- no cambia de comportamiento hasta que alguien elija uno en la pantalla.
ALTER TABLE "agent_profile" ADD COLUMN IF NOT EXISTS "sector" text;
