-- =============================================================================
-- FIX checkout cliente: columnas pedidos para multi-sucursal
-- Error: "Could not find the 'sucursal_id' column of 'pedidos'"
-- Ejecutar en Supabase SQL Editor → Run
-- =============================================================================

-- La app usa branch_id (UUID → branches), NO sucursal_id (legacy)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_branch ON public.pedidos(branch_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_customer ON public.pedidos(customer_id);

-- Verificación: deben aparecer branch_id y customer_id
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pedidos'
  AND column_name IN ('branch_id', 'customer_id', 'sucursal_id')
ORDER BY column_name;
