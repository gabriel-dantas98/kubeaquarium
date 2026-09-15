# Recuperação observada e missão demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o disparo em uma sequência compreensível de solicitação, exclusão observada e nova réplica Ready, oferecendo uma missão curta inteiramente simulada.

**Architecture:** O servidor publica identidade do controlador e estado Kubernetes correto; um controlador TypeScript acompanha operações e evidencia somente o que foi observado. A demo emite os mesmos eventos que o modo conectado, sem chamar endpoints de mutação. A cena e o vídeo apresentam essa informação sem transformar correlação em garantia de causalidade.

**Tech Stack:** Go, client-go/informers, net/http, gorilla/websocket; TypeScript, Three.js e Vite; testes no browser via Playwright/Vite; Playwright e Remotion já presentes em `video`.

**Spec:** [2026-09-10-game-experience-design.md](../specs/2026-09-10-game-experience-design.md).

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


- Este documento é planejamento: nenhum DELETE em cluster, alteração de produção, render final, instalação ou commit durante sua elaboração.
- Aplicar as restrições globais da especificação e o `AGENTS.md` da raiz; remover contratos antigos, sem camada de compatibilidade.
- Escolher a menor implementação completa, modular, sem banco de histórico, watch de todos os tipos de workload ou inferência por prefixo do nome.
- Manter as palavras da interface em inglês, conforme a interface existente; este plano e sua explicação ficam em português.
- A demo e a captura são exclusivamente simuladas, com identificação visível `SIMULATED`.
- `web/src/main.ts`, `web/src/scene.ts`, `web/src/types.ts` e o envelope do stream são pontos compartilhados: o integrador do plano principal faz suas alterações após revisar os contratos abaixo. Nenhum trabalhador modifica esses arquivos simultaneamente.

---

## Evidência no código e decisões

`internal/k8s/watcher.go` não publica ownerReferences ou deletionTimestamp; `ready` atualmente fica verdadeiro se qualquer container estiver pronto. `DeletePod` em `internal/k8s/podops.go` exclui por nome, sem UID. `server.go` responde 202 com `deleted: true`. `main.ts` mantém a baleia até o watch, mas mostra `eliminated` assim que o HTTP retorna; falhas HTTP vão para console e falhas de transporte escapam sem feedback. A demo remove diretamente do store e não cria réplica. `Watcher.send` e `Hub.Broadcast` descartam mensagens sob pressão; só existe snapshot inicial ou HTTP solicitado manualmente. `capture-demo.mjs` atira num alvo encontrado geometricamente e espera 6,2 segundos, sem comprovar Ready, podendo hoje usar cluster real.

A identidade adotada é o controlador **imediato** cujo `ownerReference.controller === true`, por namespace e UID. Um Pod de Deployment normalmente aponta para ReplicaSet; mostrar `ReplicaSet payments/api-abc`, sem rotulá-lo como Deployment. Um novo ReplicaSet de rollout não é correlacionado. Outros owner references não são usados. A expressão `New pod observed for the same controller` é verdadeira; `Your shot healed the workload` não é demonstrável com estes dados.

Um Pod com mesmo UID e restartCount maior é reinício de container, não substituição. Pod sem controlador encerra a expectativa automática com `Standalone pod: no controller-managed replacement expected`. Jobs/CronJobs não garantem reposição; observar candidato do mesmo controlador é permitido, prometer recuperação não. DaemonSet exige também mesmo node não vazio; StatefulSet exige mesmo namespace/nome e UID diferente; ReplicaSet e ReplicationController usam owner UID. Tipos desconhecidos mostram apenas atividade do controlador, sem selecionar substituto.

## Mapa de arquivos

