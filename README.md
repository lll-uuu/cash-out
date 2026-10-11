# Cash Out

Luiza Prado, 2026

A marbling bath, recorded every hour until the polls close on 25 October (17:00 in Brasília, 15:00 in Acre), made from the money betting on Brazil's presidential runoff on Polymarket.

Each frame marbles the last 24 hours of trades. Every trade is a drop of ink; every hour a comb is dragged through the bath, pulled by that hour's odds.

## Reading the bath

| In the bath | Comes from |
|---|---|
| Red ink | Bets on Lula (buying Lula Yes or selling Flávio Yes) |
| Yellow and green ink | Bets on Flávio Bolsonaro, the flag's *amarelo* and *verde* |
| Pearl and cream ink | $1,000+ moves by wallets flagged as whales ($5,000+ in an hour) or newly created (first active less than 7 days ago). They also swirl the bath around themselves |
| Where a wallet's ink lands | Address digits 1–4 (horizontal) and 5–8 (vertical) |
| The exact shade | Address digits 9–10 hue, 11–12 saturation, 13–14 brightness, 15–16 opacity, 17–18 yellow or green band |
| How much ink | The stake: more and larger drops, ringed stones for big bets, clusters scattered by the transaction hash |
| Comb strokes | One pass per hour. Horizontal pull follows Flávio's odds, vertical pull Lula's |
| Round stones on top | The last two hours, not yet combed |
| Bouquet strokes | A swing of 3+ points in the odds within an hour |
| Dark specks | Transaction hashes, one or two each: pinholes through to the bath |
| The bath (ground) | pUSD, Polymarket's collateral token, `0xC011a7…`, taken almost to black |

Thresholds live in `lib.js`. A second palette, `contracts` (blue, magenta and red taken from the contract addresses), can be rendered from the same data with `--palette contracts`.

## Set-up (about ten minutes)

1. Create a new GitHub repository. Public is simplest: Actions minutes are free and Pages works on the free plan.
2. Upload everything in this folder, including the hidden `.github` folder, and commit to `main`.
3. Open **Actions**, enable workflows if asked, choose **Cash Out hourly**, and click **Run workflow** once. A first file appears in `data/snapshots/` and `frames/`.
4. For the live page: **Settings → Pages → Deploy from a branch → main / (root)**. The page shows the latest hour and refreshes itself. Hovering names the wallet whose ink is under the cursor.

The job runs every hour on the hour; its last run is at 20:00 UTC on 25 October (17:00 in Brasília, 15:00 in Acre), and that final frame is pinned to the moment the polls close. GitHub often starts scheduled runs a few minutes late; each frame is still filed under its hour. Each run takes a few minutes. Scheduled GitHub jobs are sometimes late or skipped at busy times, so expect the odd gap; `data/index.json` lists every hour that ran.

## What gets kept

- `data/snapshots/*.json`: the master record of each hour (odds, the 24 hours of trades, anomalies). Frames are rendered from these exactly, at any size.
- `frames/*.jpg`: a 1600px image per hour, about 1 MB each.
- `data/index.json`: one line per hour, useful for captions or a colophon.

## Print files for the textile

After the 25th, on a computer with Node 20:

```
npm install
npm run print
```

This renders every hour as a 2400 × 2400 PNG in `frames-print/`. That's 20 cm at 300 dpi, which is plenty when many hours share one cloth. For a single large piece, render one hour bigger, for example `node render-frame.js data/snapshots/2026-10-25T23Z.json --size 8000 --format png --out frames-print`. Rendering uses every CPU core; expect roughly one to three minutes per 2400px frame on a laptop, longer for very large sizes.

## Files

`collect.js` fetches and writes a snapshot · `lib.js` turns trades into the compact record and detects anomalies · `engine.js` is the marbling engine (browser and Node) · `render-frame.js` renders images in parallel · `page.html` is the live page source (`npm run build` regenerates `index.html`).
