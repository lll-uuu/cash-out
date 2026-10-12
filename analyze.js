// Aggregate analysis of the money in Cash Out.
//
// Reads every hourly snapshot the project has saved, looks up the public history of the
// largest and most unusual wallets, and writes a report about them as a group:
// when they bet, what else they bet on, roughly which time zones they keep, and how their
// money arrived on Polygon.
//
// It never publishes a wallet or funder address. Every figure is a sum or a count over a
// group, and any group smaller than MIN_GROUP wallets is folded into "other" or left out.
//
// Usage:  node analyze.js            (writes analysis/)
// Optional: ETHERSCAN_API_KEY=...    (free key from etherscan.io; enables the funding section)

const fs = require("fs");
const path = require("path");
const L = require("./lib.js");

const A = {
  bigWalletUsd: 5000,     // a wallet whose total stake on the runoff reaches this counts as a big bettor
  baselineSample: 150,    // ordinary wallets sampled for comparison
  maxActivity: 3000,      // history items read per wallet
  refreshDays: 3,         // re-read a wallet's history after this long
  minGroup: 3,            // suppress any figure that describes fewer wallets than this
  beforeSwingHours: 2,    // how far back to look for money placed ahead of a swing
};

const DATA = "data", OUT = "analysis", CACHE = path.join(OUT, "cache.json");
const API = "https://data-api.polymarket.com";
const ESCAN = "https://api.etherscan.io/v2/api?chainid=137";
const KEY = process.env.ETHERSCAN_API_KEY || "";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hourOf = ts => Math.floor(ts / 3600) * 3600;
const iso = ts => new Date(ts * 1000).toISOString().slice(0, 13) + "Z";
const brt = ts => new Date((ts - 3 * 3600) * 1000).toISOString().slice(0, 16).replace("T", " ");
const r2 = x => Math.round(x * 100) / 100;
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);

// Stablecoins money arrives in, and Polymarket's own contracts (not "funders").
const STABLES = /^(usdc|usdc\.e|pusd|usdt|usdt0|dai)$/i;
const INTERNAL = new Set([
  "0x0000000000000000000000000000000000000000",
  ...Object.values(L.CONTRACTS).map(c => c.address.toLowerCase()),
  "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e", // CTF Exchange
  "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296", // Neg Risk Adapter
]);

// Broad areas for "other markets". First match wins.
const AREAS = [
  ["Brasil", /brazil|brasil|lula|bolsonaro|tarc[ií]sio|caiado|ratinho|zema|selic|ibovespa/i],
  ["Política dos EUA", /trump|biden|vance|newsom|harris|senate|house|congress|governor|mayor|republican|democrat|supreme court|us election|presidential election 2028|government shutdown|tariff/i],
  ["Guerra e geopolítica", /iran|israel|gaza|hamas|hezbollah|ukraine|russia|putin|zelensky|china|taiwan|strike|ceasefire|war|missile|nato|venezuela|maduro|military/i],
  ["Outras eleições", /election|elect|prime minister|president of|parliament|referendum|vote/i],
  ["Economia", /fed |fed\b|interest rate|rates|inflation|cpi|recession|gdp|jobs report|unemployment|s&p|nasdaq|stock|ipo|earnings/i],
  ["Cripto", /bitcoin|btc|ethereum|eth\b|solana|sol\b|crypto|xrp|doge|memecoin|token|airdrop|fdv/i],
  ["Esporte", /\bvs\.?\b|nfl|nba|mlb|nhl|ufc|premier league|champions league|la liga|serie a|bundesliga|world cup|copa|libertadores|f1|grand prix|tennis|open|super bowl|fc\b|match|game \d/i],
  ["Cultura e tecnologia", /oscar|grammy|album|movie|box office|spotify|youtube|tiktok|openai|gpt|ai model|apple|tesla|elon|musk|twitter|x\.com/i],
];
const areaOf = s => (AREAS.find(([, re]) => re.test(s)) || ["Outros"])[0];

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(res.status + " " + url);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(800 * (i + 1)); }
  }
}

// ---------- 1. Everything the project has recorded ----------