| Arquivo | Responsabilidade planejada |
| --- | --- |
| `internal/k8s/watcher.go`, `internal/k8s/watcher_test.go` | Contrato de Pod, condição Ready, identidade e snapshot vazio `[]` |
| `internal/k8s/podops.go`, `internal/k8s/podops_test.go` | Precondição UID do DELETE |
| `internal/server/server.go`, `internal/server/server_test.go` | Resposta accepted, erros HTTP, ciclo WS e reconciliação |
| `internal/server/hub.go`, `internal/server/hub_test.go` | Encerrar assinante lento, em vez de manter stream silenciosamente incompleto |
| `web/src/types.ts`, `web/src/stream.ts`, `web/src/stream.test.ts` | Contrato comum e reconexão cancelável |
| `web/src/recovery.ts`, `web/src/recovery.test.ts` | Reducer de operações e correlação conservadora |
| `web/src/operations.ts`, `web/src/operations.test.ts` | Transporte DELETE e seleção explícita live/demo |
| `web/src/recovery-panel.ts`, `web/src/recovery-panel.test.ts` | Progresso, erro, evidência e navegação acessíveis |
| `web/src/main.ts`, `web/src/hud/hud.css` | Integração única do painel, eventos e seleção |
| `web/src/demo.ts`, `web/src/demo.test.ts` | Ciclo determinístico de substituição simulada |
| `web/src/demo-mission.ts`, `web/src/demo-mission.test.ts` | Missão guiada e reinício da experiência |
| `video/scripts/capture-demo.mjs`, `video/scripts/verify-recovery.mjs` | Captura e verificação somente demo |
| `video/src/Composition.tsx`, `video/src/Root.tsx`, `video/README.md` | Narrativa e duração dirigidas por evidências |
| `video/scripts/test-recovery.mjs` | Runner de assertions Playwright/Vite sem novas dependências |

As tarefas abaixo são entregas de revisão; cada checkbox é um passo curto, repetível para os casos enumerados.

### Task 1: Publicar identidade e prontidão corretas e exigir UID no DELETE

**Files:** Modify `internal/k8s/watcher.go`, `internal/k8s/podops.go`, `internal/k8s/podops_test.go`, `internal/server/server.go`, `web/src/types.ts`, fixtures de `web/src/demo.ts`; Create `internal/k8s/watcher_test.go`, `internal/server/server_test.go`.

**Interfaces:** Consome `corev1.Pod`; produz os seguintes campos obrigatórios em todas as fixtures e snapshots:

```go
type ControllerView struct {
    APIVersion string `json:"apiVersion"`
    Kind string `json:"kind"`
    Name string `json:"name"`
    UID string `json:"uid"`
}
// Acrescentar a PodView:
// Controller *ControllerView `json:"controller"`
// DeletionTimestamp string `json:"deletionTimestamp"`
func DeletePod(ctx context.Context, cs kubernetes.Interface, ns, name, uid string) error {
    id := types.UID(uid)
    return cs.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{
        Preconditions: &metav1.Preconditions{UID: &id},
    })
}
```

```ts
export interface ControllerView {
  apiVersion: string; kind: string; name: string; uid: string;
}
// Acrescentar a PodView, não tornar opcionais:
// controller: ControllerView | null;
// deletionTimestamp: string;
export interface DeleteAccepted { accepted: true; uid: string }
```

- [ ] Escrever teste Go com dois containers, um Ready e outro não; sem condição PodReady True, exigir `v.Ready == false`. Acrescentar condição True e exigir true; `deletionTimestamp` não vazio impede mostrar recuperação mesmo com condição True. Testar owner com controller false ignorado, owner true preservado, timestamp UTC e nil convertido em JSON null.
- [ ] Rodar `go test ./internal/k8s -run 'TestToView|TestDeletePod' -count=1`; registrar falha antes da implementação.
- [ ] Substituir cálculo de Ready por condição PodReady; obter owner via `metav1.GetControllerOf(p)`, copiar somente seus quatro campos; usar RFC3339Nano para timestamps, inclusive createdAt. Inicializar slice de Snapshot com `make([]PodView, 0)`.

```go
ready := false
for _, condition := range p.Status.Conditions {
    if condition.Type == corev1.PodReady {
        ready = condition.Status == corev1.ConditionTrue
        break
    }
}
```

