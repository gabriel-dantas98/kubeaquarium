# Gate visual e orçamento de frames — 2026-09-22

Execuções sintéticas HTTP+WebSocket, Chromium headless, 1440×900, DPR 1, aquecimento 10 s e medição 30 s. Cada célula é a mediana de três rodadas; valores são p50/p95/p99 em ms. O baseline usou `/Users/gdantas/git/gdantas/kubeaquarium/web` em `e31be2d`; o final usou a fonte congelada pós-radar. Dados brutos: `output/playwright/benchmark-full-baseline/metrics.json` e `output/playwright/benchmark-full-final-post-radar/metrics.json`.

| pods | cenário | baseline | final | Δ p95 | >50 ms b/f |
|---:|---|---|---|---:|---:|
|200|overview|16.7/17.6/17.7|16.7/17.4/17.6|-1.1%|0/0|
|200|filter|16.7/17.6/17.7|16.7/17.2/17.6|-2.3%|0/0|
|200|radar|16.7/17.6/17.7|16.7/17.4/17.6|-1.1%|0/0|
|200|dive|16.7/17.6/17.7|16.7/17.3/17.6|-1.7%|0/0|
|200|impact|16.7/17.5/17.7|16.7/17.4/17.6|-0.6%|0/0|
|1200|overview|16.7/17.5/17.6|16.7/17.4/17.7|-0.6%|0/0|
|1200|filter|16.7/17.6/17.6|16.7/17.2/17.6|-2.3%|0/0|
|1200|radar|16.7/17.6/17.6|16.7/17.4/17.6|-1.1%|0/0|
|1200|dive|16.7/17.6/17.6|16.7/18.2/18.6|3.4%|0/0|
|1200|impact|16.7/17.5/17.6|16.7/18.3/18.6|4.6%|0/0|
|2500|overview|16.7/17.5/17.7|16.7/18.3/18.6|4.6%|0/0|
|2500|filter|16.7/17.6/17.7|16.7/18.3/18.6|4.0%|0/0|
|2500|radar|16.7/17.6/17.7|16.7/18.3/18.6|4.0%|0/0|
|2500|dive|16.7/17.6/17.7|16.7/18.3/18.6|4.0%|0/0|
|2500|impact|16.7/17.6/17.7|16.7/18.2/18.6|3.4%|0/0|

Nenhum p95 regrediu mais de 10%; 200 pods ficou abaixo da meta de 20 ms. O impacto mede um acerto com DELETE sintético confirmado durante a janela, não dez impactos simultâneos. A repetição de recursos foi coberta separadamente por 50 ciclos: DOM 205–207, geometrias 27 e texturas 0 constantes. O baseline não expõe contagens de recursos GPU: são `null`, não zero. As capturas em `docs/screenshots/visual-feedback/` foram feitas após a janela medida; imagens de impacto são imediatas ao hit, mas o manifesto registra a limitação do efeito de 250 ms.
