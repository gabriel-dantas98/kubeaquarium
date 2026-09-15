# Navegação e controles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a orientação espacial previsível, o mergulho controlável e os atalhos seguros durante uso dos painéis.

**Architecture:** A cena permanece dona das posições; câmera controla apenas movimento e enquadramento; radar projeta snapshots da cena. Um módulo pequeno compartilha as regras de entrada entre câmera e HUD, sem introduzir barramento genérico de comandos.

**Tech Stack:** TypeScript, Three.js existentes em `web`; Node e Playwright existentes em `video`; backend Go permanece inalterado.

**Spec:** [Game experience design](../specs/2026-09-10-game-experience-design.md).

## Global Constraints

- Preservar TypeScript, Three.js, DOM, Go e client-go; nenhuma troca de engine ou framework.
- Reutilizar dependências existentes; não adicionar biblioteca para funções já disponíveis no projeto.
- Testes e captura de vídeo usam demo determinística ou respostas simuladas; não excluem pods de clusters reais.
- Arquivos compartilhados têm um único responsável por vez; integrar main.ts e scene.ts sequencialmente.
- Documentação técnica em português; manter a interface do produto em inglês, seguindo o projeto.

- Seguir `AGENTS.md`: remover caminhos obsoletos, evitar compatibilidade retroativa e abstrações especulativas.
- Cada tarefa entrega comportamento executável antes da próxima; não adicionar dependências.
- Este documento cobre navegação, entrada, conforto da câmera e radar espacial. A política de ataque pertence ao plano de interação correspondente.
- Textos novos da interface seguem o inglês existente: `Overview`, `Dive`, `Look sensitivity`, `Invert vertical look`, `Reduce motion`.

## Evidências verificadas

`camera.ts::bind` registra todas as teclas globais sem verificar edição, modificadores ou repetição; `keyup` não resolve perda de foco. Mouse só altera órbita. `main.ts` move a mira em `pointermove`, mas isso não muda yaw/pitch do mergulho. `namespaces.ts::layoutNamespaces` ordena por quantidade de pods e usa raio médio como espaçamento: mudanças de contagem movem namespaces existentes. `radar.ts::renderScope` fabrica posições por hash de UID e limita a 18 pontos; alguns pontos podem sair do círculo. `resetToOrbit` volta à órbita local, não reenquadra o cluster.

## Arquivos e limites de responsabilidade

- Criar `web/src/input.ts`: elegibilidade de eventos e bloqueio imediato de movimento.
- Alterar `web/src/camera.ts`: transições, controle de olhar, conforto, enquadramento.
- Alterar `web/src/namespaces.ts`: alocação estável de centros durante a sessão.
- Alterar `web/src/scene.ts`: posse do layout e snapshots espaciais; limites globais da cena.
- Criar `web/src/hud/radar-projection.ts`: projeção XZ pura.
- Alterar `web/src/hud/radar.ts`: consumir posições reais, refresh enquanto aberto, marcadores acessíveis.
- Alterar `web/src/main.ts`: composição das interfaces, precedência de Escape e atualização de mira.
- Alterar `web/src/hud/search.ts`, `web/src/hud/detail.ts`: expor `isOpen` somente leitura e consumir Escape localmente.
- Alterar `web/index.html`, `web/src/hud/hud.css`: ações de navegação e controles de conforto.
- Criar `video/scripts/check-navigation.mjs`: regressões com `node:assert/strict` e Playwright existentes.

## Task 1: Entrada arbitrada e cancelamento de movimento

**Interfaces:** `isUIEvent(event: Event): boolean`; `HybridCamera.clearInput(): void`; `HybridCamera.setInputBlocked(blocked: boolean): void`; getters `RadarHUD.isOpen`, `SearchHUD.isOpen`, `DetailPanel.isOpen`. `main.ts` chama bloqueio ao abrir/fechar radar, busca e detalhe. O DOM continua consumindo seus próprios eventos.

