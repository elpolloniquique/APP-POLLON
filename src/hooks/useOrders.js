import { useEffect, useState, useCallback, useRef } from 'react';
import * as orderService from '../services/orderService';
import { playNewOrderAlert } from '../utils/orderAlertSound';

export { playNewOrderAlert, playNewOrderBeep } from '../utils/orderAlertSound';

export function useOrders(options = {}) {
  const { alarmEnabled = false } = options;
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const prevCount = useRef(0);
  const initialLoad = useRef(true);
  const alarmEnabledRef = useRef(alarmEnabled);

  alarmEnabledRef.current = alarmEnabled;

  const sync = useCallback((list) => {
    setOrders([...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    setReady(true);
    setRealtimeStatus(orderService.isBackendReady() ? 'live' : 'local');
  }, []);

  useEffect(() => {
    orderService.initOrders(sync);
  }, [sync]);

  useEffect(() => {
    if (!ready) return;
    if (initialLoad.current) {
      initialLoad.current = false;
      prevCount.current = orders.length;
      return;
    }
    if (alarmEnabledRef.current && orders.length > prevCount.current) {
      playNewOrderAlert();
    }
    prevCount.current = orders.length;
  }, [orders.length, ready]);

  return {
    orders,
    ready,
    realtimeStatus,
    refresh: () => orderService.fetchOrdersAdmin().then(sync),
    saveOrder: orderService.saveOrder,
    updateOrder: orderService.updateOrder,
    isBackendReady: orderService.isBackendReady,
  };
}