function loadSnapshots() {
  const dir = path.join(DATA, "snapshots");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const trades = new Map(), anomalies = new Map(), share = new Map();
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const t of s.trades || []) {
      const [ts, w, u, backs, tx] = t;
      trades.set(`${tx}|${w}|${ts}|${u}|${backs}`, { ts, w, u, backs });
    }
    for (const a of s.anomalies || []) anomalies.set(`${a.kind}|${a.wallet}|${a.tx || a.ts}`, a);
    for (const [h, v] of s.shareHistory || []) share.set(h, v);
    if (s.share != null) share.set(hourOf(s.ts), s.share);
  }
  return { files, trades: [...trades.values()].sort((a, b) => a.ts - b.ts), anomalies: [...anomalies.values()], share };
}

// ---------- 2. Which wallets to study ----------

function groupWallets(trades, anomalies) {
  const per = new Map();
  for (const t of trades) {
    const p = per.get(t.w) || { usd: 0, lula: 0, flavio: 0, n: 0 };
    p.usd += t.u; p[t.backs] += t.u; p.n++;
    per.set(t.w, p);
  }
  const whale = new Set(anomalies.filter(a => a.kind === "whale").map(a => a.wallet));
  const fresh = new Set(anomalies.filter(a => a.kind === "fresh").map(a => a.wallet));
  const big = new Set([...per].filter(([, p]) => p.usd >= A.bigWalletUsd).map(([w]) => w));
  const flagged = new Set([...whale, ...fresh, ...big]);
  // a reproducible sample of everyone else, for comparison
  const rest = [...per.keys()].filter(w => !flagged.has(w)).sort();
  const step = Math.max(1, Math.floor(rest.length / A.baselineSample));
  const baseline = new Set(rest.filter((_, i) => i % step === 0).slice(0, A.baselineSample));
  return { per, whale, fresh, big, flagged, baseline };
}

// ---------- 3. Public history of each studied wallet (kept only as aggregates) ----------

async function history(wallet) {
  const hours = new Array(24).fill(0);   // trades per UTC hour of day, across all markets
  const events = {};                     // eventSlug -> { usd, n, title }
  let first = Infinity, n = 0;
  for (let off = 0; off < A.maxActivity; off += 500) {
    const page = await get(`${API}/activity?user=${wallet}&limit=500&offset=${off}&sortBy=TIMESTAMP&sortDirection=DESC`);
    if (!Array.isArray(page) || !page.length) break;
    for (const it of page) {
      first = Math.min(first, it.timestamp);
      if (it.type !== "TRADE") continue;
      n++;
      hours[new Date(it.timestamp * 1000).getUTCHours()]++;
      const slug = it.eventSlug || it.slug || "?";
      const e = events[slug] || (events[slug] = { usd: 0, n: 0, title: it.title || slug });
      e.usd += Number(it.usdcSize) || 0; e.n++;
    }
    if (page.length < 500) break;
    await sleep(150);
  }
  for (const k in events) events[k].usd = r2(events[k].usd);
  if (n >= A.maxActivity) { // history was cut short; ask for the very first item separately
    const one = await get(`${API}/activity?user=${wallet}&limit=1&sortBy=TIMESTAMP&sortDirection=ASC`);
    if (Array.isArray(one) && one[0]) first = Math.min(first, one[0].timestamp);
  }
  return { at: Math.floor(Date.now() / 1000), first: first === Infinity ? null : first, n, hours, events, capped: n >= A.maxActivity };
}

// The quietest six hours of a wallet's day are probably night. Centring them on 03:30 local
// gives a rough UTC offset. Needs a reasonable number of trades to mean anything.
function guessOffset(hours) {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total < 20) return null;
  let best = 0, bestSum = Infinity;
  for (let s = 0; s < 24; s++) {
    let sum = 0; for (let k = 0; k < 6; k++) sum += hours[(s + k) % 24];
    if (sum < bestSum) { bestSum = sum; best = s; }
  }
  if (bestSum / total > 0.12) return null; // no clear night: bot, shift worker, or several people
  let off = Math.round(3.5 - (best + 3)); // centre of the window is best+3 (UTC)
  if (off < -11) off += 24; if (off > 12) off -= 24;
  return off;
}
const REGIONS = [
  ["UTC−8 a −6 (costa oeste e centro dos EUA, México)", -8, -6],
  ["UTC−5 a −2 (leste dos EUA, Canadá, Brasil, resto da América do Sul)", -5, -2],
  ["UTC−1 a +3 (Europa, África)", -1, 3],
  ["UTC+4 a +6 (Golfo, Ásia Central, Índia)", 4, 6],
  ["UTC+7 a +10 (Sudeste e Leste Asiático, Austrália)", 7, 10],
  ["outros fusos", -11, 12],
];
const regionOf = off => REGIONS.find(([, a, b]) => off >= a && off <= b)[0];

