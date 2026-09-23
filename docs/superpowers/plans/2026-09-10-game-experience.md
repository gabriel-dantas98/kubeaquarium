# Experiência de exploração e recuperação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar navegação previsível, cena legível e recuperação observada com feedback fiel ao Kubernetes.

**Architecture:** Manter a aplicação atual e adicionar capacidades em três frentes, com módulos de responsabilidade limitada. Alterações no contrato Go/TypeScript/demo são atômicas; conexões em main.ts e scene.ts são integradas sequencialmente pelo coordenador.

**Tech Stack:** Go/client-go, TypeScript, Three.js, DOM/CSS, Vite, Playwright existente em video, Remotion.

**Spec:** [Design e critérios globais](../specs/2026-09-10-game-experience-design.md).

## Global Constraints

- Preservar TypeScript, Three.js, DOM, Go e client-go; nenhuma troca de engine ou framework.
- Não manter compatibilidade com contratos obsoletos; servidor, frontend e demo evoluem juntos.
- Reutilizar dependências existentes; não adicionar biblioteca para funções já disponíveis no projeto.
- Manter instancing e degradação adaptativa; efeitos visuais não podem comprometer informação operacional.
- Nenhuma implementação de pontuação por exclusão, combate competitivo, inventário ou física geral.
- Testes e captura de vídeo usam demo determinística ou respostas simuladas; não excluem pods de clusters reais.
- Informações essenciais usam texto ou símbolos além de cor; movimento reduzido e mute devem funcionar.
- Não declarar recuperação causal ou tempo exato quando o stream não oferece evidência suficiente.
- Arquivos compartilhados têm um único responsável por vez; integrar main.ts e scene.ts sequencialmente.
- Documentação técnica em português; manter a interface do produto em inglês, seguindo o projeto.

## Documentos e delegação realizada

| Subagente | Plano | Responsabilidade |
|---|---|---|
| navigation_plan | [Navegação](2026-09-10-navigation.md) | Controles, estabilidade espacial, sonar e enquadramento |
| visual_plan | [Visual e feedback](2026-09-10-visual-feedback.md) | Legibilidade, animação, áudio, efeitos e baseline |
| recovery_plan | [Recuperação e demo](2026-09-10-recovery-demo.md) | Contrato, exclusão, reconciliação, missão e vídeo |
| Coordenador | Este documento e spec | Dependências, arbitragem de arquivos e verificação integrada |

Este documento foi criado na rodada de planejamento. A implementação foi retomada em setembro de 2026 na branch `codex/game-experience`; o [registro de validação](../../validation/game-experience-2026-09-22.md) reúne entregas, verificações e limitações atuais. Os subplanos preservam seus checklists originais como critérios de referência.

## Alternativas e decisão

1. **Polimento visual primeiro:** gera resultados visíveis rapidamente, mas não resolve controles nem credibilidade do feedback.
2. **Camadas funcionais, escolhida:** corrigir interação e contratos, tornar o espaço legível, acrescentar sonar/recuperação e só então enriquecer apresentação.
3. **Reescrita em engine/framework:** custo e risco sem benefício demonstrado para os requisitos; descartada.

## Mapa de execução

### Onda 0 — baseline e contratos

- [x] Coordenador registra revisão Git, estado de trabalho, navegador/versão, viewport, DPR e máquina. Preservar AGENTS.md preexistente não rastreado e mudanças do usuário.
- [x] Agente visual cria e executa baseline reproduzível a partir da revisão original, conforme o ajuste de execução descrito abaixo.
- [x] Agente de recuperação fecha tipos Go/TS, UID precondition e casos de eventos fora de ordem; alterações em types.ts e demo.ts são exclusivas dessa frente.
- [x] Coordenador verifica que nomes e assinaturas dos módulos novos nos três planos não conflitam.

**Entrega:** evidência inicial salva e contratos implementáveis definidos. Nenhuma medição histórica é apresentada como baseline desta execução.

**Ajuste de execução:** o baseline completo foi medido posteriormente em um checkout limpo e imutável de `e31be2d`, com o mesmo runner usado na versão final. Portanto, a ordem literal “executar antes de modificar” não foi cumprida; a separação das fontes preserva a comparação com o código anterior.

### Onda 1 — interação e estados verdadeiros

- [x] Agente de navegação corrige arbitragem de teclado, perda de foco, Escape, drag-versus-click e pilotagem.
- [x] Agente de recuperação implementa projeção do owner/readiness e exclusão com UID, com testes Go e eventos simulados.
- [x] Agente visual corrige hierarquia de camadas e política de rótulos em arquivos próprios após baseline.
- [x] Coordenador integra chamadas em main.ts e scene.ts uma frente por vez; roda typecheck, build e testes relevantes após integração.

**Entrega:** digitar não pilota; painéis não recebem rótulos da cena por cima; API aceita uma exclusão sem anunciar remoção antecipadamente; erros ficam visíveis.

### Onda 2 — espaço legível e navegável

- [x] Agente de navegação implementa posicionamento estável dos namespaces e retorno à visão geral.
- [x] Após liberar namespaces.ts, agente visual aplica contornos e transição interior/exterior.
- [x] Agente de navegação conecta sonar a coordenadas reais e sinaliza altura/alcance/alvo.
- [x] Coordenador integra enquadramento considerando painel lateral, resumos distantes e preferências de conforto.
- [x] Comparar capturas overview/filter/radar/detail/dive nas mesmas condições do baseline.

