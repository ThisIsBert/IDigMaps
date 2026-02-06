window.Polygons = (() => {
  const init = (map) => {
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
      },
      draw: {
        polygon: true,
        marker: false,
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.addLayer(e.layer);
    });

    map.on(L.Draw.Event.DELETED, () => {
      // no-op; layer group already updated
    });

    return {
      layerGroup: drawnItems,
      exportGeoJSON() {
        return drawnItems.toGeoJSON();
      },
      importGeoJSON(geojson) {
        drawnItems.clearLayers();
        L.geoJSON(geojson).eachLayer((layer) => {
          drawnItems.addLayer(layer);
        });
      },
    };
  };

  return { init };
})();
