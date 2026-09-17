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
