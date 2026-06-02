import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Minus, Plus, Check, ShoppingBag, AlertTriangle } from 'lucide-react';
import { money } from '../../utils/format';
import {
  calcBagQty,
  calcLineTotal,
  formatBagRatioLabel,
  formatDrinksLabel,
  MODAL_DRINK_OPTIONS,
  resolveProductOptions,
} from '../../utils/productOptions';
import { useCart } from '../../context/CartContext';

function resizeDrinks(list, qty) {
  const next = [...(list || [])];
  while (next.length < qty) next.push('');
  return next.slice(0, qty);
}

function getMissingDrinkIndex(drinks) {
  return drinks.findIndex((d) => !String(d || '').trim());
}

function drinkValidationMessage(drinks) {
  const idx = getMissingDrinkIndex(drinks);
  if (idx < 0) return null;
  if (drinks.length <= 1) {
    return 'Primero elija el sabor de su bebida.';
  }
  return `Debe seleccionar el sabor de bebida de su plato ${idx + 1}.`;
}

function alertHeading(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('bebida') || m.includes('sabor')) return 'Bebida pendiente';
  if (m.includes('bolsa')) return 'Opción requerida';
  return 'Atención';
}

export function ProductModal({ product, category, categoryName = '', onClose, onAddOverride }) {
  const { addItem } = useCart();
  const opts = useMemo(
    () => resolveProductOptions(product, categoryName),
    [product, categoryName],
  );

  const [qty, setQty] = useState(1);
  const [drinks, setDrinks] = useState(['']);
  const [bagSelected, setBagSelected] = useState(false);
  const [sideAlert, setSideAlert] = useState('');
  const [highlightDrinkIdx, setHighlightDrinkIdx] = useState(-1);
  const drinkSectionRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setQty(1);
    setDrinks(['']);
    setBagSelected(opts.bagRequired && opts.bagEnabled);
    setSideAlert('');
    setHighlightDrinkIdx(-1);
  }, [product?.id, opts.bagRequired, opts.bagEnabled]);

  useEffect(() => {
    setDrinks((prev) => resizeDrinks(prev, qty));
    if (opts.bagRequired && opts.bagEnabled) setBagSelected(true);
  }, [qty, opts.bagRequired, opts.bagEnabled]);

  useEffect(() => {
    if (!sideAlert) return undefined;
    const t = window.setTimeout(() => setSideAlert(''), 4500);
    return () => window.clearTimeout(t);
  }, [sideAlert]);

  if (!product) return null;

  const unitPrice = product.price;
  const bagQty = calcBagQty(qty, bagSelected, opts.bagUnitsPerBag);
  const lineTotal = calcLineTotal({
    unitPrice,
    qty,
    bagPrice: opts.bagPrice,
    includeBag: bagSelected,
    bagUnitsPerBag: opts.bagUnitsPerBag,
  });

  const hasCustomization = opts.drinkEnabled || opts.bagEnabled;

  const showSideAlert = (message) => {
    setSideAlert(message);
    if (opts.drinkEnabled) {
      const idx = getMissingDrinkIndex(drinks);
      setHighlightDrinkIdx(idx);
      if (idx >= 0) {
        drinkSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const setQtySafe = (next) => {
    setQty(Math.max(1, next));
    if (opts.bagRequired) setBagSelected(true);
    setSideAlert('');
    setHighlightDrinkIdx(-1);
  };

  const setDrinkAt = (index, value) => {
    setDrinks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setSideAlert('');
    setHighlightDrinkIdx(-1);
  };

  const handleAdd = () => {
    if (opts.drinkEnabled) {
      const drinkMsg = drinkValidationMessage(drinks);
      if (drinkMsg) {
        showSideAlert(drinkMsg);
        return;
      }
    }
    if (opts.bagEnabled && opts.bagRequired && !bagSelected) {
      showSideAlert('Debe seleccionar la bolsa ecológica para continuar.');
      return;
    }

    setSideAlert('');
    setHighlightDrinkIdx(-1);
    const drinkLabel = formatDrinksLabel(drinks);
    const payload = {
      producto_id: product.id,
      name: product.name,
      qty,
      unitPrice,
      bagPrice: opts.bagPrice,
      bagUnitsPerBag: opts.bagUnitsPerBag,
      includeBag: bagSelected,
      total: lineTotal,
      drink: opts.drinkEnabled ? drinkLabel : null,
      drinks: opts.drinkEnabled ? drinks.filter(Boolean) : [],
      bagQty: opts.bagEnabled ? bagQty : 0,
      notes: '',
      category,
      available: product.available !== false,
    };
    if (onAddOverride) onAddOverride(payload);
    else {
      const r = addItem(payload);
      if (!r?.ok && r?.error) {
        showSideAlert(
          r.error === 'branch_mismatch'
            ? 'Vacíe el carrito para cambiar de sucursal'
            : 'No se pudo agregar al carrito',
        );
        return;
      }
    }
    onClose();
  };

  return (
    <>
      {sideAlert && (
        <div className="product-modal-alert" role="alert" aria-live="assertive">
          <div className="product-modal-alert__icon-wrap" aria-hidden>
            <AlertTriangle className="product-modal-alert__icon" strokeWidth={2.25} />
          </div>
          <div className="product-modal-alert__body">
            <p className="product-modal-alert__title">{alertHeading(sideAlert)}</p>
            <p className="product-modal-alert__text">{sideAlert}</p>
          </div>
        </div>
      )}

      <div
        className="product-modal-backdrop"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="product-modal product-modal--compact"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="product-modal-title"
        >
          <header className="product-modal__header product-modal__header--bar">
            <div className="product-modal__header-text min-w-0 flex-1 pr-2">
              <h2 id="product-modal-title" className="product-modal__title">
                {product.name}
              </h2>
              {product.description && (
                <p className="product-modal__subtitle line-clamp-2">{product.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="product-modal__close product-modal__close--inline"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {hasCustomization && (
            <p className="product-modal__hint product-modal__hint--bar">
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Personaliza tu pedido antes de agregar
            </p>
          )}

          <div className="product-modal__body admin-scroll-panel">
            {opts.drinkEnabled && (
              <section ref={drinkSectionRef} className="product-modal__section product-modal__section--drinks">
                <div className="product-modal__section-head">
                  <h3 className="product-modal__section-title">Sabor de bebida</h3>
                  <span className="product-modal__required">Obligatorio</span>
                </div>
                <p className="product-modal__section-desc">
                  {qty > 1
                    ? 'Elija un sabor para cada plato de su pedido'
                    : 'Seleccione el sabor de su bebida 1.5 L'}
                </p>

                {qty > 1 ? (
                  <div className="product-modal__units">
                    {drinks.map((d, i) => (
                      <div
                        key={i}
                        className={`product-modal__unit-block ${highlightDrinkIdx === i ? 'product-modal__unit-block--error' : ''}`}
                      >
                        <p className="product-modal__unit-label">Plato {i + 1}</p>
                        <div className="product-modal__option-grid">
                          {MODAL_DRINK_OPTIONS.map((option, idx) => (
                            <DrinkOptionCard
                              key={`${i}-${option}`}
                              label={option}
                              selected={d === option}
                              onSelect={() => setDrinkAt(i, option)}
                              compact
                              fullWidth={idx === MODAL_DRINK_OPTIONS.length - 1 && MODAL_DRINK_OPTIONS.length % 2 !== 0}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="product-modal__option-grid">
                    {MODAL_DRINK_OPTIONS.map((option, idx) => (
                      <DrinkOptionCard
                        key={option}
                        label={option}
                        selected={drinks[0] === option}
                        onSelect={() => setDrinkAt(0, option)}
                        compact
                        fullWidth={idx === MODAL_DRINK_OPTIONS.length - 1 && MODAL_DRINK_OPTIONS.length % 2 !== 0}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {opts.bagEnabled && (
              <section className="product-modal__section product-modal__section--bag">
                <button
                  type="button"
                  onClick={() => {
                    if (!opts.bagRequired) setBagSelected(!bagSelected);
                    setSideAlert('');
                  }}
                  className={`product-modal-option product-modal-option--compact w-full text-left ${bagSelected ? 'product-modal-option--active' : ''} ${opts.bagRequired ? 'cursor-default' : ''}`}
                >
                  <span className={`product-modal-radio ${bagSelected ? 'product-modal-radio--active' : ''}`}>
                    {bagSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs font-bold text-pollon-black sm:text-sm">
                      Bolsa ecológica (+ {money(opts.bagPrice)})
                    </span>
                    <span className="text-[10px] font-normal normal-case tracking-normal text-gray-500">
                      {formatBagRatioLabel(opts.bagUnitsPerBag)}
                      {bagSelected && bagQty > 0 && ` · ${bagQty} bolsa${bagQty !== 1 ? 's' : ''}`}
                    </span>
                  </span>
                </button>
              </section>
            )}

            {!hasCustomization && !product.description && (
              <p className="product-modal__empty-hint">Confirma cantidad y agrégalo a tu pedido</p>
            )}
          </div>

          <footer className="product-modal__footer product-modal__footer--compact">
            <div className="product-modal__summary-row">
              <div className="product-modal__summary-qty">
                <span className="product-modal__summary-label">Cant.</span>
                <div className="product-modal__qty product-modal__qty--compact">
                  <button
                    type="button"
                    onClick={() => setQtySafe(qty - 1)}
                    className="product-modal__qty-btn product-modal__qty-btn--minus"
                    aria-label="Menos"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <span className="product-modal__qty-value">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQtySafe(qty + 1)}
                    className="product-modal__qty-btn product-modal__qty-btn--plus"
                    aria-label="Más"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="product-modal__summary-total">
                <span className="product-modal__summary-total-label">Total</span>
                <span className="product-modal__summary-total-value">{money(lineTotal)}</span>
              </div>
            </div>

            <div className="product-modal__actions">
              <button type="button" onClick={onClose} className="product-modal__btn product-modal__btn--ghost">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className="product-modal__btn product-modal__btn--primary"
              >
                Agregar al carrito
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

function DrinkOptionCard({ label, selected, onSelect, fullWidth = false, compact = false }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`product-modal-option ${compact ? 'product-modal-option--compact' : ''} ${selected ? 'product-modal-option--active' : ''} ${fullWidth ? 'col-span-2' : ''}`}
    >
      <span className={`product-modal-radio ${selected ? 'product-modal-radio--active' : ''}`}>
        {selected && <Check className="h-2.5 w-2.5 text-white sm:h-3 sm:w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 text-left text-[10px] font-bold uppercase leading-tight tracking-wide text-pollon-black sm:text-xs">
        {label}
      </span>
    </button>
  );
}