- [ ] Escrever reactor fake que inspeciona `DeleteAction.GetDeleteOptions().Preconditions.UID`; **não** confiar no fake clientset para aplicar preconditions. Fazer reactor retornar Conflict para UID errado e verificar propagação; testar pod de mesmo nome mas UID novo não excluído. Atualizar chamadas existentes para a nova assinatura.
- [ ] No handler exigir `?uid=...` não vazio, retornar 400 para ausência; mapear Forbidden 403, NotFound 404, Conflict 409 e demais falhas 500; responder 202 com `{ "accepted": true, "uid": "..." }`. Testar com httptest e fake clientset sem cluster. Remover `deleted: true`.
- [ ] Atualizar contrato TS e fixtures obrigatórias em uma alteração integrada. Executar `go test ./internal/k8s ./internal/server` e `cd web && npm exec tsc -- --noEmit`.
- [ ] Na execução, revisar e registrar commit `feat: expose pod controller identity and guard delete by uid`.

**Acceptance:** Um HTTP 202 nunca afirma exclusão; um alvo reutilizado por nome não pode ser atingido acidentalmente; Ready corresponde à condição do Pod, não a qualquer container.

### Task 2: Reconciliar conexões sem inventar eventos perdidos

**Files:** Modify `internal/server/server.go`, `internal/server/hub.go`, `web/src/stream.ts`; Create/extend `internal/server/server_test.go`, `internal/server/hub_test.go`, `web/src/stream.test.ts`.

**Interfaces:** Manter `StreamEvent` atual acrescido dos campos de Pod da tarefa 1. Snapshot continua `{type:'snapshot', pods: PodView[]}`. `Stream.onConnectionChange(connected: boolean)` é preservado; socket aberto não significa store sincronizado: operações exigem primeiro snapshot. `Stream.stop(): void` é terminal até um `start()` explícito.

- [ ] Criar `video/scripts/test-recovery.mjs` usando Playwright já instalado: iniciar browser, abrir Vite demo, importar `/src/stream.test.ts` com `page.evaluate`, chamar `runStreamTests()` e falhar com qualquer exception. Cada arquivo `*.test.ts` deste plano exporta `run...Tests(): Promise<void>` com assertions locais; importar os demais conforme as tarefas forem integradas. Restaurar globals de WebSocket/clock em finally e fechar browser em finally. Para timers da demo usar `page.clock.install()` e `page.clock.runFor(ms)`; para reducer injetar relógio conforme contrato. Executar com Vite aberto em `http://127.0.0.1:7781/?demo`; não adicionar dependência nem runner web.
- [ ] Adicionar teste com cliente lento e canal cheio: o Hub o remove/fecha sob lock exclusivo em vez de perder apenas uma mensagem e continuar; conexão fecha e cliente reconecta. Outro cliente continua recebendo. Registrar antes de criar o snapshot inicial para reduzir janela sem assinatura; essa fila pode conter deltas anteriores ao snapshot, portanto não usá-los como prova de sequência ou de causalidade.
- [ ] Adicionar ticker de 5 segundos **no mesmo writer loop WS** para enviar snapshot atual completo; ticker para ao encerrar conexão ou contexto. Implementar um canal `done` do read pump para o writer poder sair mesmo sem próximo evento. Erro de snapshot não pode ser convertido em snapshot vazio: mudar `Watcher.Snapshot() ([]PodView, error)` e propagar erro HTTP 503/encerramento WS; atualizar todos os chamadores.

```go
// Dentro de handleWS, depois da escrita inicial; nenhuma segunda goroutine escreve.
ticker := time.NewTicker(5 * time.Second)
defer ticker.Stop()
for {
    select {
    case <-done:
        return
    case msg, ok := <-ch:
        if !ok { return }
        if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil { return }
    case <-ticker.C:
        pods, err := s.watcher.Snapshot()
        if err != nil { return }
        if err := conn.WriteJSON(map[string]any{"type": "snapshot", "pods": pods}); err != nil { return }
    }
}
```

