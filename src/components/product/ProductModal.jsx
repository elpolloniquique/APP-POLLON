import { useState, useEffect, useMemo } from 'react';

import { X, Minus, Plus } from 'lucide-react';

import { money } from '../../utils/format';

import {

  calcLineTotal,

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

  const bagQty = bagSelected ? qty : 0;

  const lineTotal = calcLineTotal({

    unitPrice,

    qty,

    bagPrice: opts.bagPrice,

    includeBag: bagSelected,

  });



  const drinksValid = !opts.drinkEnabled || !opts.drinkRequired

    || drinks.every((d) => d.trim());

  const bagValid = !opts.bagEnabled || !opts.bagRequired || bagSelected;

  const canAdd = drinksValid && bagValid;



  const setQtySafe = (next) => {

    const n = Math.max(1, next);

    setQty(n);

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



  const hasCustomization = opts.drinkEnabled || opts.bagEnabled;



  return (

    <div

      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"

      onClick={onClose}

      role="presentation"

    >

      <div

        className="product-modal w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-white shadow-2xl sm:rounded-[1.75rem]"

        onClick={(e) => e.stopPropagation()}

        role="dialog"

        aria-labelledby="product-modal-title"

      >

        <div className="relative px-6 pb-2 pt-6 text-center">

          <button

            type="button"

            onClick={onClose}

            className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"

            aria-label="Cerrar"

          >

            <X className="h-5 w-5" />

          </button>

          <h2 id="product-modal-title" className="text-lg font-bold leading-snug text-pollon-black sm:text-xl">

            {product.name}

          </h2>

          {hasCustomization && (

            <p className="mt-2 text-left text-sm font-bold text-pollon-red">Personaliza tu pedido</p>

          )}

        </div>



        <div className="space-y-5 px-6 pb-6 pt-2">

          {opts.drinkEnabled && (

            <section>

              <div className="flex flex-wrap items-center gap-2">

                <h3 className="text-xs font-bold uppercase tracking-wide text-pollon-black">

                  Bebidas — elija su sabor

                </h3>

                {opts.drinkRequired && (

                  <span className="rounded-md bg-pollon-red/10 px-2 py-0.5 text-[10px] font-bold uppercase text-pollon-red">

                    Obligatorio

                  </span>

                )}

              </div>

              <p className="mt-1.5 text-xs text-gray-500">

                En esta categoría se agrega bebida 1 sabor por cada unidad

              </p>



              {qty > 1 ? (

                <div className="mt-3 space-y-3">

                  {drinks.map((d, i) => (

                    <div key={i}>

                      <p className="mb-1.5 text-[11px] font-semibold text-gray-600">Unidad {i + 1}</p>

                      <div className="grid grid-cols-2 gap-2">

                        {MODAL_DRINK_OPTIONS.map((option) => (

                          <DrinkOptionCard

                            key={`${i}-${option}`}

                            label={option}

                            selected={d === option}

                            onSelect={() => setDrinkAt(i, option)}

                            fullWidth={option === 'Fanta' && MODAL_DRINK_OPTIONS.indexOf(option) === MODAL_DRINK_OPTIONS.length - 1}

                          />

                        ))}

                      </div>

                    </div>

                  ))}

                </div>

              ) : (

                <div className="mt-3 grid grid-cols-2 gap-2">

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

            <section>

              <div className="flex flex-wrap items-center gap-2">

                <h3 className="text-xs font-bold uppercase tracking-wide text-pollon-black">

                  Bolsa ecológica

                </h3>

                {opts.bagRequired && (

                  <span className="rounded-md bg-pollon-red/10 px-2 py-0.5 text-[10px] font-bold uppercase text-pollon-red">

                    Obligatorio

                  </span>

                )}

              </div>

              <button

                type="button"

                onClick={() => !opts.bagRequired && setBagSelected(!bagSelected)}

                className={`product-modal-option mt-3 w-full text-left ${bagSelected ? 'product-modal-option--active' : ''} ${opts.bagRequired ? 'cursor-default' : ''}`}

              >

                <span className={`product-modal-radio ${bagSelected ? 'product-modal-radio--active' : ''}`} />

                <span className="text-sm font-semibold uppercase tracking-wide text-pollon-black">

                  Agregar bolsa (+ {money(opts.bagPrice)})

                </span>

              </button>

              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">

                * Esta categoría requiere agregar bolsa. Costo por bolsa:{' '}

                <strong className="text-pollon-black">{money(opts.bagPrice)}</strong>.

                {bagSelected && (

                  <> Se agregará <strong>{qty} bolsa{qty !== 1 ? 's' : ''}</strong> (1 por unidad).</>

                )}

              </p>

            </section>

          )}



          <section className="border-t border-gray-100 pt-4">

            <p className="text-sm font-bold text-pollon-black">Cantidad:</p>

            <div className="mt-2 flex items-center gap-4">

              <button

                type="button"

                onClick={() => setQtySafe(qty - 1)}

                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-700 transition hover:bg-gray-300"

                aria-label="Menos"

              >

                <Minus className="h-4 w-4" />

              </button>

              <span className="min-w-[2rem] text-center text-2xl font-bold text-pollon-black">{qty}</span>

              <button

                type="button"

                onClick={() => setQtySafe(qty + 1)}

                className="flex h-10 w-10 items-center justify-center rounded-full bg-pollon-red text-white shadow-md transition hover:bg-pollon-red-dark"

                aria-label="Más"

              >

                <Plus className="h-4 w-4" />

              </button>

            </div>

            <p className="mt-4 text-xl font-bold text-pollon-red">

              Total: {money(lineTotal)}

            </p>

          </section>



          {!hasCustomization && product.description && (

            <p className="text-sm text-gray-600">{product.description}</p>

          )}



          <textarea

            value={notes}

            onChange={(e) => setNotes(e.target.value)}

            placeholder="Observaciones (opcional)"

            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"

            rows={2}

          />



          <div className="grid grid-cols-2 gap-3 pt-1">

            <button

              type="button"

              onClick={onClose}

              className="rounded-full bg-gray-100 py-3.5 text-sm font-bold text-gray-800 transition hover:bg-gray-200"

            >

              Cancelar

            </button>

            <button

              type="button"

              onClick={handleAdd}

              disabled={!canAdd}

              className="rounded-full bg-pollon-red py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-pollon-red-dark disabled:cursor-not-allowed disabled:opacity-50"

            >

              Agregar al Carrito

            </button>

          </div>

        </div>

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

      <span className={`product-modal-radio ${selected ? 'product-modal-radio--active' : ''}`} />

      <span className="text-xs font-bold uppercase tracking-wide text-pollon-black sm:text-sm">

        {label}

      </span>

    </button>

  );

}