// ---------- 4. Funding: where the stablecoins came from (needs an Etherscan key) ----------

async function funding(wallet) {
  const url = `${ESCAN}&module=account&action=tokentx&address=${wallet}&startblock=0&endblock=99999999&page=1&offset=200&sort=asc&apikey=${KEY}`;
  const j = await get(url);
  if (!j || j.status !== "1" || !Array.isArray(j.result)) return { inflows: [] };
  const inflows = j.result
    .filter(x => x.to.toLowerCase() === wallet && STABLES.test(x.tokenSymbol) && !INTERNAL.has(x.from.toLowerCase()))
    .map(x => ({ from: x.from.toLowerCase(), ts: +x.timeStamp, usd: r2(Number(x.value) / 10 ** Number(x.tokenDecimal)), token: x.tokenSymbol }));
  return { inflows };
}

// ---------- 5. The report ----------

function hourlyTimeline(trades, groups, anomalies, share) {
  const rows = new Map();
  const row = h => rows.get(h) || rows.set(h, { h, lula: 0, flavio: 0, bigLula: 0, bigFlavio: 0, fresh: 0, wallets: new Set() }).get(h);
  for (const t of trades) {
    const r = row(hourOf(t.ts));
    r[t.backs] += t.u; r.wallets.add(t.w);
    if (groups.whale.has(t.w) || groups.big.has(t.w)) r[t.backs === "lula" ? "bigLula" : "bigFlavio"] += t.u;
    if (groups.fresh.has(t.w)) r.fresh += t.u;
  }
  const swings = new Map(anomalies.filter(a => a.kind === "swing").map(a => [hourOf(a.ts), a]));
  return [...rows.values()].sort((a, b) => a.h - b.h).map(r => ({
    hour_utc: iso(r.h), hour_brasilia: brt(r.h), wallets: r.wallets.size,
    lula_usd: r2(r.lula), flavio_usd: r2(r.flavio),
    big_lula_usd: r2(r.bigLula), big_flavio_usd: r2(r.bigFlavio), fresh_usd: r2(r.fresh),
    lula_share: share.has(r.h) ? r2(share.get(r.h)) : "",
    swing: swings.has(r.h) ? `${swings.get(r.h).points} → ${L.labelOf(swings.get(r.h).backs)}` : "",
  }));
}

function hourOfDay(trades, filter) {
  const h = new Array(24).fill(0);
  let tot = 0;
  for (const t of trades) if (filter(t)) { h[(new Date(t.ts * 1000).getUTCHours() + 21) % 24] += t.u; tot += t.u; }
  return h.map(x => pct(x, tot)); // share of money per Brasília hour
}

// Money placed by big wallets in the hours before each swing, split by whether it backed the
// side the odds then moved toward.
function aheadOfSwings(trades, groups, anomalies) {
  const out = { swings: 0, withBigMoneyAhead: 0, usdSameDirection: 0, usdOpposite: 0 };
  for (const s of anomalies.filter(a => a.kind === "swing")) {
    const h = hourOf(s.ts), from = h - A.beforeSwingHours * 3600;
    let same = 0, opp = 0;
    for (const t of trades) {
      if (t.ts < from || t.ts >= h || !(groups.whale.has(t.w) || groups.big.has(t.w))) continue;
      if (t.backs === s.backs) same += t.u; else opp += t.u;
    }
    out.swings++; if (same + opp > 0) out.withBigMoneyAhead++;
    out.usdSameDirection += same; out.usdOpposite += opp;
  }
  out.usdSameDirection = r2(out.usdSameDirection); out.usdOpposite = r2(out.usdOpposite);
  return out;
}

