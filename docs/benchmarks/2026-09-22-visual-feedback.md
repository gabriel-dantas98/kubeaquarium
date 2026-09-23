# Gate visual e orçamento de frames — 2026-09-22

Execuções sintéticas HTTP+WebSocket, Chromium headless 149.0.7827.55, macOS 26.5.2, CPU Apple M4 e GPU ANGLE Metal/Apple M4; 1440×900, DPR 1, aquecimento 10 s e medição 30 s. Baseline `e31be2d8ab98346c2af7d54bf983f941dc4c2f7b`, final `05bc42919235824d13dad6699213dd7c1b4c395f`. Sistema confirmado por `sw_vers`: macOS 26.5.2, build 25F84; kernel Darwin 25.5.0. O processo final terminou com código de saída zero. Dados: [baseline](2026-09-22/baseline/metrics.json), [final](2026-09-22/final/metrics.json), [CSV](2026-09-22/comparison.csv) e [leak](2026-09-22/leak-post-radar.json).

A tabela mostra a mediana dos p50/p95/p99 de três rodadas, em milissegundos. A coluna >50 ms soma os intervalos nas três rodadas; Δ compara as medianas de p95. Cada versão tem 45 janelas de medição.

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

Nenhum p95 regrediu mais de 10%; 200 pods ficou abaixo de 20 ms. FPS observado é `frames / (sum(rawMs)/1000)`, derivado dos intervalos rAF, não da média histórica. As medianas finais ficaram entre 59.97 e 60.00 FPS. Os valores por cenário estão no CSV completo de 15 linhas. Esses valores descrevem a cadência observada nessa máquina e navegador, não garantem a mesma taxa em outros dispositivos. Impacto mede um acerto/DELETE sintético por janela, em vez dos dez impactos propostos no plano inicial. Os 50 ciclos cobrem repetição separadamente: DOM 205–207, geometrias 27 e texturas zero após aquecimento, sem crescimento contínuo. Os contadores de recursos GPU do baseline não estão disponíveis; ausência de dado não significa zero. Screenshots de benchmark [baseline](2026-09-22/baseline/) e [final](2026-09-22/final/) são pós-janela; capturas demo imediatas ao hit ficam no [manifesto visual](../screenshots/visual-feedback/manifest.json), com a limitação da janela curta de partículas. A pasta local `benchmark-full-final` contém uma execução parcial anterior à correção do radar e não participa desta comparação.

## Reprodução

Na raiz do worktree, com dependências de `web` e `video` instaladas e um checkout separado e limpo da revisão original:

```bash
BENCH_TARGET=baseline \
  BENCH_BASELINE_ROOT='/caminho/absoluto/checkout-original/web' \
  BENCH_OUTPUT='output/playwright/benchmark-baseline' \
  node video/scripts/benchmark-visual.mjs

BENCH_TARGET=final \
  BENCH_OUTPUT='output/playwright/benchmark-final' \
  node video/scripts/benchmark-visual.mjs
```

O runner inicia servidores locais automaticamente; execute as versões sequencialmente, sem outros testes gráficos ou renderizações. O baseline desta execução foi obtido depois do início da implementação, a partir do checkout imutável original. O mesmo runner de cenários e amostragem foi usado nas duas fontes; a validação posterior de `BENCH_BASELINE_ROOT` tornou a seleção da fonte reproduzível sem alterar a medição.