- [ ] Criar o script Playwright com `chromium.launch()`, abrir `process.env.DEMO_URL ?? 'http://127.0.0.1:5173'`, esperar `window.__kubeaquarium.pods > 0` e coletar `pageerror`; falhar se ocorrer erro. Expor no debug existente `navigationDebug()` retornando cópias `{mode, position: number[], direction: number[], blocked: boolean}`. O teste deve inicialmente falhar pela interface inexistente.
- [ ] Adicionar casos de digitação no radar: capturar posição, digitar `fw asd`, pressionar setas, Space e Shift, verificar mesma posição/direção e ausência de `dive`. Abrir radar via `Control+k`; testar também `Meta+k`.
- [ ] Implementar regra compartilhada:

```ts
export function isUIEvent(event: Event): boolean {
  return event.composedPath().some(node => node instanceof Element &&
    !!node.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="dialog"],.radar,.search,.detail'));
}
```

Na câmera, aceitar movimento somente se `!blocked && !isUIEvent(e) && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey`. Impedir comportamento padrão apenas para teclas de movimento efetivamente consumidas. Ignorar `e.repeat` para alternância F. `keyup` sempre remove a tecla. `clearInput` limpa conjunto, arrasto e velocidade. Chamá-lo em `blur`, ao documento ficar oculto, ao bloquear entrada e em todas as transições.
- [ ] Impedir seleção ao terminar arrasto de órbita: guardar distância máxima desde pointerdown e consumir o click seguinte no canvas quando exceder 5 px. Expor `consumeDragClick(): boolean` na câmera, chamar antes do raycast de seleção da cena; consumir apenas uma vez. Testar arrasto iniciado sobre baleia não abre detalhe, mas click com deslocamento ≤5 px abre.
- [ ] Remover Escape global da câmera. Consumir Escape nos painéis com `preventDefault` + `stopPropagation`; em `main.ts` fechar apenas a superfície prioritária: radar, busca, detalhe, depois sair de dive. Não reenquadrar junto com fechamento. Usar `defaultPrevented` também no atalho de ataque existente.
- [ ] Acrescentar regressão: W pressionado, abrir radar, fechar radar sem liberar W; posição continua estável até novo keydown. Blur com W pressionado também para movimento. Um Escape fecha radar e preserva detalhe subjacente.
- [ ] Rodar `node video/scripts/check-navigation.mjs`; depois `npm --prefix web exec -- tsc --noEmit -p web/tsconfig.json`. Revisar e commitar apenas arquivos desta tarefa.

## Task 2: Olhar durante mergulho e conforto ajustável

**Dependencies:** Task 1. **Interfaces:** `CameraPreferences = {lookSensitivity: number; invertY: boolean; reducedMotion: boolean}`; `HybridCamera.setPreferences(value: CameraPreferences): void`. `setPreferences` limita sensibilidade a 0.25–2, default 1; inversão default false; movimento reduzido default `matchMedia('(prefers-reduced-motion: reduce)').matches`.

- [ ] Acrescentar teste: entrar em dive; arrastar com botão direito 100 px; direção deve mudar, posição não; pressionar W por 200 ms e verificar produto escalar positivo entre deslocamento e nova direção. Liberar botão e mover mouse: orientação permanece. Primeira execução falha porque dive não olha.
- [ ] Substituir mouse handlers da câmera por pointer handlers no canvas. Órbita usa botão esquerdo; dive usa botão direito e `setPointerCapture(e.pointerId)`. Cancelar via `pointerup`, `pointercancel`, blur e bloqueio. Suprimir `contextmenu` apenas no canvas em dive. Não usar pointer lock: o usuário continua acessando HUD sem uma etapa adicional de saída.

```ts
// Dentro de pointermove, somente durante arrasto de olhar em dive:
this.yaw -= dx * 0.003 * this.preferences.lookSensitivity;
this.pitch = THREE.MathUtils.clamp(
  this.pitch + dy * 0.003 * this.preferences.lookSensitivity *
    (this.preferences.invertY ? 1 : -1),
  -Math.PI * 0.47, Math.PI * 0.47,
);
```

