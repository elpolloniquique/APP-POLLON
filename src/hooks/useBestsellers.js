import { useEffect, useState } from 'react';
import {
  buildTopProductItems,
  resolveBestsellerProducts,
} from '../utils/dashboardAnalytics';
import { fetchBranchOrdersForPeriod } from '../services/orderService';

/** Platos visibles sin scroll; se listan hasta MAX si hay más ventas. */
export const BESTSELLERS_VISIBLE = 5;
export const BESTSELLERS_MAX = 10;
export const BESTSELLERS_PERIOD = 'week';

function fallbackProducts(menuProducts, limit = BESTSELLERS_VISIBLE) {
  return (menuProducts || []).filter((p) => p.available !== false).slice(0, limit);
}

export function useBestsellers(branchId, menuProducts, periodId = BESTSELLERS_PERIOD) {
  const [bestsellers, setBestsellers] = useState(() => fallbackProducts(menuProducts));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId || !menuProducts?.length) {
      setBestsellers(fallbackProducts(menuProducts));
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const orders = await fetchBranchOrdersForPeriod(branchId, periodId);
        const topItems = buildTopProductItems(orders, BESTSELLERS_MAX * 2);
        const matched = resolveBestsellerProducts(topItems, menuProducts, BESTSELLERS_MAX);
        if (!cancelled) {
          setBestsellers(matched.length ? matched : fallbackProducts(menuProducts));
        }
      } catch {
        if (!cancelled) setBestsellers(fallbackProducts(menuProducts));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [branchId, menuProducts, periodId]);

  return { bestsellers, loading };
}