function otherMarkets(wallets, cache) {
  const byArea = {}, byEvent = {};
  let withHistory = 0, onlyThis = 0;
  for (const w of wallets) {
    const h = cache[w]; if (!h || !h.n) continue;
    withHistory++;
    const others = Object.entries(h.events).filter(([slug]) => slug !== L.CONFIG.eventSlug);
    if (!others.length) onlyThis++;
    const areas = new Set();
    for (const [slug, e] of others) {
      const a = areaOf(slug + " " + e.title);
      areas.add(a);
      const ev = byEvent[slug] || (byEvent[slug] = { title: e.title, area: a, wallets: 0, usd: 0 });
      ev.wallets++; ev.usd += e.usd;
    }
    for (const a of areas) {
      const x = byArea[a] || (byArea[a] = { wallets: 0, usd: 0 });
      x.wallets++;
      x.usd += others.filter(([s, e]) => areaOf(s + " " + e.title) === a).reduce((s, [, e]) => s + e.usd, 0);
    }
  }
  const areas = Object.entries(byArea)
    .map(([area, x]) => ({ area, wallets: x.wallets, walletsPct: pct(x.wallets, withHistory), usd: r2(x.usd) }))
    .filter(x => x.wallets >= A.minGroup).sort((a, b) => b.wallets - a.wallets);
  const events = Object.values(byEvent).filter(e => e.wallets >= A.minGroup)
    .sort((a, b) => b.wallets - a.wallets || b.usd - a.usd).slice(0, 25)
    .map(e => ({ ...e, usd: r2(e.usd) }));
  return { withHistory, onlyThisMarket: onlyThis, onlyThisMarketPct: pct(onlyThis, withHistory), areas, events };
}

function timezones(wallets, cache) {
  const count = {}; let read = 0, unclear = 0;
  for (const w of wallets) {
    const h = cache[w]; if (!h || !h.n) continue;
    const off = guessOffset(h.hours);
    if (off == null) { unclear++; continue; }
    read++; const r = regionOf(off); count[r] = (count[r] || 0) + 1;
  }
  return {
    estimated: read, unclear,
    regions: Object.entries(count).filter(([, n]) => n >= A.minGroup)
      .map(([region, n]) => ({ region, wallets: n, pct: pct(n, read) })).sort((a, b) => b.wallets - a.wallets),
  };
}

function walletAge(wallets, cache, per, trades) {
  // age of each wallet at its first bet on the runoff
  const firstBet = new Map();
  for (const t of trades) if (!firstBet.has(t.w)) firstBet.set(t.w, t.ts);
  const buckets = { "menos de 1 dia": 0, "1 a 7 dias": 0, "1 a 4 semanas": 0, "1 a 6 meses": 0, "mais de 6 meses": 0 };
  const usd = { ...Object.fromEntries(Object.keys(buckets).map(k => [k, 0])) };
  let n = 0;
  for (const w of wallets) {
    const h = cache[w]; if (!h || h.first == null || !firstBet.has(w)) continue;
    const d = (firstBet.get(w) - h.first) / 86400;
    const k = d < 1 ? "menos de 1 dia" : d < 7 ? "1 a 7 dias" : d < 28 ? "1 a 4 semanas" : d < 182 ? "1 a 6 meses" : "mais de 6 meses";
    buckets[k]++; usd[k] += per.get(w).usd; n++;
  }
  return Object.keys(buckets).map(k => ({
    age: k, wallets: buckets[k] >= A.minGroup ? buckets[k] : (buckets[k] ? `<${A.minGroup}` : 0),
    pct: buckets[k] >= A.minGroup || !buckets[k] ? pct(buckets[k], n) : "–", usd: buckets[k] >= A.minGroup ? r2(usd[k]) : null,
  }));
}

