// Build a snapshot from CSV exports of Polymarket trades (used for the preview,
// and handy if you ever want to marble a frame from a manual export).
//   node scripts/sample-from-csv.js lula.csv flavio.csv <lulaPrice> <flavioPrice> > snapshot.json
const fs = require("fs");
const L = require("../lib");

const [lulaCsv, flavioCsv, pL, pF] = process.argv.slice(2);
const read = (file, market) => {
  const [head, ...rows] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return rows.map(r => {
    const v = r.split(","), o = { market };
    cols.forEach((c, i) => (o[c] = v[i]));
    o.size = Number(o.size); o.price = Number(o.price); o.timestamp = Number(o.timestamp);
    return o;
  });
};
const raw = [...read(lulaCsv, "lula"), ...read(flavioCsv, "flavio")];
const nowTs = Math.max(...raw.map(t => t.timestamp));
const fromTs = Math.min(...raw.map(t => t.timestamp));
const share = Number(pL) / (Number(pL) + Number(pF));
const trades = L.compactTrades(raw, nowTs);

console.log(JSON.stringify({
  v: 2, id: new Date(nowTs * 1000).toISOString().slice(0, 13) + "Z", ts: nowTs, at: new Date(nowTs * 1000).toISOString(),
  event: { slug: L.CONFIG.eventSlug },
  palette: L.CONFIG.palette,
  candidates: [
    { key: "lula", label: "Lula", price: Number(pL) },
    { key: "flavio", label: "Flávio Bolsonaro", price: Number(pF) },
  ],
  share,
  shareHistory: [],
  totals: L.sideTotals(trades),
  anomalies: L.detectWhales(L.hourlyMovers(raw, fromTs, nowTs + 1)),
  contracts: L.CONTRACTS,
  trades,
  source: "Preview from 173 real trades, 11 Oct",
}));
