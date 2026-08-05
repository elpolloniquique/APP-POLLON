-- ============================================================
-- Tracking de pedidos: 2 modos + sync estados desde repartidor
-- ============================================================
-- A) Repartidor ACEPTA oferta → estado=aceptado + tracking_mode=live_map
--    → Cliente ve mapa en tiempo real + ETA
--    → A ~5 min de la sucursal → preparando (En cocina) [cliente/app]
--    → Pedido recogido → en_delivery
--    → Entregado → entregado
-- B) Cajera avanza sin aceptación de app → tracking_mode=status_line
--    → Cliente solo ve barra de estados
-- ============================================================

-- 1) Aceptar oferta: Aceptado + live_map (ya NO salta a en_delivery)
CREATE OR REPLACE FUNCTION public.ep_accept_delivery_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  off RECORD;
  did UUID;
  lock_key BIGINT;
  v_max INT;
  v_active INT;
  v_post_pickup INT;
  oid TEXT;
BEGIN
  did := public.ep_my_driver_id();
  IF did IS NULL THEN RAISE EXCEPTION 'No eres repartidor'; END IF;

  SELECT * INTO off FROM ep_delivery_offers WHERE id = p_offer_id AND driver_id = did FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no encontrada'; END IF;
  IF off.status <> 'pending' THEN RAISE EXCEPTION 'Oferta ya no disponible'; END IF;
  IF off.expires_at < now() THEN
    UPDATE ep_delivery_offers SET status = 'expired' WHERE id = p_offer_id;
    RAISE EXCEPTION 'Oferta expirada';
  END IF;

  lock_key := hashtext(off.job_id::text);
  PERFORM pg_advisory_xact_lock(lock_key);

  IF EXISTS (
    SELECT 1 FROM ep_delivery_assignments
    WHERE job_id = off.job_id AND status = 'active'
  ) THEN
    UPDATE ep_delivery_offers SET status = 'taken_by_other', responded_at = now() WHERE id = p_offer_id;
    RAISE EXCEPTION 'Pedido tomado por otro repartidor';
  END IF;

  UPDATE ep_delivery_offers SET status = 'accepted', responded_at = now() WHERE id = p_offer_id;
  UPDATE ep_delivery_offers
  SET status = 'taken_by_other', responded_at = now()
  WHERE job_id = off.job_id AND id <> p_offer_id AND status = 'pending';

  INSERT INTO ep_delivery_assignments (job_id, driver_id, status, phase, driver_fee)
  VALUES (off.job_id, did, 'active', 'to_store', off.offered_fee);

  UPDATE ep_delivery_jobs
  SET status = 'assigned',
      assigned_driver_id = did,
      assigned_at = now(),
      updated_at = now()
  WHERE id = off.job_id
  RETURNING source_order_id INTO oid;

  SELECT COALESCE(max_orders, 3) INTO v_max FROM ep_driver_profiles WHERE id = did;
  SELECT COUNT(*) INTO v_active
  FROM ep_delivery_assignments WHERE driver_id = did AND status = 'active';
  SELECT COUNT(*) INTO v_post_pickup
  FROM ep_delivery_assignments
  WHERE driver_id = did AND status = 'active' AND phase IN ('to_customer', 'done');

  IF v_active < v_max AND v_post_pickup = 0 THEN
    UPDATE ep_driver_profiles
    SET operational_status = 'available', updated_at = now()
    WHERE id = did;
  ELSE
    UPDATE ep_driver_profiles
    SET operational_status = 'heading_to_branch', updated_at = now()
    WHERE id = did;
  END IF;

  -- Aceptado + modo mapa en vivo para el cliente
  UPDATE pedidos
  SET
    estado = CASE
      WHEN estado IN ('entregado', 'cancelado', 'en_delivery', 'preparando') THEN estado
      ELSE 'aceptado'
    END,
    datos_json = COALESCE(datos_json, '{}'::jsonb)
      || jsonb_build_object(
        'tracking_mode', 'live_map',
        'driver_accepted_at', to_jsonb(now())
      )
  WHERE id = oid
    AND estado NOT IN ('entregado', 'cancelado');

  RETURN jsonb_build_object('ok', true, 'job_id', off.job_id, 'driver_id', did, 'order_id', oid, 'active_count', v_active);
END;
$$;

