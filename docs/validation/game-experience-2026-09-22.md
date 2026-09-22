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

A revisão independente encontrou lacunas na proteção WebSocket da captura, na asserção exata do controlador e na portabilidade do benchmark. As três foram corrigidas e a reverificação ficou limpa. Os testes integrados também cobrem disparo somente sobre o canvas, seleção com gesto de um pixel, retorno de namespace e limites de câmera. Veja [correções e revisão](final-review-fixes.md). A inspeção das capturas também revelou o seletor de alcance ocupando uma coluna indevida no radar. O controle foi movido para o cabeçalho, os marcadores receberam estilo explícito e a distância/altitude ficou visível. A regressão agora é verificada com DOM e CSS nos tamanhos 1280×720 e 640×800.

## Evidência visual

Foram geradas 16 capturas da demo em 1600×900 e 1280×720: overview, filtro, radar, foco, mergulho e impacto, incluindo mergulho/impacto com movimento reduzido. O [manifesto](../screenshots/visual-feedback/manifest.json) registra ausência de erros e de interseções entre rótulos/painéis. Capturas de impacto congelam o frame imediatamente após o acerto; a janela curta pode limitar a quantidade de partículas visíveis.

- [Overview](../screenshots/visual-feedback/1600x900-overview.png)
- [Filtro](../screenshots/visual-feedback/1600x900-filter.png)
- [Radar](../screenshots/visual-feedback/1280x720-radar.png) e [layout estreito](../screenshots/visual-feedback/radar-640x800.png)
- [Foco](../screenshots/visual-feedback/1600x900-focus.png)
- [Impacto normal](../screenshots/visual-feedback/1280x720-impact.png) e [reduzido](../screenshots/visual-feedback/1280x720-impact-reduced.png)
- [Vídeo de aproximadamente 31 segundos](../video/kubeaquarium-demo.mp4)

## Desempenho

O protocolo completo compara 200, 1.200 e 2.500 pods, cinco cenários e três rodadas por versão, com 10 segundos de aquecimento e 30 segundos de amostragem. As versões são medidas sequencialmente para evitar concorrência de GPU entre testes. Amostras curtas servem apenas para validar o script, não para afirmar melhoria de FPS.

O teste de 50 ciclos passou, alternando 25 ciclos normais e 25 com movimento reduzido, com 50 exclusões simuladas. Após o aquecimento, o DOM variou de 205 a 207 elementos; as geometrias permaneceram em 27 e as texturas em zero. A comparação completa de frame-time ainda está em andamento; os resultados serão vinculados aqui.

## Limites da validação

- Build emite o aviso existente de bundle maior que 500 kB; isso não impede a compilação.
- Os testes de câmera foram automatizados em Chromium. Não substituem avaliação manual de trackpad e navegadores diferentes.
- Não foi preservada a falha inicial histórica de todos os testes da implementação anterior; nenhuma evidência RED foi reconstruída artificialmente.
- Capacidade de instâncias não é garantia de taxa de quadros.

## Decisões registradas durante a execução

As decisões abaixo preservam a ordem do registro da execução e explicitam o custo de revisá-las:

1. Paralelizar módulos independentes, como solicitado, e integrar arquivos compartilhados sequencialmente. Evita edições concorrentes; uma divisão inadequada custa retrabalho de integração.
2. Usar um worktree vizinho e reutilizar dependências instaladas. Preserva o diretório original; se a reutilização falhasse, seria necessário instalar dependências isoladas.
3. Na retomada, adotar executores novos e revisões separadas por tarefa, conforme a skill invocada e a preferência por modelos menores. O custo foi maior tempo de execução.
4. Preservar e verificar a implementação já existente antes de continuar. Evita perder trabalho; custa uma auditoria adicional.
5. Registrar a implementação anterior como checkpoint explicitamente não verificado. Facilita revisões por diferença; se inadequado, exigiria reorganizar o histórico antes da integração.
6. Interpretar as proibições de implementação dos subplanos como restritas à rodada original de planejamento. O pedido posterior autorizou implementação e testes locais; nenhuma publicação ou exclusão real foi feita. Uma interpretação incorreta deixaria mudanças locais para descartar.
7. Usar Terra também na revisão final, conforme a preferência expressa por modelos menores. O risco é precisar de revisão adicional para problemas sutis.
8. Preparar benchmark e baseline imutável em paralelo à implementação, mas executar as medições sem concorrência de testes. Se houvesse disputa de recursos, seria necessário repetir as amostras.
9. Corrigir os rótulos em paralelo aos controles, com arquivos distintos e integração da cena sequencial. Uma interação inesperada exigiria repetir os testes visuais.
10. Continuar localmente quando a ferramenta recusou criação e retomada de agentes por limite de tarefas. Isso reduziu a revisão independente por unidade naquele momento; a revisão final independente e as verificações integradas foram realizadas depois.
