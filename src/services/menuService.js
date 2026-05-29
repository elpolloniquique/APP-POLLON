import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { logAudit } from './auditService';

function sb() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase no configurado');
  return client;
}

function mapCategory(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    description: row.description || '',
    imageUrl: row.image_url || '',
    displayOrder: row.display_order ?? 0,
    isActive: row.is_active !== false,
    slug: row.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || row.id,
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description || '',
    image: row.image_url || '',
    imageUrl: row.image_url || '',
    price: Number(row.price) || 0,
    oldPrice: row.old_price ? Number(row.old_price) : null,
    available: row.is_available !== false,
    isFeatured: !!row.is_featured,
    isPromotion: !!row.is_promotion,
    displayOrder: row.display_order ?? 0,
    preparationTime: row.preparation_time ?? 15,
  };
}

/** Menú público por sucursal */
export async function loadBranchMenu(branchId) {
  if (!branchId || !isSupabaseConfigured()) {
    return { categories: [], productsByCategory: {}, products: [], source: 'empty' };
  }

  const client = sb();
  const { data: cats, error: catErr } = await client
    .from('categories')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (catErr) throw catErr;

  const { data: prods, error: prodErr } = await client
    .from('products')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_available', true)
    .order('display_order', { ascending: true });
  if (prodErr) throw prodErr;

  const categories = dedupeCategories((cats || []).map(mapCategory));
  const products = (prods || []).map(mapProduct);
  const productsByCategory = {};
  categories.forEach((c) => { productsByCategory[c.id] = []; });
  products.forEach((p) => {
    if (!productsByCategory[p.categoryId]) productsByCategory[p.categoryId] = [];
    productsByCategory[p.categoryId].push(p);
  });

  return { categories, productsByCategory, products, source: 'supabase' };
}