- [ ] Testar snapshot periódico usando intervalo injetável no helper privado `serveStream(conn, snapshot, interval)`; manter 5 segundos como valor de produção, sem variável de configuração pública. Verificar que perda em `Watcher.send` converge no próximo snapshot e que interrupção não deixa writer preso. Não alegar que periodicidade recupera timestamps históricos ou estabelece ordem total entre cache e fila.
- [ ] Acrescentar `stopped` e token de geração a Stream. `stop()` invalida callbacks, cancela reconnectTimer, fecha WS; `onclose` de geração antiga não agenda reconexão. Usar fake WebSocket e fake timers para stop, reconexão, snapshot vazio, mensagens malformadas e encerramento durante timer.
- [ ] Garantir que reducer de recuperação usa snapshots como evidência atual e define `observationIncomplete` após reconexão. Um UID visto somente em snapshot após gap não pode ser celebrado como criação observada nem receber tempo preciso. A tarefa 3 controla essa distinção; não ampliar protocolo com replay ou banco de eventos.
- [ ] Rodar `go test -race ./internal/server ./internal/k8s` e `cd video && node scripts/test-recovery.mjs`; revisar commit `fix: reconcile pod streams and stop stale reconnects`.

**Acceptance:** Estado visual converge após perda; conexão encerrada não fica marcada live; períodos não observados aparecem explicitamente como lacuna. Snapshot confirma ausência/estado atual, não o instante de exclusão/criação.

### Task 3: Implementar operações e correlação como estado puro

**Files:** Create `web/src/recovery.ts`, `web/src/recovery.test.ts`, `web/src/operations.ts`, `web/src/operations.test.ts`; Create `video/scripts/test-recovery.mjs` na tarefa 2 antes do primeiro teste frontend.

**Interfaces:** Consome `PodView`, `StreamEvent`, `DeleteAccepted`, relógio monotônico injetado. Produz:

```ts
export type RecoveryPhase = 'requesting' | 'accepted' | 'absent' |
  'candidate' | 'ready' | 'failed' | 'unknown' | 'ambiguous' | 'standalone';
export interface RecoveryOperation {
  id: string; target: PodView; phase: RecoveryPhase;
  startedAt: number; acceptedAt?: number; absentAt?: number;
  candidateUid?: string; readyObservedAt?: number;
  baselineUids: Set<string>; candidateUids: Set<string>;
  observationIncomplete: boolean; message: string;
}
export interface PodOperations {
  deletePod(pod: PodView): Promise<DeleteAccepted>;
}
export class ApiDeleteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class LivePodOperations implements PodOperations {
  async deletePod(pod: PodView): Promise<DeleteAccepted> {
    const path = `/api/pod/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}`;
    const response = await fetch(`${path}?uid=${encodeURIComponent(pod.uid)}`, {method: 'DELETE'});
    if (!response.ok) throw new ApiDeleteError(response.status, await response.text());
    const result = await response.json() as DeleteAccepted;
    if (result.accepted !== true || result.uid !== pod.uid) throw new Error('Unexpected DELETE response');
    return result;
  }
}
export class RecoveryTracker {
  constructor(private now: () => number) {}
  begin(target: PodView, pods: Iterable<PodView>): RecoveryOperation;
  accepted(id: string): void;
  failed(id: string, message: string, uncertain: boolean): void;
  observe(event: StreamEvent): void;
  connection(connected: boolean): void;
  dismiss(id: string): void;
  get operations(): readonly RecoveryOperation[];
}
```

As declarações sem corpo acima definem o contrato da classe; implementar métodos nesta tarefa com as regras abaixo, sem API paralela. `id` usa `crypto.randomUUID()`. `failed(..., true)` significa falha de transporte/timeout/resposta inválida: resultado desconhecido, pois servidor pode ter aceitado; não repetir DELETE automaticamente. Falha HTTP confirmada usa false. Guardar operação antes de iniciar fetch para absorver watch que chega antes do 202.

- [ ] Acrescentar ao runner Playwright/Vite da tarefa 2 o teste determinístico central abaixo. Exportar esta função de recovery.test.ts e chamá-la pelo runner em `page.evaluate`, após importar o módulo pelo Vite:

