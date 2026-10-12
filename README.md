# Cash Out

Luiza Prado, 2026 · [lll-uuu.github.io/cash-out](https://lll-uuu.github.io/cash-out)

[English](#english) · [Português](#português)

## Português

Cash Out acompanha o dinheiro apostado no segundo turno da eleição presidencial brasileira de 2026, entre Lula e Flávio Bolsonaro, no Polymarket. O Polymarket é um site de apostas que funciona com criptomoedas. A cada hora, até o fechamento das urnas em 25 de outubro, o projeto registra todas as apostas feitas nas 24 horas anteriores. Ele as transforma numa imagem marmorizada, uma gota de tinta por aposta, e guarda uma imagem por hora.

**Quem especula sobre os nossos futuros?** 
O Brasil proibiu os sites de apostas pouco antes do primeiro turno. Mesmo assim, qualquer pessoa com uma carteira de criptomoedas ainda pode apostar em quem vai governar o país, de qualquer lugar do mundo, sem se identificar. Este projeto busca entender como o capital circula nos emaranhados contemporâneos entre poder colonial e tecnologia: de quem é o dinheiro que move as odds de uma eleição brasileira, quando ele se move e de onde vem.

**Que dados gera e onde ficam.** 
Tudo vem de fontes públicas: os dados abertos do Polymarket e a blockchain Polygon, onde cada aposta fica registrada. Nada é coletado de quem visita a página. Tudo fica guardado neste repositório público:

- `data/snapshots/`: um arquivo por hora, com as odds e todas as apostas das 24 horas anteriores (horário, endereço da carteira, valor, candidato e código da transação), além das apostas fora do comum: baleias e carteiras novas.
- `frames/`: a imagem feita a cada hora.
- `data/index.json`: um resumo de uma linha para cada hora.
- `analysis/`: uma análise agregada, feita uma vez por dia, dos maiores apostadores e dos mais fora do comum. Mostra quando apostam, em que mais apostam, de que fusos horários parecem vir e como o dinheiro deles chegou à Polygon. Nunca identifica carteiras; só mostra números sobre grupos.

O projeto é de código aberto. Suas descobertas serão reunidas num relatório sobre a origem desse dinheiro nas últimas semanas da eleição.

## English

**What it tracks.** Cash Out follows the money bet on the runoff of Brazil's 2026 presidential election, between Lula and Flávio Bolsonaro, on Polymarket. Polymarket is a betting website that runs on cryptocurrency. Every hour until the polls close on 25 October, the project records every bet placed in the previous 24 hours. It turns them into a marbled image, one drop of paint per bet, and saves one image per hour.

**Why.** Who speculates on our futures? Brazil banned betting sites shortly before the first round. Yet anyone with a crypto wallet can still bet on who will govern the country, from anywhere in the world, without leaving a name. This project tries to understand how capital flows through today's entanglements of colonial power and technology: whose money moves the odds on a Brazilian election, when it moves, and where it comes from.

**What data it generates and where it is kept.** Everything comes from public sources: Polymarket's public data and the Polygon blockchain, where every bet is recorded. Nothing is collected from anyone who visits the page. All of it is saved in this public repository:

- `data/snapshots/`: one file per hour, with the odds and every bet from the previous 24 hours (time, wallet address, amount, candidate and transaction code), plus any unusual bets: whales and new wallets.
- `frames/`: the image made each hour.
- `data/index.json`: a one-line summary of every hour.
- `analysis/`: a daily aggregate analysis of the largest and most unusual bettors. It covers when they bet, what else they bet on, roughly which time zones they keep, and how their money reached Polygon. It never names wallets; it only reports figures about groups.

The project is open source. Its findings will be collated into a report on the origins of this money over the last weeks of the election.

---

## Reading the image (technical)

| In the image | Comes from |
|---|---|
| Red ink | Bets on Lula (buying Lula Yes or selling Flávio Yes) |
| Yellow and green ink | Bets on Flávio Bolsonaro, the flag's *amarelo* and *verde* |
| Pearl and cream ink | $1,000+ moves by wallets flagged as whales ($5,000+ within any 60 minutes) or newly created (first active less than 7 days before the bet). Each pearl drop is edged in the ink of the side it backs: red for Lula, yellow or green for Flávio. They also swirl the paint around them |
| Where a wallet's ink lands | Address digits 1–4 (horizontal) and 5–8 (vertical) |
| The exact shade | Address digits 9–10 hue, 11–12 saturation, 13–14 brightness, 15–16 opacity, 17–18 yellow or green band |
| How much ink | The stake: more and larger drops, ringed stones for big bets, clusters scattered by the transaction hash |
| Comb strokes | One pass per hour. Horizontal pull follows Flávio's odds, vertical pull Lula's |
| Round stones on top | The last two hours, not yet combed |
| Bouquet strokes | A swing of 3+ points in the odds within an hour |
| Dark specks | Transaction hashes, one or two each: pinholes through to the background |
| The background | pUSD, Polymarket's collateral token, `0xC011a7…`, taken almost to black |

Thresholds live in `lib.js`. A second palette, `contracts` (blue, magenta and red taken from the contract addresses), can be rendered from the same data with `--palette contracts`.

## Set-up (about ten minutes)

1. Create a new GitHub repository. Public is simplest: Actions minutes are free and Pages works on the free plan.
2. Upload everything in this folder, including the hidden `.github` folder, and commit to `main`.
3. Open **Actions**, enable workflows if asked, choose **Cash Out hourly**, and click **Run workflow** once. A first file appears in `data/snapshots/` and `frames/`.
4. For the live page: **Settings → Pages → Deploy from a branch → main / (root)**. The page shows the latest hour and refreshes itself. Hovering names the wallet whose ink is under the cursor.

The job runs every hour on the hour; its last run is at 20:00 UTC on 25 October (17:00 in Brasília, 15:00 in Acre), and that final frame is pinned to the moment the polls close. GitHub often starts scheduled runs a few minutes late; each frame is still filed under its hour. Each run takes a few minutes. Scheduled GitHub jobs are sometimes late or skipped at busy times, so expect the odd gap; `data/index.json` lists every hour that ran.

## What gets kept

- `data/snapshots/*.json`: the master record of each hour (odds, the 24 hours of trades, anomalies). Frames are rendered from these exactly, at any size.
- `frames/*.jpg`: a 1600px image per hour, about 1 MB each, for the live page.
- `data/index.json`: one line per hour, useful for captions or a colophon.

## Print files for the textile

After the 25th, on a computer with Node 20:

```
npm install
npm run print
```

This renders every hour as a 2400 × 2400 PNG in `frames-print/`. That's 20 cm at 300 dpi, which is plenty when many hours share one cloth. For a single large piece, render one hour bigger, for example `node render-frame.js data/snapshots/2026-10-25T23Z.json --size 8000 --format png --out frames-print`. Rendering uses every CPU core; expect roughly one to three minutes per 2400px frame on a laptop, longer for very large sizes.

## Aggregate analysis

`analyze.js` runs once a day (workflow **Cash Out analysis**, or `npm run analyze` locally) and writes `analysis/`:

- `relatorio.md`: a readable report in Portuguese, covering who bets, the hours of day, the money placed ahead of swings, estimated time zones, wallet ages, other markets and where the money came from.
- `hourly.csv`: every recorded hour, with money per side, big-bettor money, new-wallet money, odds and swings. It is ready to set against the campaign calendar.
- `report.json`: the same figures for other tools.

It studies big bettors (whales, flagged new wallets, and anyone with US$ 5,000+ in total) against a sample of ordinary wallets, using their public Polymarket history. No wallet or funder address appears in the outputs, and any figure covering fewer than 3 wallets is hidden. `analysis/cache.json` keeps per-wallet summaries between runs, to save requests. Those wallets are already public in the snapshots.

The funding section needs a free Etherscan API key (etherscan.io → API Keys), saved as a repository secret named `ETHERSCAN_API_KEY` (Settings → Secrets and variables → Actions). Without the key, the rest of the report still runs.

## Files

`collect.js` fetches and writes a snapshot · `lib.js` turns trades into the compact record and detects anomalies · `engine.js` is the marbling engine (browser and Node) · `render-frame.js` renders images in parallel · `page.html` is the live page source (`npm run build` regenerates `index.html`).
