// «ИИ-фильтр» сигналов: логистическая регрессия «будет ли сделка прибыльной после издержек».
// Обучение walk-forward: модель для года Y обучается только на сделках, закрытых до 1 января Y.

export function fitLogistic(X, y, { l2 = 1e-2, iters = 400, lr = 0.1 } = {}) {
  const n = X.length, k = X[0]?.length ?? 0;
  const mu = Array(k).fill(0), sd = Array(k).fill(1);
  for (let j = 0; j < k; j++) {
    mu[j] = X.reduce((a, r) => a + r[j], 0) / n;
    sd[j] = Math.sqrt(X.reduce((a, r) => a + (r[j] - mu[j]) ** 2, 0) / n) || 1;
  }
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const w = Array(k).fill(0); let b = 0;
  const sig = (z) => 1 / (1 + Math.exp(-z));
  for (let it = 0; it < iters; it++) {
    const gw = Array(k).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const p = sig(Z[i].reduce((a, v, j) => a + v * w[j], b));
      const e = p - y[i];
      for (let j = 0; j < k; j++) gw[j] += e * Z[i][j];
      gb += e;
    }
    for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * gb / n;
  }
  const predict = (x) => sig(x.reduce((a, v, j) => a + ((v - mu[j]) / sd[j]) * w[j], b));
  return { w, b, mu, sd, predict, n, base: y.reduce((a, v) => a + v, 0) / n };
}

// trades: сделки «прохода без фильтра» с полем feat. Возвращает filter(feat, t) → вероятность.
// До накопления minTrades сделок фильтр пропускает всё (возвращает 1).
export function walkForwardFilter(trades, { minTrades = 150, quantile = null } = {}) {
  const withFeat = trades.filter((t) => t.feat);
  const years = [...new Set(withFeat.map((t) => +t.entryT.slice(0, 4)))].sort();
  const models = new Map();
  for (let Y = years[0]; Y <= years.at(-1) + 1; Y++) {
    const train = withFeat.filter((t) => t.exitT.slice(0, 4) < String(Y));
    if (train.length < minTrades) continue;
    const m = fitLogistic(train.map((t) => t.feat), train.map((t) => (t.pnl - t.costs > 0 ? 1 : 0)));
    // порог по квантилю обучающей выборки: отсекаем худшие (1 − quantile) сигналов
    if (quantile != null) {
      const ps = train.map((t) => m.predict(t.feat)).sort((a, b) => a - b);
      m.cut = ps[Math.floor(ps.length * (1 - quantile))];
    }
    models.set(Y, m);
  }
  const fn = (feat, t) => {
    const m = models.get(+String(t).slice(0, 4));
    if (!m) return 1;
    const p = m.predict(feat);
    return m.cut != null ? (p >= m.cut ? 1 : 0) : p;
  };
  fn.models = models;
  return fn;
}