```ts
export function testObservedRecovery() {
  let now = 100;
  const tracker = new RecoveryTracker(() => now);
  const target = pod('old', 'rs-1', false);
  const sibling = pod('existing', 'rs-1', true);
  const operation = tracker.begin(target, [target, sibling]);
  tracker.accepted(operation.id);
  assert(operation.phase === 'accepted', 'HTTP acceptance is not deletion');
  tracker.observe({type: 'updated', pod: sibling});
  assert(operation.candidateUid === undefined, 'Existing sibling is not a replacement');
  now = 200;
  tracker.observe({type: 'deleted', uid: target.uid});
  now = 300;
  tracker.observe({type: 'added', pod: pod('new', 'rs-1', false)});
  now = 1200;
  tracker.observe({type: 'updated', pod: pod('new', 'rs-1', true)});
  assert(String(operation.phase) === 'ready', 'New candidate must become Ready');
  assert(operation.readyObservedAt! - operation.startedAt === 1100, 'Observed duration differs');
}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
function pod(uid: string, owner: string, ready: boolean): PodView {
  return {uid, name: uid, namespace: 'payments', node: 'node-1',
    phase: 'Running', ready, restartCount: 0, reason: '', cpuMillis: 10,
    memMib: 16, createdAt: '2026-09-10T12:00:00.000Z', deletionTimestamp: '',
    controller: {apiVersion:'apps/v1',kind:'ReplicaSet',name:'api',uid:owner}};
}
```

- [ ] Rodar teste falhando; implementar `begin` capturando **todos** os UIDs visíveis do controlador, inclusive irmãos Ready. Bloquear submissão duplicada do mesmo target enquanto em aberto. Guardar baseline e evidências desde begin; chegada da exclusão antes do HTTP não regride ao receber accepted.
- [ ] Implementar correlação por UID do controlador + namespace e regras específicas já definidas. Candidato precisa UID diferente e ausente no baseline; criação não pode ser anterior à createdAt do alvo. createdAt serve para rejeitar candidatos evidentemente antigos, nunca para calcular duração nem provar causalidade (relógios distintos). Ausência do alvo e candidato único são condições para Ready; candidato pode aparecer antes da exclusão por terminação demorada. Só celebrar com ready true e deletionTimestamp vazio.
- [ ] Em duas operações sobre o mesmo controlador, marcar ambas ambiguous, exceto identidades distintas garantidas pela regra StatefulSet/nome ou DaemonSet/node. Dois novos UIDs elegíveis deixam a operação ambiguous; não selecionar o mais próximo, primeiro evento, mesmo prefixo ou mesma posição da cena. Se operador escolher um candidato, mostrar `Following selected pod`, sem converter seleção em prova de reposição. Histórico concluído também pode virar ambiguous se aparecer evidência posterior concorrente durante sua retenção.
- [ ] Diferenciar ausência por deleted de ausência por snapshot (`Pod absent in latest snapshot`). Reconnect/gap conserva operação, mas marca incomplete; snapshots não fabricam `absentAt` histórico. Nova réplica Ready encontrada apenas após reconexão mostra `Ready in latest snapshot; exact recovery timing unavailable`. Atualização com mesmo UID/restartCount incrementado exibe reinício observado sem avançar substituição. Reload da página inicia sessão vazia e não retoma cronômetros antigos.
- [ ] Após 60 segundos sem conclusão, manter operação observável com `Still waiting; recovery is not confirmed`, sem marcar failed e sem atribuir falha ao Kubernetes. Reter no máximo 20 operações encerradas, removendo a mais antiga; não descartar operações abertas silenciosamente. `dismiss` remove acompanhamento, nunca muta cluster.
- [ ] Testar todos os casos: 202 sem watch; watch antes de 202; UID repetido; nova réplica antes da exclusão; candidato já Ready no primeiro evento; namespace/controller UID diferente; rollout; antigo irmão ausente no baseline por gap; standalone; Job sem promessa; StatefulSet mesmo nome; DaemonSet outro node; candidato terminando; 403/404/409/500; rejeição de fetch; accepted com UID errado; gaps/snapshot vazio; dois alvos, dois candidatos; relógio monotônico; espera 60s; novo snapshot não reinicia duração. Testar que a lacuna impede o antigo irmão de aparecer como criação confirmada.
- [ ] Rodar `cd video && node scripts/test-recovery.mjs`, depois `cd web && npm exec tsc -- --noEmit`; revisar commit `feat: track observed pod recovery without causal claims`.

