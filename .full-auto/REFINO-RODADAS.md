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

## Rodada 2, 2026-09-12, em frentes paralelas

Seis trilhas em worktree própria, cada uma dona exclusiva de um conjunto de
arquivos sem interseção, mais duas frentes de varredura somente leitura nas áreas
que a rodada 1 não cobriu. Tudo despachado de uma vez.

### Entregue: 32 itens, nada revertido

| Trilha | Itens | O que mudou de mais importante |
|---|---|---|
| relatórios e financeiro | 4 | O card Lucro parou de inventar prejuízo em período de mais de 90 dias atrás, onde a receita vinha vazia e a despesa cheia. Lançamentos passaram a ser filtrados na consulta, e o atalho "Tudo" deixou de exportar 90 dias dizendo "Todo o período" para quem manda o arquivo ao contador. |
| cadastros e estoque | 5 | Exclusão de produto recusada pela RLS deixou de ser registrada como sucesso no log, leitura falha da composição do combo passou a travar o Salvar em vez de apagar itens em silêncio, e o segundo Enter na entrada de estoque não lança a quantidade em dobro. |
| PDV e Palm | 7 | Nome de comanda repetido é bloqueado com o motivo, fechar caixa com diferença exige a justificativa que a regra já pedia, clique no fundo do modal de mesa cancela em vez de confirmar vazio, split não aceita negativo, e a fila de pedidos em espera do Palm sobrevive a recarregar a tela. |
| acesso e login | 5 | Queda de conexão deixou de ser acusada como senha errada e de queimar tentativa (o Console herdou de graça, usa a mesma função), a tela voltou a ser um formulário de verdade, e a aba aberta direto numa rota protegida espera a sessão em vez de piscar o login. |
| gestão e configurações | 5 | Duas abas paravam de oferecer ao gerente botões que o banco sempre recusa, o card Impostos passou a contar a fonte que a tela usa (e levou 175 linhas de tela morta), e Compras ganhou busca, recorte por situação e corte em blocos. |
| delivery e cozinha | 6 | A Cozinha diz no cartão quando a ação não salvou, separando o caso de outra estação ter avançado a comanda, o kanban parou de trazer a base inteira, e os chips do histórico de NFC-e dizem quantas notas esperam ação. |
| do maestro | 5 | Formatador único de dinheiro ligado às seis telas do desktop, travessão fora das telas da Ponte com o guard estendido aos `.html` dela, teto diário de uso do Jarvas, janela de 90 dias com dono único, e prazo de teste de 20 s. |

### Medidas, antes e depois

| Medida | Início da rodada 2 | Fim |
|--------|--------------------|-----|
| Arquivos de teste | 241 | 252 |
| Testes | 4212 | 4334 |
| Tempo da suíte (máquina livre) | 76 s | 135 s |
| Build | limpo | limpo, 2,20 s |
| Bundle principal | 2.442,98 kB, gzip 702,49 kB | 2.456,87 kB, gzip 706,29 kB |
| Achados abertos na auditoria | 33 | 18 |
| Separadores de travessão fora do alcance do guard | 10, na Ponte | 0, e o guard cobre `ponte/*.html` |

O bundle cresceu 14 kB, que é o peso do que foi acrescentado (busca em duas
telas, estados de erro, persistência da fila do Palm). O tempo da suíte quase
dobrou porque há 122 testes novos; por teste, ele ficou praticamente igual.

### Revertido

Nada por quebra. Duas mudanças minhas foram desfeitas por julgamento, não por
falha:

1. **V201, fuso da assinatura.** Alinhar o front ao UTC derrubava 7 testes que
   codificam uma decisão do dono (o dia que vale é o local do estabelecimento, e
   a suíte fixa o fuso em São Paulo de propósito). Reverti e virou a pendência
   P06, com as duas saídas e recomendação.
2. **Constante da janela exportada do `AppContext`.** Os mocks de tela quebraram
   na hora, o que mostrou que o lugar certo era um módulo de constante, que
   ninguém substitui por dublê. Refeito assim.

### Dois erros das frentes, que elas mesmas relataram

Duas frentes criaram arquivo de teste sem checar se já existia e apagaram testes
antigos: 19 no `FinanceiroView.test.jsx` e 7 no `HistoricoNfce.test.jsx`. Nos
dois casos a suíte continuou verde, porque o arquivo novo passava, e só o
`git diff --stat` mostrou a remoção. As duas restauraram por conta própria, e eu
conferi no merge: o diff dos dois arquivos contra a base é puramente aditivo.

Isto vale como aprendizado da rodada, não como acusação: **suíte verde não
detecta teste apagado.** Conferir `git diff --stat` dos arquivos de teste antes
de integrar entrou no meu procedimento.

### O que a paralelização ensinou

Três frentes independentes pediram a mesma coisa (prazo de teste maior) e duas
pediram a mesma constante. Nenhuma delas teria visto isso sozinha, e nenhuma
podia resolver, porque são arquivos compartilhados. A conta fecha: o paralelismo
rendeu, e o custo dele é que a suíte da cópia principal não mede nada enquanto as
frentes rodam (registrado no `BASELINE.md`).
