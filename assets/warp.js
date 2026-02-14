window.Warp = (() => {
  const triangleTransform = (ctx, src, dst) => {
    const [x0, y0, x1, y1, x2, y2] = dst;
    const [u0, v0, u1, v1, u2, v2] = src;

    const denom = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(denom) < 1e-12) return false;

    const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / denom;
    const b = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / denom;
    const c = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / denom;

    const d = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / denom;
    const e = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / denom;
    const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / denom;

    ctx.setTransform(a, d, b, e, c, f);
    return true;
  };

  class WarpedImageLayer extends L.Layer {
    constructor(options = {}) {
      super();
      this.options = options;
      this.image = null;
      this.transform = null;
      this.controlPoints = [];
      this.gridSize = options.gridSize || 40;
      this.opacity = options.opacity || 0.8;
      this.showMesh = false;
      this._frame = null;
    }

    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "warped-image-layer");
      this._canvas.style.position = "absolute";
      this._canvas.style.top = "0";
      this._canvas.style.left = "0";
      this._canvas.style.pointerEvents = "none";
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("move zoom resize", this.requestRedraw, this);
      this.requestRedraw();
    }

    onRemove(map) {
      map.off("move zoom resize", this.requestRedraw, this);
      if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
      }
    }

    setImage(image) {
      this.image = image;
      this.requestRedraw();
    }

    setTransform(transform) {
      this.transform = transform;
      this.requestRedraw();
    }

    setControlPoints(points) {
      this.controlPoints = Array.isArray(points) ? points : [];
      this.requestRedraw();
    }

    setGridSize(size) {
      this.gridSize = size;
      this.requestRedraw();
    }

    setOpacity(opacity) {
      this.opacity = opacity;
      this.requestRedraw();
    }

    setShowMesh(show) {
      this.showMesh = show;
      this.requestRedraw();
    }

    requestRedraw() {
      if (!this._map) return;
      if (this._frame) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = null;
        this._redraw();
      });
    }

    _redraw() {
      const map = this._map;
      if (!map || !this._canvas) return;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      if (this._canvas.width !== size.x) {
        this._canvas.width = size.x;
      }
      if (this._canvas.height !== size.y) {
        this._canvas.height = size.y;
      }
      const ctx = this._canvas.getContext("2d");
      ctx.clearRect(0, 0, size.x, size.y);
      if (!this.image || !this.transform || !this.transform.eval) return;

      ctx.globalAlpha = this.opacity;
      const cols = this.gridSize;
      const w = this.image.width;
      const h = this.image.height;

      const uBreaks = this._buildBreaks(w, cols, this.controlPoints.map((point) => point.u));
      const vBreaks = this._buildBreaks(h, cols, this.controlPoints.map((point) => point.v));
      const projectedGrid = Array.from({ length: uBreaks.length }, () => Array(vBreaks.length).fill(null));
      for (let i = 0; i < uBreaks.length; i += 1) {
        for (let j = 0; j < vBreaks.length; j += 1) {
          projectedGrid[i][j] = this._projectPoint(uBreaks[i], vBreaks[j]);
        }
      }

      for (let i = 0; i < uBreaks.length - 1; i += 1) {
        for (let j = 0; j < vBreaks.length - 1; j += 1) {
          const u0 = uBreaks[i];
          const v0 = vBreaks[j];
          const u1 = uBreaks[i + 1];
          const v1 = vBreaks[j + 1];

          const p00 = projectedGrid[i][j];
          const p10 = projectedGrid[i + 1][j];
          const p01 = projectedGrid[i][j + 1];
          const p11 = projectedGrid[i + 1][j + 1];
          if (!(p00 && p10 && p01 && p11)) continue;
          const minX = Math.min(p00.x, p10.x, p01.x, p11.x);
          const maxX = Math.max(p00.x, p10.x, p01.x, p11.x);
          const minY = Math.min(p00.y, p10.y, p01.y, p11.y);
          const maxY = Math.max(p00.y, p10.y, p01.y, p11.y);
          if (maxX < 0 || maxY < 0 || minX > size.x || minY > size.y) {
            continue;
          }

          this._drawTriangle(ctx, [u0, v0, u1, v0, u1, v1], [p00, p10, p11]);
          this._drawTriangle(ctx, [u0, v0, u1, v1, u0, v1], [p00, p11, p01]);
        }
      }
    }

    _buildBreaks(maxValue, segments, extras) {
      const values = [0, maxValue];
      for (let i = 1; i < segments; i += 1) {
        values.push((i * maxValue) / segments);
      }
      extras.forEach((value) => {
        if (!Number.isFinite(value)) return;
        values.push(Math.min(Math.max(value, 0), maxValue));
      });
      values.sort((a, b) => a - b);
      const unique = [];
      const epsilon = 1e-6;
      values.forEach((value) => {
        if (!unique.length || Math.abs(value - unique[unique.length - 1]) > epsilon) {
          unique.push(value);
        }
      });
      return unique;
    }

    _projectPoint(u, v) {
      const result = this.transform.eval(u, v);
      if (!result) return null;
      const latlng = this.transform.toLatLng(result.x, result.y);
      if (!Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) {
        return null;
      }
      return this._map.latLngToContainerPoint(latlng);
    }

    _drawTriangle(ctx, src, dstPoints) {
      const dst = [
        dstPoints[0].x,
        dstPoints[0].y,
        dstPoints[1].x,
        dstPoints[1].y,
        dstPoints[2].x,
        dstPoints[2].y,
      ];

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dst[0], dst[1]);
      ctx.lineTo(dst[2], dst[3]);
      ctx.lineTo(dst[4], dst[5]);
      ctx.closePath();
      ctx.clip();
      if (!triangleTransform(ctx, src, dst)) {
        ctx.restore();
        return;
      }
      ctx.drawImage(this.image, 0, 0);
      if (this.showMesh) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  return { WarpedImageLayer };
})();