**Acceptance:** Nunca aparece `eliminated` por HTTP, não há falsa substituição por restart ou spawn arbitrário, e tempo significa `Observed Ready after 1.1s from request`, não tempo de agendamento, indisponibilidade ou SLO. Quando evidência é incompleta, omitir número exato e explicar a lacuna.

### Task 4: Integrar progresso e falhas à interface

**Files:** Create `web/src/recovery-panel.ts`, `web/src/recovery-panel.test.ts`; integrador modifica `web/src/main.ts` e stylesheet existente. `scene.ts` pertence ao integrador do plano visual: reutilizar `clearTargeted`, `setFocused`, `removePod`, sem implementar efeitos concorrentes aqui.

**Interfaces:** `RecoveryPanel` recebe elemento raiz e callback de foco; expõe `render(operations: readonly RecoveryOperation[]): void`. `main.ts` possui uma instância de tracker e uma de PodOperations, escolhida explicitamente por `isDemoMode`.

- [ ] Testar apresentação dos estados com DOM: accepted contém `Delete accepted; waiting for observation`; failed mostra erro legível e ação de dispensar; unknown informa que a solicitação pode ter chegado; standalone não mostra spinner eterno; candidate identifica namespace/nome; ready distingue observação completa e lacuna. Usar `textContent` para texto do servidor, nunca innerHTML. Um teste com `<img onerror=...>` garante texto literal.
- [ ] Implementar lista persistente enquanto operação aberta, no máximo cinco itens visíveis com expansor para os demais. Usar `role="status"`, `aria-live="polite"`, atualizar anúncio somente quando estado muda, não a cada tick do cronômetro. Botões acessíveis `Focus pod` e `Dismiss` não disparam ataque. Quando UID não existe no store, desabilitar foco. Usar a linguagem visual definida pelo plano principal.

```ts
const tracker = new RecoveryTracker(() => performance.now());
async function requestAttackDelete(pod: PodView) {
  const operation = tracker.begin(pod, store.pods.values());
  panel.render(tracker.operations);
  try {
    await operations.deletePod(pod);
    tracker.accepted(operation.id);
  } catch (error) {
    // operations.ts deve expor ApiDeleteError para distinguir HTTP de transporte.
    tracker.failed(operation.id, String(error), !(error instanceof ApiDeleteError));
    scene.clearTargeted(pod.uid);
  }
  panel.render(tracker.operations);
}
```

- [ ] Definir `export class ApiDeleteError extends Error { constructor(public status: number, message: string) { super(message); } }` em operations.ts e lançá-la somente para `!response.ok`; demais erros permanecem incertos. Atualizar teste da tarefa 3. Substituir `deletePodFromAttackHit` por integração acima e remover `pushKillFeed`/`eliminated` obsoletos. Antes de begin, checar operação aberta para UID e snapshot inicial recebido; não disparar nova requisição enquanto desconectado.
- [ ] No flush, entregar **cada** StreamEvent ao tracker antes do store.apply, inclusive snapshot; não reduzir a sequência a último estado antes de acompanhar operações. Só `deleted`/snapshot remove Pod da cena. HTTP accepted não remove nem comemora. onConnectionChange atualiza tracker; após snapshot inicial liberar ação. Efeito de impacto representa impacto, não confirmação de DELETE. Desfazer marca de alvo se operação falha/indeterminada.
- [ ] Verificar teclado/foco, animação reduzida, falha HTTP visível e reconexão por mocks de browser. Rodar `cd web && npm exec tsc -- --noEmit && npm run build`; revisar commit `feat: present deletion and recovery progress in the aquarium`.

**Acceptance:** Operador acompanha etapas sem abrir console; Ready pode focar a nova baleia; erro não deixa alvo marcado indefinidamente e nenhum fallback repete DELETE.

### Task 5: Criar missão simulada determinística no mesmo caminho de eventos

**Files:** Modify `web/src/demo.ts`; Create `web/src/demo.test.ts`, `web/src/demo-mission.ts`, `web/src/demo-mission.test.ts`; integrador conecta `web/src/main.ts` e estilos.

