import { useEffect, useState, useCallback, useRef } from 'react';
import * as orderService from '../services/orderService';

export function useOrders() {
  const [orders, setOrders] = useState([]);
  const [ready, setReady] = useState(false);
  const prevCount = useRef(0);

  const sync = useCallback((list) => {
    setOrders([...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    setReady(true);
  }, []);

  useEffect(() => {
    orderService.initOrders(sync);
  }, [sync]);

  const playAlarm = useCallback(() => {
    try {
      const audio = new Audio('/sounds/alarma.mp3');
      audio.volume = 0.8;
      audio.play().catch(() => {});
      setTimeout(() => audio.pause(), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (ready && orders.length > prevCount.current && prevCount.current > 0) {
      playAlarm();
    }
    prevCount.current = orders.length;
  }, [orders.length, ready, playAlarm]);

  return {
    orders,
    ready,
    refresh: () => orderService.fetchOrdersAdmin().then(sync),
    saveOrder: orderService.saveOrder,
    updateOrder: orderService.updateOrder,
    isBackendReady: orderService.isBackendReady,
  };
}
