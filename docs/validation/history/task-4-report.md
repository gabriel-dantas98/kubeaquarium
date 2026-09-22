# Relatório da tarefa 4 — painel de recuperação e missão demo

## Resultado

O painel de recuperação agora desabilita `Focus pod` quando a substituição já não está no store. A missão demo só conclui depois de uma solicitação aceita e de uma observação `Ready`; uma evidência `Ready` antiga não pula as etapas. A cena inicializa o atributo instanciado `instanceState`, que o shader e a remoção de pods já utilizavam, evitando erros de página durante a recuperação visível. O alvo que está em foco tem prioridade no disparo em mergulho, portanto o fluxo guiado realmente atinge o pod que acabou de ser inspecionado.

## Cenários verificados

- **Estados do painel:** `accepted`, `failed`, `unknown`, `standalone`, `candidate`, `ready` com observação completa e `ready` originado de snapshot exibem suas mensagens no DOM.
- **Texto não confiável:** uma mensagem contendo `<img src=x onerror=...>` permanece texto literal; nenhum elemento `img` é criado.
- **Ações e lista:** `Dismiss` chama sua ação, candidato ausente deixa `Focus pod` desabilitado, candidato presente pode receber foco, e seis operações começam com cinco cartões e usam `Show 1 more`.
- **Sequência simulada:** o alvo fixo é aceito sem `fetch`, emite `deleted` após 400 ms, `added` Pending após 1200 ms e `updated` Ready após 3200 ms.
- **Timers e repetição:** segundo clique de delete é rejeitado; `resetMission()` cancela timers antigos e emite apenas o novo snapshot; `stop()` não permite eventos tardios e limpa o tick comum.
- **Guia:** seleção errada e `Ready` antes do pedido não avançam; Find → Inspect → Prepare → accepted → observe → Ready conclui; Restart reabre a missão e Explore freely a fecha sem operação.
- **Fluxo visível:** em `http://127.0.0.1:7781/?demo`, Playwright clicou Find pod, Inspect failure, Prepare submarine e o canvas. O guia chegou a `Watch the new pod become Ready` e `Recovery observed`, sem `pageerror`.

## Comandos e saída

```text
cd web && npm exec tsc -- --noEmit
# saída: código 0

cd video && node scripts/test-recovery.mjs
# saída: recovery frontend tests passed

cd web && KUBEAQUARIUM_WEB_OUT_DIR=/tmp/kubeaquarium-review-build npm exec vite -- build
# saída: ✓ built in 687ms

cd web && KUBEAQUARIUM_WEB_OUT_DIR=/tmp/kubeaquarium-review-build-demo \
  KUBEAQUARIUM_WEB_BASE=/kubeaquarium/ VITE_KUBEAQUARIUM_DEMO=1 npm exec vite -- build
# saída: ✓ built in 644ms

cd video && node scripts/check-demo-mission.mjs
# saída: visible demo mission flow passed
```

O smoke test coleta `pageerror`, espera os pods da demo, executa os quatro controles visíveis e falha se qualquer erro de página ocorrer.

## Limitações e preocupações

- Os dois builds do Vite ainda avisam que o bundle JavaScript minificado tem mais de 500 kB. Isso já existia no produto e não foi alterado nesta tarefa.
- A validação usa exclusivamente a demo local e timers falsos; nenhuma operação de cluster foi executada.

## Correção round 1/5

O revisor identificou que `absent` ou `candidate` podiam mover a missão de `fire` para `observe` antes da confirmação HTTP. A transição agora exige `operation.acceptedAt !== undefined`. Como essa confirmação pode chegar depois dos eventos do stream, a mesma atualização ainda conclui corretamente uma operação que já esteja `ready`.

O teste da demo também reinicia enquanto os três timers da primeira recuperação ainda estão pendentes, avança além de todos os prazos antigos e confirma que só o snapshot de reset foi emitido. Depois conclui duas recuperações novas até Ready. O smoke test visual percorre duas missões completas com Restart entre elas.

### RED observado em `177cee4`

```text
Temporary worktree: git worktree add --detach /tmp/kubeaquarium-task4-red 177cee4
Temporary server: cd /tmp/kubeaquarium-task4-red/web && npm exec vite -- --port 7782 --strictPort
Browser assertion: construct DemoMission in fire, deliver candidate without acceptedAt, require state === fire
# saída (código 1): Error: RED: stream candidate advanced guide before HTTP acceptance: observe
```

O worktree e o servidor temporários foram removidos após a reprodução.

### GREEN

```text
cd web && npm exec tsc -- --noEmit
# saída: código 0

cd video && node scripts/test-recovery.mjs
# saída: recovery frontend tests passed

cd video && node scripts/check-demo-mission.mjs
# saída: visible demo mission flow passed
```

## Correção round 2/5

O deduplicador de `main.ts` agora inclui `acceptedAt`, portanto a aceitação HTTP tardia é uma mudança observável para a missão. A reprodução revelou também que `RecoveryTracker.accepted()` tratava `ready` como terminal e descartava essa aceitação; ele agora aceita o único carimbo tardio em `ready`, mas continua ignorando falha, resultado desconhecido, ambiguidade e standalone. A regressão do tracker verifica Ready antes de `accepted(id)`, exige `acceptedAt` registrado e confirma que fase e tempo Ready observados não regridem.

`check-demo-mission.mjs` carrega a instância já usada pelo app, substitui somente `DemoStream.prototype.deletePod` nessa página isolada e retarda a Promise em 5 segundos depois de preservar os eventos normais. O teste espera o cartão `ready`, confirma que o guia ainda mostra `Fire a simulated request`, e então exige `Recovery observed` após a aceitação tardia. Ele percorre duas repetições.

### RED observado

```text
cd video && node scripts/check-demo-mission.mjs
# saída (código 1): Error: guide did not complete after delayed acceptance:
# SIMULATED · No cluster changesFire a simulated requestPrepare submarineExplore freely
```

Isso ocorreu antes de permitir `acceptedAt` tardio no tracker: o painel já mostrava Ready, mas a missão não recebia uma atualização de aceitação.

### GREEN

```text
cd web && npm exec tsc -- --noEmit
# saída: código 0

cd video && node scripts/test-recovery.mjs
# saída: recovery frontend tests passed

cd video && node scripts/check-demo-mission.mjs
# saída: visible demo mission flow passed
```