**Interfaces:** `DemoStream implements PodOperations` com `deletePod(pod: PodView): Promise<DeleteAccepted>` e `resetMission(): void`. DemoMission recebe `onFocus(uid: string)`, `onInspect(uid: string)` e `onRestart(): void`; estados `'find' | 'inspect' | 'fire' | 'observe' | 'complete'`. Método `selected(uid: string)` registra inspeção real do alvo; `update(operations: readonly RecoveryOperation[]): void` avança somente pelas evidências. `mount(root: HTMLElement): void` e `dispose(): void` montam/limpam controles.

- [ ] Escrever teste com fake timers e spy em fetch: inicializar demo, excluir alvo de missão, avançar relógio; exigir zero fetch e sequência accepted → deleted → added não Ready → updated Ready. `stop()`/reset impedem eventos de timers antigos; duplo clique não agenda duas réplicas.
- [ ] Adicionar alvo fixo `demo-mission-old`, nome `checkout-demo-old`, namespace `bench-payments`, controlador `ReplicaSet/checkout-demo`, UID `demo-rs-checkout`, reason CrashLoopBackOff, ready false. Não aplicar ticks aleatórios a alvo/réplica de missão. Definir owner/deletionTimestamp nos demais Pods sem inventar ligação entre nomes. Missão existe somente em demo.

```ts
// Dentro de DemoStream.deletePod; validar UID ainda presente antes de agendar.
// A fila deve usar timers registrados e generation para cancelamento.
const accepted: DeleteAccepted = {accepted: true, uid: pod.uid};
// +400ms: remover target da lista e emitir {type:'deleted', uid:pod.uid}.
// +1200ms: inserir cópia com uid 'demo-mission-new', nome 'checkout-demo-new',
// controller preservado, ready:false, phase:'Pending', reason:'', restartCount:0.
// +3200ms: atualizar nova cópia para phase:'Running', ready:true e emitir updated.
return accepted;
```

- [ ] Implementar os timers descritos com helper privado `schedule(delay: number, callback: () => void): void`, registrando handles em Set; limpar todos em stop/reset. `emit(event)` primeiro mantém array/map interno coerente e depois chama handler. reset recompõe snapshot, limpa acompanhamento no integrador e retorna câmera ao estado de missão sem recarregar app. Replicar o ciclo para outros Pods controlados da demo com UID único, sem prometer renascimento de standalone.
- [ ] Montar quatro instruções curtas: `Find the unhealthy pod` → `Inspect the failure` → `Fire a simulated request` → `Watch the new pod become Ready`. Seleção abre detalhes reais de demo; avanço para fire depende da inspeção; observe depende da operação aceita; complete depende do tracker Ready para o controlador da missão. Botão `Restart mission` reinicia; `Explore freely` fecha guia sem mutações. Texto fixo `SIMULATED · No cluster changes` permanece visível.
- [ ] Testar erro simulado, encerramento durante recuperação, repetir missão duas vezes e selecionar Pod errado. Ticks comuns não completam missão. Ready tardio de geração anterior não avança guia novo. Rodar `cd web && npm exec tsc -- --noEmit && npm run build:demo`; revisar commit `feat: add a guided simulated recovery mission`.

**Acceptance:** Em menos de um minuto o visitante inspeciona falha, dispara e observa nova réplica Ready; todas as etapas vêm do mesmo tracker do modo conectado. A execução não lê nem muta cluster.

### Task 6: Capturar narrativa verificada, sem cluster real

**Files:** Modify `video/scripts/capture-demo.mjs`, `video/src/Composition.tsx`, `video/src/Root.tsx`, `video/README.md`; Create `video/scripts/verify-recovery.mjs`. Gerar `video/public/kubeaquarium-beats.json`, `video/public/kubeaquarium-footage.webm`, `docs/video/kubeaquarium-demo.mp4` e poster somente durante implementação, após validação.

**Interfaces:** A interface da missão publica `data-mission-step` no elemento raiz e `data-operation-phase`, `data-target-uid`, `data-candidate-uid` em cards; estes atributos representam estado já visível. Playwright usa seletores sem chamar métodos internos que pulem inspeção/disparo. Beats continuam `{name: string, at: number}[]`, com nomes `inspect`, `request`, `absent`, `candidate`, `ready`, `closing`.