function fundingSummary(wallets, fund, per) {
  // How many studied wallets each funder address paid. Addresses are counted, never printed.
  const funders = new Map();
  let withData = 0, noOutside = 0, inflowUsd = 0;
  const tokens = {};
  for (const w of wallets) {
    const f = fund[w]; if (!f) continue;
    withData++;
    if (!f.inflows.length) { noOutside++; continue; }
    for (const x of f.inflows) {
      inflowUsd += x.usd; tokens[x.token] = (tokens[x.token] || 0) + x.usd;
      if (!funders.has(x.from)) funders.set(x.from, new Set());
      funders.get(x.from).add(w);
    }
  }
  // Classify each studied wallet by the most connected address that funded it.
  const cls = { hub: 0, shared: 0, own: 0 };
  const clsUsd = { hub: 0, shared: 0, own: 0 };
  const sharedSizes = [];
  const seenCluster = new Set();
  for (const w of wallets) {
    const f = fund[w]; if (!f || !f.inflows.length) continue;
    const reach = Math.max(...f.inflows.map(x => funders.get(x.from).size));
    const k = reach >= 5 ? "hub" : reach >= 2 ? "shared" : "own";
    cls[k]++; clsUsd[k] += per.get(w).usd;
  }
  for (const [from, ws] of funders) {
    if (ws.size >= 2 && ws.size < 5 && !seenCluster.has(from)) { seenCluster.add(from); sharedSizes.push(ws.size); }
  }
  const crossFunded = [...funders.keys()].filter(f => wallets.has(f)).length; // studied wallets that funded other studied wallets
  return {
    walletsChecked: withData, walletsNoOutsideInflow: noOutside, inflowUsd: r2(inflowUsd),
    tokens: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, r2(v)])),
    byFunderType: {
      viaHub: { wallets: cls.hub, betUsd: r2(clsUsd.hub) },
      viaSharedFunder: { wallets: cls.shared, betUsd: r2(clsUsd.shared) },
      ownFunder: { wallets: cls.own, betUsd: r2(clsUsd.own) },
    },
    sharedFunderGroups: sharedSizes.length, sharedFunderGroupSizes: sharedSizes.sort((a, b) => b - a),
    walletsThatFundedOtherStudiedWallets: crossFunded >= A.minGroup ? crossFunded : (crossFunded ? `<${A.minGroup}` : 0),
  };
}

const money = x => "US$ " + Math.round(x).toLocaleString("pt-BR");
const few = n => (typeof n === "number" && n > 0 && n < A.minGroup ? `<${A.minGroup}` : n);
const pc = x => String(x).replace(".", ",") + "%";

