-- =============================================================================
-- Reloj de 1 minuto en Supabase (pg_cron + pg_net) → Web Push / FCM
-- Ejecutar UNA vez en SQL Editor (plan pago: pg_cron incluido).
--
-- Qué hace: cada minuto llama a
--   https://www.el-pollon.cl/api/cron-retry-driver-offers
-- Aunque el pollito esté cerrado o la pantalla apagada.
-- Mismo pedido = actualiza la notificación (no duplica).
--
-- ANTES:
--  1) En Vercel Production debe existir CRON_SECRET (el código ya lo usa).
--  2) Luego pega ese MISMO valor abajo en ep_set_cron_secret('...').
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.ep_internal_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ep_internal_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ep_internal_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ep_internal_secrets TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.ep_set_cron_secret(p_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_secret IS NULL OR length(trim(p_secret)) < 16 THEN
    RAISE EXCEPTION 'CRON_SECRET demasiado corto';
  END IF;
  INSERT INTO public.ep_internal_secrets(key, value, updated_at)
  VALUES ('cron_secret', trim(p_secret), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'updated_at', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.ep_get_cron_secret()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.ep_internal_secrets WHERE key = 'cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ep_set_cron_secret(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ep_get_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ep_set_cron_secret(TEXT) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.ep_get_cron_secret() TO postgres, service_role;

-- >>> OBLIGATORIO: pega el mismo CRON_SECRET de Vercel (Production)
-- SELECT public.ep_set_cron_secret('PEGA_AQUI_EL_CRON_SECRET_DE_VERCEL');

CREATE OR REPLACE FUNCTION public.ep_cron_retry_driver_offers()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions, pg_temp
AS $$
DECLARE
  secret TEXT;
  req_id BIGINT;
BEGIN
  secret := public.ep_get_cron_secret();
  IF secret IS NULL OR length(trim(secret)) < 16 THEN
    RAISE WARNING '[Pollón] pg_cron: falta CRON_SECRET (ejecuta ep_set_cron_secret)';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://www.el-pollon.cl/api/cron-retry-driver-offers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object('source', 'supabase_pg_cron'),
    timeout_milliseconds := 15000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ep_cron_retry_driver_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ep_cron_retry_driver_offers() TO postgres, service_role;

-- Reprogramar de forma idempotente
DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'pollon-retry-driver-offers'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'pollon-retry-driver-offers',
  '* * * * *',
  $cron$SELECT public.ep_cron_retry_driver_offers();$cron$
);

-- Verificación
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'pollon-retry-driver-offers';
