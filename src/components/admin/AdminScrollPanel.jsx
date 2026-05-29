/**
 * Panel con scroll vertical — muestra ~maxRows filas y el resto al desplazar.
 * Usar en tablas (sticky thead) o listas de tarjetas.
 */
export function AdminScrollPanel({
  children,
  maxRows = 7,
  variant = 'table',
  className = '',
}) {
  const rowRem = variant === 'card' ? 4.75 : 3.25;
  const headRem = variant === 'card' ? 0 : 2.75;
  const maxHeight = variant === 'card'
    ? `calc(${maxRows} * ${rowRem}rem)`
    : `calc(${headRem}rem + ${maxRows} * ${rowRem}rem)`;

  return (
    <div
      className={`admin-scroll-panel overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
