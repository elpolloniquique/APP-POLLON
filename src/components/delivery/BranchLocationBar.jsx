import { useEffect, useState } from 'react';
import { MapPin, Pencil, Check, X, Loader2, Navigation } from 'lucide-react';
import { AddressAutocomplete } from '../cart/AddressAutocomplete';
import { searchPreciseAddresses, reverseGeocodePrecise } from '../../utils/addressGeocode';

/**
 * Barra de ubicación de sucursal (Zona 00): punto central del cálculo por km.
 */
export function BranchLocationBar({
  branch,
  center,
  editing,
  onStartEdit,
  onCancel,
  onSave,
  saving = false,
  draft,
  onDraftChange,
}) {
  const [resolving, setResolving] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!editing) setLocalError('');
  }, [editing]);

  const displayAddress = branch?.address?.trim()
    || (branch?.city ? `${branch.city}` : '')
    || 'Sin dirección configurada';

  const hasGps = center?.lat != null && center?.lng != null;

  const applyHit = (hit) => {
    if (!hit) return;
    onDraftChange?.({
      address: hit.label || hit.address || draft?.address || '',
      lat: Number(hit.lat),
      lng: Number(hit.lng),
    });
    setLocalError('');
  };

  const resolveTypedAddress = async () => {
    const q = (draft?.address || '').trim();
    if (q.length < 4) {
      setLocalError('Escribe una dirección completa (calle y número).');
      return null;
    }
    setResolving(true);
    setLocalError('');
    try {
      const hits = await searchPreciseAddresses(q, {
        city: branch?.city || 'Iquique',
        lat: draft?.lat ?? center?.lat,
        lng: draft?.lng ?? center?.lng,
        limit: 5,
      });
      const best = hits?.[0];
      if (!best?.lat || !best?.lng) {
        setLocalError('No se encontró esa dirección. Prueba otra o mueve el pin en el mapa.');
        return null;
      }
      applyHit(best);
      return best;
    } catch {
      setLocalError('No se pudo geocodificar. Revisa la dirección o mueve el pin.');
      return null;
    } finally {
      setResolving(false);
    }
  };

  const handleConfirm = async () => {
    let next = draft;
    if (next?.lat == null || next?.lng == null || !Number.isFinite(Number(next.lat))) {
      const hit = await resolveTypedAddress();
      if (!hit) return;
      next = {
        address: hit.label || hit.address || draft?.address,
        lat: Number(hit.lat),
        lng: Number(hit.lng),
      };
    }
    if (!String(next?.address || '').trim()) {
      setLocalError('La dirección es obligatoria.');
      return;
    }
    await onSave?.(next);
  };

  const handleMapSyncLabel = async () => {
    if (draft?.lat == null || draft?.lng == null) return;
    setResolving(true);
    try {
      const rev = await reverseGeocodePrecise(draft.lat, draft.lng, {
        city: branch?.city || 'Iquique',
      });
      if (rev?.label || rev?.address) {
        onDraftChange?.({
          ...draft,
          address: rev.label || rev.address,
        });
      }
    } catch {
      /* keep coords */
    } finally {
      setResolving(false);
    }
  };

  return (
    <section className="branch-location-bar overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:w-[220px] sm:shrink-0">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pollon-red text-white shadow-sm">
            <MapPin className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-gray-900">Ubicación de Sucursal</h3>
              <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Zona 00
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              Punto central desde el que se calcula el delivery por kilometraje
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-1.5">
              <AddressAutocomplete
                value={draft?.address || ''}
                onChange={(v) => onDraftChange?.({ ...draft, address: v, lat: null, lng: null })}
                onSelect={(hit) => {
                  if (!hit) {
                    onDraftChange?.({ ...draft, address: draft?.address || '', lat: null, lng: null });
                    return;
                  }
                  applyHit(hit);
                }}
                cityBias={branch?.city || 'Iquique'}
                biasLat={draft?.lat ?? center?.lat}
                biasLng={draft?.lng ?? center?.lng}
                branchAddress={branch?.address || ''}
              />
              {localError && (
                <p className="text-[11px] font-medium text-red-600">{localError}</p>
              )}
              <p className="text-[10px] text-gray-400">
                Elige una sugerencia o arrastra el pin rojo en el mapa para afinar el punto exacto.
              </p>
            </div>
          ) : (
            <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/90 px-3.5 py-2.5">
              <Navigation className={`h-4 w-4 shrink-0 ${hasGps ? 'text-emerald-600' : 'text-amber-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900" title={displayAddress}>
                  {displayAddress}
                </p>
                <p className="text-[10px] tabular-nums text-gray-400">
                  {hasGps
                    ? `${Number(center.lat).toFixed(6)}, ${Number(center.lng).toFixed(6)}`
                    : 'GPS pendiente — edita para fijar el centro en el mapa'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 self-stretch sm:self-center">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleMapSyncLabel}
                disabled={saving || resolving || draft?.lat == null}
                className="hidden rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-40 md:inline-flex"
                title="Actualizar texto desde el pin del mapa"
              >
                Desde mapa
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || resolving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-pollon-red px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
              >
                {saving || resolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {saving ? 'Guardando…' : resolving ? 'Detectando…' : 'Guardar'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-pollon-red px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