function markdown(R) {
  const L1 = [];
  const p = s => L1.push(s);
  p(`# Cash Out: análise agregada`);
  p(``);
  p(`Atualizado em ${brt(R.generatedAt)} (Brasília). ${R.hoursRecorded} horas registradas, de ${R.from} a ${R.to} (UTC).`);
  p(``);
  p(`Nenhum endereço de carteira aparece aqui. Todo número é soma ou contagem de um grupo, e grupos com menos de ${A.minGroup} carteiras são omitidos.`);
  p(``);
  p(`## Quem está apostando`);
  p(``);
  p(`| | Carteiras | Apostado | Em Lula | Em Flávio |`);
  p(`|---|---:|---:|---:|---:|`);
  for (const g of R.groups) p(`| ${g.label} | ${g.wallets} | ${money(g.usd)} | ${pc(g.lulaPct)} | ${pc(g.flavioPct)} |`);
  p(``);
  p(`Grandes apostadores = baleias (US$ 5.000+ em menos de uma hora), carteiras novas sinalizadas, ou quem somou US$ ${A.bigWalletUsd.toLocaleString("pt-BR")}+ no período. Eles são ${pc(R.concentration.bigWalletsPct)} das carteiras e põem ${pc(R.concentration.bigUsdPct)} do dinheiro.`);
  p(``);
  p(`## Horários (hora de Brasília)`);
  p(``);
  p(`Parcela do dinheiro apostado em cada hora do dia. A linha do tempo completa, hora a hora, está em \`hourly.csv\`, pronta para cruzar com a agenda de campanha.`);
  p(``);
  p(`| Hora | Grandes | Demais |`);
  p(`|---|---:|---:|`);
  for (let h = 0; h < 24; h++) p(`| ${String(h).padStart(2, "0")}h | ${R.hourOfDay.big ? pc(R.hourOfDay.big[h]) : "–"} | ${pc(R.hourOfDay.rest[h])} |`);
  p(``);
  const s = R.aheadOfSwings;
  p(`**Antes das viradas.** Houve ${s.swings} viradas de 3+ pontos em uma hora. Em ${s.withBigMoneyAhead} delas, grandes apostadores tinham posto dinheiro nas ${A.beforeSwingHours} horas anteriores: ${money(s.usdSameDirection)} no lado para onde as odds foram, ${money(s.usdOpposite)} no outro. Isso mostra coincidência no tempo, não prova que alguém sabia antes; também pode ser o próprio dinheiro deles movendo as odds.`);
  p(``);
  p(`## Fusos horários (estimativa)`);
  p(``);
  p(`Para cada carteira com histórico suficiente, as seis horas mais quietas do dia são tratadas como noite. ${R.timezones.big.estimated} grandes apostadores tiveram um padrão claro; ${R.timezones.big.unclear} não (robôs, várias pessoas ou pouca atividade). O método não separa o Brasil (UTC−3) do leste dos EUA (UTC−4 em outubro).`);
  p(``);
  p(`| Faixa | Grandes | Comparação |`);
  p(`|---|---:|---:|`);
  const regs = new Set([...R.timezones.big.regions, ...R.timezones.baseline.regions].map(r => r.region));
  for (const r of regs) {
    const b = R.timezones.big.regions.find(x => x.region === r), c = R.timezones.baseline.regions.find(x => x.region === r);
    p(`| ${r} | ${b ? pc(b.pct) : "–"} | ${c ? pc(c.pct) : "–"} |`);
  }
  p(``);
  p(`## Idade das carteiras na primeira aposta na eleição`);
  p(``);
  p(`| Idade | Grandes | % | Apostado |`);
  p(`|---|---:|---:|---:|`);
  for (const a of R.walletAge) p(`| ${a.age} | ${a.wallets} | ${a.pct === "–" ? "–" : pc(a.pct)} | ${a.usd == null ? "–" : money(a.usd)} |`);
  p(``);
  p(`## Em que mais eles apostam`);
  p(``);
  const om = R.otherMarkets.big, ob = R.otherMarkets.baseline;
  p(`${pc(om.onlyThisMarketPct)} dos grandes apostadores nunca apostaram em outra coisa no Polymarket (na comparação: ${pc(ob.onlyThisMarketPct)}). Carteiras de uso único são um dos sinais clássicos de aposta com informação privilegiada, mas também de quem só se interessa pelo Brasil.`);
  p(``);
  p(`| Área | Grandes | Comparação |`);
  p(`|---|---:|---:|`);
  const areas = new Set([...om.areas, ...ob.areas].map(a => a.area));
  for (const a of areas) {
    const b = om.areas.find(x => x.area === a), c = ob.areas.find(x => x.area === a);
    p(`| ${a} | ${b ? pc(b.walletsPct) : "–"} | ${c ? pc(c.walletsPct) : "–"} |`);
  }
  p(``);
  if (om.events.length) {
    p(`Mercados em comum entre os grandes apostadores (${A.minGroup}+ carteiras):`);
    p(``);
    p(`| Mercado | Área | Carteiras | Apostado |`);
    p(`|---|---|---:|---:|`);
    for (const e of om.events) p(`| ${e.title.replace(/\|/g, "/")} | ${e.area} | ${e.wallets} | ${money(e.usd)} |`);
    p(``);
  }
  p(`## De onde vem o dinheiro`);
  p(``);
  const f = R.funding;
  if (f && f.walletsChecked < A.minGroup) {
    p(`Ainda há poucos grandes apostadores verificados para mostrar esta seção sem expor carteiras individuais.`);
  } else if (!f) {
    p(`Esta seção precisa de uma chave gratuita do Etherscan (secret \`ETHERSCAN_API_KEY\`).`);
  } else {
    p(`Entradas de stablecoins (USDC, pUSD e similares) nas carteiras dos ${f.walletsChecked} grandes apostadores verificados, na rede Polygon. Contratos do próprio Polymarket não contam como origem.`);
    p(``);
    p(`| Origem | Carteiras | Apostado na eleição |`);
    p(`|---|---:|---:|`);
    p(`| Endereço que também abasteceu 5+ das carteiras estudadas (provável corretora, ponte ou serviço de depósito) | ${few(f.byFunderType.viaHub.wallets)} | ${money(f.byFunderType.viaHub.betUsd)} |`);
    p(`| Endereço que abasteceu 2 a 4 das carteiras estudadas (possível mesmo dono) | ${few(f.byFunderType.viaSharedFunder.wallets)} | ${money(f.byFunderType.viaSharedFunder.betUsd)} |`);
    p(`| Endereço exclusivo | ${few(f.byFunderType.ownFunder.wallets)} | ${money(f.byFunderType.ownFunder.betUsd)} |`);
    p(`| Sem entrada visível (dinheiro chegou por dentro do Polymarket) | ${few(f.walletsNoOutsideInflow)} | – |`);
    p(``);
    p(`${f.sharedFunderGroups} grupos de carteiras dividem uma mesma origem (tamanhos: ${f.sharedFunderGroupSizes.join(", ") || "–"}). Carteiras estudadas que abasteceram outras carteiras estudadas: ${f.walletsThatFundedOtherStudiedWallets}.`);
    p(``);
    p(`Moedas de entrada: ${Object.entries(f.tokens).map(([k, v]) => `${k} ${money(v)}`).join(", ")}.`);
    p(``);
    p(`A blockchain mostra o endereço de origem, não a pessoa. Quase todo dinheiro chega por corretoras e pontes, que misturam milhares de clientes; a partir daí o rastro só continua com dados das próprias corretoras.`);
  }
  p(``);
  return L1.join("\n");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { files, trades, anomalies, share } = loadSnapshots();
  if (!trades.length) { console.log("no trades recorded yet"); return; }
  const G = groupWallets(trades, anomalies);
  console.log(`${files.length} snapshots, ${trades.length} trades, ${G.per.size} wallets; studying ${G.flagged.size} big + ${G.baseline.size} baseline`);

  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : { history: {}, funding: {} };
  const now = Math.floor(Date.now() / 1000);
  const study = [...G.flagged, ...G.baseline];
  let fetched = 0;
  for (const w of study) {
    const h = cache.history[w];
    if (h && now - h.at < A.refreshDays * 86400) continue;
    try { cache.history[w] = await history(w); fetched++; } catch (e) { console.log("history failed:", e.message); }
    await sleep(120);
  }
  if (KEY) {
    for (const w of G.flagged) {
      if (cache.funding[w] && now - cache.funding[w].at < A.refreshDays * 86400) continue;
      try { cache.funding[w] = { at: now, ...(await funding(w)) }; } catch (e) { console.log("funding failed:", e.message); }
      await sleep(250); // stays under the free tier's rate
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`read ${fetched} wallet histories`);

  const group = (label, set) => {
    let usd = 0, lula = 0;
    for (const w of set) { const p = G.per.get(w); usd += p.usd; lula += p.lula; }
    return { label, wallets: set.size, usd: r2(usd), lulaPct: pct(lula, usd), flavioPct: r2(100 - pct(lula, usd)) };
  };
  const all = new Set(G.per.keys());
  const bigUsd = [...G.flagged].reduce((s, w) => s + G.per.get(w).usd, 0);
  const allUsd = [...all].reduce((s, w) => s + G.per.get(w).usd, 0);
  const isBig = t => G.whale.has(t.w) || G.big.has(t.w) || G.fresh.has(t.w);

  const R = {
    generatedAt: now, hoursRecorded: files.length,
    from: iso(trades[0].ts), to: iso(trades[trades.length - 1].ts),
    thresholds: { ...A, whaleUsd: L.CONFIG.whaleUsd, freshWalletDays: L.CONFIG.freshWalletDays },
    groups: [
      group("Todas as carteiras", all),
      group("Grandes apostadores", G.flagged),
      group("…baleias", G.whale),
      group("…carteiras novas sinalizadas", G.fresh),
    ].filter(g => g.wallets >= A.minGroup),
    concentration: { bigWalletsPct: pct(G.flagged.size, all.size), bigUsdPct: pct(bigUsd, allUsd) },
    hourOfDay: { big: G.flagged.size >= A.minGroup ? hourOfDay(trades, isBig) : null, rest: hourOfDay(trades, t => !isBig(t)) },
    aheadOfSwings: aheadOfSwings(trades, G, anomalies),
    timezones: { big: timezones(G.flagged, cache.history), baseline: timezones(G.baseline, cache.history) },
    walletAge: walletAge(G.flagged, cache.history, G.per, trades),
    otherMarkets: { big: otherMarkets(G.flagged, cache.history), baseline: otherMarkets(G.baseline, cache.history) },
    funding: KEY ? fundingSummary(G.flagged, cache.funding, G.per) : null,
  };

  const rows = hourlyTimeline(trades, G, anomalies, share);
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(path.join(OUT, "hourly.csv"), [cols.join(","), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? "")).join(","))].join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(R, null, 1));
  fs.writeFileSync(path.join(OUT, "relatorio.md"), markdown(R));
  console.log("wrote analysis/relatorio.md, report.json, hourly.csv");
}

main().catch(e => { console.error(e); process.exit(1); });