- [ ] Durante todo dive, manter mira no centro; `main.ts` não deve mover retículo nesse modo. Órbita mantém apontamento pelo cursor. Expor `HybridCamera.isLooking` somente leitura através da cena para dica visual; sair de dive restaura mira ao ponteiro seguinte. O handler de ataque deve aceitar somente botão esquerdo; isso é ponto de integração com o plano de ataque.
- [ ] Adicionar controle visível `Dive` e seção `Camera` com range 0.25–2, step 0.05, inversão e redução de movimento; listeners em `main.ts` chamam `setPreferences`. Guardar somente estes três campos em uma chave versionada `kubeaquarium.camera.v1`, com parsing protegido e validação de tipos/limites; dados inválidos usam defaults sem migração.
- [ ] Redução de movimento elimina shake (`impulse` retorna sem criar impulso), usa foco instantâneo com conclusão executada uma vez e corta inércia do dive. Atualizar dica para `Right-drag to look · WASD to move · Space / Shift to rise / descend`.
- [ ] Preservar posição e direção ao entrar/sair de dive; remover shake antes da transição para impedir offsets residuais. Testar ida e volta sem movimento com tolerância 1e-6 e frenagem até velocidade <0.01 em 1.5 s após soltar W no modo normal; no modo reduzido parar no próximo frame.
- [ ] Testar sensibilidade 2 dobra mudança angular de 1 para o mesmo arrasto curto, inversão muda sinal vertical, pitch nunca inverte câmera; preferência persiste após reload; redução evita deslocamento por impulso. Executar script e typecheck; commitar tarefa.

## Task 3: Centros estáveis e visão geral explícita

**Dependencies:** Task 1; Task 2 para respeitar conforto. **Interfaces:** `NamespaceLayoutState` guarda `allocations: Map<string, {center: THREE.Vector3; initialRadius: number; reservedRadius: number}>`; `NamespaceLayout` acrescenta `capacityRadius: number` e `dense: boolean`; `layoutNamespaces(names: string[], counts: Map<string, number>, state: NamespaceLayoutState): Map<string, NamespaceLayout>` substitui assinatura anterior. `AquariumScene.showOverview(): void`; `HybridCamera.frameBounds(bounds: THREE.Box3): void`.

- [ ] No script importar módulos TS pelo Vite dentro de `page.evaluate(async () => import('/src/namespaces.ts'))`; testar contagem a:1,b:100 → a:1000,b:1 preserva centros exatamente. Adicionar/remover namespace também preserva centros sobreviventes. Inicialmente deve falhar.
- [ ] `scene.ts` mantém alocações por contexto carregado; reset completo de contexto limpa alocações, mudanças de snapshot no mesmo contexto não. Novos nomes entram ordenados lexicalmente entre si; namespace removido conserva sua alocação até troca de contexto para reaparecer no mesmo ponto. Calcular raio inicial pela função existente `radiusForCount`. Primeiro centro é origem; os seguintes percorrem uma espiral de candidatos no plano XZ, em anéis de raio 2, 4, 6... unidades, com `ceil(2 * PI * ringRadius / 2)` amostras angulares por anel. Escolher o primeiro candidato cuja distância horizontal a cada alocação existente seja pelo menos `newInitialRadius + existingInitialRadius + 16`: são 4 unidades de corredor e 6 de crescimento por vizinho. O jitter Y não participa da separação. Não reservar espaço para raio futuro 42, nem recompactar centros.
- [ ] Calcular capacidade pelo espaço real, considerando também alocações temporariamente ausentes. Cada par divide igualmente sua folga inicial; a capacidade de um namespace é o menor limite dos pares, ou 42 quando isolado:

```ts
const distanceXZ = Math.hypot(center.x - other.center.x, center.z - other.center.z);
const slack = distanceXZ - reservedRadius - other.reservedRadius - 4;
const pairCapacity = reservedRadius + Math.max(0, slack) / 2;
// capacityRadius = min(42, ...pairCapacity de todos os vizinhos)
// radius = min(radiusForCount(currentCount), capacityRadius)
// dense = radiusForCount(currentCount) > capacityRadius
```

