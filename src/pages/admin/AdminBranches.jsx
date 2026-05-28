import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminListAllBranches, adminSaveBranch } from '../../services/branchService';
import { isSupabaseConfigured } from '../../services/menuService';
import { useToast } from '../../hooks/useToast';
import { Plus, Pencil } from 'lucide-react';

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
  const { profile } = useAuth();
  const { show, Toast } = useToast();
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null);
  const user = { id: profile?.id, email: profile?.email };

  const load = () => adminListAllBranches().then(setList);
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
      show(err.message);
    }
  };

  if (!isSupabaseConfigured()) {
    return <p className="rounded-xl bg-amber-50 p-4">Configura Supabase y ejecuta schema-multi-sucursal.sql</p>;
  }

  return (
    <div className="space-y-6">
      {Toast}
      <div className="flex justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sucursales</h2>
          <p className="text-sm text-gray-500">Cada sucursal opera de forma independiente</p>
        </div>
        <button type="button" onClick={() => setModal(emptyBranch())} className="flex items-center gap-2 rounded-xl bg-pollon-red px-4 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> Nueva sucursal
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {list.map((b) => (
          <article key={b.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="flex justify-between">
              <h3 className="font-bold">{b.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                {b.isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{b.city} · {b.address}</p>
            <p className="text-sm">WhatsApp: {b.whatsapp}</p>
            <p className="text-sm">Delivery: ${b.deliveryCost?.toLocaleString('es-CL')}</p>
            <button type="button" onClick={() => setModal({ ...b, schedule: b.schedule })} className="mt-3 flex items-center gap-1 text-sm font-semibold text-pollon-red">
              <Pencil className="h-4 w-4" /> Editar
            </button>
          </article>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
