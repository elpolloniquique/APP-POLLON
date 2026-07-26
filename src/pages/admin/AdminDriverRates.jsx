import { useEffect, useState } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAdminBranchFilter } from '../../hooks/useAdminBranchFilter';
import { AdminBranchFilter } from '../../components/admin/AdminBranchFilter';
import { listPricingRules, savePricingRule, deletePricingRule, simulateLocalQuote } from '../../services/pricingService';
import { money } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Loader } from '../../components/ui/Loader';

const EMPTY = {
  name: '',
  rule_type: 'per_km',
  base_fee: 1500,
  per_km_fee: 400,
  min_fee: 2000,
  max_fee: 8000,
  is_active: true,
  priority: 10,
  branch_id: null,
};

export function AdminDriverRates() {
  const { selectedBranchId, setSelectedBranchId, branches, showBranchFilter, branchId: staffBranchId, isSuperAdmin } = useAdminBranchFilter();
  const filterBranch = isSuperAdmin ? selectedBranchId || null : staffBranchId;
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [simKm, setSimKm] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRules(await listPricingRules(filterBranch));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterBranch]);

  const save = async () => {
    try {
      await savePricingRule({
        ...form,
        branch_id: form.branch_id || filterBranch || null,
      });
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar esta tarifa?')) return;
    try {
      await deletePricingRule(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:p-6">
      <AdminPageHeader
        title="Tarifas de delivery"
        subtitle="Reglas fijas o por km · simulador de cotización"
        actions={showBranchFilter ? (
          <AdminBranchFilter value={selectedBranchId} onChange={setSelectedBranchId} branches={branches} />
        ) : null}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 sm:p-6">
          <h3 className="mb-3 font-bold">{form.id ? 'Editar tarifa' : 'Nueva tarifa'}</h3>
          <div className="space-y-3">
            <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border px-3 py-2" />
            <select value={form.rule_type} onChange={(e) => setForm({ ...form, rule_type: e.target.value })} className="w-full rounded-xl border px-3 py-2">
              <option value="fixed">Fija</option>
              <option value="per_km">Por kilómetro</option>
              <option value="tiers">Tramos</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Base" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: e.target.value })} className="rounded-xl border px-3 py-2" />
              <input type="number" placeholder="Por km" value={form.per_km_fee} onChange={(e) => setForm({ ...form, per_km_fee: e.target.value })} className="rounded-xl border px-3 py-2" />
              <input type="number" placeholder="Mínimo" value={form.min_fee} onChange={(e) => setForm({ ...form, min_fee: e.target.value })} className="rounded-xl border px-3 py-2" />
              <input type="number" placeholder="Máximo" value={form.max_fee} onChange={(e) => setForm({ ...form, max_fee: e.target.value })} className="rounded-xl border px-3 py-2" />
            </div>
            <Button onClick={save} className="w-full">Guardar tarifa</Button>
          </div>

          <div className="mt-6 rounded-xl bg-gray-50 p-4">
            <p className="text-sm font-semibold">Simulador</p>
            <input type="range" min={0.5} max={15} step={0.5} value={simKm} onChange={(e) => setSimKm(Number(e.target.value))} className="mt-2 w-full accent-pollon-red" />
            <p className="mt-2 text-sm text-gray-600">{simKm} km → <strong className="text-pollon-red">{money(simulateLocalQuote(form, simKm))}</strong></p>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 sm:p-6">
          <h3 className="mb-3 font-bold">Tarifas activas</h3>
          {loading ? <Loader /> : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border px-3 py-3">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-gray-500">
                      {r.rule_type} · base {money(r.base_fee)}
                      {r.rule_type !== 'fixed' && ` + ${money(r.per_km_fee)}/km`}
                      {' · '}min {money(r.min_fee)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setForm(r)}>Editar</Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600" onClick={() => remove(r.id)}>Eliminar</Button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && <p className="text-sm text-gray-500">Sin tarifas. Crea la primera.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
