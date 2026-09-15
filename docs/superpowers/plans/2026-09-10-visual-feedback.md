# Legibilidade, feedback e desempenho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o aquário legível em visão geral e mergulho, com feedback de estado e ações que preserva a orientação e o orçamento de renderização.

**Architecture:** Manter Three.js, os meshes instanciados e a separação atual entre cena e HUD. Corrigir seleção e apresentação de labels, substituir a malha de contorno e acrescentar apenas módulos pequenos para medição e áudio; integrar alterações em arquivos compartilhados sequencialmente.

**Tech Stack:** TypeScript, Three.js 0.180, Vite 7, stats.js, CSS e Web Audio nativo; nenhuma dependência nova de runtime.

**Spec:** [Game experience design](../specs/2026-09-10-game-experience-design.md).

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

- Plano apenas: este documento não autoriza implementar, executar deleções reais ou publicar.
- Aplicar AGENTS.md: sem compatibilidade retroativa, sem fallback legado, sem refatoração geral; cada entrega deve funcionar ponta a ponta.
- Manter instancing de baleias, projéteis, bolhas e fragmentos; não criar material, luz, DOM ou áudio por pod.
- Movimento reduzido preserva estados estáticos e controles. Áudio começa desligado, depende de gesto explícito e possui mute persistente.
- Não interpretar capacidade de 20.000 instâncias como benchmark de 20.000 pods.

## Evidência e limites

Inspeção de `docs/screenshots/dive.jpg`, `explosion.jpg` e `radar.jpg`: a triangulação da esfera ocupa o interior inteiro no mergulho; baleias próximas e fragmentos grandes cobrem o centro; labels atravessam o radar. São evidências históricas, não medições de uma execução atual. `namespaces.ts/buildBubble` cria duas esferas 32×24, uma wireframe. `scene.ts/computeLabelTargets` interrompe após os primeiros 80 candidatos, antes de priorizar foco. `labels.ts` ordena, mede e reescreve HTML a cada frame. O fluxo já define `matched=false` sem filtro: não corrigir um bug inexistente nesse ponto.

`docs/benchmarks/20260701T194543Z/final/metrics.json` registra 222 pods, média 120,6 FPS, dez amostras de FPS e um erro de pointer lock classificado como não fatal. Seu p95 é percentil de FPS, não p95 de frame-time. Não permite inferir desempenho atual, ausência de travamentos nem capacidade de 20.000 pods.

## Arquivos e integração

| Arquivo | Responsabilidade nesta trilha |
| --- | --- |
| `web/src/frame-metrics.ts` (novo) | Amostra limitada de intervalos rAF e resumo de percentis |
| `web/src/scene.ts` | Integração de medição, projeção, shader, efeitos e limites |
| `web/src/namespaces.ts` | Contorno das bolhas; remoção de sprite quando resumo HTML chegar |
| `web/src/hud/labels.ts` | Pool estável, layout e limites de labels |
| `web/src/hud/hud.css` | Ordem de camadas, contraste, movimento reduzido |
| `web/src/whale.ts` | Animação de estados no material instanciado |
| `web/src/audio.ts` (novo) | Um contexto de áudio, ganho mestre e cues limitados |
| `web/src/main.ts`, `web/index.html` | Composição e controles de preferências |
| `docs/benchmarks/2026-09-10-visual-feedback.md` (novo na execução) | Baseline e comparação reproduzível |

`main.ts`, `scene.ts` e `namespaces.ts` também pertencem às trilhas de navegação e interação. O coordenador deve conceder propriedade exclusiva por entrega; nunca dois agentes alterando esses arquivos simultaneamente. Fazer primeiro contratos de modo/modal da navegação, depois labels/contornos, depois estados/efeitos e por último medição final. Módulo de áudio pode ser produzido isoladamente, mas sua integração aguarda liberação de `main.ts`.

### Task 1: Baseline que mede os frames corretos

**Files:** criar `web/src/frame-metrics.ts`; modificar `web/src/scene.ts`, `web/src/main.ts`; criar relatório de benchmark acima.

