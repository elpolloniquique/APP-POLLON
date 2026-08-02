import { useEffect, useRef, useState } from 'react';
import { Banknote, Check, ChevronDown } from 'lucide-react';
import {
  CAJA_PAGO,
  CAJA_PAGO_OPTIONS,
  cajaPagoLabel,
  resolveCajaPagoStatus,
} from '../../utils/cajaPago';

/**
 * Botón profesional de cobro interno (solo panel cajera/admin).
 * N/A | Por pagar | Pagado — siempre editable.
 * No imprimible / no visible para cliente.
 */
export function CajaPagoControl({ order, onChange, disabled = false }) {
  const status = resolveCajaPagoStatus(order);
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
    if (disabled || next === status) return;
    await onChange?.(next);
  };

  return (
    <div className="caja-pago-wrap relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`caja-pago caja-pago--btn ${tone}`}
        title="Control de cobro (solo caja): N/A, Por pagar o Pagado"
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
          {CAJA_PAGO_OPTIONS.map((opt) => (
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
