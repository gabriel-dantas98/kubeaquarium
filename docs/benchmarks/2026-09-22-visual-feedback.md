# Gate visual e orçamento de frames — 2026-09-22

Execuções sintéticas HTTP+WebSocket, Chromium headless 149.0.7827.55, macOS 26.5.2, CPU Apple M4 e GPU ANGLE Metal/Apple M4; 1440×900, DPR 1, aquecimento 10 s e medição 30 s. Baseline `e31be2d`, final `05bc429`. Dados: [baseline](2026-09-22/baseline/metrics.json), [final](2026-09-22/final/metrics.json), [CSV](2026-09-22/comparison.csv) e [leak](2026-09-22/leak-post-radar.json).

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

Nenhum p95 regrediu mais de 10%; 200 pods ficou abaixo de 20 ms. FPS observado é `frames / (sum(rawMs)/1000)`, derivado do raw rAF, não da média histórica. Impacto mede um acerto/DELETE sintético por janela; 50 ciclos cobrem repetição. Screenshots de benchmark [baseline](2026-09-22/baseline/) e [final](2026-09-22/final/) são pós-janela; capturas demo imediatas ao hit ficam em `docs/screenshots/visual-feedback/`.

Reprodução: `BENCH_BASELINE_ROOT=/Users/gdantas/git/gdantas/kubeaquarium/web BENCH_TARGET=baseline BENCH_OUTPUT=... node video/scripts/benchmark-visual.mjs`; repetir com `BENCH_TARGET=final` e URL local.
