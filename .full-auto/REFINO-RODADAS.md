# RODADAS DE REFINO

Uma seção por rodada: o que entrou, o que foi entregue, o que foi revertido e por
quê, medidas antes e depois, o que ficou atrás de flag.

## Rodada 1, 2026-09-12

Entrada: auditoria de 53 fluxos em quatro frentes, mais navegação real nas
superfícies anônimas. 41 achados com evidência, 8 executados por score.

### Entregue, 8 de 8, nada revertido

| id | eixo | O que mudou | Commit |
|---|---|---|---|
| A01 | robustez | PDV, a metade cancelada de um item lançado pelo carrinho passa a nascer com `uid` próprio. Sem isso o cancelamento era descartado no primeiro lançamento vindo do Palm e o cliente pagava o item cancelado. | `7949b63` |
| C01 | robustez | Relatórios, item cancelado dentro de venda cobrada sai do detalhado, da contagem de itens e do arquivo exportado. A soma dos subtotais voltou a fechar com o total da comanda. | `4f8dc3d` |
| A02 | qualidade | Palm, as duas chamadas de `logAction` voltaram a registrar o garçom. Gravavam `operator_id: "comanda:abrir"` e `action_type: "[object Object]"`, então comanda aberta e lançamento ficavam fora de qualquer filtro por tipo. | `4e5cd65` |
| D01 | qualidade | A sessão do super-admin não veste mais a marca de um cliente, em nenhum host, e não grava essa marca no cache por origem. | `9557798` |
| B03 | ux | Delivery, apagar faixa de taxa pede confirmação dizendo qual faixa sai, e a remoção casa pelo `uid` em vez do índice. | `b4b39e1` |
| B04 | robustez | Delivery no desktop, falha ao carregar itens do pedido aparece como falha e é tentada de novo ao reabrir o cartão, em vez de virar "Sem itens detalhados". | `aa5dd2a` |
| A06 | produto | PDV, buscar comanda aceita nome e garçom, não só dígito. A grade já filtrava por nome, só o campo bloqueava. | `19ea39d` |
| B05 | qualidade | O guard da regra de escrita do dono voltou a pegar o travessão como separador em JSX, e as 6 ocorrências reais viraram vírgula. | `1a8a420` |

### Medidas, antes e depois

| Medida | Antes | Depois |
|--------|-------|--------|
| Arquivos de teste | 238 | 241 |
| Testes | 4191 | 4212 |
| Tempo da suíte | 78,65 s | 75,69 s |
| Build | limpo, 2,99 s | limpo, 1,56 s |
| Separadores de travessão em texto de tela | 6, nenhum pego pelo guard | 0, e o guard pega |
| Achados abertos no `AUDITORIA.md` | 41 | 33 |

Cada correção nasceu com teste que falha sem ela: verifiquei item por item,
revertendo a mudança de produção e rodando o teste novo antes de commitar.

### Revertido

Nada. Nenhum item precisou de `git revert` nesta rodada.

### Atrás de flag ou mockado

Nada. Nenhuma mudança desta rodada ficou atrás de flag, e nenhuma depende de
migration, então não há nada novo para o dono aplicar antes de usar.

### Observação sobre o tempo de build

O build caiu de 2,99 s para 1,56 s e o precache do PWA subiu de 3.877 KiB para
4.068 KiB. A queda de tempo é cache do Vite entre execuções, não ganho de
performance meu, e a subida do precache é o peso dos arquivos que mudaram. Não
conto nenhum dos dois como resultado.
