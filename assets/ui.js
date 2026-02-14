window.UI = (() => {
  const state = {
    canvas: null,
    ctx: null,
    image: null,
    imageGcps: [],
    highlightedGcpId: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragStart: null,
    pickMarker: null,
    pendingPick: false,
  };

  const elements = {};

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const eventToCanvasPoint = (event) => {
    const { canvas } = state;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: 0, y: 0 };
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const screenToImage = (x, y) => {
    const u = (x - state.offsetX) / state.scale;
    const v = (y - state.offsetY) / state.scale;
    return { u, v };
  };

  const drawImagePicker = () => {
    const { ctx, canvas } = state;
    if (!ctx || !canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.image) {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#777";
      ctx.fillText("No image loaded", 12, 20);
      return;
    }

    ctx.setTransform(state.scale, 0, 0, state.scale, state.offsetX, state.offsetY);
    ctx.drawImage(state.image, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    state.imageGcps.forEach((gcp, index) => {
      const x = gcp.u * state.scale + state.offsetX;
      const y = gcp.v * state.scale + state.offsetY;
      const highlighted = gcp.id === state.highlightedGcpId;
      ctx.fillStyle = highlighted ? "#b60000" : "#0063b1";
      ctx.beginPath();
      ctx.arc(x, y, highlighted ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText(String(index + 1), x + 6, y - 6);
    });

    if (state.pickMarker) {
      const x = state.pickMarker.u * state.scale + state.offsetX;
      const y = state.pickMarker.v * state.scale + state.offsetY;
      ctx.strokeStyle = "#d11";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const setImage = (img) => {
    state.image = img;
    state.pickMarker = null;
    resetView();
  };

  const setImageGcps = (gcps, highlightedId = null) => {
    state.imageGcps = Array.isArray(gcps)
      ? gcps
        .filter((gcp) => Number.isFinite(gcp.u) && Number.isFinite(gcp.v))
        .map((gcp) => ({ id: gcp.id, u: gcp.u, v: gcp.v }))
      : [];
    state.highlightedGcpId = highlightedId;
    drawImagePicker();
  };

  const resetView = () => {
    const { canvas } = state;
    if (!canvas) return;
    if (!state.image) {
      state.scale = 1;
      state.offsetX = 0;
      state.offsetY = 0;
      drawImagePicker();
      return;
    }
    const scaleX = canvas.width / state.image.width;
    const scaleY = canvas.height / state.image.height;
    state.scale = Math.min(scaleX, scaleY, 1);
    state.offsetX = (canvas.width - state.image.width * state.scale) / 2;
    state.offsetY = (canvas.height - state.image.height * state.scale) / 2;
    drawImagePicker();
  };

  const attachCanvasEvents = (app) => {
    const { canvas } = state;
    canvas.addEventListener("mousedown", (event) => {
      const point = eventToCanvasPoint(event);
      state.dragging = true;
      state.dragStart = { x: point.x, y: point.y, ox: state.offsetX, oy: state.offsetY };
    });

    canvas.addEventListener("mousemove", (event) => {
      if (!state.dragging) return;
      const point = eventToCanvasPoint(event);
      const dx = point.x - state.dragStart.x;
      const dy = point.y - state.dragStart.y;
      state.offsetX = state.dragStart.ox + dx;
      state.offsetY = state.dragStart.oy + dy;
      drawImagePicker();
    });

    canvas.addEventListener("mouseup", () => {
      state.dragging = false;
    });

    canvas.addEventListener("mouseleave", () => {
      state.dragging = false;
    });

    canvas.addEventListener("wheel", (event) => {
      if (!state.image) return;
      event.preventDefault();
      const zoom = event.deltaY < 0 ? 1.1 : 0.9;
      const point = eventToCanvasPoint(event);
      const { u, v } = screenToImage(point.x, point.y);
      const newScale = clamp(state.scale * zoom, 0.1, 10);
      state.offsetX = point.x - u * newScale;
      state.offsetY = point.y - v * newScale;
      state.scale = newScale;
      drawImagePicker();
    });

    canvas.addEventListener("click", (event) => {
      if (!app.isWaitingForImage()) return;
      if (!state.image) {
        app.setModeStatus("Load an image before picking image points.");
        return;
      }
      const point = eventToCanvasPoint(event);
      const { u, v } = screenToImage(point.x, point.y);
      const clampedU = clamp(u, 0, state.image.width);
      const clampedV = clamp(v, 0, state.image.height);
      state.pickMarker = { u: clampedU, v: clampedV };
      drawImagePicker();
      app.onImagePicked(clampedU, clampedV);
    });
  };

  const renderGcpTable = (gcps, metrics) => {
    elements.gcpTable.innerHTML = "";
    if (!gcps.length) {
      elements.gcpTable.textContent = "No GCPs yet.";
      return;
    }
    gcps.forEach((gcp, index) => {
      const row = document.createElement("div");
      row.className = "gcp-row";
      if (gcp.residual !== null && metrics && metrics.max && gcp.residual > metrics.max * 0.6) {
        row.classList.add("high-error");
      }
      row.innerHTML = `
        <strong>${index + 1}</strong>
        <div>u:${gcp.u.toFixed(1)}<br>v:${gcp.v.toFixed(1)}</div>
        <div>lat:${gcp.lat.toFixed(6)}<br>lng:${gcp.lng.toFixed(6)}</div>
        <div>${gcp.residual === null ? "-" : `${gcp.residual.toFixed(2)} m`}</div>
        <div class="gcp-actions">
          <button data-action="edit-image" data-id="${gcp.id}">Img</button>
          <button data-action="edit-map" data-id="${gcp.id}">Map</button>
          <button data-action="delete" data-id="${gcp.id}">Del</button>
        </div>
      `;
      elements.gcpTable.appendChild(row);
    });
  };

  const attachGcpActions = (app) => {
    elements.gcpTable.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "edit-image") {
        app.startEditGcpImage(id);
      } else if (button.dataset.action === "edit-map") {
        app.startEditGcpMap(id);
      } else if (button.dataset.action === "delete") {
        app.deleteGcp(id);
      }
    });
  };

  const setModeStatus = (text) => {
    elements.modeStatus.textContent = text;
  };

  const setImageMeta = (meta) => {
    elements.imageMeta.textContent = meta;
  };

  const setImageHint = (text) => {
    elements.imageHint.textContent = text;
  };

  const updateTransformMetrics = (metrics) => {
    if (!metrics || metrics.rms === null) {
      elements.transformMetrics.textContent = "No transform computed.";
      return;
    }
    elements.transformMetrics.textContent = `RMS: ${metrics.rms.toFixed(2)} m | Max: ${metrics.max.toFixed(2)} m`;
  };

  const updateOverlayDisplay = (opacity, resolution) => {
    elements.opacityValue.textContent = opacity.toFixed(2);
    elements.resolutionValue.textContent = resolution.toFixed(0);
  };

  const bindInputs = (app) => {
    elements.startGcp.addEventListener("click", () => app.startNewGcp());
    elements.computeTransform.addEventListener("click", () => app.computeTransform());
    elements.clearImage.addEventListener("click", () => app.clearImage());
    elements.resetImageView.addEventListener("click", () => resetView());

    elements.imageInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) app.loadImage(file);
      event.target.value = "";
    });

    elements.transformMode.addEventListener("change", (event) => {
      app.setTransformMode(event.target.value);
    });

    const onLambdaChange = (value) => {
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        elements.lambdaRange.value = num;
        elements.lambdaValue.value = num;
        app.setLambda(num);
      }
    };

    elements.lambdaRange.addEventListener("input", (event) => onLambdaChange(event.target.value));
    elements.lambdaValue.addEventListener("input", (event) => onLambdaChange(event.target.value));

    elements.opacityRange.addEventListener("input", (event) => app.setOpacity(parseFloat(event.target.value)));
    elements.resolutionRange.addEventListener("input", (event) => app.setResolution(parseInt(event.target.value, 10)));
    elements.overlayToggle.addEventListener("change", (event) => app.toggleOverlay(event.target.checked));
    elements.meshToggle.addEventListener("change", (event) => app.toggleMesh(event.target.checked));
    elements.gcpToggle.addEventListener("change", (event) => app.toggleGcpLayer(event.target.checked));
    elements.polygonToggle.addEventListener("change", (event) => app.togglePolygonLayer(event.target.checked));

    elements.exportGeojson.addEventListener("click", () => app.exportGeoJSON());
    elements.importGeojson.addEventListener("click", () => elements.geojsonFileInput.click());
    elements.geojsonFileInput.addEventListener("change", (event) => app.importGeoJSONFile(event));

    elements.exportProject.addEventListener("click", () => app.exportProject());
    elements.importProject.addEventListener("click", () => elements.projectFileInput.click());
    elements.projectFileInput.addEventListener("change", (event) => app.importProjectFile(event));
  };

  const init = (app) => {
    elements.imageInput = document.getElementById("imageInput");
    elements.clearImage = document.getElementById("clearImage");
    elements.imageCanvas = document.getElementById("imageCanvas");
    elements.imageMeta = document.getElementById("imageMeta");
    elements.imageHint = document.getElementById("imageHint");
    elements.modeStatus = document.getElementById("modeStatus");
    elements.startGcp = document.getElementById("startGcp");
    elements.gcpTable = document.getElementById("gcpTable");
    elements.transformMode = document.getElementById("transformMode");
    elements.lambdaRange = document.getElementById("lambdaRange");
    elements.lambdaValue = document.getElementById("lambdaValue");
    elements.computeTransform = document.getElementById("computeTransform");
    elements.transformMetrics = document.getElementById("transformMetrics");
    elements.opacityRange = document.getElementById("opacityRange");
    elements.opacityValue = document.getElementById("opacityValue");
    elements.resolutionRange = document.getElementById("resolutionRange");
    elements.resolutionValue = document.getElementById("resolutionValue");
    elements.overlayToggle = document.getElementById("overlayToggle");
    elements.meshToggle = document.getElementById("meshToggle");
    elements.gcpToggle = document.getElementById("gcpToggle");
    elements.polygonToggle = document.getElementById("polygonToggle");
    elements.resetImageView = document.getElementById("resetImageView");
    elements.exportGeojson = document.getElementById("exportGeojson");
    elements.importGeojson = document.getElementById("importGeojson");
    elements.geojsonFileInput = document.getElementById("geojsonFileInput");
    elements.exportProject = document.getElementById("exportProject");
    elements.importProject = document.getElementById("importProject");
    elements.projectFileInput = document.getElementById("projectFileInput");

    state.canvas = elements.imageCanvas;
    state.ctx = state.canvas.getContext("2d");

    attachCanvasEvents(app);
    bindInputs(app);
    attachGcpActions(app);
    drawImagePicker();
  };

  return {
    init,
    setImage,
    resetView,
    drawImagePicker,
    renderGcpTable,
    setModeStatus,
    setImageMeta,
    setImageHint,
    updateTransformMetrics,
    updateOverlayDisplay,
    setImageGcps,
    setPickMarker(marker) {
      state.pickMarker = marker;
      drawImagePicker();
    },
    getCanvasContext() {
      return state.ctx;
    },
  };
})();
