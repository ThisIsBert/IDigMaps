window.TPS = (() => {
  const EPS = 1e-12;

  const toMatrix = (n, fill = 0) => Array.from({ length: n }, () => Array(n).fill(fill));

  const gaussianElimination = (A, b) => {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i += 1) {
      let maxRow = i;
      for (let k = i + 1; k < n; k += 1) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
          maxRow = k;
        }
      }
      if (Math.abs(M[maxRow][i]) < EPS) {
        return null;
      }
      if (maxRow !== i) {
        [M[i], M[maxRow]] = [M[maxRow], M[i]];
      }

      const pivot = M[i][i];
      for (let j = i; j <= n; j += 1) {
        M[i][j] /= pivot;
      }

      for (let k = 0; k < n; k += 1) {
        if (k === i) continue;
        const factor = M[k][i];
        for (let j = i; j <= n; j += 1) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }

    return M.map((row) => row[n]);
  };

  const U = (r2) => r2 * Math.log(r2 + EPS);

  const buildTPS = (points, lambda = 0) => {
    const n = points.length;
    const dim = n + 3;
    const K = toMatrix(dim, 0);

    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const dx = points[i].u - points[j].u;
        const dy = points[i].v - points[j].v;
        const r2 = dx * dx + dy * dy;
        K[i][j] = U(r2);
      }
      K[i][i] += lambda;
      K[i][n] = 1;
      K[i][n + 1] = points[i].u;
      K[i][n + 2] = points[i].v;
      K[n][i] = 1;
      K[n + 1][i] = points[i].u;
      K[n + 2][i] = points[i].v;
    }

    const rhsX = Array(dim).fill(0);
    const rhsY = Array(dim).fill(0);
    for (let i = 0; i < n; i += 1) {
      rhsX[i] = points[i].x;
      rhsY[i] = points[i].y;
    }

    const coeffX = gaussianElimination(K, rhsX);
    const coeffY = gaussianElimination(K, rhsY);

    if (!coeffX || !coeffY) {
      return null;
    }

    return { coeffX, coeffY, points };
  };

  const evalTPS = (model, u, v) => {
    const n = model.points.length;
    let x = model.coeffX[n] + model.coeffX[n + 1] * u + model.coeffX[n + 2] * v;
    let y = model.coeffY[n] + model.coeffY[n + 1] * u + model.coeffY[n + 2] * v;

    for (let i = 0; i < n; i += 1) {
      const dx = u - model.points[i].u;
      const dy = v - model.points[i].v;
      const r2 = dx * dx + dy * dy;
      const basis = U(r2);
      x += model.coeffX[i] * basis;
      y += model.coeffY[i] * basis;
    }

    return { x, y };
  };

  const solveAffine = (points) => {
    if (points.length < 3) return null;
    const A = points.map((p) => [1, p.u, p.v]);
    const AtA = toMatrix(3, 0);
    const AtbX = Array(3).fill(0);
    const AtbY = Array(3).fill(0);

    for (let i = 0; i < A.length; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        for (let k = 0; k < 3; k += 1) {
          AtA[j][k] += A[i][j] * A[i][k];
        }
        AtbX[j] += A[i][j] * points[i].x;
        AtbY[j] += A[i][j] * points[i].y;
      }
    }

    const coeffX = gaussianElimination(AtA.map((row) => [...row]), AtbX);
    const coeffY = gaussianElimination(AtA.map((row) => [...row]), AtbY);
    if (!coeffX || !coeffY) return null;
    return { coeffX, coeffY };
  };

  const evalAffine = (model, u, v) => {
    const x = model.coeffX[0] + model.coeffX[1] * u + model.coeffX[2] * v;
    const y = model.coeffY[0] + model.coeffY[1] * u + model.coeffY[2] * v;
    return { x, y };
  };

  return {
    buildTPS,
    evalTPS,
    solveAffine,
    evalAffine,
  };
})();
