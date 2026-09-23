# Experiência de exploração e recuperação do kubeaquarium

## Objetivo e escopo

Evoluir o aquário para um espaço legível, navegável e capaz de mostrar ações e recuperação observada do Kubernetes. Direção solicitada pelo usuário após a análise das capturas, frames dos vídeos e fontes do projeto; este documento detalha essa direção para planejamento e delegação.

Três subprojetos: navegação, apresentação visual e operações/recuperação. Cada entrega deve manter o produto utilizável de ponta a ponta. A implementação pode começar pelas correções existentes; funcionalidades maiores entram em camadas verificadas.

## Restrições globais

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

## Navegação

Teclas de pilotagem não atuam em busca, radar, campos editáveis ou controles interativos. Perda de foco limpa teclas presas. Escape fecha primeiro a interface ativa antes de mudar o modo de câmera. Arrastar para orbitar não seleciona um pod ao terminar.

Mergulho permite olhar e dirigir com o mouse, com sensibilidade ajustável, frenagem previsível e movimento reduzido. Entrada e saída preservam orientação sem saltos. Preferir um modo de mira consistente; não acumular dois sistemas concorrentes de apontamento.

Namespaces mantêm centros estáveis durante mudanças de contagem. A extensão visual pode crescer sem reorganizar silenciosamente o mapa. O retorno à visão geral enquadra o conjunto atual. Radar usa coordenadas relativas à câmera e distingue profundidade, seleção e alvos fora do alcance; a busca existente continua acessível por teclado.

## Apresentação

Substituir grade densa por contorno discreto que perde presença dentro da bolha. Preservar a identidade low-poly das baleias. Informação varia com distância: resumo do namespace ao longe, recursos relevantes perto e identidade inequívoca do alvo selecionado.

Rótulos não atravessam modais nem encobrem controles. O painel de detalhes reserva área no enquadramento. Pods em erro ganham atenção sem transformar todo o cenário em um alerta piscante. Estado de saúde é distinto de tamanho: CPU/memória atuais representam requests ou limits projetados pelo backend, não consumo ao vivo.

Efeitos de impacto curtos com anel, bolhas e fragmentos limitados. Áudio opcional iniciado por gesto do usuário e suspenso quando apropriado; sinaliza lançamento, impacto e recuperação sem tocar um alerta para cada pod. Remover tremor e pulsos intensos quando movimento reduzido está ativo.

## Operações e recuperação

Separar impacto visual, solicitação pendente, exclusão aceita, remoção observada e recuperação observada. HTTP 2xx não significa que o recurso já desapareceu. Erro de rede ou API aparece na interface; não repetir automaticamente uma exclusão incerta.

Transportar UID do owner controlador imediato com namespace/kind/name. Correlação exige identidade do controlador, UID novo e conhecimento dos pods anteriores à operação. Réplica já existente não é substituta. Pods sem controlador não prometem reposição. Múltiplas operações do mesmo controlador devem ser agregadas ou explicitamente tratadas como ambíguas.

DELETE identifica também o UID do pod alvejado, evitando excluir outro pod que reutilizou o nome. Reconexão e lacunas reconstituem estado a partir de snapshot, sem inventar sequência ou duração. A interface apresenta “recovery observed” quando a evidência comprova apenas o estado observado, não causalidade.

Demo segue os mesmos contratos, com cenário repetível: localizar falha, inspecionar, efetuar exclusão simulada e observar uma réplica ficar Ready. Ela pode ser pulada e reiniciada. Vídeo apresenta essa narrativa e suas evidências, em vez de depender de esperas fixas ou anunciar funcionalidades técnicas durante toda a sequência.

## Verificação

Capturar baseline atual antes de alterações visuais no mesmo navegador, máquina, viewport e DPR usados depois. Cenários de 200, 1200 e 2500 pods sintéticos cobrem visão geral, filtro, radar, mergulho e impacto. Medir intervalos rAF brutos, p50/p95/p99, frames acima de 50 ms, draw calls e resolução efetiva; FPS suavizado não basta.

Meta inicial: p95 de até 20 ms com 200 pods no ambiente de referência que conseguir essa marca no baseline; nos demais cenários, regressão de p95 superior a 10% exige investigação antes da integração. São metas de validação, não resultados medidos. Não prometer desempenho para 20 mil pods com base em capacidade de alocação.

Validar navegação manual em navegador visível além de testes automatizados. Validar operações com testes de Go e eventos sintéticos; garantir ausência de DELETE real nos testes de browser e na captura. Evidência final inclui imagens comparáveis, vídeo curto, resultados de testes e limitações.
