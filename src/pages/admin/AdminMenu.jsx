import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../services/authService';
import { adminListAllBranches } from '../../services/branchService';
import {
  adminListCategories,
  adminUpsertCategory,
  adminDeleteCategory,
  adminCountProductsInCategory,
  adminListProducts,
  adminUpsertProduct,
  adminBulkPriceIncrease,
  adminBulkSetUnavailable,
  adminCopyMenuFromBranch,
  adminDuplicateCategory,
  adminDuplicateProduct,
  adminReorderCategory,
  uploadProductImage,
  uploadProductImages,
  isSupabaseConfigured,
} from '../../services/menuService';
import { ProductImagesEditor } from '../../components/admin/ProductImagesEditor';
import { AdminScrollPanel } from '../../components/admin/AdminScrollPanel';
import { getAuditLogs } from '../../services/auditService';
import { money } from '../../utils/format';
import { useToast } from '../../hooks/useToast';
import {
  Plus, Pencil, Trash2, Copy, ArrowUp, ArrowDown, Eye, Search,
  Percent, Ban, Download,
} from 'lucide-react';

const emptyCat = (branchId) => ({
  branchId, name: '', description: '', imageUrl: '', displayOrder: 0, isActive: true,
});

const emptyProd = (branchId, categoryId) => ({
  branchId, categoryId, name: '', description: '', imageUrl: '', imageUrls: [], price: 0,
  oldPrice: null, available: true, isFeatured: false, isPromotion: false, displayOrder: 0,
});