- [ ] Criar verificação que abre URL demo local, espera badge `SIMULATED`, inspeciona alvo fixo e dispara pelo fluxo existente; abortar toda requisição `/api/` e todo método mutante, registrando violação e falhando o teste. Impedir captura de URL sem modo demo confirmado **antes** de qualquer input de ataque. Remover sobrescrita periódica de `ctx-name` que hoje disfarça origem.
- [ ] Substituir alvo geométrico arbitrário e espera fixa de “resurrection” por alvo da missão e espera de fases. Timeout de 10 segundos em cada fase falha captura; só registrar beat ready quando card contém UID novo, controlador esperado e fase ready. Verificar um único alvo, nenhuma chamada DELETE, banner visível e ausência de erros de página. Pequenas pausas para leitura são aceitáveis depois de evidência, nunca como confirmação.

```js
await page.locator('[data-mission-step="inspect"]').waitFor({timeout: 10000});
// Ações de inspeção e disparo usam controles reais já localizados pela missão.
await page.locator('[data-operation-phase="ready"][data-target-uid="demo-mission-old"]')
  .waitFor({timeout: 10000});
const candidate = await page.locator('[data-target-uid="demo-mission-old"]')
  .getAttribute('data-candidate-uid');
if (candidate !== 'demo-mission-new') throw new Error('Unexpected recovery candidate');
```

- [ ] Construir narrativa de 30–45 segundos: plano geral curto, falha, inspeção, impacto, `Request accepted`, `Pod absent`, `New replica observed`, `Ready observed`, retorno ao aquário. Remotion lê beats capturados para posicionar títulos; duração deriva de último beat + 2s a 24fps, substituindo 1030 frames fixos. Manter overlay `Simulated Kubernetes lifecycle`; remover afirmação de ressurreição real e rodapé de detalhes internos irrelevantes à missão.
- [ ] Documentar dois terminais: `cd web && npm run dev -- --host 127.0.0.1 --port 7781`; `cd video && DEMO_URL='http://127.0.0.1:7781/?demo' node scripts/verify-recovery.mjs`. Depois `DEMO_URL='http://127.0.0.1:7781/?demo' pnpm capture`, `pnpm lint`, `pnpm render`, `pnpm still`. Revisar MP4 e poster em 960×540 para textos legíveis e conclusão visível. Não executar essas ações nesta rodada de planejamento.
- [ ] Executar `go test ./...`, `cd web && npm exec tsc -- --noEmit && npm run build`, verificações acima; revisar commit `docs: demonstrate observed recovery with a simulated mission`.

**Acceptance:** Vídeo não usa credenciais/cluster, não fabrica resultado pelo relógio, termina depois de Ready confirmado na simulação e mantém origem explícita. Publicação segue decisão do usuário e fica fora deste plano.

## Dependências e ordem de integração

1. Contrato da tarefa 1 é aprovado pelo integrador e aplicado antes dos consumidores. Correção de Ready deve também alimentar radar, labels e detalhes no plano de observabilidade; não criar segunda definição de saúde.
2. Tarefa 2 estabelece reconciliação; tarefa 3 pode ser desenvolvida contra fixtures do contrato em paralelo após aprovação, sem editar main/scene. Tarefa 4 só integra após ambas.
3. Tarefa 5 depende do tracker e painel; tarefa 6 depende da missão funcional. Agentes de vídeo e demo não editam contratos comuns simultaneamente.
4. Cada tarefa mantém o app executável; commits listados são checkpoints da implementação futura, não autorização para executá-la nesta rodada.

## Revisão final do plano

- [ ] Confirmar cobertura com a especificação: solicitação/exclusão distintas, observação de nova réplica e Ready, falhas visíveis, gaps/concorrência, standalone, missão e vídeo.
- [ ] Conferir que `controller`, `deletionTimestamp`, `DeleteAccepted` e assinaturas são idênticos em Go/TS/fixtures; remover consumidores do contrato antigo.
- [ ] Revisar semanticamente resultados: nenhum prefixo/nome sozinho estabelece controlador; nenhuma ausência em snapshot estabelece hora passada; nenhuma criação correlacionada prova causalidade; nenhum vídeo opera cluster real.
