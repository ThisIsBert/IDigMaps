# IDigMaps

A lightweight, production-ready georeferencing tool that runs entirely in the browser (no build step, no server required). It lets you rubber-sheet a scanned map onto an interactive Leaflet map using GCPs, then digitize polygons and export GeoJSON.

## Run

### Option 1: Open directly (recommended for Firefox)
1. Open `index.html` directly in Firefox.
2. Load your image and begin creating GCPs.

> Some browsers restrict `file://` access to local images when drawing to canvas. Firefox is generally the most permissive, but if you see a warning about a blocked canvas, use the local server option below.

### Option 2: Local static server (best compatibility)
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

## How to use
1. **Load an image** (PNG/JPG) using the Image section.
2. **Add GCPs**: press **G** or click “Add GCP”, then click the image picker and the map.
3. **Compute a transform** (Affine or TPS). TPS works best with 6+ points.
4. **Adjust the overlay** opacity and resolution.
5. **Digitize polygons** with Leaflet.draw and export GeoJSON.
6. **Export/Import projects** to save GCPs, settings, and polygons (image bytes are not stored).

## Features
- Thin Plate Spline (TPS) and affine transforms (EPSG:3857 internal coordinates).
- Robust GCP management with residual error metrics.
- Mesh-warped overlay canvas aligned to Leaflet.
- Polygon drawing, editing, and GeoJSON export/import.
- Autosave to localStorage (no image bytes).

## Limitations
- Images are not embedded in project exports (you must reload the same file).
- TPS can be ill-conditioned if GCPs are clustered or duplicated; increase lambda or spread points.
- If `file://` canvas access is blocked, use the local server option.

## Files
- `index.html` - main UI
- `assets/app.js` - application state and orchestration
- `assets/ui.js` - UI wiring and image picker
- `assets/tps.js` - TPS + affine solvers
- `assets/warp.js` - mesh warping overlay
- `assets/gcp.js` - GCP state + residuals
- `assets/polygons.js` - Leaflet.draw integration
- `assets/styles.css` - styling
