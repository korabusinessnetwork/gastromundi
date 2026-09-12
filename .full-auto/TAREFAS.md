# TAREFAS, rodada 1 do refino

Legenda: `[ ]` pendente, `[~]` em andamento, `[x]` concluída e verificada, `[!]` travada com diagnóstico.

Lote montado a partir do `AUDITORIA.md` por score, com pelo menos um item de cada
eixo e nenhum item de risco 4 ou 5. Baseline verde antes de começar: 238 arquivos,
4191 testes, build limpo.

| # | id da auditoria | eixo | Tarefa | Critério de pronto, observável |
|---|---|---|---|---|
| [x] T01 | A01 | robustez | PDV, a metade cancelada do item lançado nasce com `uid` novo, como já acontece no checkout | teste novo que cancela item pelo carrinho, roda `mesclarItensComanda` com um lançamento seguinte do Palm e prova que a linha cancelada continua cancelada; suíte verde |
| [x] T02 | C01 | robustez | Relatórios, item cancelado sai do detalhado, da contagem de itens e do export | teste que monta venda com um item cancelado e prova que o detalhado não lista, a contagem não conta e a soma dos subtotais fecha com o total da venda; mesmo para o export; suíte verde |
| [x] T03 | A02 | qualidade | Palm, as duas chamadas de `logAction` passam o usuário no lugar certo | teste que prova `operator_id` com o usuário e `action_type` com o tipo nas duas ações do Palm; suíte verde |
| [x] T04 | D01 | qualidade | Sessão da plataforma não veste a marca de nenhum estabelecimento nem grava cache de marca | teste que entra como `plataforma` fora do host do console e prova título neutro, tokens limpos e nenhuma escrita no cache de marca; suíte verde |
| [x] T05 | B03 | ux | Delivery, apagar faixa de taxa pede confirmação dizendo qual faixa sai | teste que clica na lixeira, prova que nada foi salvo antes da confirmação, e que confirmar salva; suíte verde |
| [x] T06 | B04 | robustez | Delivery desktop, falha ao carregar itens do pedido aparece como falha e pode ser tentada de novo | teste com a leitura falhando: a tela diz que não deu para carregar, não diz "sem itens", e reabrir tenta de novo; suíte verde |
| [x] T07 | A06 | produto | PDV, buscar comanda aceita nome, não só número | teste que digita "Balcão" no campo e prova que a comanda com esse nome aparece; suíte verde |
| [x] T08 | B05 e A08 | qualidade | O guard de travessão passa a pegar o separador em JSX, e as 5 ocorrências viram vírgula | o guard falha com o repositório como está hoje e passa depois da troca; as 5 telas mostram vírgula; suíte verde |

Rodada 1 fechada em 2026-09-12: 8 de 8 entregues, nada revertido, baseline
verde no fim (241 arquivos, 4212 testes, build limpo).

## Backlog imediato para a rodada 2, por score

C04 (5), A04 (5), C02 (4), C05 (4), C06 (4), A03 (4), D02 (4), C11 (3), C08 (3),
C09 (3), A05 (3), A10 (3), D03 (3), D04 (3), N01 (4, do meu próprio achado de
navegação: erro de rede no login apresentado como senha errada), N02 (3), N04 (2).
