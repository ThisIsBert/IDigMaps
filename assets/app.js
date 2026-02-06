(() => {
  const state = {
    map: null,
    image: null,
    imageMeta: null,
    gcps: [],
    transform: null,
    transformMode: "affine",
    lambda: 0.001,
    overlay: {
      visible: true,
      opacity: 0.8,
      resolution: 40,
      mesh: false,
    },
    pick: {
      mode: "idle",
      pending: null,
      tempImage: null,
    },
    lastMetrics: null,
  };

  const STORAGE_KEY = "idigmaps-project";

  const app = {
    init() {
      state.map = L.map("map").setView([37.8, -96], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(state.map);
      L.control.scale().addTo(state.map);

      const cursorControl = L.control({ position: "bottomleft" });
      cursorControl.onAdd = () => {
        const div = L.DomUtil.create("div", "cursor-info");
        div.style.background = "rgba(255,255,255,0.8)";
        div.style.padding = "4px 6px";
        div.style.fontSize = "12px";
        div.textContent = "Lat: --, Lng: -- | Zoom: --";
        state.cursorDiv = div;
        return div;
      };
      cursorControl.addTo(state.map);

      state.map.on("mousemove", (event) => {
        if (!state.cursorDiv) return;
        const { lat, lng } = event.latlng;
        state.cursorDiv.textContent = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} | Zoom: ${state.map.getZoom()}`;
      });

      state.map.on("click", (event) => {
        if (!app.isWaitingForMap()) return;
        app.onMapPicked(event.latlng);
      });

      state.gcpLayer = L.layerGroup().addTo(state.map);
      state.polygons = Polygons.init(state.map);

      state.overlayLayer = new Warp.WarpedImageLayer({
        gridSize: state.overlay.resolution,
        opacity: state.overlay.opacity,
      });
      state.overlayLayer.addTo(state.map);

      UI.init(app);
      UI.updateOverlayDisplay(state.overlay.opacity, state.overlay.resolution);

      document.addEventListener("keydown", (event) => {
        if (event.key === "g" || event.key === "G") {
          app.startNewGcp();
        }
        if (event.key === "Escape") {
          app.cancelPick();
        }
      });

      app.restoreProject();
      app.updateUI();
    },

    isWaitingForImage() {
      return state.pick.mode === "image";
    },

    isWaitingForMap() {
      return state.pick.mode === "map";
    },

    setModeStatus(text) {
      UI.setModeStatus(text);
    },

    startNewGcp() {
      if (!state.image) {
        UI.setModeStatus("Load an image before adding GCPs.");
        return;
      }
      state.pick.mode = "image";
      state.pick.pending = { type: "new" };
      state.pick.tempImage = null;
      UI.setModeStatus("Click the image picker to choose the image point.");
    },

    startEditGcpImage(id) {
      state.pick.mode = "image";
      state.pick.pending = { type: "edit-image", id };
      state.pick.tempImage = null;
      UI.setModeStatus("Re-pick the image point.");
    },

    startEditGcpMap(id) {
      state.pick.mode = "map";
      state.pick.pending = { type: "edit-map", id };
      state.pick.tempImage = null;
      UI.setModeStatus("Click the map to re-pick the map point.");
    },

    cancelPick() {
      state.pick.mode = "idle";
      state.pick.pending = null;
      state.pick.tempImage = null;
      UI.setModeStatus("Pick canceled.");
    },

    onImagePicked(u, v) {
      state.pick.tempImage = { u, v };
      state.pick.mode = "map";
      UI.setModeStatus("Now click on the map to set the GCP location.");
    },

    onMapPicked(latlng) {
      if (!state.pick.pending || !state.pick.tempImage) {
        UI.setModeStatus("Pick an image point first.");
        return;
      }
      const { u, v } = state.pick.tempImage;
      if (state.pick.pending.type === "new") {
        state.gcps.push(GCP.create(u, v, latlng.lat, latlng.lng));
      }
      if (state.pick.pending.type === "edit-image") {
        const gcp = state.gcps.find((item) => item.id === state.pick.pending.id);
        if (gcp) {
          gcp.u = u;
          gcp.v = v;
        }
      }
      if (state.pick.pending.type === "edit-map") {
        const gcp = state.gcps.find((item) => item.id === state.pick.pending.id);
        if (gcp) {
          gcp.lat = latlng.lat;
          gcp.lng = latlng.lng;
        }
      }

      state.pick.mode = "idle";
      state.pick.pending = null;
      state.pick.tempImage = null;
      UI.setModeStatus("GCP saved.");
      app.resetTransform();
      app.updateUI();
      app.saveProject();
    },

    deleteGcp(id) {
      state.gcps = state.gcps.filter((gcp) => gcp.id !== id);
      app.resetTransform();
      app.updateUI();
      app.saveProject();
    },

    setTransformMode(mode) {
      state.transformMode = mode;
      app.updateUI();
      app.saveProject();
    },

    setLambda(value) {
      state.lambda = value;
      app.saveProject();
    },

    setOpacity(value) {
      state.overlay.opacity = value;
      state.overlayLayer.setOpacity(value);
      UI.updateOverlayDisplay(state.overlay.opacity, state.overlay.resolution);
      app.saveProject();
    },

    setResolution(value) {
      state.overlay.resolution = value;
      state.overlayLayer.setGridSize(value);
      UI.updateOverlayDisplay(state.overlay.opacity, state.overlay.resolution);
      app.saveProject();
    },

    toggleOverlay(show) {
      state.overlay.visible = show;
      if (show) {
        state.map.addLayer(state.overlayLayer);
      } else {
        state.map.removeLayer(state.overlayLayer);
      }
      app.saveProject();
    },

    toggleMesh(show) {
      state.overlay.mesh = show;
      state.overlayLayer.setShowMesh(show);
      app.saveProject();
    },

    toggleGcpLayer(show) {
      if (show) {
        state.map.addLayer(state.gcpLayer);
      } else {
        state.map.removeLayer(state.gcpLayer);
      }
      app.saveProject();
    },

    togglePolygonLayer(show) {
      if (show) {
        state.map.addLayer(state.polygons.layerGroup);
      } else {
        state.map.removeLayer(state.polygons.layerGroup);
      }
      app.saveProject();
    },

    computeTransform() {
      if (!state.gcps.length) {
        UI.setModeStatus("Add GCPs before computing a transform.");
        return;
      }
      const points = state.gcps.map((gcp) => {
        const projected = GCP.toProjected(gcp.lat, gcp.lng);
        return { u: gcp.u, v: gcp.v, x: projected.x, y: projected.y };
      });

      let transform = null;
      if (state.transformMode === "affine") {
        const model = TPS.solveAffine(points);
        if (!model) {
          UI.setModeStatus("Affine solve failed. Check for duplicate points.");
          return;
        }
        transform = {
          eval: (u, v) => TPS.evalAffine(model, u, v),
          toLatLng: (x, y) => L.CRS.EPSG3857.unproject(L.point(x, y)),
        };
      } else {
        const model = TPS.buildTPS(points, state.lambda);
        if (!model) {
          UI.setModeStatus("TPS solve failed (ill-conditioned). Try more spread points or increase lambda.");
          return;
        }
        transform = {
          eval: (u, v) => TPS.evalTPS(model, u, v),
          toLatLng: (x, y) => L.CRS.EPSG3857.unproject(L.point(x, y)),
        };
      }

      state.transform = transform;
      state.overlayLayer.setTransform(transform);
      const metrics = GCP.computeResiduals(state.gcps, transform);
      state.lastMetrics = metrics;
      UI.updateTransformMetrics(metrics);
      UI.setModeStatus("Transform computed.");
      app.updateUI();
      app.saveProject();
    },

    loadImage(file) {
      if (!file) return;
      const img = new Image();
      UI.setModeStatus("Loading image...");
      img.onload = () => {
        state.image = img;
        state.imageMeta = { name: file.name, width: img.width, height: img.height };
        UI.setImage(img);
        UI.setImageMeta(`${file.name} (${img.width} x ${img.height})`);
        state.overlayLayer.setImage(img);
        UI.setImageHint("");
        app.resetTransform();
        app.checkCanvasSecurity();
        app.updateUI();
        app.saveProject();
        UI.setModeStatus("Image loaded. Add a GCP to start.");
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        state.image = null;
        state.imageMeta = null;
        UI.setImage(null);
        UI.setImageMeta("No image loaded.");
        UI.setImageHint("Image could not be loaded. Try a PNG or JPG file.");
        UI.setModeStatus("Image load failed.");
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    },

    clearImage() {
      state.image = null;
      state.imageMeta = null;
      app.cancelPick();
      UI.setImage(null);
      UI.setImageMeta("No image loaded.");
      UI.setImageHint("");
      state.overlayLayer.setImage(null);
      app.resetTransform();
      app.updateUI();
      app.saveProject();
    },

    checkCanvasSecurity() {
      if (!state.image) return;
      try {
        const ctx = UI.getCanvasContext();
        ctx.getImageData(0, 0, 1, 1);
      } catch (error) {
        UI.setImageHint("Browser blocked canvas access. Try running a local static server.");
      }
    },

    updateUI() {
      const minAffine = 3;
      const minTps = 3;
      const canCompute = state.transformMode === "affine"
        ? state.gcps.length >= minAffine
        : state.gcps.length >= minTps;
      UI.renderGcpTable(state.gcps, state.lastMetrics);
      UI.updateTransformMetrics(state.lastMetrics);
      if (!canCompute) {
        UI.setModeStatus(
          state.transformMode === "affine"
            ? `Need at least ${minAffine} GCPs for affine.`
            : `Need at least ${minTps} GCPs for TPS (6+ recommended).`
        );
      }
      document.getElementById("computeTransform").disabled = !canCompute;

      const warnings = GCP.detectDuplicates(state.gcps);
      if (warnings.length) {
        UI.setModeStatus(warnings[0]);
      }
      app.updateGcpMarkers();
    },

    updateGcpMarkers() {
      state.gcpLayer.clearLayers();
      state.gcps.forEach((gcp, index) => {
        const marker = L.circleMarker([gcp.lat, gcp.lng], {
          radius: 5,
          color: "#0063b1",
          weight: 2,
          fillColor: "#66a3ff",
          fillOpacity: 0.8,
        }).bindTooltip(`GCP ${index + 1}`);
        state.gcpLayer.addLayer(marker);
      });
    },

    exportGeoJSON() {
      const geojson = state.polygons.exportGeoJSON();
      app.downloadFile("polygons.geojson", JSON.stringify(geojson, null, 2));
    },

    importGeoJSONFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const geojson = JSON.parse(reader.result);
          state.polygons.importGeoJSON(geojson);
          app.saveProject();
        } catch (error) {
          UI.setModeStatus("Invalid GeoJSON file.");
        }
      };
      reader.readAsText(file);
    },

    exportProject() {
      const payload = app.buildProject();
      app.downloadFile("idigmaps-project.json", JSON.stringify(payload, null, 2));
    },

    importProjectFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          app.applyProject(payload);
        } catch (error) {
          UI.setModeStatus("Invalid project file.");
        }
      };
      reader.readAsText(file);
    },

    buildProject() {
      return {
        version: 1,
        image: state.imageMeta,
        gcps: state.gcps,
        transform: {
          mode: state.transformMode,
          lambda: state.lambda,
        },
        overlay: state.overlay,
        polygons: state.polygons.exportGeoJSON(),
      };
    },

    applyProject(payload) {
      if (!payload) return;
      state.gcps = Array.isArray(payload.gcps) ? payload.gcps : [];
      state.lastMetrics = null;
      state.transformMode = payload.transform?.mode || "affine";
      state.lambda = payload.transform?.lambda ?? 0.001;
      state.overlay = { ...state.overlay, ...(payload.overlay || {}) };
      app.resetTransform();
      if (payload.polygons) {
        state.polygons.importGeoJSON(payload.polygons);
      }
      if (payload.image && !state.image) {
        UI.setImageMeta(`Expected image: ${payload.image.name} (${payload.image.width} x ${payload.image.height})`);
        UI.setImageHint("Load the matching image file to render the overlay.");
      }

      document.getElementById("transformMode").value = state.transformMode;
      document.getElementById("lambdaRange").value = state.lambda;
      document.getElementById("lambdaValue").value = state.lambda;
      document.getElementById("opacityRange").value = state.overlay.opacity;
      document.getElementById("resolutionRange").value = state.overlay.resolution;
      document.getElementById("overlayToggle").checked = state.overlay.visible;
      document.getElementById("meshToggle").checked = state.overlay.mesh;
      document.getElementById("gcpToggle").checked = true;
      document.getElementById("polygonToggle").checked = true;

      state.overlayLayer.setOpacity(state.overlay.opacity);
      state.overlayLayer.setGridSize(state.overlay.resolution);
      state.overlayLayer.setShowMesh(state.overlay.mesh);
      UI.updateOverlayDisplay(state.overlay.opacity, state.overlay.resolution);
      if (!state.overlay.visible) {
        state.map.removeLayer(state.overlayLayer);
      } else if (!state.map.hasLayer(state.overlayLayer)) {
        state.map.addLayer(state.overlayLayer);
      }

      app.updateUI();
      app.saveProject();
    },

    resetTransform() {
      state.transform = null;
      state.lastMetrics = null;
      state.overlayLayer.setTransform(null);
      UI.updateTransformMetrics(null);
    },

    restoreProject() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      try {
        const payload = JSON.parse(stored);
        app.applyProject(payload);
      } catch (error) {
        localStorage.removeItem(STORAGE_KEY);
      }
    },

    saveProject() {
      const payload = app.buildProject();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },

    downloadFile(name, content) {
      const blob = new Blob([content], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    },
  };

  window.addEventListener("load", () => app.init());
})();
