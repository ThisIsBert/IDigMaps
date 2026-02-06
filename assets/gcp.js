window.GCP = (() => {
  const create = (u, v, lat, lng) => ({
    id: crypto.randomUUID(),
    u,
    v,
    lat,
    lng,
    residual: null,
  });

  const toProjected = (lat, lng) => {
    const point = L.CRS.EPSG3857.project(L.latLng(lat, lng));
    return { x: point.x, y: point.y };
  };

  const computeResiduals = (gcps, transform) => {
    if (!transform) return { rms: null, max: null };
    let sum = 0;
    let max = 0;
    let count = 0;
    gcps.forEach((gcp) => {
      const projected = transform.eval(gcp.u, gcp.v);
      if (!projected) {
        gcp.residual = null;
        return;
      }
      const target = toProjected(gcp.lat, gcp.lng);
      const dx = projected.x - target.x;
      const dy = projected.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      gcp.residual = dist;
      sum += dist * dist;
      max = Math.max(max, dist);
      count += 1;
    });
    const rms = count ? Math.sqrt(sum / count) : null;
    return { rms, max };
  };

  const detectDuplicates = (gcps, threshold = 2) => {
    const warnings = [];
    for (let i = 0; i < gcps.length; i += 1) {
      for (let j = i + 1; j < gcps.length; j += 1) {
        const a = gcps[i];
        const b = gcps[j];
        const du = Math.hypot(a.u - b.u, a.v - b.v);
        const dm = Math.hypot(a.lat - b.lat, a.lng - b.lng);
        if (du < threshold) {
          warnings.push(`Image points ${i + 1} and ${j + 1} are very close.`);
        }
        if (dm < threshold * 1e-5) {
          warnings.push(`Map points ${i + 1} and ${j + 1} are very close.`);
        }
      }
    }
    return warnings;
  };

  return {
    create,
    computeResiduals,
    detectDuplicates,
    toProjected,
  };
})();
