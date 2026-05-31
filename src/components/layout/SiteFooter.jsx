import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';
import { useBranch } from '../../context/BranchContext';
import { TRANSFER_BANK_INFO } from '../../utils/constants';

export function SiteFooter() {
  const { branch, whatsapp } = useBranch();

  return (
    <footer className="bg-pollon-black text-white">
      {/* Barra beneficios */}
      <div className="border-b border-white/10 bg-[#1a0505]">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
          {[
            { icon: '🍗', title: 'Pollo fresco del día', desc: 'Marinado y cocinado al carbón' },
            { icon: '🛵', title: 'Delivery rápido', desc: 'Llegamos caliente a tu puerta' },
            { icon: '💵', title: 'Efectivo y transferencia', desc: 'Solo estos métodos de pago' },
            { icon: '🎧', title: 'Atención multi-sucursal', desc: 'Arica, Iquique y más' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide">{item.title}</p>
                <p className="text-[11px] text-white/60">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <img src="/img/logo pollon.png" alt="" className="mb-4 h-14 w-14 rounded-full bg-white object-contain p-1" />
            <h3 className="font-display text-2xl text-pollon-gold">EL POLLÓN</h3>
            <p className="mt-2 text-sm text-white/60">
              El auténtico sabor del pollo a la brasa peruano en el norte de Chile.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-pollon-gold">Enlaces rápidos</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link to="/" className="hover:text-white">Inicio</Link></li>
              <li><Link to="/tienda" className="hover:text-white">Menú completo</Link></li>
              <li><Link to="/sucursal" className="hover:text-white">Sucursales</Link></li>
              <li><Link to="/tienda?cat=ofertas-familiares" className="hover:text-white">Promociones</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-pollon-gold">Ayuda</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link to="/tienda" className="hover:text-white">Cómo comprar</Link></li>
              <li><a href={`https://wa.me/${whatsapp}`} className="hover:text-white">Contacto WhatsApp</a></li>
              <li><Link to="/sucursal" className="hover:text-white">Zonas de delivery</Link></li>
              <li><Link to="/admin/login" className="hover:text-white">Panel admin</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-widest text-pollon-gold">Contacto</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-pollon-red" /><a href={`tel:+${whatsapp}`}>{branch?.phone}</a></li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-pollon-red" />{TRANSFER_BANK_INFO.email}</li>
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-pollon-red" />{branch?.schedule}</li>
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-pollon-red" />{branch?.address}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Pollería El Pollón — Todos los derechos reservados</p>
          <p>Desarrollado con ❤️ para nuestros clientes</p>
        </div>
      </div>
    </footer>
  );
}
