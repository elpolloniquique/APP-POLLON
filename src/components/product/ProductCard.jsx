import { money } from '../../utils/format';
import { ShoppingCart } from 'lucide-react';

export function ProductCard({ product, onSelect }) {
  const img = product.image?.startsWith('img/') ? `/${product.image}` : product.image || '/img/todo el menu.png';

  return (
    <article
      className="card-hover group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-100"
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(product)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <img
          src={img}
          alt={product.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
          onError={(e) => { e.target.src = '/img/todo el menu.png'; }}
        />
        {product.promotion && (
          <span className="absolute left-2 top-2 rounded-full bg-pollon-red px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
            Promo
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-bold leading-tight text-pollon-black line-clamp-2">{product.name}</h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{product.description}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span className="font-display text-xl text-pollon-gold sm:text-2xl">{money(product.price)}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-pollon-red px-3 py-2 text-xs font-bold text-white shadow-md transition group-hover:bg-pollon-red-dark sm:px-3.5 sm:text-sm">
            <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} />
            Agregar
          </span>
        </div>
      </div>
    </article>
  );
}
