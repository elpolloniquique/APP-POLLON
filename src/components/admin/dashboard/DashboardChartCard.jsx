/** Tarjeta contenedora de gráfico compacto. */
export function DashboardChartCard({ title, subtitle, children, className = '', action }) {
  return (
    <article className={`dashboard-chart-card ${className}`}>
      <div className="dashboard-chart-card__head">
        <div className="min-w-0">
          <h3 className="dashboard-chart-card__title">{title}</h3>
          {subtitle && <p className="dashboard-chart-card__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="dashboard-chart-card__body">{children}</div>
    </article>
  );
}

/** KPI con variación vs período anterior. */
export function DashboardKpiCard({ label, value, delta, icon: Icon, accent = 'red' }) {
  const accentClass = accent === 'green' ? 'text-green-600' : accent === 'amber' ? 'text-amber-600' : 'text-pollon-red';
  const deltaUp = delta > 0;
  const deltaDown = delta < 0;
  const deltaClass = deltaUp ? 'text-green-600 bg-green-50' : deltaDown ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50';

  return (
    <div className="dashboard-kpi">
      <div className="dashboard-kpi__top">
        {Icon && (
          <span className={`dashboard-kpi__icon ${accentClass}`}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        )}
        {delta !== undefined && delta !== null && (
          <span className={`dashboard-kpi__delta ${deltaClass}`}>
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <p className="dashboard-kpi__value">{value}</p>
      <p className="dashboard-kpi__label">{label}</p>
    </div>
  );
}
