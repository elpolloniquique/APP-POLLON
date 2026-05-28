import { Link } from 'react-router-dom';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { money } from '../../utils/format';
import { Button } from '../ui/Button';
import { BAG_PRICE } from '../../utils/constants';

export function CartDrawer() {
  const { items, isOpen, setIsOpen, subtotal, itemCount, removeItem, updateQty, clearCart } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={() => setIsOpen(false)}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <h2 className="text-lg font-bold">Tu pedido ({itemCount})</h2>
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!items.length ? (
            <p className="py-12 text-center text-gray-500">Tu carrito está vacío</p>
          ) : (
            <ul className="space-y-4">
              {items.map((it) => (
                <li key={it.cartId} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">{it.name}</p>
                      {it.drink && <p className="text-xs text-gray-500">🥤 {it.drink}</p>}
                      {it.bagQty > 0 && <p className="text-xs text-gray-500">♻️ Bolsa x{it.bagQty}</p>}
                      {it.notes && <p className="text-xs text-gray-500">📝 {it.notes}</p>}
                    </div>
                    <button type="button" onClick={() => removeItem(it.cartId)} className="text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-lg border">
                      <button type="button" className="p-1.5" onClick={() => updateQty(it.cartId, -1)}><Minus className="h-3 w-3" /></button>
                      <span className="px-2 text-sm font-bold">{it.qty}</span>
                      <button type="button" className="p-1.5" onClick={() => updateQty(it.cartId, 1)}><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="font-bold text-pollon-red">{money(it.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-4">
            <div className="mb-3 flex justify-between text-sm">
              <span>Subtotal</span>
              <span className="font-bold">{money(subtotal)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={clearCart}>Vaciar</Button>
              <Link to="/checkout" className="flex-1" onClick={() => setIsOpen(false)}>
                <Button className="w-full">Confirmar pedido</Button>
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
