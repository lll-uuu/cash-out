#!/usr/bin/env node
// Render snapshot JSON files to images, using every CPU core.
//
//   node render-frame.js --latest                      this hour's frame (frames/<id>.jpg), skipped if it exists
//   node render-frame.js --all --size 2400 --format png --out frames-print
//                                                      every hour at print size
//   node render-frame.js path/to/snapshot.json         one snapshot
//
// Options: --size N (square, default 1600) or --w N --h N, --ss N (supersampling, default 1.5 below 2000px,
// 1 above), --format jpg|png (default jpg), --out DIR (default frames), --palette brasil|contracts, --force.
// Snapshots are the master record: any frame can be re-rendered later, at any size, identically.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const E = require("./engine");

if (!isMainThread) {
  // worker: render a band of rows and hand the pixels back
  const { snap, W, H, y0, y1, ss, palette } = workerData;
  const B = E.build(snap, { palette });
  const out = new Uint8ClampedArray(W * (y1 - y0) * 4);
  E.renderRows(B, W, H, y0, y1, out, ss);
  parentPort.postMessage(out, [out.buffer]);
  return;
}

const { PNG } = require("pngjs");
const jpeg = require("jpeg-js");
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const flag = name => args.includes("--" + name);

const size = Number(opt("size", 1600));
const W = Number(opt("w", size)), H = Number(opt("h", size));
const ss = Number(opt("ss", Math.max(W, H) < 2000 ? 1.5 : 1));
const format = opt("format", "jpg");
const outDir = opt("out", "frames");
const palette = opt("palette", undefined);
const force = flag("force");

let files = args.filter((a, i) => a.endsWith(".json") && !["--out"].includes(args[i - 1]));
if (flag("latest")) files = ["data/latest.json"];
if (flag("all")) files = fs.readdirSync("data/snapshots").filter(f => f.endsWith(".json")).sort().map(f => path.join("data/snapshots", f));
if (!files.length) { console.error("Nothing to render. Pass --latest, --all, or a snapshot path."); process.exit(1); }

// fractional supersampling (e.g. 1.5): render at ss-scaled size with 1 sample, then box-filter down
function renderParallel(snap, w, h, sub) {
  const cores = Math.max(1, Math.min(os.cpus().length, 16));
  const bands = cores * 4, step = Math.ceil(h / bands);
  const full = new Uint8ClampedArray(w * h * 4);
  let next = 0;
  return new Promise((resolve, reject) => {
    let running = 0, done = 0;
    const launch = () => {
      if (next >= bands) return;
      const b = next++, y0 = b * step, y1 = Math.min(h, y0 + step);
      if (y0 >= h) { done++; if (done === bands) resolve(full); return launch(); }
      running++;
      const wk = new Worker(__filename, { workerData: { snap, W: w, H: h, y0, y1, ss: sub, palette } });
      wk.once("message", buf => { full.set(new Uint8ClampedArray(buf.buffer || buf), y0 * w * 4); });
      wk.once("error", reject);
      wk.once("exit", () => { running--; done++; if (done === bands) resolve(full); else launch(); });
    };
    for (let i = 0; i < cores; i++) launch();
  });
}

function downsample(src, sw, sh, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const fx = sw / dw, fy = sh / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const k = (yy * sw + xx) * 4; r += src[k]; g += src[k + 1]; b += src[k + 2]; n++;
    }
    const o = (y * dw + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    const snap = JSON.parse(fs.readFileSync(f, "utf8"));
    const target = path.join(outDir, `${snap.id}${palette ? "-" + palette : ""}.${format}`);
    if (fs.existsSync(target) && !force) { console.log("exists, skipping", target); continue; }
    const t0 = Date.now();
    let pixels;
    if (Number.isInteger(ss)) pixels = await renderParallel(snap, W, H, ss);
    else {
      const sw = Math.round(W * ss), sh = Math.round(H * ss);
      pixels = downsample(await renderParallel(snap, sw, sh, 1), sw, sh, W, H);
    }
    const data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    if (format === "png") {
      const png = new PNG({ width: W, height: H });
      data.copy(png.data);
      fs.writeFileSync(target, PNG.sync.write(png, { colorType: 2 }));
    } else fs.writeFileSync(target, jpeg.encode({ data, width: W, height: H }, 88).data);
    console.log(`rendered ${target} (${W}x${H}, ${(snap.trades || []).length} trades) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
})().catch(e => { console.error(e); process.exit(1); });
