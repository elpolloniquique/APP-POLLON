import { useEffect, useRef, useState } from 'react';
import { Banknote, Check, ChevronDown } from 'lucide-react';
import {
  CAJA_PAGO,
  cajaPagoLabel,
  canEditCajaPago,
  resolveCajaPagoStatus,
} from '../../utils/cajaPago';

/**
 * Botón profesional de cobro interno (solo panel cajera/admin).
 * No imprimible / no visible para cliente.
 */
export function CajaPagoControl({ order, deliveryInfo, onChange, disabled = false }) {
  const status = resolveCajaPagoStatus(order, deliveryInfo);
  const editable = canEditCajaPago(order, deliveryInfo) && !disabled;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const tone =
    status === CAJA_PAGO.PAGADO
      ? 'caja-pago--pagado'
      : status === CAJA_PAGO.POR_PAGAR
        ? 'caja-pago--por-pagar'
        : 'caja-pago--na';

  const pick = async (next) => {
    setOpen(false);
    if (!editable || next === status || next === CAJA_PAGO.NA) return;
    await onChange?.(next);
  };

  if (!editable) {
    return (
      <span
        className={`caja-pago caja-pago--pill ${tone}`}
        title="Sin repartidor asignado — cobro N/A"
      >
        <Banknote className="h-3 w-3 opacity-70" />
        N/A
      </span>
    );
  }

  return (
    <div className="caja-pago-wrap relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`caja-pago caja-pago--btn ${tone}`}
        title="Marcar cobro (solo caja)"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Banknote className="h-3.5 w-3.5" />
        <span>{cajaPagoLabel(status)}</span>
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="caja-pago-menu" role="menu">
          <p className="caja-pago-menu__hint">Control de caja</p>
          {[CAJA_PAGO.POR_PAGAR, CAJA_PAGO.PAGADO].map((opt) => (
            <button
              key={opt}
              type="button"
              role="menuitem"
              className={`caja-pago-menu__item ${status === opt ? 'is-active' : ''}`}
              onClick={() => pick(opt)}
            >
              <span>{cajaPagoLabel(opt)}</span>
              {status === opt && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
