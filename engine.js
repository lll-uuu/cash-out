// Cash Out marbling engine. A snapshot's last 24 hours of trades become the history of a marbling bath:
// ink drops, comb strokes and swirls. Each pixel is traced backwards through that history until it
// lands in a drop, so the image is exact at any resolution and identical across sizes.
// Runs unchanged in the browser (window.CashOutEngine) and in Node (require).
//
// Reading the bath (default "brasil" palette):
//   red ink                 bets on Lula (buying Lula Yes or selling Flávio Yes)
//   yellow and green ink    bets on Flávio (the flag's amarelo and verde)
//   pearl / cream ink       $1,000+ trades by wallets flagged as whales or freshly created: interference,
//                           softly edged in red (backing Lula) or yellow/green (backing Flávio)
//   where a wallet's ink lands, its exact hue, saturation, lightness and opacity: the wallet address
//   how much ink            the stake (more and larger drops, ringed stones for big ones)
//   comb strokes            one pass per hour, pulled in proportion to that hour's odds
//   round stones on top     the last two hours, not yet combed
//   swirls                  whales and fresh wallets stirring the bath
//   wave strokes            sudden swings in the odds
//   dark specks             transaction hashes, pinholes through to the bath
//   the bath (ground)       pUSD, Polymarket's collateral, taken almost to black
(function (root) {
  "use strict";

  const PALETTES = {
    brasil: {
      lula:   { bands: [{ hue: 0, spread: 9, s: [0.78, 1], l: [0.3, 0.5] }], ring: { dh: 9, dl: 0.05 } },
      flavio: { bands: [
        { hue: 50,  spread: 6,  s: [0.85, 1], l: [0.5, 0.62], weight: 0.42 },
        { hue: 138, spread: 14, s: [0.7, 1],  l: [0.24, 0.5], weight: 0.58 },
      ], ring: { dh: -4, dl: 0.08 } },
      whale:  { bands: [{ hue: 42,  spread: 14, s: [0.08, 0.45], l: [0.84, 0.97] }], ring: { dh: 0, dl: 0.02 }, a: [0.93, 1] },
      fresh:  { bands: [{ hue: 205, spread: 20, s: [0.08, 0.35], l: [0.86, 0.97] }], ring: { dh: 0, dl: 0.02 }, a: [0.93, 1] },
      ground: [22, 10, 28], speck: [24, 10, 26],
    },
    contracts: {
      lula:   { bands: [{ hue: 205, spread: 38, s: [0.55, 1], l: [0.3, 0.78] }], ring: { dh: 0, dl: 0.16 } },
      flavio: { bands: [{ hue: 312, spread: 30, s: [0.55, 1], l: [0.3, 0.78] }], ring: { dh: 0, dl: 0.16 } },
      whale:  { bands: [{ hue: 358, spread: 16, s: [0.55, 1], l: [0.3, 0.78] }], ring: { dh: 0, dl: 0.16 } },
      fresh:  { bands: [{ hue: 75,  spread: 12, s: [0.7, 1],  l: [0.45, 0.7] }],  ring: { dh: 0, dl: 0.12 } },
      ground: [22, 10, 28], speck: [246, 238, 222],
    },
  };

  const STONE_HOURS = 2;      // the newest hours stay uncombed
  const COVERAGE = 2.1;       // ink covers the bath about twice over
  const STRIDE = 13;          // floats per operation

  const hexv = (w, a, b) => parseInt(w.slice(2 + a, 2 + b), 16) || 0;
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  // bytes of a transaction hash in [0,1); falls back to a hash of the trade if the tx is missing
  function byteFn(trade) {
    const tx = trade[4];
    if (tx && tx.length >= 66) return i => parseInt(tx.slice(2 + (i % 32) * 2, 4 + (i % 32) * 2), 16) / 255;
    const seed = fnv(trade[1] + ":" + trade[0] + ":" + trade[2]);
    return i => (Math.imul(seed ^ (i * 0x9E3779B1), 0x85EBCA6B) >>> 0) / 4294967296;
  }

  function inkFor(P, wallet, fam, ring) {
    const F = P[fam];
    const pick = hexv(wallet, 16, 18) / 255;
    let acc = 0, band = F.bands[F.bands.length - 1];
    for (const b of F.bands) { acc += b.weight || 1 / F.bands.length; if (pick < acc) { band = b; break; } }
    const u = (a, b) => hexv(wallet, a, b) / 255;
    const h = band.hue + (u(8, 10) - 0.5) * 2 * band.spread + F.ring.dh * ring;
    const sat = band.s[0] + (band.s[1] - band.s[0]) * u(10, 12);
    const l = Math.min(0.97, band.l[0] + (band.l[1] - band.l[0]) * u(12, 14) + F.ring.dl * ring);
    const ar = F.a || [0.62, 1];
    return { c: hsl(h, sat, l), a: ar[0] + (ar[1] - ar[0]) * u(14, 16) };
  }

  // Build the bath's history in unit coordinates (the image is the square [0,1] x [0,1]).
  function build(snap, opts) {
    opts = opts || {};
    const P = PALETTES[opts.palette || snap.palette || "brasil"];
    const trades = (snap.trades || []).slice().sort((a, b) => a[0] - b[0]);
    const ops = [], meta = [];
    const push = (...v) => { while (v.length < STRIDE) v.push(0); ops.push(...v); };
    // a drop may carry a coloured rim: [rimR, rimG, rimB, rim width as a fraction of the radius]
    const drop = (cx, cy, r, ink, m, rim) => {
      const rc = rim ? rim.c : [0, 0, 0], rw = rim ? rim.w : 0;
      push(0, cx, cy, r * r, ink.c[0], ink.c[1], ink.c[2], ink.a, meta.length, rc[0], rc[1], rc[2], rw);
      meta.push(m);
    };
    const tine = (bx, by, mx, my, z, lam) => push(1, bx, by, mx, my, -my, mx, z, lam);
    const wave = (mx, my, A, lam, phi) => push(2, mx, my, -my, mx, A, 2 * Math.PI / lam, phi);
    const swirl = (cx, cy, th, R) => push(3, cx, cy, th, R * R);

    const flagged = new Map();
    for (const a of snap.anomalies || []) if (a.wallet && (a.kind === "whale" || a.kind === "fresh")) flagged.set(a.wallet, a.kind);
    const swingHours = new Set((snap.anomalies || []).filter(a => a.kind === "swing").map(a => Math.floor(a.ts / 3600)));
    const shareAt = new Map((snap.shareHistory || []).map(([h, s]) => [h, s]));
    const lastShare = h => { for (let k = h; k > h - 48; k--) if (shareAt.has(k)) return shareAt.get(k); return snap.share; };

    const endHour = Math.floor(snap.ts / 3600);
    const rawR = t => Math.pow(t[2] + 4, 0.3);
    const dropsFor = t => Math.min(7, 1 + Math.floor(Math.log2(1 + t[2] / 15)));
    const area = trades.reduce((a, t) => a + dropsFor(t) * rawR(t) ** 2 * 0.75, 0) || 1;
    const SCALE = Math.sqrt(COVERAGE / Math.PI / area);

    let pass = 0;
    function comb(h) {
      const lulaP = lastShare(h), flavioP = 1 - lulaP;
      const d = pass % 2 ? -1 : 1;
      wave(1, 0, d * 0.03 * (0.4 + flavioP), 1 / (4 + (pass % 4)), pass * 1.3);
      for (let k = 0; k < 4; k++) tine(0, (k + 0.5) / 4 + (pass % 3) * 0.06, 1, 0, d * (k % 2 ? -1 : 1) * 0.06 * flavioP, 0.03);
      for (let k = 0; k < 3; k++) tine((k + 0.5) / 3, 0, 0, 1, d * (k % 2 ? 1 : -1) * 0.06 * lulaP, 0.03);
      if (pass % 3 === 2) wave(0, 1, 0.02 * (0.4 + lulaP), 1 / 6, pass);
      if (swingHours.has(h)) {                        // a swing: a bouquet stroke across the whole bath
        for (let k = 0; k < 24; k++) tine((k + 0.5) / 24, 0, 0, 1, (k % 2 ? 1 : -1) * 0.025, 0.006);
        wave(1, 0, 0.05, 1 / 3, pass * 2.1);
      }
      pass++;
    }

    let hour = trades.length ? Math.floor(trades[0][0] / 3600) : endHour;
    const advanceTo = h => { while (hour < h) { if (hour <= endHour - STONE_HOURS) comb(hour); hour++; } };
    trades.forEach((t, ti) => {
      advanceTo(Math.floor(t[0] / 3600));
      const [ts, wallet, usd, side] = t;
      const B = byteFn(t);
      const cx0 = 0.04 + 0.92 * hexv(wallet, 0, 4) / 65535;
      const cy0 = 0.04 + 0.92 * hexv(wallet, 4, 8) / 65535;
      // pearl marks the interfering moves themselves: a flagged wallet's trades of $1,000 or more
      const fam = flagged.has(wallet) && usd >= 1000 ? flagged.get(wallet) : side;
      const r = rawR(t) * SCALE;
      const m = { trade: ti, kind: fam };
      if (usd < 3) { drop(cx0, cy0, r * 0.7, { c: P.speck, a: 0.95 }, { trade: ti, kind: "speck" }); return; }
      const n = dropsFor(t);
      // interference keeps its pearl, but every ring of it is edged in the ink of the side it backs
      const edge = fam === "whale" || fam === "fresh" ? { c: inkFor(P, wallet, side, 0).c, w: 0.3 } : null;
      for (let i = 0; i < n; i++) {
        const ang = B(i * 2) * Math.PI * 2, dist = i ? r * (0.9 + 1.6 * B(i * 2 + 1)) : 0;
        const cx = cx0 + Math.cos(ang) * dist, cy = cy0 + Math.sin(ang) * dist;
        const ri = r * (i ? 0.55 + 0.45 * B(20 + i) : 1);
        drop(cx, cy, ri, inkFor(P, wallet, fam, i * 0.2), m, edge);
        if (ri > 0.02) drop(cx, cy, ri * 0.55, inkFor(P, wallet, fam, 1), m);
        if (ri > 0.035) drop(cx, cy, ri * 0.28, inkFor(P, wallet, fam, 2), m);
      }
      if (fam === "whale" || fam === "fresh") swirl(cx0, cy0, 1.6, r * 4);
    });
    advanceTo(endHour + 1);
    // specks: every transaction hash throws one or two pinholes across the surface
    trades.forEach((t, ti) => {
      const B = byteFn(t);
      const k = 1 + (B(30) > 0.6 ? 1 : 0);
      for (let i = 0; i < k; i++) drop(B(9 + i * 3), B(10 + i * 3), 0.0018 + 0.006 * Math.pow(B(11 + i * 3), 3), { c: P.speck, a: 0.92 }, { trade: ti, kind: "speck" });
    });
    return { ops: Float64Array.from(ops), count: ops.length / STRIDE, meta, ground: P.ground, trades };
  }

  // Trace one point (unit coords) back through the history. Writes rgb into out[o..o+2].
  // Returns the meta index of the first drop hit (or -1).
  function trace(B, px, py, out, o) {
    const ops = B.ops;
    let R = 0, G = 0, Bl = 0, T = 1, hit = -1;
    for (let i = B.count - 1; i >= 0 && T > 0.03; i--) {
      const j = i * STRIDE, t = ops[j];
      if (t === 0) {
        const dx = px - ops[j + 1], dy = py - ops[j + 2], d2 = dx * dx + dy * dy, r2 = ops[j + 3];
        if (d2 < r2) {
          const q = Math.sqrt(d2 / r2);
          const a = ops[j + 7] * T, rw = ops[j + 12];
          const rim = q > 0.9 ? 0.78 + 2.2 * (1 - q) : 1;      // pigment gathers at the rim
          let cr = ops[j + 4], cg = ops[j + 5], cb = ops[j + 6];
          if (rw > 0 && q > 1 - rw) {
            // a whale's or new wallet's pearl drop: the ink of the side it backs bleeds in softly from the edge
            let e = (q - (1 - rw)) / rw; e = e * e * (3 - 2 * e);
            cr += (ops[j + 9] - cr) * e; cg += (ops[j + 10] - cg) * e; cb += (ops[j + 11] - cb) * e;
          }
          R += a * cr * rim; G += a * cg * rim; Bl += a * cb * rim;
          T *= 1 - ops[j + 7];
          if (hit < 0) hit = ops[j + 8];
          px = ops[j + 1] + dx * 0.5; py = ops[j + 2] + dy * 0.5;   // older ink glimpsed through the glaze
        } else {
          // far from a drop the displacement is tiny: a series expansion avoids the square root
          const e = r2 / d2;
          const k = e < 0.01 ? 1 - e * (0.5 + 0.125 * e) : Math.sqrt(1 - e);
          px = ops[j + 1] + dx * k; py = ops[j + 2] + dy * k;
        }
      } else if (t === 1) {
        const dist = Math.abs((px - ops[j + 1]) * ops[j + 5] + (py - ops[j + 2]) * ops[j + 6]);
        const s = ops[j + 7] * ops[j + 8] / (dist + ops[j + 8]);
        px -= s * ops[j + 3]; py -= s * ops[j + 4];
      } else if (t === 2) {
        const s = ops[j + 5] * Math.sin((px * ops[j + 3] + py * ops[j + 4]) * ops[j + 6] + ops[j + 7]);
        px -= s * ops[j + 1]; py -= s * ops[j + 2];
      } else {
        const dx = px - ops[j + 1], dy = py - ops[j + 2];
        const th = -ops[j + 3] * Math.exp(-(dx * dx + dy * dy) / ops[j + 4]);
        const c = Math.cos(th), s = Math.sin(th);
        px = ops[j + 1] + dx * c - dy * s; py = ops[j + 2] + dx * s + dy * c;
      }
    }
    out[o] = R + T * B.ground[0]; out[o + 1] = G + T * B.ground[1]; out[o + 2] = Bl + T * B.ground[2];
    return hit;
  }

  const tooth = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
  };

  // Render rows [y0, y1) of a W x H image into out (RGBA, row y0 at offset 0).
  // ss = supersampling per axis (1, 2 ...). The square bath is centred and covers the longer side.
  function renderRows(B, W, H, y0, y1, out, ss) {
    ss = ss || 1;
    const M = Math.max(W, H), ox = (M - W) / 2, oy = (M - H) / 2;
    const tmp = [0, 0, 0], n = ss * ss;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        trace(B, (x + ox + (sx + 0.5) / ss) / M, (y + oy + (sy + 0.5) / ss) / M, tmp, 0);
        r += tmp[0]; g += tmp[1]; b += tmp[2];
      }
      const k = ((y - y0) * W + x) * 4, grain = tooth(x, y) * 7;
      out[k] = Math.max(0, Math.min(255, r / n + grain));
      out[k + 1] = Math.max(0, Math.min(255, g / n + grain));
      out[k + 2] = Math.max(0, Math.min(255, b / n + grain));
      out[k + 3] = 255;
    }
    return out;
  }

  function render(snap, W, H, opts) {
    opts = opts || {};
    const B = opts.built || build(snap, opts);
    const out = opts.out || new Uint8ClampedArray(W * H * 4);
    return renderRows(B, W, H, 0, H, out, opts.ss || 1);
  }

  // Which trade's ink is at pixel (x, y) of a W x H render.
  function inspect(snap, W, H, x, y, opts) {
    const B = (opts && opts.built) || build(snap, opts);
    const M = Math.max(W, H);
    const hit = trace(B, (x + (M - W) / 2 + 0.5) / M, (y + (M - H) / 2 + 0.5) / M, [0, 0, 0], 0);
    if (hit < 0) return null;
    const m = B.meta[hit], t = B.trades[m.trade];
    return { kind: m.kind, ts: t[0], wallet: t[1], usd: t[2], side: t[3], tx: t[4] || null };
  }

  const api = { build, render, renderRows, inspect, PALETTES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CashOutEngine = api;
})(typeof self !== "undefined" ? self : this);
