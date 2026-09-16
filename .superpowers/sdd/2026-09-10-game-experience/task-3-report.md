# Task 3 — evidências de recuperação

## Resultado

O tracker agora reconcilia candidatos com a membresia atual: um candidato removido por evento deleted ou ausente no próximo snapshot deixa de poder ser apresentado como Ready. A história de UIDs candidatos é preservada separadamente para que uma concorrência posterior continue ambígua. Snapshots e lacunas não fabricam hora de ausência ou duração precisa.

O contrato público de RecoveryTracker e LivePodOperations foi preservado. Não houve alteração em main.ts ou no painel.

## Checklist de cenários

| Cenário exigido | Evidência no teste |
| --- | --- |
| 202 sem watch; watch antes de 202 | 202 without watch stays accepted; watch before 202 does not regress |
| UID repetido e restart sem substituição | irmão do baseline em testObservedRecovery nunca vira candidato |
| nova réplica antes da exclusão; Ready no primeiro evento | candidate before deletion can be observed Ready; Ready on first candidate event is observed |
| namespace/controlador diferente; rollout | foreign owner and namespace do not correlate; two candidate UIDs stay ambiguous |
| irmão antigo após gap | gap cannot establish old sibling creation: há lacuna, sem hora precisa e sem alegação de criação |
| standalone e Job | standalone has no replacement promise; Job readiness is not a replacement promise |
| StatefulSet e DaemonSet | StatefulSet requires same name; StatefulSet same name is eligible; DaemonSet requires same node |
| candidato terminando; candidato removido | terminating candidate cannot become Ready; deleted candidate cannot remain Ready |
| 403/404/409/500; fetch rejeitado; UID aceito errado | runOperationsTests, com status preservado, rejeição propagada e validação de UID |
| gap, snapshot vazio e Ready no snapshot | snapshot absence has no historical time; snapshot Ready has no exact timing |
| dois alvos no mesmo controlador | two ReplicaSet targets are ambiguous; StatefulSet com nomes distintos não conflita |
| relógio, espera de 60 s, snapshot posterior | testObservedRecovery mede 1100 ms injetados; 60 second wait remains observable; snapshot never restarts duration |
| bloqueio de duplicata e dismiss | open duplicate is blocked; dismiss only removes tracking |

## Comandos executados

    cd web && npm exec tsc -- --noEmit
    # exit 0

    cd video && node scripts/test-recovery.mjs
    # recovery frontend tests passed

O runner foi executado contra http://127.0.0.1:7781/?demo, com Vite/Playwright e somente eventos e fetch falsos. Ele falha em pageerror.

## Revisão própria e limitações

Revisei especialmente a separação entre o mapa de candidatos atuais e candidateUids histórico. O primeiro é limpo por snapshot/delete; o segundo nunca é usado para concluir Ready, mas mantém a ambiguidade. Uma nova evidência concorrente também reclassifica uma operação anteriormente Ready como ambígua e remove o tempo.

O tracker não infere causalidade Kubernetes, tempo de scheduler ou disponibilidade. Após gap/snapshot ele pode mostrar o pod Ready atualmente, mas omite a duração exata.
