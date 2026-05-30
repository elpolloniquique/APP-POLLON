import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle, MessageCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useBranch } from '../context/BranchContext';
import { money, formatDateTime, buildWhatsappMessage } from '../utils/format';
import * as orderService from '../services/orderService';
import { useEffect, useState } from 'react';

export function OrderSuccess() {
  const { state } = useLocation();
  const { id } = useParams();
  const { branch, whatsapp } = useBranch();
  const [order, setOrder] = useState(state?.order || null);

  useEffect(() => {
    if (order || !id) return;
    const found = orderService.getOrders().find((o) => o.id === id);
    if (found) setOrder(found);
  }, [id, order]);

  const code = order?.ticketNumber || order?.codigo_pedido;

  const handleWhatsApp = () => {
    if (!order || !whatsapp) return;
    const msg = buildWhatsappMessage(order, branch);
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pollon-cream p-6 text-center">
      <CheckCircle className="h-20 w-20 text-green-600" />
      <h1 className="mt-4 font-display text-4xl text-pollon-black">¡Pedido recibido!</h1>
      <p className="mt-2 max-w-md text-gray-600">
        Tu pedido fue registrado correctamente y ya está visible en la sucursal.
      </p>
      {order && (
        <div className="mt-6 max-w-md rounded-2xl bg-white p-6 shadow-lg text-left w-full">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-green-800">Código de seguimiento</p>
          <p className="mt-2 text-center font-display text-3xl tracking-wider text-pollon-black">#{code}</p>
          <div className="mt-4 space-y-2 text-sm">
            <p><strong>Total:</strong> {money(order.total)}</p>
            <p><strong>Fecha:</strong> {formatDateTime(order.createdAt)}</p>
            <p className="text-xs text-gray-500 break-all"><strong>ID:</strong> {id}</p>
          </div>
        </div>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {order && whatsapp && (
          <Button onClick={handleWhatsApp} className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb855]">
            <MessageCircle className="h-4 w-4" />
            Enviar comprobante por WhatsApp
          </Button>
        )}
        {order?.id && (
          <Link to={`/cuenta/seguimiento/${order.id}`}><Button>Seguir mi pedido</Button></Link>
        )}
        <Link to="/tienda"><Button variant="outline">Seguir comprando</Button></Link>
        <Link to="/"><Button variant="outline">Inicio</Button></Link>
      </div>
    </div>
  );
}
