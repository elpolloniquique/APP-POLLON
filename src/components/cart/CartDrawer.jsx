import { Link } from 'react-router-dom';
import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { money } from '../../utils/format';
import { Button } from '../ui/Button';

export function CartDrawer() {
  const { items, isOpen, setIsOpen, subtotal, itemCount, removeItem, updateQty, clearCart } = useCart();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/40 backdrop-blur-[2px]"
      onClick={() => setIsOpen(false)}
      role="presentation"
    >
      <aside
        className="cart-drawer flex h-full w-[50vw] min-w-[168px] max-w-[50vw] flex-col bg-white shadow-2xl sm:w-[min(42vw,360px)] sm:max-w-sm md:max-w-md md:w-full"
        onClick={(e) => e.stopPropagation()}
        aria-label="Carrito de compras"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-2">
            <ShoppingBag className="h-4 w-4 shrink-0 text-pollon-red sm:h-5 sm:w-5" />
            <h2 className="truncate text-sm font-bold sm:text-lg">
              Tu pedido ({itemCount})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="shrink-0 rounded-lg p-1.5 hover:bg-gray-100 sm:p-2"
            aria-label="Cerrar carrito"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          {!items.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-center sm:py-12">
              <ShoppingBag className="mb-3 h-10 w-10 text-gray-200 sm:h-12 sm:w-12" />
              <p className="text-xs text-gray-500 sm:text-sm">Tu carrito está vacío</p>
            </div>
          ) : (
            <ul className="space-y-3 sm:space-y-4">
              {items.map((it) => (
                <li key={it.cartId} className="rounded-xl border border-gray-100 p-2.5 sm:p-3">
                  <div className="flex justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold sm:text-sm">{it.name}</p>
                      {it.drink && <p className="truncate text-[10px] text-gray-500 sm:text-xs">🥤 {it.drink}</p>}
                      {it.bagQty > 0 && <p className="text-[10px] text-gray-500 sm:text-xs">♻️ Bolsa x{it.bagQty}</p>}
                      {it.notes && <p className="line-clamp-2 text-[10px] text-gray-500 sm:text-xs">📝 {it.notes}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(it.cartId)}
                      className="shrink-0 text-red-500"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-0.5 rounded-lg border">
                      <button type="button" className="p-1 sm:p-1.5" onClick={() => updateQty(it.cartId, -1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[1.25rem] px-1 text-center text-xs font-bold sm:text-sm">{it.qty}</span>
                      <button type="button" className="p-1 sm:p-1.5" onClick={() => updateQty(it.cartId, 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-pollon-red sm:text-sm">{money(it.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-3 sm:p-4">
            <div className="mb-2 flex justify-between text-xs sm:mb-3 sm:text-sm">
              <span>Subtotal</span>
              <span className="font-bold">{money(subtotal)}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="ghost" className="flex-1 !py-2 text-xs sm:!py-2.5 sm:text-sm" onClick={clearCart}>
                Vaciar
              </Button>
              <Link to="/checkout" className="flex-1" onClick={() => setIsOpen(false)}>
                <Button className="w-full !py-2 text-xs sm:!py-2.5 sm:text-sm">Confirmar</Button>
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