/** Elimina duplicados visuales (mismo nombre en la misma sucursal) */
function dedupeCategories(categories) {
  const byKey = new Map();
  for (const c of categories) {
    const key = `${c.branchId}:${(c.name || '').trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || c.displayOrder < prev.displayOrder) {
      byKey.set(key, c);
    }
  }
  return [...byKey.values()].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

/** Admin: categorías de una sucursal (incluye inactivas, sin duplicados por nombre) */
export async function adminListCategories(branchId) {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await sb()
    .from('categories')
    .select('*')
    .eq('branch_id', branchId)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return dedupeCategories((data || []).map(mapCategory));
}

export async function adminCountProductsInCategory(categoryId) {
  const { count, error } = await sb()
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', categoryId);
  if (error) throw error;
  return count ?? 0;
}

export async function adminUpsertCategory(category, user) {
  const name = (category.name || '').trim();
  if (!name) throw new Error('El nombre de la categoría es obligatorio');

  const { data: duplicate } = await sb()
    .from('categories')
    .select('id')
    .eq('branch_id', category.branchId)
    .eq('name', name)
    .maybeSingle();

  if (duplicate && duplicate.id !== category.id) {
    throw new Error(`Ya existe la categoría "${name}" en esta sucursal`);
  }

  const row = {
    id: category.id || undefined,
    branch_id: category.branchId,
    name,
    description: category.description || '',
    image_url: category.imageUrl || '',
    display_order: category.displayOrder ?? 0,
    is_active: category.isActive !== false,
  };
  const { data, error } = await sb().from('categories').upsert(row).select().single();
  if (error) {
    if (error.code === '23505') {
      throw new Error(`Ya existe la categoría "${name}" en esta sucursal`);
    }
    throw error;
  }
  await logAudit({ user, branchId: category.branchId, entityType: 'category', entityId: data.id, action: category.id ? 'update' : 'create', newData: data });
  return mapCategory(data);
}

export async function adminDeleteCategory(id, branchId, user) {
  const count = await adminCountProductsInCategory(id);
  const { error } = await sb().from('categories').delete().eq('id', id);
  if (error) throw error;
  await logAudit({
    user,
    branchId,
    entityType: 'category',
    entityId: id,
    action: 'delete',
    oldData: { productsDeleted: count },
  });
  return count;
}

export async function adminReorderCategory(id, displayOrder) {
  const { error } = await sb().from('categories').update({ display_order: displayOrder }).eq('id', id);
  if (error) throw error;
}

/** Admin: productos */
export async function adminListProducts(branchId, filters = {}) {
  if (!isSupabaseConfigured()) return [];
  let q = sb().from('products').select('*, categories(id, name)').eq('branch_id', branchId);
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  if (filters.available === true) q = q.eq('is_available', true);
  if (filters.available === false) q = q.eq('is_available', false);
  if (filters.search) q = q.ilike('name', `%${filters.search}%`);
  const { data, error } = await q.order('display_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ ...mapProduct(r), categoryName: r.categories?.name }));
}

export async function adminUpsertProduct(product, user) {
  const row = {
    id: product.id || undefined,
    branch_id: product.branchId,
    category_id: product.categoryId,
    name: product.name,
    description: product.description || '',
    image_url: product.imageUrl || product.image || '',
    price: product.price,
    old_price: product.oldPrice || null,
    is_available: product.available !== false,
    is_featured: !!product.isFeatured,
    is_promotion: !!product.isPromotion,
    display_order: product.displayOrder ?? 0,
    preparation_time: product.preparationTime ?? 15,
  };
  const { data, error } = await sb().from('products').upsert(row).select().single();
  if (error) throw error;
  await logAudit({ user, branchId: product.branchId, entityType: 'product', entityId: data.id, action: product.id ? 'update' : 'create', newData: { price: data.price, name: data.name } });
  return mapProduct(data);
}

export async function adminDeleteProduct(id, user) {
  const { error } = await sb().from('products').delete().eq('id', id);
  if (error) throw error;
  await logAudit({ user, entityType: 'product', entityId: id, action: 'delete' });
}

export async function adminBulkSetUnavailable(branchId) {
  const { error } = await sb().from('products').update({ is_available: false }).eq('branch_id', branchId);
  if (error) throw error;
}

export async function adminBulkPriceIncrease(branchId, percent, user) {
  const { data: products, error } = await sb().from('products').select('id, price').eq('branch_id', branchId);
  if (error) throw error;
  const factor = 1 + (Number(percent) || 0) / 100;
  for (const p of products || []) {
    const newPrice = Math.round(Number(p.price) * factor);
    await sb().from('products').update({ price: newPrice, old_price: p.price }).eq('id', p.id);
    await logAudit({ user, branchId, entityType: 'product', entityId: p.id, action: 'price_increase', oldData: { price: p.price }, newData: { price: newPrice } });
  }
}

/** Duplicar producto a otra sucursal/categoría */
export async function adminDuplicateProduct(productId, targetBranchId, targetCategoryId, user) {
  const { data: src, error } = await sb().from('products').select('*').eq('id', productId).single();
  if (error) throw error;
  const { data, error: insErr } = await sb().from('products').insert({
    branch_id: targetBranchId,
    category_id: targetCategoryId,
    name: src.name,
    description: src.description,
    image_url: src.image_url,
    price: src.price,
    old_price: src.old_price,
    is_available: src.is_available,
    is_featured: false,
    is_promotion: false,
    display_order: src.display_order,
    preparation_time: src.preparation_time,
  }).select().single();
  if (insErr) throw insErr;
  await logAudit({ user, branchId: targetBranchId, entityType: 'product', entityId: data.id, action: 'duplicate', newData: { from: productId } });
  return mapProduct(data);
}

/** Copiar menú completo de una sucursal a otra */
export async function adminCopyMenuFromBranch(sourceBranchId, targetBranchId, user) {
  const cats = await adminListCategories(sourceBranchId);
  const catMap = {};
  for (const c of cats) {
    const newCat = await adminUpsertCategory({
      branchId: targetBranchId,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      displayOrder: c.displayOrder,
      isActive: c.isActive,
    }, user);
    catMap[c.id] = newCat.id;
  }
  const products = await adminListProducts(sourceBranchId);
  for (const p of products) {
    await sb().from('products').insert({
      branch_id: targetBranchId,
      category_id: catMap[p.categoryId],
      name: p.name,
      description: p.description,
      image_url: p.imageUrl || p.image,
      price: p.price,
      old_price: p.oldPrice,
      is_available: p.available,
      is_featured: p.isFeatured,
      is_promotion: p.isPromotion,
      display_order: p.displayOrder,
      preparation_time: p.preparationTime,
    });
  }
  await logAudit({ user, branchId: targetBranchId, entityType: 'menu', action: 'copy_from_branch', newData: { sourceBranchId } });
}

/** Duplicar categoría con todos sus productos */
export async function adminDuplicateCategory(categoryId, targetBranchId, user) {
  const { data: cat, error } = await sb().from('categories').select('*').eq('id', categoryId).single();
  if (error) throw error;
  const newCat = await adminUpsertCategory({
    branchId: targetBranchId,
    name: `${cat.name} (copia)`,
    description: cat.description,
    imageUrl: cat.image_url,
    displayOrder: cat.display_order,
    isActive: cat.is_active,
  }, user);
  const products = await adminListProducts(cat.branch_id, { categoryId: categoryId });
  for (const p of products) {
    await adminDuplicateProduct(p.id, targetBranchId, newCat.id, user);
  }
  return newCat;
}

export async function uploadProductImage(file, branchId) {
  const bucket = import.meta.env.VITE_STORAGE_BUCKET || 'product-images';
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${branchId || 'general'}/${Date.now()}.${ext}`;
  const { error } = await sb().storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: true });
  if (error) throw error;
  const { data } = sb().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export { isSupabaseConfigured };
