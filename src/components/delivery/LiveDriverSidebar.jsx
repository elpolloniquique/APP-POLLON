import { Eye } from 'lucide-react';

function DriverRow({ item, onView }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow"
        style={{ background: item.color }}
        title={item.phaseLabel}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
        <p className="text-[10px] text-gray-500">
          Actualizado {item.updatedLabel}
          {item.etaLabel ? ` · ${item.etaLabel}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onView?.(item)}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-pollon-red hover:text-pollon-red"
        title="Ver pedidos"
      >
        <Eye className="h-3.5 w-3.5" />
        Ver
      </button>
    </div>
  );
}

export function LiveDriverSidebar({
  pickupDrivers = [],
  deliveryDrivers = [],
  onView,
  onSelect,
  selectedDriverId,
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border bg-white p-3 shadow-sm">
      <section>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Repartidores hacia recojo
        </p>
        <div className="space-y-2">
          {pickupDrivers.map((d) => (
            <div
              key={d.driverId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.(d.driverId)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect?.(d.driverId)}
              className={selectedDriverId === d.driverId ? 'ring-2 ring-pollon-red/30 rounded-xl' : ''}
            >
              <DriverRow item={d} onView={onView} />
            </div>
          ))}
          {pickupDrivers.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              Nadie en camino a la sucursal
            </p>
          )}
        </div>
      </section>

      <section>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Repartidores hacia destino cliente
        </p>
        <div className="space-y-2">
          {deliveryDrivers.map((d) => (
            <div
              key={d.driverId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.(d.driverId)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect?.(d.driverId)}
              className={selectedDriverId === d.driverId ? 'ring-2 ring-pollon-red/30 rounded-xl' : ''}
            >
              <DriverRow item={d} onView={onView} />
            </div>
          ))}
          {deliveryDrivers.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              Sin entregas en curso hacia cliente
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
