import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { money, formatDateTime } from '../utils/format';

export function OrderSuccess() {
  const { state } = useLocation();
  const { id } = useParams();
  const order = state?.order;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pollon-cream p-6 text-center">
      <CheckCircle className="h-20 w-20 text-green-600" />
      <h1 className="mt-4 font-display text-4xl text-pollon-black">¡Pedido registrado!</h1>
      {order && (
        <div className="mt-6 max-w-md rounded-2xl bg-white p-6 shadow-lg text-left">
          <p><strong>Código:</strong> #{order.ticketNumber || order.codigo_pedido}</p>
          <p><strong>Total:</strong> {money(order.total)}</p>
          <p><strong>Fecha:</strong> {formatDateTime(order.createdAt)}</p>
          <p className="mt-2 text-sm text-gray-500">ID: {id}</p>
        </div>
      )}
      <p className="mt-4 max-w-sm text-gray-600">
        Tu pedido quedó guardado y se abrió WhatsApp para confirmar con la sucursal.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {order?.id && (
          <Link to={`/cuenta/seguimiento/${order.id}`}><Button>Seguir mi pedido</Button></Link>
        )}
        <Link to="/tienda"><Button variant="outline">Seguir comprando</Button></Link>
        <Link to="/"><Button variant="outline">Inicio</Button></Link>
      </div>
    </div>
  );
}