**Interfaces:** `FrameMetrics.record(timestamp: number): void`, `reset(): void`, `snapshot(): { samples: number; p50Ms: number; p95Ms: number; p99Ms: number; over50Ms: number }`. Expor `scene.getFrameMetrics()` no objeto debug já existente. Capacidade fixa de 3.600 intervalos, sobrescrita circular; ordenar somente ao solicitar snapshot.

- [ ] Registrar antes de qualquer mudança visual: navegador, versão, GPU, resolução, DPR efetivo, refresh rate, carga real e modo. Rodar demo com `cd web && VITE_KUBEAQUARIUM_DEMO=1 npm run dev -- --host 127.0.0.1`; aquecer 10 s, medir 30 s em overview, dive, filtro, radar e dez impactos de demo. Repetir três vezes.
- [ ] Implementar intervalo bruto do callback rAF, antes do clamp de simulação. Resetar após pausa/tab oculto; não excluir frames lentos de uma janela ativa:

```ts
record(timestamp: number) {
  if (this.last !== undefined) {
    this.values[this.cursor] = timestamp - this.last;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  this.last = timestamp;
}
```

Definir `last: number | undefined`, `values = new Float64Array(3600)`, `cursor = 0`, `count = 0`. `reset` limpa last/cursor/count; snapshot copia somente count valores, ordena e usa índice `ceil(n*p)-1`, retornando zeros sem amostras. `over50Ms` conta valores estritamente maiores que 50.

- [ ] Validar manualmente no navegador: `record(0); record(10); record(30)` dá duas amostras, p50=10/p95=20; após reset e `record(1000)` não há intervalo. Inspecionar `renderer.info.render.calls`, geometrias/texturas e DOM antes/depois dos cenários.
- [ ] Rodar `cd web && npx tsc --noEmit && npm run build`. Salvar dados brutos e procedimento no relatório. Commit de entrega sugerido: `perf: record reproducible frame timing baseline`.

**Aceite:** métricas independem de `fpsAvg` e do dt limitado a 0,1 s; relatório não converte média FPS em percentil de ms. Comparação posterior usa mesmo dispositivo e DPR; meta inicial p95 ≤20 ms com 200 pods no ambiente de referência que atingir essa marca no baseline. Se baseline já exceder, registrar essa limitação e investigar regressões maiores que 10% antes da integração.

### Task 2: Bolhas com contorno e interior limpo

**Files:** modificar `web/src/namespaces.ts`, `web/src/scene.ts`.

**Interfaces:** preservar `buildBubble(layout: NamespaceLayout): THREE.Group`; cada grupo tem somente um shell visual, além do label atual até a Task 3. Atualização de câmera usa uniforms do material, sem reconstrução de geometria.

- [ ] Capturar overview e câmera dentro da maior bolha em 1600×900 e 1280×720; registrar contagem de draw calls.
- [ ] Substituir ambas as esferas visuais por um shell `ShaderMaterial` transparente, `depthWrite:false`, `side:THREE.DoubleSide`, sem wireframe. Vertex transmite posição e normal em espaço de câmera; fragmento usa:

```glsl
float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vViewPosition))), 3.0);
float alpha = mix(0.012, 0.20, rim) * uVisibility;
gl_FragColor = vec4(vec3(0.43, 0.76, 0.96), alpha);
```

`vViewPosition=(modelViewMatrix*vec4(position,1.0)).xyz`, `vNormal=normalMatrix*normal`; ambos declarados nos shaders. Criar `uVisibility` inicialmente 1. Dentro da bolha, interpolar para 0,15 usando distância câmera/centro e margem 1 unidade; fora, 1. Evitar liga/desliga abrupto na fronteira.
- [ ] Repetir capturas; confirmar fronteira reconhecível no overview e nenhum triângulo atravessando a visão no mergulho. Não mudar layout físico nem colisão nesta tarefa.
- [ ] Rodar `cd web && npx tsc --noEmit && npm run build`; comparar draw calls, exigindo redução ou estabilidade. Commit: `feat: replace namespace grids with subtle contours`.

**Aceite:** zero wireframe de namespace, sem nova luz/postprocessing, sem efeito de parede brilhante ao atravessar a fronteira; remoção de namespace libera geometria/material. Se textura de sprite for removida na tarefa seguinte, liberar também `material.map`.

### Task 3: Labels contextuais e resumos distantes

