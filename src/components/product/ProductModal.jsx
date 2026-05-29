import { useState, useEffect, useMemo } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { money } from '../../utils/format';
import { DRINK_OPTIONS } from '../../utils/constants';
import { useCart } from '../../context/CartContext';

const BAG_CATEGORIES = ['ofertas-familiares', 'ofertas-dos', 'ofertas-personales', 'platos-extras', 'agregados'];
const DRINK_CATEGORIES = ['ofertas-familiares', 'ofertas-dos', 'ofertas-personales'];

export function ProductModal({ product, category, categoryName = '', onClose, onAddOverride }) {
  const { addItem, BAG_PRICE: bagPrice } = useCart();
  const catLabel = (categoryName || category || '').toString().toLowerCase();
  const [qty, setQty] = useState(1);
  const [drink, setDrink] = useState('');
  const [bagQty, setBagQty] = useState(0);
  const [notes, setNotes] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const gallery = useMemo(() => {
    if (!product) return [];
    const urls = product.imageUrls?.length
      ? product.imageUrls
      : (product.image ? [product.image] : []);
    return urls.map((u) => (u?.startsWith('img/') ? `/${u}` : u)).filter(Boolean);
  }, [product?.imageUrls, product?.image]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [product?.id]);

  if (!product) return null;

  const img = gallery[activeIdx] || gallery[0] || '/img/todo el menu.png';
  const showDrink = DRINK_CATEGORIES.some((c) => catLabel.includes(c.replace(/-/g, ' '))) || catLabel.includes('oferta') || catLabel.includes('combo');
  const showBag = BAG_CATEGORIES.some((c) => catLabel.includes(c.replace(/-/g, ' '))) || catLabel.includes('oferta') || catLabel.includes('plato');
  const isFamiliares = catLabel.includes('familiar');
  const bagMandatory = catLabel.includes('dos') || catLabel.includes('personal') || catLabel.includes('plato');

  const unitPrice = product.price;
  const bagTotal = bagQty * bagPrice;
  const lineTotal = unitPrice * qty + bagTotal;

  const handleAdd = () => {
    if (bagMandatory && bagQty < 1) return;
    const payload = {
      producto_id: product.id,
      name: product.name,
      qty,
      unitPrice,
      total: lineTotal,
      drink: showDrink ? drink : null,
      bagQty: showBag ? bagQty : 0,
      notes: notes.trim(),
      category,
      available: product.available !== false,
    };
    if (onAddOverride) onAddOverride(payload);
    else {
      const r = addItem(payload);
      if (!r?.ok && r?.error) alert(r.error === 'branch_mismatch' ? 'Vacía el carrito para cambiar de sucursal' : r.error);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img src={img} alt="" className="h-48 w-full object-cover sm:h-56" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          {gallery.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
              {gallery.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${
                    activeIdx === i ? 'border-pollon-red ring-2 ring-white' : 'border-white/50 opacity-80'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-5">
          <h2 className="text-xl font-bold">{product.name}</h2>
          <p className="mt-1 text-sm text-gray-600">{product.description}</p>
          <p className="mt-2 text-2xl font-bold text-pollon-red">{money(product.price)}</p>

          <div className="mt-4 flex items-center gap-4">
            <span className="text-sm font-medium">Cantidad</span>
            <div className="flex items-center gap-2 rounded-xl border border-gray-200">
              <button type="button" className="p-2" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center font-bold">{qty}</span>
              <button type="button" className="p-2" onClick={() => setQty(qty + 1)}><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          {showDrink && (
            <div className="mt-4">
              <label className="text-sm font-medium">Bebida (según stock)</label>
              <select value={drink} onChange={(e) => setDrink(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm">
                <option value="">Seleccionar bebida</option>
                {DRINK_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {showBag && (
            <div className="mt-4 rounded-xl wood-texture p-3">
              <p className="text-sm font-medium">Bolsa ecológica ({money(bagPrice)} c/u)</p>
              {isFamiliares && <p className="text-xs text-gray-600">Opcional para ofertas familiares</p>}
              {bagMandatory && <p className="text-xs text-pollon-red">Obligatoria en esta categoría</p>}
              <div className="mt-2 flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBagQty(n)}
                    className={`rounded-lg px-3 py-1 text-sm ${bagQty === n ? 'bg-pollon-red text-white' : 'bg-white'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones (opcional)"
            className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            rows={2}
          />

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="font-bold">Subtotal: {money(lineTotal)}</span>
            <Button onClick={handleAdd} disabled={bagMandatory && bagQty < 1}>
              Agregar al carrito
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