export function AdminMenu() {
  const { profile } = useAuth();
  const { show, Toast } = useToast();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [tab, setTab] = useState('productos');
  const [search, setSearch] = useState('');
  const [filterAvail, setFilterAvail] = useState('all');
  const [loading, setLoading] = useState(false);
  const [catModal, setCatModal] = useState(null);
  const [prodModal, setProdModal] = useState(null);
  const [audit, setAudit] = useState([]);
  const [copyFromId, setCopyFromId] = useState('');
  const [dupProduct, setDupProduct] = useState(null);
  const [dupTargetBranch, setDupTargetBranch] = useState('');
  const [dupTargetCat, setDupTargetCat] = useState('');
  const [dupTargetCats, setDupTargetCats] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const user = { id: profile?.id, email: profile?.email };
  const role = normalizeRole(profile?.rol || profile?.role);
  const isSuper = role === 'super_admin';
  const adminBranchId = profile?.branch_id || profile?.branchId;
  const canManageMenu = role === 'super_admin' || role === 'admin_sucursal' || role === 'administrador';

  useEffect(() => {
    adminListAllBranches().then((list) => {
      setBranches(list);
      const initial = isSuper ? (list[0]?.id || '') : (adminBranchId || list[0]?.id || '');
      setBranchId(initial);
    });
  }, [isSuper, adminBranchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [cats, prods] = await Promise.all([
        adminListCategories(branchId),
        adminListProducts(branchId, {
          categoryId: selectedCatId || undefined,
          search: search || undefined,
          available: filterAvail === 'all' ? undefined : filterAvail === 'yes',
        }),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (!selectedCatId && cats.length) setSelectedCatId(cats[0].id);
    } catch (e) {
      show(e.message);
    } finally {
      setLoading(false);
    }
  }, [branchId, selectedCatId, search, filterAvail, show]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dupProduct) return;
    const target = dupTargetBranch || branchId;
    adminListCategories(target).then(setDupTargetCats).catch(() => setDupTargetCats([]));
  }, [dupProduct, dupTargetBranch, branchId]);

  useEffect(() => {
    if (branchId && tab === 'historial') {
      getAuditLogs(branchId).then(setAudit);
    }
  }, [branchId, tab]);

  const saveCategory = async (e) => {
    e.preventDefault();
    try {
      await adminUpsertCategory(catModal, user);
      setCatModal(null);
      show('Categoría guardada');
      load();
    } catch (err) {
      show(err.message);
    }
  };

  const deleteCategory = async (cat) => {
    const count = await adminCountProductsInCategory(cat.id);
    const msg = count > 0
      ? `¿Eliminar "${cat.name}" y sus ${count} producto(s)? No se puede deshacer.`
      : `¿Eliminar la categoría "${cat.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await adminDeleteCategory(cat.id, branchId, user);
      show('Categoría eliminada');
      if (selectedCatId === cat.id) setSelectedCatId('');
      load();
    } catch (err) {
      show(err.message);
    }
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    try {
      const imageUrls = prodModal.imageUrls || [];
      await adminUpsertProduct({
        ...prodModal,
        imageUrls,
        imageUrl: imageUrls[0] || prodModal.imageUrl || '',
      }, user);
      setProdModal(null);
      show('Producto guardado');
      load();
    } catch (err) {
      show(err.message);
    }
  };

  const handleProductImagesUpload = async (files) => {
    if (!files?.length) return;
    if (!branchId) {
      show('Selecciona una sucursal antes de subir imágenes');
      return;
    }
    setUploadingImages(true);
    try {
      const result = await uploadProductImages(files, branchId);
      const urls = result.urls || result;
      setProdModal((p) => {
        const prev = p.imageUrls || (p.imageUrl ? [p.imageUrl] : []);
        const merged = [...prev, ...urls].slice(0, 12);
        return { ...p, imageUrls: merged, imageUrl: merged[0] || '' };
      });
      show(result.warning ? `${urls.length} imagen(es) subida(s). ${result.warning}` : `${urls.length} imagen(es) subida(s)`);
    } catch (err) {
      show(err.message || 'No se pudo subir la imagen');
    } finally {
      setUploadingImages(false);
    }
  };

  const openProductModal = (product) => {
    const imageUrls = product.imageUrls?.length
      ? product.imageUrls
      : (product.imageUrl ? [product.imageUrl] : []);
    setProdModal({ ...product, imageUrls, imageUrl: imageUrls[0] || product.imageUrl || '' });
  };

  const handleImage = async (e, target) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!branchId) {
      show('Selecciona una sucursal antes de subir imágenes');
      return;
    }
    try {
      const url = await uploadProductImage(file, branchId);
      if (target === 'cat') setCatModal((c) => ({ ...c, imageUrl: url }));
      else setProdModal((p) => ({ ...p, imageUrl: url }));
      show('Imagen subida');
    } catch (err) {
      show(err.message || 'No se pudo subir la imagen');
    } finally {
      e.target.value = '';
    }
  };

  const moveCategory = async (cat, dir) => {
    const idx = categories.findIndex((c) => c.id === cat.id);
    const swap = categories[idx + dir];
    if (!swap) return;
    try {
      await adminReorderCategory(cat.id, swap.displayOrder);
      await adminReorderCategory(swap.id, cat.displayOrder);
      load();
    } catch (e) {
      show(e.message);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-amber-900">
        <h2 className="text-xl font-bold">Configura Supabase</h2>
        <p className="mt-2 text-sm">Ejecuta schema-multi-sucursal.sql y seed-multi-sucursal.sql en tu proyecto Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Toast}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-pollon-black">Menú por sucursal</h2>
          <p className="text-sm text-gray-500">Cada sucursal tiene su propio menú, precios y categorías</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">Sucursal:</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!isSuper && !!adminBranchId}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Link
            to={`/tienda?branch=${branchId}`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl border border-pollon-red px-4 py-2 text-sm font-semibold text-pollon-red"
          >
            <Eye className="h-4 w-4" /> Vista previa
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b">
        {['categorias', 'productos', 'herramientas', 'historial'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-bold capitalize ${tab === t ? 'border-pollon-red text-pollon-red' : 'border-transparent text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'categorias' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="font-bold">Categorías ({categories.length})</h3>
            {categories.length > 7 && (
              <span className="text-xs text-gray-400">Desplaza para ver más</span>
            )}
          </div>
          <AdminScrollPanel maxRows={7} variant="card" className={categories.length ? '' : 'border-0 shadow-none'}>
            <div className="space-y-2 p-2">
            {categories.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                {c.imageUrl && <img src={c.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-gray-500">Orden {c.displayOrder} · {c.isActive ? 'Activa' : 'Inactiva'}</p>
                </div>
                {canManageMenu && (
                  <>
                    <button type="button" onClick={() => moveCategory(c, -1)} disabled={i === 0} className="p-1" title="Subir"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveCategory(c, 1)} disabled={i === categories.length - 1} className="p-1" title="Bajar"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setCatModal(c)} className="p-2 text-gray-600" title="Editar"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => deleteCategory(c)} className="p-2 text-red-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    <button type="button" onClick={() => adminDuplicateCategory(c.id, branchId, user).then(() => { show('Categoría duplicada'); load(); })} className="p-2 text-blue-600" title="Duplicar"><Copy className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            ))}
            {!categories.length && (
              <p className="py-8 text-center text-sm text-gray-500">
                Sin categorías. {canManageMenu ? 'Crea la primera con el botón de arriba.' : ''}
              </p>
            )}
            </div>
          </AdminScrollPanel>
          {canManageMenu && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setCatModal(emptyCat(branchId))} className="flex items-center gap-1 rounded-lg bg-pollon-red px-3 py-2 text-sm text-white">
                <Plus className="h-4 w-4" /> Nueva categoría
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'productos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <select value={selectedCatId} onChange={(e) => setSelectedCatId(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm" />
            </div>
            <select value={filterAvail} onChange={(e) => setFilterAvail(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="all">Todos</option>
              <option value="yes">Disponibles</option>
              <option value="no">No disponibles</option>
            </select>
            <button type="button" onClick={() => setProdModal(emptyProd(branchId, selectedCatId || categories[0]?.id))} className="flex items-center gap-1 rounded-lg bg-pollon-red px-4 py-2 text-sm text-white">
              <Plus className="h-4 w-4" /> Nuevo producto
            </button>
          </div>

          {loading ? <p className="text-center text-gray-500">Cargando…</p> : (
            <div className="rounded-2xl bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-700">
                  {products.length} producto{products.length !== 1 ? 's' : ''}
                </p>
                {products.length > 7 && (
                  <p className="text-xs text-gray-400">Mostrando 7 filas · desplaza para ver el resto</p>
                )}
              </div>
              <AdminScrollPanel maxRows={7} variant="table" className="rounded-t-none border-0 shadow-none">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase shadow-sm">
                  <tr>
                    <th className="p-3">Img</th><th className="p-3">Nombre</th><th className="p-3">Categoría</th>
                    <th className="p-3">Precio</th><th className="p-3">Estado</th><th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">
                        {p.imageUrl ? (
                          <div className="relative inline-block">
                            <img src={p.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                            {(p.imageUrls?.length || 0) > 1 && (
                              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pollon-red px-1 text-[9px] font-bold text-white">
                                {p.imageUrls.length}
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3 text-gray-500">{p.categoryName}</td>
                      <td className="p-3 font-bold text-pollon-red">{money(p.price)}</td>
                      <td className="p-3">{p.available ? '✅' : '❌'}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => openProductModal(p)} className="mr-2 text-gray-600" title="Editar"><Pencil className="h-4 w-4 inline" /></button>
                        <button type="button" onClick={() => { setDupProduct(p); setDupTargetBranch(''); setDupTargetCat(''); }} className="mr-2 text-blue-600" title="Duplicar a otra sucursal"><Copy className="h-4 w-4 inline" /></button>
                        <button type="button" onClick={() => adminUpsertProduct({ ...p, available: !p.available }, user).then(load)} className="text-amber-600" title="Cambiar disponibilidad"><Ban className="h-4 w-4 inline" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </AdminScrollPanel>
              {!products.length && <p className="p-8 text-center text-gray-500">Sin productos</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'herramientas' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold"><Copy className="h-5 w-5 text-pollon-red" /> Copiar menú de otra sucursal</h3>
            <p className="mt-1 text-sm text-gray-500">Importa categorías y productos completos</p>
            <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Seleccionar origen</option>
              {branches.filter((b) => b.id !== branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-pollon-red py-2 text-sm font-bold text-white"
              onClick={() => {
                if (!copyFromId || !confirm('¿Copiar todo el menú? Se agregarán categorías y productos.')) return;
                adminCopyMenuFromBranch(copyFromId, branchId, user).then(() => { show('Menú copiado'); load(); });
              }}
            >
              Copiar menú
            </button>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold"><Percent className="h-5 w-5 text-pollon-red" /> Aumento de precios</h3>
            <p className="mt-1 text-sm text-gray-500">Aplica un % a todos los productos de esta sucursal</p>
            <input type="number" id="price-percent" placeholder="Ej: 10" className="mt-3 w-full rounded-lg border px-3 py-2" />
            <button
              type="button"
              className="mt-3 w-full rounded-lg border-2 border-pollon-red py-2 text-sm font-bold text-pollon-red"
              onClick={() => {
                const pct = document.getElementById('price-percent')?.value;
                if (!pct || !confirm(`¿Aumentar ${pct}% todos los precios?`)) return;
                adminBulkPriceIncrease(branchId, pct, user).then(() => { show('Precios actualizados'); load(); });
              }}
            >
              Aplicar aumento
            </button>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold"><Ban className="h-5 w-5 text-red-600" /> Desactivar todos</h3>
            <p className="mt-1 text-sm text-gray-500">Marca todos los productos como no disponibles</p>
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-red-600 py-2 text-sm font-bold text-white"
              onClick={() => {
                if (!confirm('¿Desactivar TODOS los productos de esta sucursal?')) return;
                adminBulkSetUnavailable(branchId).then(() => { show('Productos desactivados'); load(); });
              }}
            >
              Desactivar productos
            </button>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm opacity-60">
            <h3 className="flex items-center gap-2 font-bold"><Download className="h-5 w-5" /> Exportar Excel/CSV</h3>
            <p className="mt-1 text-sm text-gray-500">Próximamente</p>
          </div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Historial de cambios</h3>
            {audit.length > 7 && <span className="text-xs text-gray-400">Desplaza para ver más</span>}
          </div>
          <AdminScrollPanel maxRows={7} variant="card">
            <div className="space-y-2 p-2">
            {audit.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{a.action} · {a.entity_type}</p>
                <p className="text-xs text-gray-500">{a.user_email} · {new Date(a.created_at).toLocaleString('es-CL')}</p>
              </div>
            ))}
            {!audit.length && <p className="py-8 text-center text-gray-500">Sin registros</p>}
            </div>
          </AdminScrollPanel>
        </div>
      )}

      {catModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveCategory} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="text-lg font-bold">{catModal.id ? 'Editar' : 'Nueva'} categoría</h3>
            <div className="mt-4 space-y-3">
              <input required value={catModal.name} onChange={(e) => setCatModal({ ...catModal, name: e.target.value })} placeholder="Nombre" className="w-full rounded-lg border px-3 py-2" />
              <textarea value={catModal.description} onChange={(e) => setCatModal({ ...catModal, description: e.target.value })} placeholder="Descripción" className="w-full rounded-lg border px-3 py-2" rows={2} />
              <input type="number" value={catModal.displayOrder} onChange={(e) => setCatModal({ ...catModal, displayOrder: Number(e.target.value) })} placeholder="Orden" className="w-full rounded-lg border px-3 py-2" />
              <input type="file" accept="image/*" onChange={(e) => handleImage(e, 'cat')} />
              {catModal.imageUrl && <img src={catModal.imageUrl} alt="" className="h-20 rounded object-cover" />}
              <label className="flex items-center gap-2"><input type="checkbox" checked={catModal.isActive} onChange={(e) => setCatModal({ ...catModal, isActive: e.target.checked })} /> Activa</label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" className="flex-1 rounded-lg bg-pollon-red py-2 font-bold text-white">Guardar</button>
              <button type="button" onClick={() => setCatModal(null)} className="flex-1 rounded-lg border py-2">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {dupProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="text-lg font-bold">Duplicar producto</h3>
            <p className="mt-1 text-sm text-gray-500">Copiar &ldquo;{dupProduct.name}&rdquo; a otra sucursal</p>
            <div className="mt-4 space-y-3">
              <select
                value={dupTargetBranch}
                onChange={(e) => setDupTargetBranch(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Sucursal destino</option>
                {branches.filter((b) => b.id !== branchId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select
                value={dupTargetCat}
                onChange={(e) => setDupTargetCat(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Seleccionar categoría destino</option>
                {dupTargetCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg bg-pollon-red py-2 font-bold text-white"
                onClick={async () => {
                  try {
                    let targetBranch = dupTargetBranch || branchId;
                    let targetCat = dupTargetCat;
                    if (dupTargetBranch && !dupTargetCat) {
                      const remoteCats = await adminListCategories(dupTargetBranch);
                      targetCat = remoteCats.find((c) => c.isActive)?.id || remoteCats[0]?.id;
                      if (!targetCat) { show('La sucursal destino no tiene categorías'); return; }
                    }
                    if (!targetCat) targetCat = dupProduct.categoryId;
                    await adminDuplicateProduct(dupProduct.id, targetBranch, targetCat, user);
                    show('Producto duplicado');
                    setDupProduct(null);
                    load();
                  } catch (err) {
                    show(err.message);
                  }
                }}
              >
                Duplicar
              </button>
              <button type="button" onClick={() => setDupProduct(null)} className="flex-1 rounded-lg border py-2">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {prodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveProduct} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="text-lg font-bold">{prodModal.id ? 'Editar' : 'Nuevo'} producto</h3>
            <div className="mt-4 space-y-3">
              <select required value={prodModal.categoryId} onChange={(e) => setProdModal({ ...prodModal, categoryId: e.target.value })} className="w-full rounded-lg border px-3 py-2">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input required value={prodModal.name} onChange={(e) => setProdModal({ ...prodModal, name: e.target.value })} placeholder="Nombre" className="w-full rounded-lg border px-3 py-2" />
              <textarea value={prodModal.description} onChange={(e) => setProdModal({ ...prodModal, description: e.target.value })} placeholder="Descripción" className="w-full rounded-lg border px-3 py-2" rows={3} />
              <div className="grid grid-cols-2 gap-2">
                <input required type="number" value={prodModal.price} onChange={(e) => setProdModal({ ...prodModal, price: Number(e.target.value) })} placeholder="Precio" className="rounded-lg border px-3 py-2" />
                <input type="number" value={prodModal.oldPrice || ''} onChange={(e) => setProdModal({ ...prodModal, oldPrice: Number(e.target.value) || null })} placeholder="Precio anterior" className="rounded-lg border px-3 py-2" />
              </div>
              <input type="number" value={prodModal.displayOrder} onChange={(e) => setProdModal({ ...prodModal, displayOrder: Number(e.target.value) })} placeholder="Orden" className="w-full rounded-lg border px-3 py-2" />
              <ProductImagesEditor
                imageUrls={prodModal.imageUrls || []}
                onChange={(imageUrls) => setProdModal({ ...prodModal, imageUrls, imageUrl: imageUrls[0] || '' })}
                onUpload={handleProductImagesUpload}
                onError={show}
                uploading={uploadingImages}
              />
              <label className="flex items-center gap-2"><input type="checkbox" checked={prodModal.available} onChange={(e) => setProdModal({ ...prodModal, available: e.target.checked })} /> Disponible</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prodModal.isFeatured} onChange={(e) => setProdModal({ ...prodModal, isFeatured: e.target.checked })} /> Destacado</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prodModal.isPromotion} onChange={(e) => setProdModal({ ...prodModal, isPromotion: e.target.checked })} /> Promoción</label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={uploadingImages} className="flex-1 rounded-lg bg-pollon-red py-2 font-bold text-white disabled:opacity-50">Guardar</button>
              <button type="button" onClick={() => setProdModal(null)} className="flex-1 rounded-lg border py-2">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
