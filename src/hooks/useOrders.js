import { useEffect, useState, useCallback, useRef } from 'react';
import * as orderService from '../services/orderService';
import { playNewOrderAlert } from '../utils/orderAlertSound';

export { playNewOrderAlert, playNewOrderBeep } from '../utils/orderAlertSound';

export function useOrders(options = {}) {
  const { alarmEnabled = false } = options;
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const prevIds = useRef(new Set());
  const initialLoad = useRef(true);
  const alarmEnabledRef = useRef(alarmEnabled);

  alarmEnabledRef.current = alarmEnabled;

  const sync = useCallback((list, meta = {}) => {
    setOrders([...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    setReady(true);
    setRealtimeStatus(meta.realtimeStatus || (orderService.isBackendReady() ? 'live' : 'local'));
  }, []);

  useEffect(() => {
    const unsub = orderService.subscribeOrders((list, meta) => {
      sync(list, meta);
    });
    return unsub;
  }, [sync]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      orderService.fetchOrdersAdmin().then((list) => {
        sync(list, { realtimeStatus: orderService.isBackendReady() ? 'live' : 'local' });
      });
    };
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [sync]);

  useEffect(() => {
    if (!ready) return;
    const currentIds = new Set(orders.map((o) => o.id));
    if (initialLoad.current) {
      initialLoad.current = false;
      prevIds.current = currentIds;
      return;
    }
    const hasNewOrder = orders.some((o) => !prevIds.current.has(o.id));
    if (alarmEnabledRef.current && hasNewOrder) {
      playNewOrderAlert();
    }
    prevIds.current = currentIds;
  }, [orders, ready]);

  return {
    orders,
    ready,
    realtimeStatus,
    refresh: () => orderService.fetchOrdersAdmin().then((list) => {
      sync(list, { realtimeStatus: orderService.isBackendReady() ? 'live' : 'local' });
    }),
    saveOrder: orderService.saveOrder,
    updateOrder: orderService.updateOrder,
    isBackendReady: orderService.isBackendReady,
  };
}
