# Correções da revisão final

A revisão de código identificou três problemas, corrigidos em `118f696` e reverificados com `11e2610`. A revisão estática independente confirmou as três correções e não encontrou novos problemas importantes nesse escopo.

- **Proteção WebSocket da captura:** os scripts interceptam `/api/stream`, registram a tentativa e encerram a conexão sem acessar o servidor. Uma tentativa deliberada verifica a proteção depois de confirmar que a missão não fez chamadas à API. O WebSocket de HMR do Vite permanece fora dessa interceptação.
- **Identidade exata do controlador:** os cartões expõem UID, tipo e nome do controlador do alvo e do candidato realmente observado. Captura e verificador exigem `ReplicaSet checkout-demo/demo-rs-checkout` dos dois lados.
- **Checkout do baseline:** `BENCH_BASELINE_ROOT` aponta para o diretório `web` de um checkout com arquivos rastreados limpos. O resultado registra caminho e revisão da fonte, sem depender de um caminho pessoal embutido no script.

## Verificação das correções

O teste WebSocket falhou antes da inclusão da rota e passou depois. As verificações abaixo terminaram com código de saída zero:

```bash
node --test video/scripts/recovery-demo.test.mjs
node --check video/scripts/recovery-demo.mjs
node --check video/scripts/verify-recovery.mjs
node --check video/scripts/capture-demo.mjs
node --check video/scripts/benchmark-visual.mjs
node --check video/scripts/check-scene.mjs
npm exec --prefix web -- tsc --noEmit -p web/tsconfig.json

export DEMO_URL='http://127.0.0.1:7781/?demo'
node video/scripts/test-recovery.mjs
node video/scripts/verify-recovery.mjs
node video/scripts/check-scene.mjs
node video/scripts/check-navigation.mjs
node video/scripts/check-radar.mjs
node video/scripts/check-labels.mjs
node video/scripts/check-audio.mjs
node video/scripts/check-demo-mission.mjs
make web-build
go test -p 1 ./...
go vet -p 1 ./...
CI=true npm run lint --prefix video
```

O teste de concorrência `go test -race -p 1 ./internal/k8s ./internal/server` também passou. O backend não mudou depois desse teste.

## Regressões de integração

- Pods que retornam durante a animação de remoção voltam a pertencer ao namespace reconstruído. O teste cobre snapshot vazio, reconstrução, retorno do mesmo UID e contagem do resumo.
- O mergulho não usa mais o limite obsoleto de 205 unidades. Colisões não deslocam a câmera quando a interação está bloqueada por um painel.
- Disparos aceitam apenas cliques no canvas. A missão verifica que clicar no texto do guia com ataque armado não cria projétil nem operação de exclusão.
- Um gesto de seleção de um pixel sobre um pod abre seus detalhes.
- Movimento reduzido omite exaustão decorativa e trilhas de projéteis.

## Inspeção visual e correção do radar

A inspeção independente de `200-radar.png` encontrou o seletor de alcance como terceiro filho da grade, ocupando uma coluna indevida e deslocando a lista. A medição parcial dessa versão foi interrompida e não representa a versão final.

A suspeita de sobreposição em `200-filter.png` foi retirada após conferir as posições dos três rótulos: eles ocupavam faixas verticais distintas. O título do vídeo foi reduzido e movido para uma área livre durante a introdução; o poster e o quadro de recuperação aos 23 segundos foram inspecionados novamente.

A correção `2aed726` moveu o seletor para o cabeçalho do radar, corrigiu o estilo dos marcadores e tornou distância/altitude visíveis. O heading `Ahead ↑` indica a orientação relativa à câmera. O status é limpo quando o resultado não existe ou não tem posição.

`check-radar.mjs` verifica a estrutura do radar com o CSS real em 1280×720 e 640×800, incluindo colunas, empilhamento, limites da tela e estado vazio. As capturas [desktop](../screenshots/visual-feedback/radar-1280x720.png) e [estreita](../screenshots/visual-feedback/radar-640x800.png) foram conferidas. Após a correção, TypeScript, build incorporado, testes/vet Go, navegação, rótulos, missão e radar passaram novamente.

## Revisão das capturas finais

A revisão independente das imagens de `05bc429` não encontrou novos problemas concretos de legibilidade ou oclusão. Overview, filtro e radar permanecem legíveis; os rótulos filtrados ocupam linhas distintas. O pod focado fica inteiramente visível e livre do painel em 1280×720 e 1600×900; o limite de 60% da altura útil também é verificado numericamente pelo teste de cena.

Mergulho, impacto normal e impacto reduzido preservam controles e indicação do alvo. As imagens estáticas não substituem a avaliação manual do movimento. O [registro de validação](game-experience-2026-09-22.md) reúne o vídeo, o manifesto das capturas e os limites dos testes.