Usar distância XZ também nesta conta (sem contribuição do jitter vertical). Uma nova alocação deve respeitar os raios ATUAIS além dos iniciais: distância mínima é `max(newInitialRadius + existingInitialRadius + 16, newInitialRadius + currentRadius + 10)`. Assim, novos namespaces não forçam encolhimento dos existentes; armazenar ainda `reservedRadius` na alocação, inicializado pelo raio inicial e elevado ao maior raio efetivamente utilizado, e usar `reservedRadius` no cálculo de folga mostrado acima e no lugar do raio existente na restrição de posicionamento. Calcular todas as capacidades a partir do mesmo snapshot das reservas antes de atualizá-las, evitando dependência da ordem do Map. O limite calculado pode crescer quando existe espaço, mas nunca desloca centros.
- [ ] Entregar resumo agregado quando `dense`: o rótulo da bolha mostra `namespace · N pods · Dense`; a cena desativa rótulos individuais comuns nessa bolha a distância, preservando selecionado e resultados de busca. Todos os pods continuam no store, pesquisa e radar; não truncar recursos nem esconder quantidade. Coordenador integra este resumo com LOD do plano visual, usando `NamespaceLayout.dense` e contagem atual como contrato. A tarefa continua utilizável sozinha com texto agregado no rótulo existente.
- [ ] Testar aumento de 1 para 1000 pods preserva centro e mantém `radius <= capacityRadius`; qualquer par conserva corredor >=4. Inserir namespace após crescimento não reduz raio atual de nenhum existente. Reaparecimento recupera centro; atualizar snapshot não reordena; mesma sequência inicial gera mesmo mapa. Confirmar com fixture de 200 pods divididos entre 8 namespaces de 25 que raio total XZ fica abaixo de 120 unidades, e registrar screenshot de Overview em 1280×720: todos os 8 resumos estão legíveis, sem pontos centrais ocultos pela névoa. Esta é uma nova regressão de browser, não teste já presente.
- [ ] `frameBounds` calcula esfera envolvente de `Box3` expandida pelos raios das bolhas. Distância `radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.1`, com `hFov = 2 * atan(tan(vFov / 2) * aspect)`. Ajustar far plane e limite de zoom à extensão atual; ajustar a densidade da `FogExp2` ao enquadramento geral para manter transmissão mínima de 0.5 no ponto mais distante (`density <= sqrt(-ln(0.5)) / farthestDistance`) e restaurar 0.012 ao sair da visão geral; manter near positivo. Caso vazio usa raio 10 e centro zero. Definir target, spherical e modo orbit, limpar entrada, remover classe dive e cancelar callback de foco pendente. Não limitar overview ao teto antigo de 220.
- [ ] Adicionar botão `Overview` e tecla O fora de UI. Na carga inicial enquadrar uma vez; eventos subsequentes não roubam a câmera. Overview usa todos os namespaces atuais mesmo com filtro e não altera filtro; limpar foco de pod e fechar detalhe explicitamente ao acioná-lo.
- [ ] Testar 30 namespaces, aspect 16/9 e 9/16: extremos das bolhas projetados dentro de NDC [-1,1], plano distante contém limites; dive→overview deixa body sem classe dive e câmera parada; atualizações de contagem não reposicionam câmera. Rodar script, typecheck e build; commitar tarefa.

## Task 4: Radar espacial alimentado pela cena

**Dependencies:** Tasks 1 e 3. **Interfaces:** ampliar `RadarItem` com `position: {x:number;y:number;z:number} | null`; `AquariumScene.getPodPosition(uid: string): {x:number;y:number;z:number} | null` devolve cópia de slot vivo. `RadarHandlers.getPose(): {position: {x:number;y:number;z:number}; forward: {x:number;y:number;z:number}}`. `projectRadar(point, pose, range): {x:number;y:number;outside:boolean;altitude:number}` retorna coordenadas normalizadas [-1,1], altitude relativa em unidades do mundo. `RadarHUD.refresh(): void` atualiza dados somente aberto, limitado a 10 Hz pelo loop de `main.ts`.

- [ ] Criar `radar-projection.ts` puro e testes via import Vite: câmera em origem olhando -Z; ponto (0,0,-10) aparece em cima, (10,0,0) à direita. Transladar câmera e todos os pontos pelo mesmo vetor mantém projeção. Girar câmera 90° gira projeção oposta. Todos os pontos permanecem dentro do círculo, inclusive distância > range.

