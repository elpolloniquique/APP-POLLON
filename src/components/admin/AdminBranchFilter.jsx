/** Selector de sucursal — solo visible para super admin. */
export function AdminBranchFilter({ branches, value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm ${className}`}
      aria-label="Filtrar por sucursal"
    >
      <option value="">Todas las sucursales</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
