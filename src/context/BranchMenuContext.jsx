import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { useBranch } from './BranchContext';
import { loadBranchMenu, subscribeBranchMenu } from '../services/menuService';

const EMPTY_MENU = { categories: [], productsByCategory: {}, products: [], source: 'empty' };

const BranchMenuContext = createContext(null);

export function BranchMenuProvider({ children }) {
  const { branch } = useBranch();
  const [menu, setMenu] = useState(EMPTY_MENU);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!branch?.id) {
      setMenu(EMPTY_MENU);
      setLoading(false);
      return;
    }
    try {
      const data = await loadBranchMenu(branch.id);
      setMenu(data);
    } catch {
      setMenu(EMPTY_MENU);
    } finally {
      setLoading(false);
    }
  }, [branch?.id]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const unsub = subscribeBranchMenu(branch?.id, refresh);
    return unsub;
  }, [branch?.id, refresh]);

  return (
    <BranchMenuContext.Provider value={{ ...menu, loading, refresh }}>
      {children}
    </BranchMenuContext.Provider>
  );
}

export function useBranchMenu() {
  const ctx = useContext(BranchMenuContext);
  if (!ctx) throw new Error('useBranchMenu debe usarse dentro de BranchMenuProvider');
  return ctx;
}
