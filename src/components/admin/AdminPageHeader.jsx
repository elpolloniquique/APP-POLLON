/**
 * Encabezado estándar de páginas admin — responsive en móvil/tablet/PC.
 */
export function AdminPageHeader({ title, subtitle, branchLabel, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-pollon-black sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{subtitle}</p>}
        {branchLabel && (
          <p className="mt-1 text-xs font-medium text-pollon-red sm:text-sm">Sucursal: {branchLabel}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </div>
  );
}
