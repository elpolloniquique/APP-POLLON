import { useLocation } from 'react-router-dom';
import { PollitoBot } from './PollitoBot';

/** Muestra Pollito Bot solo en la tienda pública (no en /admin) */
export function PollitoBotGate() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return <PollitoBot />;
}
