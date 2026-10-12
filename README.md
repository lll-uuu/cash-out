# Cash Out

Luiza Prado, 2026 · [lll-uuu.github.io/cash-out](https://lll-uuu.github.io/cash-out)

[Português](#português) · [English](#english)

## Português

**O que acompanha.** Cash Out acompanha o dinheiro apostado no segundo turno da eleição presidencial brasileira de 2026, entre Lula e Flávio Bolsonaro, no Polymarket, um site de apostas que funciona com criptomoedas. A cada hora, até o fechamento das urnas em 25 de outubro, o projeto registra todas as apostas feitas nas 24 horas anteriores e as transforma numa imagem marmorizada, uma gota de tinta por aposta. Uma imagem é guardada por hora.

**Por quê.** Quem especula sobre os nossos futuros? O Brasil proibiu os sites de apostas pouco antes do primeiro turno, mas qualquer pessoa com uma carteira de criptomoedas ainda pode apostar em quem vai governar o país, de qualquer lugar do mundo, sem se identificar. Este projeto busca entender como o capital circula nos emaranhados contemporâneos entre poder colonial e tecnologia: de quem é o dinheiro que move as odds de uma eleição brasileira, quando ele se move e de onde vem.

**Que dados gera e onde ficam.** Tudo vem de fontes públicas: os dados abertos do Polymarket e a blockchain Polygon, onde cada aposta fica registrada. Nada é coletado de quem visita a página. Tudo fica guardado neste repositório público:

- `data/snapshots/`: um arquivo por hora, com as odds e todas as apostas das 24 horas anteriores (horário, endereço da carteira, valor, candidato e código da transação), além das apostas fora do comum: baleias e carteiras novas.
- `frames/`: a imagem feita a cada hora.
- `data/index.json`: um resumo de uma linha para cada hora.
- `analysis/`: uma análise agregada, feita uma vez por dia, dos maiores apostadores e dos mais fora do comum. Mostra quando apostam, em que mais apostam, de que fusos horários parecem vir e como o dinheiro deles chegou à Polygon. Nunca identifica carteiras; só mostra números sobre grupos.

O projeto é de código aberto. Suas descobertas serão reunidas num relatório sobre a origem desse dinheiro nas últimas semanas da eleição.

### Como ler a imagem

| Na imagem | Vem de |
|---|---|
| Tinta vermelha | Apostas em Lula (comprar "sim" para Lula ou vender "sim" para Flávio) |
| Tinta amarela e verde | Apostas em Flávio Bolsonaro, o amarelo e o verde da bandeira |
| Tinta branca e creme | Apostas de US$ 1.000 ou mais feitas por baleias (carteiras que apostam US$ 5.000 ou mais em menos de uma hora) ou por carteiras novas (usadas pela primeira vez menos de 7 dias antes da aposta). A borda de cada gota branca tem a cor de quem recebeu a aposta: vermelho para Lula, amarelo ou verde para Flávio. Essas apostas também fazem um redemoinho na tinta em volta |
| Onde cai a tinta de uma carteira | Dígitos 1 a 4 do endereço (horizontal) e 5 a 8 (vertical) |
| O tom exato | Dígitos 9–10 do endereço definem o matiz, 11–12 a saturação, 13–14 o brilho, 15–16 a opacidade e 17–18 se a tinta de Flávio é amarela ou verde |
| Quanta tinta | O valor apostado: mais gotas e gotas maiores, com anéis nas apostas grandes, espalhadas a partir do código da transação |
| Arrastos de pente | Um por hora. O puxão horizontal segue as odds de Flávio; o vertical, as de Lula |
| Gotas redondas por cima | As duas últimas horas, ainda não penteadas |
| Arrastos em buquê | Uma virada de 3 pontos ou mais nas odds em uma hora |
| Pontos pretos | Os códigos das transações, um ou dois por aposta |
| O fundo | O pUSD, a moeda digital do Polymarket (`0xC011a7…`), levado quase ao preto |

Os limites (valor de uma baleia, idade de uma carteira nova etc.) ficam em `lib.js`. Uma segunda paleta, `contracts` (azul, magenta e vermelho tirados dos endereços dos contratos), pode ser gerada com os mesmos dados usando `--palette contracts`.

### Como instalar (uns dez minutos)

1. Crie um repositório novo no GitHub. Público é mais simples: os minutos do Actions são gratuitos e o Pages funciona no plano gratuito.
2. Envie tudo o que está nesta pasta, incluindo a pasta oculta `.github`, para a branch `main`.
3. Abra **Actions**, ative os workflows se for pedido, escolha **Cash Out hourly** e clique em **Run workflow** uma vez. Um primeiro arquivo aparece em `data/snapshots/` e em `frames/`.
4. Para a página: **Settings → Pages → Deploy from a branch → main / (root)**. A página mostra a hora mais recente e se atualiza sozinha. Ao passar o mouse sobre a imagem, ela mostra de qual carteira é a tinta.

O workflow roda a cada hora cheia. A última execução é às 20:00 UTC de 25 de outubro (17:00 em Brasília, 15:00 no Acre), e essa imagem final fica fixada no momento em que as urnas fecham. O GitHub costuma começar as execuções agendadas alguns minutos atrasado, e às vezes pula uma em horários de muito uso; cada imagem continua registrada na sua hora, e `data/index.json` lista todas as horas que rodaram.

### O que fica guardado

- `data/snapshots/*.json`: o registro principal de cada hora (odds, as apostas das 24 horas, as apostas fora do comum). As imagens são geradas exatamente a partir deles, em qualquer tamanho.
- `frames/*.jpg`: uma imagem de 1600 px por hora, cerca de 1 MB cada, para a página.
- `data/index.json`: uma linha por hora.

Para gerar uma imagem maior a partir de qualquer hora, num computador com Node 20: `npm install` e depois `node render-frame.js data/snapshots/<hora>.json --size 4000 --format png --out grandes`.

### Análise agregada

`analyze.js` roda uma vez por dia (workflow **Cash Out analysis**, ou `npm run analyze` no seu computador) e escreve em `analysis/`:

- `relatorio.md`: um relatório para ler, em português: quem aposta, horários, dinheiro apostado antes das viradas, fusos horários estimados, idade das carteiras, outros mercados e de onde veio o dinheiro.
- `hourly.csv`: todas as horas registradas, com o dinheiro de cada lado, o dos grandes apostadores, o das carteiras novas, as odds e as viradas. Pronto para cruzar com a agenda de campanha.
- `report.json`: os mesmos números, para outras ferramentas.

A análise estuda os grandes apostadores (baleias, carteiras novas sinalizadas e quem somou US$ 5.000 ou mais) em comparação com uma amostra de carteiras comuns, usando o histórico público delas no Polymarket. Nenhum endereço de carteira ou de origem aparece nos resultados, e qualquer número que descreva menos de 3 carteiras fica escondido. `analysis/cache.json` guarda resumos por carteira entre uma execução e outra, para fazer menos consultas; essas carteiras já são públicas nos snapshots.

A seção sobre a origem do dinheiro precisa de uma chave gratuita do Etherscan (etherscan.io → API Keys), salva como secret do repositório com o nome `ETHERSCAN_API_KEY` (Settings → Secrets and variables → Actions). Sem a chave, o resto do relatório funciona normalmente.

### Arquivos

- `collect.js` busca os dados e escreve um snapshot.
- `lib.js` organiza as apostas e detecta as fora do comum.
- `engine.js` é o motor de marmorização (navegador e Node).
- `render-frame.js` gera as imagens.
- `analyze.js` faz a análise agregada.
- `page.html` é a fonte da página; `npm run build` gera `index.html` a partir dela.

---

## English

**What it tracks.** Cash Out follows the money bet on the runoff of Brazil's 2026 presidential election, between Lula and Flávio Bolsonaro, on Polymarket, a betting website that runs on cryptocurrency. Every hour until the polls close on 25 October, the project records every bet placed in the previous 24 hours and turns them into a marbled image, one drop of paint per bet. One image is saved per hour.

**Why.** Who speculates on our futures? Brazil banned betting sites shortly before the first round, yet anyone with a crypto wallet can still bet on who will govern the country, from anywhere in the world, without leaving a name. This project tries to understand how capital flows through today's entanglements of colonial power and technology: whose money moves the odds on a Brazilian election, when it moves, and where it comes from.

**What data it generates and where it is kept.** Everything comes from public sources: Polymarket's public data and the Polygon blockchain, where every bet is recorded. Nothing is collected from anyone who visits the page. All of it is saved in this public repository:

- `data/snapshots/`: one file per hour, with the odds and every bet from the previous 24 hours (time, wallet address, amount, candidate and transaction code), plus any unusual bets: whales and new wallets.
- `frames/`: the image made each hour.
- `data/index.json`: a one-line summary of every hour.
- `analysis/`: a daily aggregate analysis of the largest and most unusual bettors. It covers when they bet, what else they bet on, roughly which time zones they keep, and how their money reached Polygon. It never names wallets; it only reports figures about groups.

The project is open source. Its findings will be collated into a report on the origins of this money over the last weeks of the election.

### Reading the image

| In the image | Comes from |
|---|---|
| Red paint | Bets on Lula (buying Lula "yes" or selling Flávio "yes") |
| Yellow and green paint | Bets on Flávio Bolsonaro, the yellow and green of the flag |
| White and cream paint | Bets of $1,000 or more by whales (wallets that bet $5,000 or more within an hour) or by new wallets (first used less than 7 days before the bet). Each white drop is edged in the colour of the candidate it backs: red for Lula, yellow or green for Flávio. These bets also swirl the paint around them |
| Where a wallet's paint falls | Address digits 1–4 (horizontal) and 5–8 (vertical) |
| The exact shade | Address digits 9–10 set the hue, 11–12 the saturation, 13–14 the brightness, 15–16 the opacity, and 17–18 whether Flávio's paint is yellow or green |
| How much paint | The amount bet: more and larger drops, with rings for big bets, scattered from the transaction code |
| Comb strokes | One per hour. The horizontal pull follows Flávio's odds, the vertical pull Lula's |
| Round drops on top | The last two hours, not yet combed |
| Bouquet strokes | A swing of 3 points or more in the odds within an hour |
| Black dots | Transaction codes, one or two per bet |
| The background | pUSD, Polymarket's digital currency (`0xC011a7…`), taken almost to black |

Thresholds (what counts as a whale, how new a new wallet is, and so on) live in `lib.js`. A second palette, `contracts` (blue, magenta and red taken from the contract addresses), can be rendered from the same data with `--palette contracts`.

### Set-up (about ten minutes)

1. Create a new GitHub repository. Public is simplest: Actions minutes are free and Pages works on the free plan.
2. Upload everything in this folder, including the hidden `.github` folder, and commit to `main`.
3. Open **Actions**, enable workflows if asked, choose **Cash Out hourly**, and click **Run workflow** once. A first file appears in `data/snapshots/` and `frames/`.
4. For the live page: **Settings → Pages → Deploy from a branch → main / (root)**. The page shows the latest hour and refreshes itself. Hovering over the image shows which wallet the paint under the cursor belongs to.

The job runs every hour on the hour. Its last run is at 20:00 UTC on 25 October (17:00 in Brasília, 15:00 in Acre), and that final image is pinned to the moment the polls close. GitHub often starts scheduled runs a few minutes late and sometimes skips one at busy times; each image is still filed under its hour, and `data/index.json` lists every hour that ran.

### What gets kept

- `data/snapshots/*.json`: the master record of each hour (odds, the 24 hours of bets, unusual bets). Images are rendered from these exactly, at any size.
- `frames/*.jpg`: a 1600px image per hour, about 1 MB each, for the live page.
- `data/index.json`: one line per hour.

To render a larger image of any hour on a computer with Node 20: `npm install`, then `node render-frame.js data/snapshots/<hour>.json --size 4000 --format png --out large`.

### Aggregate analysis

`analyze.js` runs once a day (workflow **Cash Out analysis**, or `npm run analyze` locally) and writes `analysis/`:

- `relatorio.md`: a readable report in Portuguese, covering who bets, the hours of day, the money placed ahead of swings, estimated time zones, wallet ages, other markets and where the money came from.
- `hourly.csv`: every recorded hour, with money per side, big-bettor money, new-wallet money, odds and swings. It is ready to set against the campaign calendar.
- `report.json`: the same figures for other tools.

It studies big bettors (whales, flagged new wallets, and anyone with $5,000+ in total) against a sample of ordinary wallets, using their public Polymarket history. No wallet or funder address appears in the outputs, and any figure covering fewer than 3 wallets is hidden. `analysis/cache.json` keeps per-wallet summaries between runs, to save requests; those wallets are already public in the snapshots.

The funding section needs a free Etherscan API key (etherscan.io → API Keys), saved as a repository secret named `ETHERSCAN_API_KEY` (Settings → Secrets and variables → Actions). Without the key, the rest of the report still runs.

### Files

- `collect.js` fetches the data and writes a snapshot.
- `lib.js` organises the bets and detects unusual ones.
- `engine.js` is the marbling engine (browser and Node).
- `render-frame.js` renders the images.
- `analyze.js` runs the aggregate analysis.
- `page.html` is the page source; `npm run build` regenerates `index.html` from it.
