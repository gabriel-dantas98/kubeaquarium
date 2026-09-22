# Validação da experiência — 22/09/2026

Implementação na branch `codex/game-experience`, em worktree separado. Base: `e31be2d`.
Não houve publicação, merge ou operação em cluster real. As interações destrutivas dos testes usam demo local ou HTTP/WebSocket simulados.

## Entregas

- Centros de namespaces estáveis, Overview com enquadramento global, resumos de densidade e rótulos limitados a 16 pods/12 namespaces.
- Mergulho com olhar por arrasto direito, arbitragem de teclado/painéis e preferências persistentes.
- Radar com posições reais, alcance selecionável, altitude e indicação explícita de posição indisponível.
- Estados visuais por instância, pods concluídos imóveis, foco com espaço para o painel e efeitos de impacto contidos.
- Som opcional iniciado por gesto; mute e suspensão ao ocultar a aba. Preferência compartilhada de movimento reduzido.
- Recuperação acompanhada por identidade de pod/controlador e evidência observada, sem interpretar aceite HTTP como recuperação.
- Missão simulada repetível e vídeo de aproximadamente 31 segundos gerado a partir das etapas realmente observadas.

## Verificações executadas

| Verificação | Evidência |
|---|---|
| TypeScript e build Vite | `npm exec --prefix web -- tsc --noEmit -p web/tsconfig.json`; `make web-build` |
| Backend | `go test -p 1 ./...`; `go vet -p 1 ./...` |
| Concorrência | `go test -race -p 1 ./internal/k8s ./internal/server` |
| Entrada e câmera | `video/scripts/check-navigation.mjs` |
| Layout, enquadramento, estados e impacto | `video/scripts/check-scene.mjs` |
| Radar e identidade dos marcadores | `video/scripts/check-radar.mjs` |
| Rótulos e limites de DOM | `video/scripts/check-labels.mjs` |
| Áudio, preferência e visibilidade | `video/scripts/check-audio.mjs` |
| Recuperação e reconciliação | `video/scripts/test-recovery.mjs` |
| Missão com aceite HTTP atrasado e duas repetições | `video/scripts/check-demo-mission.mjs` |
| Captura simulada | `video/scripts/verify-recovery.mjs`; lint, render e still em `video` |

A revisão independente encontrou lacunas na proteção WebSocket da captura, na asserção exata do controlador e na portabilidade do benchmark. A correção consolidada e sua reverificação estão em andamento.

## Desempenho

O protocolo completo compara 200, 1.200 e 2.500 pods, cinco cenários e três rodadas por versão, com 10 segundos de aquecimento e 30 segundos de amostragem. As versões são medidas sequencialmente para evitar concorrência de GPU entre testes. Amostras curtas servem apenas para validar o script, não para afirmar melhoria de FPS.

Medição longa e teste de 50 ciclos ainda em andamento; resultados finais serão vinculados aqui.

## Limites da validação

- Build emite o aviso existente de bundle maior que 500 kB; isso não impede a compilação.
- Os testes de câmera foram automatizados em Chromium. Não substituem avaliação manual de trackpad e navegadores diferentes.
- Não foi preservada a falha inicial histórica de todos os testes da implementação anterior; nenhuma evidência RED foi reconstruída artificialmente.
- Capacidade de instâncias não é garantia de taxa de quadros.

## Decisões registradas durante a execução

As decisões abaixo preservam a ordem do registro da execução e explicitam o custo de revisá-las:

- Execute parallel independent modules as explicitly requested, serial shared-file integration by coordinator — avoids conflicting edits — cost if wrong: integration rework.
- Use sibling worktree and existing dependency symlinks — preserve user working tree and avoid redundant installs — cost if wrong: install isolated dependencies.
- Supersede earlier parallel implementation ruling with sequential fresh implementers and separate reviews per invoked skill — user requested smaller-model SDD — cost if wrong: longer elapsed time.
- Preserve and verify existing sibling worktree changes before new implementation — avoids losing prior work — cost if wrong: extra audit time.
- Commit preexisting implementation as an explicit unverified checkpoint before task fixes — makes each subsequent review diff scoped — cost if wrong: checkpoint needs rewriting before merge.
- Planning-only prohibitions in September 10 subplans describe their authoring session; current explicit request authorizes implementation and local validation — no publishing or real cluster deletion — cost if wrong: local changes to discard.
- Use Terra for final whole-branch review too, superseding earlier Astra selection — user explicitly requested smaller models, which overrides skill model preference — cost if wrong: subtle whole-branch issues may need follow-up review/rework.
- Prepare isolated benchmark script and immutable baseline in parallel with feature work; no shared implementation files — measurements need long wall time and baseline code is immutable — cost if wrong: rerun measurements if resource contention invalidates them.
- Task8 label DOM/CSS subset runs independently of task5 controls with disjoint ownership; scene integration stays sequential — fixes a confirmed visible defect while navigation finishes — cost if wrong: repeat visual browser assertions.
- Continue inline when agent spawn and followup both report agent thread limit reached — tools prevent fresh implementers/reviewers; complete authorized work with direct tests and explicit review limitation — cost if wrong: reduced independent review coverage.
