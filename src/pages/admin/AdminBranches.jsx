import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminListAllBranches, adminSaveBranch } from '../../services/branchService';
import { isSupabaseConfigured } from '../../services/menuService';
import { useToast } from '../../hooks/useToast';
import { Plus, Pencil } from 'lucide-react';
import { ROLES } from '../../utils/constants';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminScrollPanel } from '../../components/admin/AdminScrollPanel';

const emptyBranch = () => ({
  name: '',
  slug: '',
  city: '',
  address: '',
  phone: '',
  whatsapp: '',
  schedule: 'Lun-Dom: 11:30 - 23:00',
  deliveryCost: 2000,
  deliveryEta: '30-45 min',
  deliveryEnabled: true,
  pickupEnabled: true,
  reservationsEnabled: true,
  isActive: true,
  isOpen: true,
  displayOrder: 0,
});

export function AdminBranches() {
  const { profile, can, role } = useAuth();
  const { show, Toast } = useToast();
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState('');
  const user = { id: profile?.id, email: profile?.email };
  const canManage = can('branches');

  const load = () => {
    setLoadError('');
    return adminListAllBranches()
      .then(setList)
      .catch((err) => setLoadError(err.message || 'No se pudo cargar sucursales'));
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await adminSaveBranch({
        ...modal,
        schedule: modal.schedule,
        deliveryCost: Number(modal.deliveryCost),
        isActive: modal.isActive,
      }, user);
      show('Sucursal guardada');
      setModal(null);
      load();
    } catch (err) {
      const msg = err.message || 'Error al guardar';
      show(msg.includes('branches') ? `${msg} — ¿Ejecutaste schema-multi-sucursal.sql?` : msg);
    }
  };

  if (!isSupabaseConfigured()) {
    return <p className="rounded-xl bg-amber-50 p-4">Configura Supabase y ejecuta schema-multi-sucursal.sql</p>;
  }

  if (!canManage) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">Sin permiso para gestionar sucursales</p>
        <p className="mt-2">Tu rol actual es <strong>{role}</strong>. Solo <strong>{ROLES.SUPER_ADMIN}</strong> puede crear sucursales.</p>
        <p className="mt-2">En Supabase ejecuta <code>supabase/fix-perfil-admin.sql</code> y vuelve a iniciar sesión.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {Toast}
      {loadError && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}. Verifica que exista la tabla <code>branches</code> (schema-multi-sucursal.sql).</p>
      )}
      <AdminPageHeader
        title="Sucursales"
        subtitle="Cada sucursal opera de forma independiente"
        actions={(
          <button
            type="button"
            onClick={() => setModal(emptyBranch())}
            className="flex items-center gap-2 rounded-xl bg-pollon-red px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            <Plus className="h-4 w-4" /> Nueva sucursal
          </button>
        )}
      />

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center justify-between border-b px-3 py-2.5 sm:px-4">
          <p className="text-sm font-semibold text-gray-700">{list.length} sucursal{list.length !== 1 ? 'es' : ''}</p>
          {list.length > 4 && <p className="text-xs text-gray-400">Desplaza ↓</p>}
        </div>
        <AdminScrollPanel maxRows={4} variant="grid" className="rounded-none border-0 shadow-none">
          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
            {list.map((b) => (
              <article key={b.id} className="rounded-xl bg-gray-50/80 p-4 ring-1 ring-gray-100 sm:rounded-2xl sm:p-5">
                <div className="flex justify-between gap-2">
                  <h3 className="min-w-0 truncate font-bold">{b.name}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                    {b.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">{b.city} · {b.address}</p>
                <p className="text-xs sm:text-sm">WhatsApp: {b.whatsapp}</p>
                <p className="text-xs sm:text-sm">Delivery: ${b.deliveryCost?.toLocaleString('es-CL')}</p>
                <button type="button" onClick={() => setModal({ ...b, schedule: b.schedule })} className="mt-3 flex items-center gap-1 text-sm font-semibold text-pollon-red">
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              </article>
            ))}
            {!list.length && <p className="col-span-full py-8 text-center text-sm text-gray-500">Sin sucursales</p>}
          </div>
        </AdminScrollPanel>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={save} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="text-lg font-bold">{modal.id ? 'Editar' : 'Nueva'} sucursal</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="Nombre" className="col-span-2 rounded-lg border px-3 py-2" />
              <input value={modal.slug} onChange={(e) => setModal({ ...modal, slug: e.target.value })} placeholder="Slug (iquique-vivar)" className="rounded-lg border px-3 py-2" />
              <input value={modal.city} onChange={(e) => setModal({ ...modal, city: e.target.value })} placeholder="Ciudad" className="rounded-lg border px-3 py-2" />
              <input value={modal.address} onChange={(e) => setModal({ ...modal, address: e.target.value })} placeholder="Dirección" className="col-span-2 rounded-lg border px-3 py-2" />
              <input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} placeholder="Teléfono" className="rounded-lg border px-3 py-2" />
              <input value={modal.whatsapp} onChange={(e) => setModal({ ...modal, whatsapp: e.target.value })} placeholder="WhatsApp" className="rounded-lg border px-3 py-2" />
              <input value={modal.schedule} onChange={(e) => setModal({ ...modal, schedule: e.target.value })} placeholder="Horario" className="col-span-2 rounded-lg border px-3 py-2" />
              <input type="number" value={modal.deliveryCost} onChange={(e) => setModal({ ...modal, deliveryCost: e.target.value })} placeholder="Costo delivery" className="rounded-lg border px-3 py-2" />
              <input value={modal.deliveryEta} onChange={(e) => setModal({ ...modal, deliveryEta: e.target.value })} placeholder="Tiempo entrega" className="rounded-lg border px-3 py-2" />
              <label className="flex items-center gap-2"><input type="checkbox" checked={modal.isActive} onChange={(e) => setModal({ ...modal, isActive: e.target.checked })} /> Activa</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={modal.deliveryEnabled} onChange={(e) => setModal({ ...modal, deliveryEnabled: e.target.checked })} /> Delivery</label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" className="flex-1 rounded-lg bg-pollon-red py-2 font-bold text-white">Guardar</button>
              <button type="button" onClick={() => setModal(null)} className="flex-1 rounded-lg border py-2">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
