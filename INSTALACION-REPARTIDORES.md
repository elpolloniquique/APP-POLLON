# Módulo Repartidores / Despacho GPS — El Pollón

Sistema estilo **Uber / inDriver** integrado en `el-pollon` **sin modificar** menú, caja, cocina ni ventas multi-sucursal.

## Stack mapas (100% gratis)

| Pieza | Tecnología |
|-------|------------|
| Motor mapa | MapLibre GL |
| Calles | CARTO Voyager @2x |
| Satélite | Esri World Imagery |
| Rutas | OSRM (`router.project-osrm.org` o self-host) |
| Geocoding | Nominatim OSM |

**No** se usan Mapbox / MapTiler / Google Maps tiles de pago.

## 1. Migración SQL (obligatorio)

En Supabase → SQL Editor, ejecuta:

```
supabase/migration-repartidores-delivery.sql
```

## 2. Crear repartidor

1. Authentication → Create user (email + password)
2. En tabla `profiles`:

```sql
UPDATE profiles
SET role = 'delivery',  -- o 'repartidor'
    branch_id = '<uuid-sucursal-opcional>'
WHERE email = 'repartidor@tudominio.cl';
```

3. El repartidor inicia sesión desde la tienda (Mi cuenta) o `/admin/login`
4. Es redirigido automáticamente a `/repartidor`

5. En Admin → **Repartidores** → **Aprobar**

## 3. Flujo operativo

```
Pedido delivery listo en cocina
  → Admin Despacho → Sincronizar pedidos
  → Ofertar a repartidores
  → App repartidor recibe oferta (Realtime)
  → Aceptar → GPS se rastrea
  → Admin En vivo ve mapa
  → Recogido → Entregado → sync estado en `pedidos`
```

## 4. Rutas nuevas

### Admin
- `/admin/repartidores`
- `/admin/repartidores/config`
- `/admin/repartidores/tarifas`
- `/admin/repartidores/despacho`
- `/admin/repartidores/en-vivo`
- `/admin/repartidores/reportes`

### Repartidor
- `/repartidor` — ofertas + viaje
- `/repartidor/mapa`
- `/repartidor/historial`
- `/repartidor/ingresos`
- `/repartidor/perfil`

## 5. Variables de entorno

```env
VITE_OSRM_URL=https://router.project-osrm.org
```

Para producción, self-host OSRM y apunta `VITE_OSRM_URL` a tu servidor.

## 6. Archivos clave (aditivos)

```
src/services/driverService.js
src/services/dispatchService.js
src/services/pricingService.js
src/services/trackingService.js
src/utils/geo.js | osrm.js | mapStyles.js
src/components/delivery/*
src/pages/admin/AdminDrivers.jsx ... AdminLiveMap.jsx
src/pages/driver/*
supabase/migration-repartidores-delivery.sql
```

## 7. Qué NO se tocó

- Checkout / carrito / menú por sucursal
- Caja diaria / stock / campañas
- Cocina / pedidos (solo lectura + sync opcional de estado `en_delivery` / `entregado` vía RPC)