-- 2) Recogido: En reparto
CREATE OR REPLACE FUNCTION public.ep_confirm_pickup(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  did UUID;
  is_staff BOOLEAN;
  oid TEXT;
BEGIN
  did := public.ep_my_driver_id();
  is_staff := public.ep_is_dispatch_staff();

  IF did IS NOT NULL THEN
    SELECT * INTO a FROM ep_delivery_assignments
    WHERE id = p_assignment_id AND driver_id = did AND status = 'active';
  ELSIF is_staff THEN
    SELECT * INTO a FROM ep_delivery_assignments
    WHERE id = p_assignment_id AND status = 'active';
  ELSE
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación no encontrada'; END IF;

  UPDATE ep_delivery_assignments
  SET phase = 'to_customer', picked_up_at = now(), updated_at = now()
  WHERE id = p_assignment_id;

  UPDATE ep_delivery_jobs
  SET status = 'picked_up', picked_up_at = now(), updated_at = now()
  WHERE id = a.job_id
  RETURNING source_order_id INTO oid;

  UPDATE ep_driver_profiles
  SET operational_status = 'delivering', updated_at = now()
  WHERE id = a.driver_id;

  UPDATE ep_delivery_offers
  SET status = 'expired', responded_at = now()
  WHERE driver_id = a.driver_id AND status = 'pending';

  -- Pedido en reparto
  IF oid IS NOT NULL THEN
    UPDATE pedidos
    SET
      estado = 'en_delivery',
      datos_json = COALESCE(datos_json, '{}'::jsonb)
        || jsonb_build_object('picked_up_at', to_jsonb(now()))
    WHERE id = oid
      AND estado NOT IN ('entregado', 'cancelado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'driver_id', a.driver_id, 'order_id', oid);
END;
$$;

-- 3) Cliente: tracking en vivo seguro (solo su pedido)
CREATE OR REPLACE FUNCTION public.ep_customer_order_live_tracking(p_order_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ped RECORD;
  job RECORD;
  asg RECORD;
  loc RECORD;
  branch RECORD;
  mode TEXT;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO ped FROM pedidos WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ped.customer_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  mode := COALESCE(ped.datos_json->>'tracking_mode', 'status_line');

  SELECT * INTO job
  FROM ep_delivery_jobs
  WHERE source_order_id = p_order_id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR job.assigned_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'tracking_mode', mode,
      'estado', ped.estado,
      'has_driver', false
    );
  END IF;

  -- Si hay driver asignado por aceptación, forzar live_map
  IF mode IS DISTINCT FROM 'live_map' AND job.assigned_at IS NOT NULL THEN
    mode := 'live_map';
  END IF;

  SELECT * INTO asg
  FROM ep_delivery_assignments
  WHERE job_id = job.id AND status = 'active'
  ORDER BY accepted_at DESC NULLS LAST
  LIMIT 1;

  SELECT * INTO loc
  FROM ep_driver_location_latest
  WHERE driver_id = job.assigned_driver_id;

  SELECT id, name, lat, lng, address, city INTO branch
  FROM branches
  WHERE id = COALESCE(job.branch_id, ped.branch_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'tracking_mode', mode,
    'estado', ped.estado,
    'has_driver', true,
    'phase', COALESCE(asg.phase, 'to_store'),
    'driver', jsonb_build_object(
      'id', job.assigned_driver_id,
      'lat', loc.lat,
      'lng', loc.lng,
      'heading', loc.heading,
      'speed', loc.speed,
      'updated_at', loc.updated_at
    ),
    'customer', jsonb_build_object(
      'lat', COALESCE(job.customer_lat, ped.cliente_lat),
      'lng', COALESCE(job.customer_lng, ped.cliente_lng),
      'address', COALESCE(job.customer_address, ped.cliente_direccion)
    ),
    'store', jsonb_build_object(
      'id', branch.id,
      'name', branch.name,
      'lat', branch.lat,
      'lng', branch.lng,
      'address', branch.address
    ),
    'ticket', COALESCE(job.ticket_code, ped.codigo_pedido)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ep_customer_order_live_tracking(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ep_customer_order_live_tracking(TEXT) TO authenticated;

COMMENT ON FUNCTION public.ep_customer_order_live_tracking(TEXT) IS
  'Tracking cliente: mapa+ETA solo si tracking_mode=live_map / driver aceptó.';