```ts
const horizontal = Math.hypot(pose.forward.x, pose.forward.z);
const fx = horizontal > 1e-6 ? pose.forward.x / horizontal : 0;
const fz = horizontal > 1e-6 ? pose.forward.z / horizontal : -1;
const dx = point.x - pose.position.x, dz = point.z - pose.position.z;
let x = (dx * -fz + dz * fx) / range;
let y = -(dx * fx + dz * fz) / range;
const length = Math.hypot(x, y), outside = length > 1;
if (outside) { x /= length; y /= length; }
return {x, y, outside, altitude: point.y - pose.position.y};
```

- [ ] Usar range fixo inicial 100 unidades com seletor 50/100/250/500; desenhar pontos em `50 + projected * 44` por cento, câmera no centro e indicação `Heading up`. Pontos fora do alcance ficam na borda com estilo distinto e distância textual; altitude usa ↑/↓ acima de ±2 unidades. Remover hash e sweep que sugere uma varredura inexistente.
- [ ] `podToRadarItem` busca posição real da cena. Pods sem slot mantêm resultado de busca com `Position unavailable`, sem ponto fabricado. Renderizar até os 50 resultados ranqueados, destacar item ativo; marcadores devem ser botões com nome acessível e selecionar o mesmo UID da lista. Atualizar somente geometria dos pontos a 10 Hz, preservando foco, query e active UID durante refresh. Se UID desaparece, escolher próximo resultado válido.
- [ ] Testar snapshot com dois pods em lados conhecidos, selecionar ponto e confirmar detalhe do UID correspondente. Remover pod selecionado entre refresh e click não gera erro. Movimento de câmera atualiza pontos sem alterar texto da busca nem foco do input. Filtrar por nome reduz lista e pontos coerentemente.
- [ ] Rodar validação integrada abaixo; revisar diff e commitar tarefa.

## Validação integrada e aceite

Não existe suíte de navegação atual: `video/scripts/check-navigation.mjs` é novo; build e typecheck usam ferramentas já presentes. Lockfiles verificados: `web/package-lock.json` e `video/pnpm-lock.yaml`. Em terminais separados, instalar dependências já declaradas se necessário (`npm --prefix web ci` e `pnpm --dir video install --frozen-lockfile`) e iniciar `VITE_KUBEAQUARIUM_DEMO=1 npm --prefix web run dev -- --host 127.0.0.1`. Executar:

```sh
DEMO_URL=http://127.0.0.1:5173 node video/scripts/check-navigation.mjs
npm --prefix web exec -- tsc --noEmit -p web/tsconfig.json
npm --prefix web run build
```

O script deve usar `try/finally` para fechar browser, assertions sobre estado e matemática espacial em vez de screenshots como único oráculo. Para gestos cronometrados, comparar deslocamentos/direções com tolerância, não FPS ou posições absolutas dos peixes animados. Guardar screenshot somente na falha. Não é necessário alterar nem testar backend Go para este escopo.

Aceite: digitar e operar HUD nunca move câmera; perder foco para movimento; olhar altera trajetória; preferências são acessíveis por teclado; Overview mostra todo cluster; contagem não muda centros; radar corresponde às coordenadas reais e apresenta ausência de posição honestamente. Conferir manualmente mouse e trackpad, viewport estreito, navegação de teclado e preferência do sistema de movimento reduzido.

## Integração e riscos

`main.ts` também será modificado pelos planos de HUD/ataque: o integrador deve reservar inicialização dos controles, Escape, `pointermove`/`pointerdown` e debug para uma única revisão conjunta. `scene.ts` precisa conciliar bloqueio de câmera, foco, slot removido e limpeza de contexto com esses planos; nenhum agente deve reescrever esse arquivo inteiro. A alocação compacta limita crescimento individual pela folga real; grandes aumentos de densidade exigem resumo agregado e busca/radar acessíveis. O teste de 200 pods deve detectar dispersão ou névoa excessivas antes da integração. Não prometer identidade de posições após reload com um conjunto diferente de namespaces; o compromisso é estabilidade durante a sessão e repetibilidade para o mesmo conjunto inicial. Redução de movimento aqui cobre câmera; animação ambiente pertence ao plano visual. Em browsers onde botão direito ativa menu nativo, validar prevenção exclusivamente no canvas para não prejudicar a interface.
