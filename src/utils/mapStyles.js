/** Estilos de mapa 100% gratis — CARTO + Esri (sin API key) */

export const MAP_STYLES = {
  streets: {
    id: 'streets',
    label: 'Calles',
    style: {
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 512,
          attribution: '© OpenStreetMap © CARTO',
        },
        labels: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 512,
        },
      },
      layers: [
        { id: 'carto', type: 'raster', source: 'carto' },
        { id: 'labels', type: 'raster', source: 'labels' },
      ],
    },
  },
  satellite: {
    id: 'satellite',
    label: 'Satélite',
    style: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© Esri',
        },
        labels: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 512,
        },
      },
      layers: [
        { id: 'esri', type: 'raster', source: 'esri' },
        { id: 'labels', type: 'raster', source: 'labels' },
      ],
    },
  },
};

export function getMapStyle(id = 'streets') {
  return MAP_STYLES[id]?.style || MAP_STYLES.streets.style;
}