**Files:** modificar `web/src/hud/labels.ts`, `web/src/hud/hud.css`, `web/src/scene.ts`, `web/src/main.ts`, `web/src/namespaces.ts`.

**Interfaces:** exportar `LabelContext = { mode: 'overview' | 'dive'; filterActive: boolean; modalOpen: boolean; blockedRects: readonly DOMRectReadOnly[] }`. Alterar `render(targets: readonly LabelTarget[], context: LabelContext): void`. Exportar `NamespaceLabelTarget = { namespace: string; total: number; unhealthy: number; x: number; y: number; depth: number }` e `renderNamespaces(targets: readonly NamespaceLabelTarget[], context: LabelContext): void`. `scene.getNamespaceLabelTargets()` fornece projeções; estado modal vem do contrato da trilha de navegação, sem inferência por CSS.

- [ ] Reproduzir radar aberto, foco em pod inserido depois de 80 outros, filtro com >60 resultados e viewport estreito. Registrar capturas e contagem de `.pod-label.visible`.
- [ ] Alterar seleção da cena: reservar focused antes de percorrer restantes; manter no máximo 80 candidatos por prioridade `focused`, `filterActive && matched`, distância, UID como desempate. Não interromper na primeira população de 80: substituir o pior candidato em buffer limitado durante varredura. Atualizar projeção dos escolhidos por frame; refazer ranking no máximo a cada 100 ms ou imediatamente ao mudar foco/filtro.
- [ ] Aplicar caps explícitos: overview 4 pods e 12 namespaces, dive 8 pods e 4 namespaces, filtro até 16 pods; focado participa do limite e sempre tem prioridade. Mostrar `name` e status no focado, namespace abreviado nos demais. Resumo distante: `namespace · total pods · unhealthy unhealthy`, usando mesmas regras de status de `statusForSlot`; não contar remoções concluídas.
- [ ] Fazer pool indexado por UID: escrever conteúdo com `textContent` somente se nome/status mudar; posições com transform. Medir dimensões quando conteúdo/viewport mudar, antes da fase de escrita. Remover sprite antigo de namespace quando resumo HTML estiver integrado, sem apresentação dupla.
- [ ] Implementar recorte e exclusões: descartar candidatos fora do viewport; `modalOpen` chama `hideAll` e oculta resumos; retângulos de painel, topo e ajuda entram antes das colisões entre labels. Focado tenta acima/abaixo/esquerda/direita; se nenhum cabe, mostrar identificação no painel já aberto em vez de cobrir controles.

```css
#labels { position: fixed; inset: 0; z-index: 10; pointer-events: none; }
#hud { position: fixed; inset: 0; z-index: 20; pointer-events: none; }
.pod-label { max-width: min(240px, calc(100vw - 32px)); }
```

Preservar `pointer-events:auto` nos controles existentes; não sobrescrever visibilidade do radar. `main.ts` passa tipos corretos e remove o cast `as any` de `labels.render`.
- [ ] Verificar as quatro reproduções, resize e filtro limpo. Rodar `cd web && npx tsc --noEmit && npm run build`. Commit: `feat: prioritize contextual pod and namespace labels`.

**Aceite:** zero labels sobre radar; foco nunca perdido por ordem de inserção; zero criação de DOM em 30 s sem mudar candidatos; nomes/status legíveis sem depender apenas de cor; erro de namespace aparece em resumo distante sem abrir painel. Contraste textual mínimo 4,5:1 no fundo efetivo dos labels.

### Task 4: Estado vivo sem perder identidade ou enquadramento

**Files:** modificar `web/src/whale.ts`, `web/src/scene.ts`; ajustar `web/src/hud/hud.css`.

**Interfaces:** material recebe `instanceState` float por instância (0 running, 1 pending/not-ready, 2 unhealthy, 3 completed) e `uReducedMotion` float. Atualizar atributo em `upsertPod`, limpar ao liberar slot. Expor `scene.setReducedMotion(enabled: boolean): void` para a Task 5.

