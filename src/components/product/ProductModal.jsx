import { useState, useEffect, useMemo } from 'react';
import { X, Minus, Plus, Check, ShoppingBag } from 'lucide-react';
import { money, optimizeMediaUrl } from '../../utils/format';
import {
  calcBagQty,
  calcLineTotal,
  formatBagRatioLabel,
  formatDrinksLabel,
  MODAL_DRINK_OPTIONS,
  resolveProductOptions,
} from '../../utils/productOptions';
import { useCart } from '../../context/CartContext';

const FALLBACK_IMG = '/img/todo el menu.png';

function resizeDrinks(list, qty) {
  const next = [...(list || [])];
  while (next.length < qty) next.push('');
  return next.slice(0, qty);
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
  const [notes, setNotes] = useState('');

  const heroImg = useMemo(
    () => optimizeMediaUrl(product?.image || product?.imageUrl, { width: 640, quality: 82 }, FALLBACK_IMG),
    [product?.image, product?.imageUrl],
  );

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setQty(1);
    setDrinks(['']);
    setBagSelected(opts.bagRequired && opts.bagEnabled);
    setNotes('');
  }, [product?.id, opts.bagRequired, opts.bagEnabled]);

  useEffect(() => {
    setDrinks((prev) => resizeDrinks(prev, qty));
    if (opts.bagRequired && opts.bagEnabled) setBagSelected(true);
  }, [qty, opts.bagRequired, opts.bagEnabled]);

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

  const drinksValid = !opts.drinkEnabled || !opts.drinkRequired || drinks.every((d) => d.trim());
  const bagValid = !opts.bagEnabled || !opts.bagRequired || bagSelected;
  const canAdd = drinksValid && bagValid;
  const hasCustomization = opts.drinkEnabled || opts.bagEnabled;

  const setQtySafe = (next) => {
    setQty(Math.max(1, next));
    if (opts.bagRequired) setBagSelected(true);
  };

  const setDrinkAt = (index, value) => {
    setDrinks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAdd = () => {
    if (!canAdd) return;
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
      notes: notes.trim(),
      category,
      available: product.available !== false,
    };
    if (onAddOverride) onAddOverride(payload);
    else {
      const r = addItem(payload);
      if (!r?.ok && r?.error) {
        alert(r.error === 'branch_mismatch' ? 'Vacía el carrito para cambiar de sucursal' : r.error);
        return;
      }
    }
    onClose();
  };

  return (
    <div
      className="product-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="product-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="product-modal-title"
      >
        <div className="product-modal__hero">
          <img
            src={heroImg}
            alt=""
            className="product-modal__hero-img"
            onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
          />
          <div className="product-modal__hero-overlay" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            className="product-modal__close"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {categoryName && (
            <span className="product-modal__category">{categoryName}</span>
          )}
        </div>

        <header className="product-modal__header">
          <h2 id="product-modal-title" className="product-modal__title">
            {product.name}
          </h2>
          {product.description && (
            <p className="product-modal__subtitle">{product.description}</p>
          )}
          {hasCustomization && (
            <p className="product-modal__hint">
              <ShoppingBag className="inline h-3.5 w-3.5 -translate-y-px" aria-hidden />
              {' '}Personaliza tu pedido antes de agregar
            </p>
          )}
        </header>

        <div className="product-modal__body admin-scroll-panel">
          {opts.drinkEnabled && (
            <section className="product-modal__section">
              <div className="product-modal__section-head">
                <h3 className="product-modal__section-title">Bebidas</h3>
                {opts.drinkRequired && (
                  <span className="product-modal__required">Obligatorio</span>
                )}
              </div>
              <p className="product-modal__section-desc">
                Elige un sabor por cada unidad del pedido
              </p>

              {qty > 1 ? (
                <div className="mt-3 space-y-4">
                  {drinks.map((d, i) => (
                    <div key={i} className="product-modal__unit-block">
                      <p className="product-modal__unit-label">Unidad {i + 1}</p>
                      <div className="product-modal__option-grid">
                        {MODAL_DRINK_OPTIONS.map((option, idx) => (
                          <DrinkOptionCard
                            key={`${i}-${option}`}
                            label={option}
                            selected={d === option}
                            onSelect={() => setDrinkAt(i, option)}
                            fullWidth={idx === MODAL_DRINK_OPTIONS.length - 1 && MODAL_DRINK_OPTIONS.length % 2 !== 0}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="product-modal__option-grid mt-3">
                  {MODAL_DRINK_OPTIONS.map((option, idx) => (
                    <DrinkOptionCard
                      key={option}
                      label={option}
                      selected={drinks[0] === option}
                      onSelect={() => setDrinkAt(0, option)}
                      fullWidth={idx === MODAL_DRINK_OPTIONS.length - 1 && MODAL_DRINK_OPTIONS.length % 2 !== 0}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {opts.bagEnabled && (
            <section className="product-modal__section">
              <div className="product-modal__section-head">
                <h3 className="product-modal__section-title">Bolsa ecológica</h3>
                {opts.bagRequired && (
                  <span className="product-modal__required">Obligatorio</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => !opts.bagRequired && setBagSelected(!bagSelected)}
                className={`product-modal-option mt-2 w-full text-left ${bagSelected ? 'product-modal-option--active' : ''} ${opts.bagRequired ? 'cursor-default' : ''}`}
              >
                <span className={`product-modal-radio ${bagSelected ? 'product-modal-radio--active' : ''}`}>
                  {bagSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-bold text-pollon-black">
                    Agregar bolsa (+ {money(opts.bagPrice)})
                  </span>
                  <span className="text-[11px] font-normal normal-case tracking-normal text-gray-500">
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

          <div className="product-modal__section product-modal__section--notes">
            <label htmlFor="product-notes" className="product-modal__section-title">
              Observaciones <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              id="product-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: pollo trozado en 8 piezas, sin ají…"
              className="product-modal__notes"
              rows={2}
            />
          </div>
        </div>

        <footer className="product-modal__footer">
          <div className="product-modal__qty-row">
            <span className="product-modal__qty-label">Cantidad</span>
            <div className="product-modal__qty">
              <button
                type="button"
                onClick={() => setQtySafe(qty - 1)}
                className="product-modal__qty-btn product-modal__qty-btn--minus"
                aria-label="Menos"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="product-modal__qty-value">{qty}</span>
              <button
                type="button"
                onClick={() => setQtySafe(qty + 1)}
                className="product-modal__qty-btn product-modal__qty-btn--plus"
                aria-label="Más"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="product-modal__total-bar">
            <div>
              <p className="product-modal__total-label">Total</p>
              <p className="product-modal__unit-hint">{money(unitPrice)} c/u · {qty} und.</p>
            </div>
            <p className="product-modal__total-value">{money(lineTotal)}</p>
          </div>

          <div className="product-modal__actions">
            <button type="button" onClick={onClose} className="product-modal__btn product-modal__btn--ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className="product-modal__btn product-modal__btn--primary"
            >
              Agregar al carrito
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function DrinkOptionCard({ label, selected, onSelect, fullWidth = false }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`product-modal-option ${selected ? 'product-modal-option--active' : ''} ${fullWidth ? 'col-span-2' : ''}`}
    >
      <span className={`product-modal-radio ${selected ? 'product-modal-radio--active' : ''}`}>
        {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
      <span className="text-left text-xs font-bold uppercase tracking-wide text-pollon-black sm:text-sm">
        {label}
      </span>
    </button>
  );
}
