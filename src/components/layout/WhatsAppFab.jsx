import { MessageCircle } from 'lucide-react';
import { useBranch } from '../../context/BranchContext';

export function WhatsAppFab() {
  const { whatsapp } = useBranch();
  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hola, quiero hacer un pedido en El Pollón 🍗')}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-110"
      aria-label="WhatsApp"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