- [ ] Capturar os quatro estados com filtro desativado. Definir tabela visual: running nado atual; pending cauda a 45% da frequência e leve flutuação; unhealthy pulso de luminosidade suave ≤1 Hz e oscilação determinística pequena; completed imóvel com cor existente. Status textual permanece fonte explícita. Tamanho continua representando requests/limits projetados pelo backend; não rotular como consumo em tempo real.
- [ ] No shader substituir frequência global por fator por estado, sem materiais separados:

```glsl
float speed = instanceState == 1.0 ? 0.45 : (instanceState == 3.0 ? 0.0 : 1.0);
float motion = 1.0 - uReducedMotion;
float wave = sin(uTime * 3.0 * speed + phase) * 0.08 * tailFactor * tailFactor * motion * min(speed, 1.0);
```

Aplicar amplitude 0 quando completed e reduced motion; retirar jitter aleatório CrashLoop da simulação, substituindo por termo determinístico pequeno dependente de tempo e seed somente sem movimento reduzido. Não apresentar impacto como sucesso de deleção: saída final continua condicionada ao watcher.
- [ ] Corrigir distância de `focusOnPod` com raio real conservador da geometria e `baseScale`, em vez de offset fixo 5,5. Calcular distância por FOV mais restritivo: `distance = radius / Math.sin(Math.min(vFov,hFov)/2) * 1.35`; ajustar área útil ao painel. Consumir contrato de câmera da trilha navegação; não criar segunda autoridade de foco.
- [ ] Verificar menor e maior pod no mesmo viewport: objeto focado ocupa ≤60% da altura útil, não intersecta near plane, identidade de recursos continua coerente. Não redimensionar instância com distância da câmera nem mudar volumes de colisão artificialmente.
- [ ] Rodar `cd web && npx tsc --noEmit && npm run build`; registrar vídeos curtos dos estados normal/reduced motion. Commit: `feat: clarify pod states and focus framing`.

**Aceite:** foco revela baleia inteira, não aumenta draw calls por estado, movimento reduzido desliga jitter/pulso e animações decorativas mantendo seleção e atualizações reais.

### Task 5: Efeitos subaquáticos curtos e som opcional

**Files:** criar `web/src/audio.ts`; modificar `web/src/scene.ts`, `web/src/main.ts`, `web/index.html`, `web/src/hud/hud.css`.

**Interfaces:** `type AudioCue = 'select' | 'dive' | 'fire' | 'impact' | 'recovery' | 'error'`; `AquariumAudio.enableFromGesture(): Promise<void>`, `setMuted(muted: boolean): void`, `play(cue: AudioCue): void`, `dispose(): void`. Um AudioContext criado no gesto, GainNode mestre; no máximo quatro vozes e um cue por tipo a cada 150 ms. `scene.onImpact?: () => void` só identifica impacto; recuperação/erro vêm dos estados observados da trilha de operações na composição.

- [ ] Reduzir burst atual: 12 bolhas pequenas, quatro fragmentos por impacto, duração ≤450 ms. Manter capacidades globais existentes (180 bolhas/64 fragmentos/32 projéteis). Substituir flash esférico por um anel curto billboard com geometria reutilizada, duração 180 ms, opacidade máxima 0,25. Escala de fragmentos limitada a 0,15–0,45 do raio conservador da baleia; limitar anel a 12% da menor dimensão projetada da viewport.
- [ ] Com movimento reduzido, emitir apenas seis bolhas de 250 ms, sem flash, kick ou anel expansivo. Reaproveitar fog e background existentes: não adicionar bloom, volumetria, luz por projétil ou simulação de fluidos.
- [ ] Implementar áudio sintetizado com oscillator→gain→master→destination. Frequências iniciais: select 520 Hz/60 ms; dive 180→100 Hz/180 ms; fire 220→90 Hz/100 ms; impact 110→45 Hz/120 ms; recovery 440→660 Hz/120 ms; error 180→120 Hz/160 ms. Envelope começa/termina em ganho 0,0001, pico ≤0,04 por voz. Desconectar nós em `onended`; expiração remove voz da lista.
- [ ] Adicionar botão `Sound: off/on` com `aria-pressed` e persistência `kubeaquarium.sound`. Valor salvo `on` mostra ação para habilitar, mas nunca cria/retoma AudioContext antes de novo gesto. `enableFromGesture` cria contexto, aguarda `resume`, informa falha mantendo botão desligado; mute zera ganho imediatamente. Tab oculta suspende áudio; retorno só retoma em gesto seguinte. Som de recuperação apenas na transição de `RecoveryOperation.phase` para `ready`, com `observationIncomplete === false`, uma vez por id de operação, nunca no impacto nem na simples remoção. Os tipos vêm da Task 3 do plano de recuperação.
- [ ] Ler `matchMedia('(prefers-reduced-motion: reduce)')`, propagar mudança à cena e acrescentar CSS que remove sweep do radar/transições decorativas. Opção manual de movimento reduzido usa `CameraPreferences { lookSensitivity, invertY, reducedMotion }` da navegação: a composição repassa o mesmo `reducedMotion` a `scene.setReducedMotion` e `camera.setPreferences`, sem segundo toggle. Respeitar preferência do sistema quando não houver override manual.
- [ ] Validar primeira visita silenciosa, enable por teclado, mute durante cue, refresh com preferência salva, tab oculta, erro e confirmação em demo. Rodar `cd web && npx tsc --noEmit && npm run build`. Commit: `feat: add restrained underwater feedback and optional audio`.

