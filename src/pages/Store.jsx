import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SiteFooter } from '../components/layout/SiteFooter';
import { WhatsAppFab } from '../components/layout/WhatsAppFab';
import { CartDrawer } from '../components/cart/CartDrawer';
import { ProductCard } from '../components/product/ProductCard';
import { ProductModal } from '../components/product/ProductModal';
import { useCart } from '../context/CartContext';
import { useBranch } from '../context/BranchContext';
import { useBranchMenu } from '../context/BranchMenuContext';
import { CategoryScrollBar } from '../components/store/CategoryScrollBar';
import { Search } from 'lucide-react';

export function Store() {
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get('cat');
  const qParam = searchParams.get('q') || '';

  const { categories, productsByCategory, loading: menuLoading } = useBranchMenu();
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState(qParam);
  const [selected, setSelected] = useState(null);
  const { setIsOpen } = useCart();
  const { branch, branchOpen, loading: branchLoading } = useBranch();

  useEffect(() => {
    if (!categories.length) {
      setCategoryId('');
      return;
    }
    const match = catParam
      ? categories.find((c) => c.id === catParam || c.slug === catParam)
      : null;
    const nextId = match?.id || categories[0]?.id || '';
    setCategoryId((prev) => {
      if (prev && categories.some((c) => c.id === prev)) return prev;
      return nextId;
    });
  }, [categories, catParam]);

  useEffect(() => { setSearch(qParam); }, [qParam]);

  const currentProducts = useMemo(() => {
    const list = productsByCategory[categoryId] || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }, [productsByCategory, categoryId, search]);

  const allFiltered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return categories.flatMap((cat) =>
      (productsByCategory[cat.id] || [])
        .filter((p) => p.name.toLowerCase().includes(q))
        .map((p) => ({ ...p, __categoryId: cat.id, __categoryName: cat.name }))
    );
  }, [categories, productsByCategory, search]);

  const loading = branchLoading || menuLoading;

  if (branchLoading) {
    return <div className="flex min-h-screen items-center justify-center">Cargando sucursal…</div>;
  }

  if (!branch) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-pollon-cream p-8 text-center">
        <p className="text-lg font-semibold">Selecciona una sucursal para ver el menú</p>
        <Link to="/sucursal" className="mt-4 rounded-lg bg-pollon-red px-6 py-3 font-bold text-white">Elegir sucursal</Link>
      </div>
    );
  }

  const currentCat = categories.find((c) => c.id === categoryId);

  return (
    <div className="flex min-h-screen flex-col bg-pollon-cream">
      <SiteHeader onOpenCart={() => setIsOpen(true)} />
      <CartDrawer />
      <WhatsAppFab />

      <div className="bg-pollon-red py-6 text-white">
        <div className="mx-auto max-w-[1400px] px-4">
          <h1 className="font-display text-4xl md:text-5xl">NUESTRO MENÚ</h1>
          <p className="mt-1 text-white/80">{branch.name}</p>
          {!branchOpen && (
            <p className="mt-2 inline-block rounded-lg bg-black/30 px-3 py-1 text-sm">Sucursal cerrada — pedidos pueden no estar disponibles</p>
          )}
        </div>
      </div>

      <div className="sticky top-0 z-30 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-[1400px] px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchParams(search.trim() ? { q: search.trim() } : {});
            }}
            className="relative mb-3"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar en el menú…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm"
            />
          </form>
          <CategoryScrollBar
            items={categories}
            activeId={search ? null : categoryId}
            onSelect={(cat) => {
              setCategoryId(cat.id);
              setSearch('');
              setSearchParams({ cat: cat.id });
            }}
          />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8">
        {loading ? (
          <p className="py-20 text-center text-gray-500">Cargando menú de {branch.name}…</p>
        ) : !categories.length ? (
          <div className="py-20 text-center">
            <p className="text-gray-600">Esta sucursal aún no tiene menú configurado.</p>
            <p className="mt-2 text-sm text-gray-500">Configúralo en Admin → Menú por sucursal</p>
          </div>
        ) : allFiltered?.length ? (
          <>
            <h2 className="mb-4 text-xl font-bold">Resultados: &quot;{search}&quot;</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allFiltered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={{ ...p, image: p.image || p.imageUrl, price: p.price }}
                  onSelect={() => setSelected({ product: p, categoryId: p.__categoryId })}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-6 font-display text-3xl text-pollon-black">{currentCat?.name}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {currentProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={{ ...p, image: p.image || p.imageUrl }}
                  onSelect={() => setSelected({ product: p, categoryId })}
                />
              ))}
            </div>
            {!currentProducts.length && <p className="py-12 text-center text-gray-500">Sin productos en esta categoría</p>}
          </>
        )}
      </main>

      {selected && (
        <ProductModal
          product={{
            ...selected.product,
            id: selected.product.id,
            name: selected.product.name,
            description: selected.product.description,
            price: selected.product.price,
            image: selected.product.image || selected.product.imageUrl,
            imageUrls: selected.product.imageUrls,
          }}
          category={selected.categoryId}
          categoryName={categories.find((c) => c.id === selected.categoryId)?.name}
          onClose={() => setSelected(null)}
        />
      )}

      <SiteFooter />
    </div>
  );
}
