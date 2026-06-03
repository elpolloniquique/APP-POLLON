import { AdminScrollPanel } from './AdminScrollPanel';

/**
 * Tabla admin responsive: scroll vertical (7 filas visibles) + horizontal en móvil.
 */
export function AdminTable({
  columns,
  children,
  count,
  countLabel,
  emptyMessage = 'Sin registros',
  maxRows = 7,
  minWidth = 640,
  className = '',
}) {
  const total = count ?? 0;
  const label = countLabel ?? `${total} registro${total !== 1 ? 's' : ''}`;

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="text-xs font-semibold text-gray-700 sm:text-sm">{label}</p>
        {total > maxRows && (
          <p className="text-[10px] text-gray-400 sm:text-xs">Desplaza para ver más ↓</p>
        )}
      </div>

      {total > 0 ? (
        <AdminScrollPanel maxRows={maxRows} variant="table" className="rounded-none border-0 shadow-none">
          <div className="admin-table-scroll overflow-x-auto">
            <table className="admin-data-table w-full text-left text-sm" style={{ minWidth }}>
              <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase shadow-sm">
                <tr>
                  {columns.map((col) => {
                    const key = typeof col === 'string' ? col : col.key;
                    const labelCol = typeof col === 'string' ? col : col.label;
                    const thClass = typeof col === 'object' ? col.className : '';
                    return (
                      <th key={key} className={`whitespace-nowrap p-2 sm:p-3 ${thClass || ''}`}>
                        {labelCol}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
        </AdminScrollPanel>
      ) : (
        <p className="p-6 text-center text-sm text-gray-500 sm:p-8">{emptyMessage}</p>
      )}
    </div>
  );
}