**Aceite:** texto/retículo continuam visíveis durante impacto; dez impactos não excedem pools; após terminar cues não restam oscillators conectados; nenhum áudio antes de gesto; mute funciona imediatamente; não há confirmação sonora falsa.

### Task 6: Gate visual e de custo antes de integrar

**Files:** atualizar relatório de benchmark; capturas novas em `docs/screenshots/visual-feedback/` durante execução.

- [ ] Repetir exatamente os cenários e três rodadas da Task 1. Salvar overview/dive/radar/filtro/foco maior/impacto e reduced motion nos dois tamanhos. Usar demo para disparos; nunca testar efeitos deletando pods reais.
- [ ] Comparar p50/p95/p99, frames >50 ms, DPR, draw calls, DOM e recursos GPU. Critérios: p95 não regride >10% no mesmo cenário/DPR; meta ≤20 ms com 200 pods quando o baseline atingir essa marca; recursos não crescem continuamente após 50 ciclos de filtro/radar/foco/impacto. Não baixar DPR para esconder regressão de CPU/DOM.
- [ ] Carga sintética de 200/1.200/2.500 pods é obrigatória; 20.000 é exploratória. Cada carga é experimento separado com fixture determinística e identificação explícita; não misturar seus números com demo ou cluster real. Documentar limiar de qualidade e boids existente; reportar FPS e frame-time observados, inclusive quando a meta falhar.
- [ ] Rodar `cd web && npx tsc --noEmit && npm run build`, verificar console sem erros novos e fazer revisão de capturas por outro agente autorizado pelo coordenador. Qualquer falha de legibilidade ou custo bloqueia a entrega de efeitos, preservando as correções anteriores já aprovadas.
- [ ] Registrar resultado e limitações no relatório; commit sugerido `docs: verify visual feedback and frame budgets`. A conclusão só ocorre com evidências atuais, não com screenshots históricos.

## Handoff de execução

Entregar tarefas em ordem, com revisão após cada unidade. Task 5 permite preparação isolada de `audio.ts` enquanto outro agente trabalha em arquivos exclusivos, mas integração é sequencial. Não criar testes que apenas repitam constantes de estilo; usar cenários de comportamento e medições acima. Este plano não exige instalação de framework de testes: a automação de navegador da trilha de verificação pode reproduzir os mesmos cenários quando estiver disponível.

## Contrato de fixture para o baseline

Na Task 1, criar `video/scripts/benchmark-visual.mjs` com Playwright existente. Interceptar `/api/contexts` e WebSocket `/api/stream` antes de carregar o modo conectado; servir snapshot de 200/1200/2500 pods com UIDs `bench-${i}`, namespace `bench-${i % 8}`, dados fixos e nenhum timer aleatório. Rejeitar DELETE de rede; simular resposta e eventos nos cenários de impacto. Rodar as três cargas antes/depois com a mesma fixture, salvando amostras e capturas no relatório. Isso evita depender da missão futura ou alterar demo.ts na frente visual. Fixture acompanha os campos obrigatórios de PodView do contrato da frente de recuperação quando esses campos forem integrados.
