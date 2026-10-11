#!/usr/bin/env node
// Hourly collector: pulls odds and trades from Polymarket's public APIs and writes one snapshot.
//   data/snapshots/<YYYY-MM-DDTHHZ>.json   one per hour, the permanent record
//   data/latest.json                       what the live page shows
//   data/index.json                        a running list of every hour (odds, wallets, anomalies)
//   data/wallets.json                      cache of each wallet's first Polymarket activity
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const GAMMA = "https://gamma-api.polymarket.com";
const DATA = "https://data-api.polymarket.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "cash-out/1.0 (artwork by Luiza Prado)" } });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(1500 * (i + 1));
  }
}

async function tradesFor(conditionId, market, sinceTs) {
  const all = [];
  for (let offset = 0, page = 0; page < 20; page++, offset += 500) {
    const batch = await getJSON(`${DATA}/trades?market=${conditionId}&limit=500&offset=${offset}&takerOnly=true`);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const t of batch) all.push({ ...t, market, size: Number(t.size), price: Number(t.price), timestamp: Number(t.timestamp) });
    if (Number(batch[batch.length - 1].timestamp) < sinceTs || batch.length < 500) break;
    await sleep(250);
  }
  return all;
}

const yesPrice = m => {
  const outs = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes;
  const ps = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
  const i = Math.max(0, (outs || []).indexOf("Yes"));
  return Number(ps[i]);
};

async function main() {
  // Runs are scheduled on the hour but GitHub often starts them a few minutes late.
  // The final hour still counts if its run starts late; its snapshot is pinned to the moment polls close.
  const realNow = Math.floor(Date.now() / 1000);
  const finalTs = Math.floor(Date.parse(L.CONFIG.finalAt) / 1000);
  if (Math.floor(realNow / 3600) > Math.floor(finalTs / 3600) && !process.env.FORCE) {
    console.log(`Past ${L.CONFIG.finalAt}; the polls have closed and the bath is finished. Nothing collected.`);
    return;
  }
  const final = realNow >= finalTs;
  const now = final ? finalTs : realNow;
  const id = new Date(now * 1000).toISOString().slice(0, 13) + "Z";

  const events = await getJSON(`${GAMMA}/events?slug=${encodeURIComponent(L.CONFIG.eventSlug)}`);
  const ev = Array.isArray(events) ? events[0] : events;
  if (!ev) throw new Error("Event not found: " + L.CONFIG.eventSlug);

  const candidates = L.CONFIG.candidates.map(c => {
    const m = (ev.markets || []).find(m => c.match.test(m.groupItemTitle || m.question || ""));
    if (!m) throw new Error("No market found for " + c.label);
    return { key: c.key, label: c.label, price: yesPrice(m), conditionId: m.conditionId, closed: !!m.closed };
  });
  const [A, B] = candidates;
  const share = A.price + B.price > 0 ? A.price / (A.price + B.price) : 0.5;

  const since = now - L.CONFIG.windowHours * 3600;
  const trades = [];
  for (const c of candidates) trades.push(...await tradesFor(c.conditionId, c.key, since));
  const windowTrades = trades.filter(t => t.timestamp >= since);

  // --- anomalies across the whole 24-hour window the bath marbles ---
  // Every frame judges all of its ink by the same rule, however long the system has been running.
  // Whales: $5,000+ on one side within any 60-minute stretch of the window.
  const prev = readJSON("data/latest.json", null);
  const found = L.detectWhalesRolling(windowTrades, since, now + 1), movers = [];
  for (let h = Math.floor(since / 3600) * 3600; h <= now; h += 3600) {
    movers.push(...L.hourlyMovers(windowTrades, Math.max(h, since), Math.min(h + 3600, now + 1)));
  }

  // fresh wallets: how old was the wallet when it placed the bet?
  const cache = readJSON("data/wallets.json", {});
  let lookups = 0;
  const candidates4fresh = movers.filter(m => m.usd >= L.CONFIG.freshMinUsd).sort((a, b) => b.usd - a.usd);
  for (const mv of candidates4fresh) {
    if (!(mv.wallet in cache)) {
      if (lookups >= 60) continue;   // keep each run polite to the API; the cache fills over a few runs
      lookups++;
      try {
        const act = await getJSON(`${DATA}/activity?user=${mv.wallet}&limit=1&sortBy=TIMESTAMP&sortDirection=ASC`);
        cache[mv.wallet] = Array.isArray(act) && act[0] ? Number(act[0].timestamp) : null;
      } catch (e) { console.warn("activity lookup failed for", mv.wallet, e.message); continue; }
      await sleep(200);
    }
    const fresh = L.detectFresh(mv, cache[mv.wallet], mv.ts);
    if (fresh) {
      const w = found.findIndex(a => a.kind === "whale" && a.wallet === fresh.wallet && a.tx === fresh.tx);
      if (w >= 0) found.splice(w, 1); // a fresh wallet that is also large counts once, as fresh
      found.push(fresh);
    }
  }
  const swing = L.detectSwing(prev && prev.share, share, now);
  if (swing) found.push(swing);
  const anomalies = L.mergeAnomalies(prev && prev.anomalies, found, now);
  const seenBefore = new Set(((prev && prev.anomalies) || []).map(a => `${a.kind}|${a.wallet || ""}|${a.tx || Math.floor(a.ts / 3600)}`));
  const fresh_ = anomalies.filter(a => !seenBefore.has(`${a.kind}|${a.wallet || ""}|${a.tx || Math.floor(a.ts / 3600)}`));
  found.length = 0; found.push(...fresh_);   // "new" = not already in the previous hour's record

  const compact = L.compactTrades(windowTrades, now);
  const totals = L.sideTotals(compact);
  const pastIndex = readJSON("data/index.json", []);
  // the odds at each hour of the window, so each comb pass is pulled by that hour's odds
  const shareHistory = pastIndex
    .filter(r => r.ts >= since && r.id !== id)
    .map(r => [Math.floor(r.ts / 3600), r.share])
    .concat([[Math.floor(now / 3600), Number(share.toFixed(4))]]);
  const snap = {
    v: 2, id, ts: now, at: new Date(now * 1000).toISOString(), final,
    event: { slug: ev.slug, id: ev.id, title: ev.title, volume24hr: Number(ev.volume24hr) || null },
    palette: L.CONFIG.palette,
    candidates, share, shareHistory, totals,
    anomalies,
    newAnomalies: found.length,
    contracts: L.CONTRACTS,
    trades: compact,
  };

  writeJSON(`data/snapshots/${id}.json`, snap);
  writeJSON("data/latest.json", snap);
  writeJSON("data/wallets.json", cache);
  const index = pastIndex.filter(r => r.id !== id);
  index.push({
    id, ts: now, share: Number(share.toFixed(4)),
    prices: Object.fromEntries(candidates.map(c => [c.key, c.price])),
    wallets: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.wallets])),
    newAnomalies: found.map(a => ({ kind: a.kind, wallet: a.wallet, usd: a.usd, note: a.note })),
  });
  writeJSON("data/index.json", index);

  console.log(`${id}: ${A.label} ${(A.price * 100).toFixed(1)}% · ${B.label} ${(B.price * 100).toFixed(1)}% · ` +
    `${compact.length} trades in 24 h · ${found.length} new anomalies`);
  for (const a of found) console.log("  ", a.kind, a.wallet || "", a.note);
}

main().catch(e => { console.error(e); process.exit(1); });