**Entrega:** mudança no número de pods não reposiciona namespaces existentes; usuário encontra e reencontra um alvo; dentro de uma bolha a grade não domina a visão.

### Onda 3 — recuperação observada

- [x] Agente de recuperação implementa tracker e reconciliação, sem confundir pods existentes com substitutos.
- [x] Exercitar exclusão concorrente, pod sem owner, novo UID com mesmo nome, eventos perdidos, reconexão, timeout e erro HTTP.
- [x] Coordenador conecta apresentação dos estados ao tracker; somente confirmação observada dispara mensagem correspondente.
- [x] Agente visual associa animações de saúde e recuperação aos estados confirmados.

**Entrega:** operação tem resultado legível e a aplicação explicita incerteza quando a evidência é incompleta. Tempo de recuperação só aparece quando sua origem temporal é conhecida.

### Onda 4 — impacto, som e demonstração

- [x] Agente visual refina impacto com pools limitados e áudio opcional, incluindo mute/movimento reduzido.
- [x] Agente de recuperação implementa cenário determinístico e missão pulável/reiniciável na demo.
- [x] Atualizar captura para recusar execução real e esperar transições observadas, sem mascarar o contexto de um cluster real.
- [x] Atualizar composição do vídeo com investigação, ação simulada e recuperação; renderizar e inspecionar resultado.
- [x] Coordenador executa verificação final e atualiza README para os controles/limites efetivos.

**Entrega:** uma sessão demonstrável completa, desde localizar falha até observar recuperação, acompanhada de vídeo e evidência de desempenho.

## Propriedade de arquivos durante execução

| Arquivos | Escritor permitido |
|---|---|
| web/src/camera.ts e módulos novos de navegação | Agente de navegação |
| web/src/hud/radar.ts | Agente de navegação |
| web/src/namespaces.ts | Navegação primeiro; visual somente após liberação |
| web/src/hud/labels.ts, whale.ts, novos módulos de efeitos/áudio | Agente visual |
| internal/k8s/*, internal/server/*, web/src/types.ts, stream.ts, demo.ts, tracker novo | Agente de recuperação |
| video/src/* e capture-demo.mjs | Recuperação/demo após estabilizar comportamento |
| web/src/main.ts, scene.ts, hud/hud.css, web/index.html | Coordenador, ou um agente com posse explícita temporária |
| package.json, lockfiles e configuração comum de testes | Coordenador, uma alteração consolidada |

Subagentes devem entregar módulo e instruções de ligação quando não têm posse do arquivo compartilhado. O coordenador integra o código funcional na mesma entrega; não deixar stubs ou módulos sem uso como resultado final. Não executar builds simultâneos no mesmo diretório de saída. Não usar commits globais que capturem alterações de outro agente.

## Contrato de despacho de uma tarefa

Cada despacho recebe: caminho do repo; spec e seção exata do subplano; objetivo observável; arquivos permitidos; assinaturas aprovadas; comandos de verificação; exclusões de escopo; formato de retorno. Usar contexto isolado (`fork_turns: none`), com no máximo três agentes executores e um coordenador.

Exemplo para a primeira correção:

```text
Implemente a tarefa de arbitragem de input do plano de navegação.
Leia AGENTS.md, a spec e o plano. Preserve campos editáveis e modais:
digitar f não alterna mergulho; blur limpa movimento; Escape tem um único efeito.
Posse: camera.ts e módulo/testes de input definidos no plano.
Não edite main.ts/scene.ts: devolva a ligação exata para o coordenador.
Não opere clusters reais. Retorne arquivos alterados, comandos/resultados,
casos testados e limitações. Não implemente sonar ou efeitos nesta tarefa.
```

## Verificação integrada

Os subplanos definem os testes específicos que serão criados; hoje web/package.json não possui runner de testes. Não afirmar execução de scripts futuros antes de implementá-los.

Comandos já suportados, executados a partir da raiz:

```bash
npm exec --prefix web -- tsc --noEmit -p web/tsconfig.json
KUBEAQUARIUM_WEB_OUT_DIR=/tmp/kubeaquarium-review-build npm run build --prefix web
go test ./...
go vet ./...
npm run lint --prefix video
```

O build temporário verifica frontend sem sobrescrever dist rastreado. Na entrega integrada, executar `make web-build` antes de verificar o binário Go com assets atualizados. Dependências devem estar instaladas nos projetos correspondentes para os comandos npm.

Checklist comportamental final:

- [x] Filtro/radar recebem digitação sem movimentar câmera.
- [x] Mouse orienta mergulho; perder foco não deixa movimento preso.
- [x] Seleção permanece visível ao lado de detalhes; radar não é coberto por labels.
- [x] Alterar réplicas preserva centros dos namespaces existentes.
- [x] Sonar representa direção real, inclusive rotação e diferenças de altura.
- [x] HTTP aceito e remoção observada têm mensagens diferentes.
- [x] Recuperação não reutiliza uma réplica anterior como substituta.
- [x] Reconexão/lacuna não produz duração fictícia.
- [x] Demo e captura não enviam DELETE real.
- [x] Som desativado permanece silencioso; movimento reduzido elimina tremor.
- [x] Baseline e resultado registram p50/p95/p99 brutos e resolução efetiva.

Critério de encerramento: cada checkbox tem evidência ou limitação explícita; não declarar a onda completa apenas por build bem-sucedido. Alterações puramente documentais desta rodada são verificadas por revisão de cobertura, links e consistência, sem executar a suíte do produto desnecessariamente.
