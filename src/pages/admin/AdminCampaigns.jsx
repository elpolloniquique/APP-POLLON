import { useEffect, useState } from 'react';
import { Mail, Send, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listCampaigns, createCampaign, prepareCampaignRecipients, markCampaignSent } from '../../services/campaignService';
import { isSupabaseConfigured } from '../../services/supabaseClient';
import { useToast } from '../../hooks/useToast';

const empty = { title: '', subject: '', message: '', campaignType: 'promotion', branchId: '' };

export function AdminCampaigns() {
  const { profile } = useAuth();
  const { show, Toast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(empty);
  const [segment, setSegment] = useState({ minOrders: 0, acceptsEmailOnly: true });

  const branchId = profile?.branchId || profile?.branch_id;

  const load = () => {
    if (!isSupabaseConfigured()) return;
    listCampaigns(profile?.rol === 'super_admin' ? null : branchId).then(setCampaigns).catch(() => {});
  };

  useEffect(() => { load(); }, [branchId]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const camp = await createCampaign({ ...form, branchId: form.branchId || branchId }, profile?.id);
      const count = await prepareCampaignRecipients(camp.id, {
        branchId: form.branchId || branchId,
        minOrders: segment.minOrders,
        acceptsEmailOnly: segment.acceptsEmailOnly,
      });
      show(`Campaña creada con ${count} destinatarios`);
      setForm(empty);
      load();
    } catch (err) {
      show(err.message);
    }
  };

  const send = async (id) => {
    if (!confirm('¿Marcar campaña como enviada? (Integración email vía Edge Function en producción)')) return;
    try {
      await markCampaignSent(id);
      show('Campaña enviada');
      load();
    } catch (err) {
      show(err.message);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-amber-900">
        <h2 className="text-xl font-bold">Campañas</h2>
        <p className="mt-2 text-sm">Ejecuta schema-auth.sql en Supabase.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Toast}
      <div>
        <h2 className="text-2xl font-bold">Campañas y ofertas</h2>
        <p className="text-sm text-gray-500">Enviar promociones, novedades y cupones por correo</p>
      </div>

      <form onSubmit={create} className="rounded-2xl bg-white p-6 shadow-sm space-y-4 max-w-2xl">
        <h3 className="font-bold flex items-center gap-2"><Mail className="h-5 w-5 text-pollon-red" /> Nueva campaña</h3>
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título interno" className="w-full rounded-xl border px-4 py-2 text-sm" />
        <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Asunto del correo" className="w-full rounded-xl border px-4 py-2 text-sm" />
        <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Mensaje / oferta / cupón…" rows={5} className="w-full rounded-xl border px-4 py-2 text-sm" />
        <select value={form.campaignType} onChange={(e) => setForm({ ...form, campaignType: e.target.value })} className="w-full rounded-xl border px-4 py-2 text-sm">
          <option value="promotion">Promoción</option>
          <option value="news">Novedad</option>
          <option value="coupon">Cupón</option>
        </select>
        <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-sm">
          <p className="font-semibold">Segmentación</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={segment.acceptsEmailOnly} onChange={(e) => setSegment({ ...segment, acceptsEmailOnly: e.target.checked })} />
            Solo clientes que aceptaron promociones por email
          </label>
          <label className="flex items-center gap-2">
            Mín. pedidos en sucursal:
            <input type="number" min={0} value={segment.minOrders} onChange={(e) => setSegment({ ...segment, minOrders: Number(e.target.value) })} className="w-20 rounded border px-2 py-1" />
          </label>
        </div>
        <button type="submit" className="rounded-xl bg-pollon-red px-6 py-2.5 text-sm font-bold text-white">Crear campaña</button>
      </form>

      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-xs uppercase">
            <tr>
              <th className="p-3">Título</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.title}</td>
                <td className="p-3"><Tag className="h-4 w-4 inline text-gray-400" /> {c.campaign_type}</td>
                <td className="p-3 capitalize">{c.status}</td>
                <td className="p-3">
                  {c.status !== 'sent' && (
                    <button type="button" onClick={() => send(c.id)} className="flex items-center gap-1 text-pollon-red font-semibold text-xs">
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!campaigns.length && <p className="p-8 text-center text-gray-500">Sin campañas</p>}
      </div>
    </div>
  );
}
