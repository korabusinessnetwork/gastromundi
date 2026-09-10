# TD015 — chaves estáveis nas listas React

**Rodada:** 66
**Item do backlog:** TD015 (`docs/09_BACKLOG/tech-debt.md`)
**Trilha:** ui
**Data:** 2026-09-10

## O problema, sem exagero e sem minimizar

Existem hoje 40 ocorrências de `key={i}` / `key={idx}` / `key={index}` em `.map()` dentro
de `src/`. Nenhuma delas produz bug hoje, e o próprio TD015 registra o porquê: ou a lista
é um array literal fixo (cabeçalho de tabela), ou todos os inputs da linha são
controlados, com o valor vindo do state, então remover a linha do meio ainda renderiza os
valores certos.

O risco é o de amanhã. Chave por índice diz ao React "a terceira linha é a terceira
linha", e não "a terceira linha é o item tal". No dia em que uma dessas listas passar a
reordenar, ou em que uma linha ganhar estado próprio (um `useState` dentro do componente
da linha, um dropdown aberto, foco, seleção de texto, transição CSS), o React reaproveita
o DOM errado e o estado gruda na posição, não no item.

Um caso já está nessa situação: `VinculaRow` (`NotasFiscaisTab.jsx:67`) tem `useState` de
busca e de dropdown aberto, mais um `useRef`, e é renderizado com `key={i}` na linha 1096.
Basta a lista `itensVinc` encolher no meio para o texto digitado numa linha aparecer em
outra. Esse é o único defeito real do lote; os outros 39 são risco futuro.

O TD015 também diz, com razão, que "não vale um refactor em massa isolado". Esta rodada
não é um refactor em massa: é fechar a dívida com uma regra escrita, trocando a chave onde
já existe identidade de domínio, criando identidade onde a lista é editável, e deixando o
índice, com justificativa escrita no código, só onde o índice de fato É a identidade.

## A regra que passa a valer

> `key={i}` só é legítimo quando o índice é a identidade da linha: array literal fixo,
> escrito no código, que nunca reordena nem muda de tamanho, ou lista cuja seleção é feita
> pelo próprio índice. Qualquer lista que venha de dados usa chave estável.

A regra entra no TD015 (que passa a Resolvido) e cada ocorrência remanescente carrega um
comentário curto dizendo por que se encaixa na exceção.

## Escopo: as 40 ocorrências em três baldes

### Balde A — a chave estável já existe, troca direta (10)

| Arquivo | Linha | Lista | Chave |
|---|---|---|---|
| `src/components/desktop/Sidebar.jsx` | 500 | itens da venda | `it.uid ?? idx` |
| `src/components/desktop/views/PDVView/CartPanel.jsx` | 145 | `comanda.items` | `item.uid ?? idx` |
| `src/components/desktop/views/PDVView/CheckoutView.jsx` | 481 | itens do checkout | `item.uid ?? i` |
| `src/components/desktop/views/CozinhaView.jsx` | 179 | itens ativos do pedido | `item.uid ?? idx` |
| `src/components/desktop/views/PDVView/index.jsx` | 1457 | itens da transferência | `item.uid ?? idx` |
| `src/components/desktop/views/PDVView/index.jsx` | 2123 | cancelados do turno | `item.uid ?? idx` |
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | 1129 | cancelamentos | `c.uid ?? i` (ver Decisão 6) |
| `src/components/desktop/views/ProdutosView.jsx` | 674 | fornecedores do produto | `c.uid ?? idx` (o `uid` nasce aqui mesmo, ver Decisão 7) |
| `src/components/desktop/views/CombosView.jsx` | 343 | produtos do combo | `it.produto.id` |
| `src/components/desktop/views/CombosView.jsx` | 448 | subprodutos do combo | `it.subproduto.id` |

O `uid` dos itens de comanda já existe e é estável: `garantirUidItens`
(`src/lib/comandaItens.js`) atribui `crypto.randomUUID()` na primeira gravação e é
idempotente. O `?? idx` é o idioma que o repositório já usa (`CartPanel.jsx:229`,
`RelatorioView.jsx:839`) e cobre item legado, gravado antes do `uid` existir.

As duas listas do `CombosView` entraram aqui depois da leitura do arquivo: elas já
carregam o produto e o subproduto inteiros, e a unicidade do id é garantida por
construção, porque os seletores filtram o que já foi adicionado (`jaAdd` na linha 123,
`adicionados` na linha 114). Não precisam de `uid`.

Onde o índice também é usado dentro do callback (`transQtds[idx]` na linha 1457,
`setQtd(idx, ...)` no `CombosView`), o índice continua na assinatura do `map`. A troca é
só da chave.

### Balde B — a lista é editável e precisa ganhar identidade (11)

Linhas que o usuário adiciona e remove do meio. Recebem `uid` no ponto onde nascem.

| Arquivo | Linha | Lista |
|---|---|---|
| `NotasFiscaisTab.jsx` | 755 | `manualItens` |
| `NotasFiscaisTab.jsx` | 1096 | `itensVinc`, o `VinculaRow` com estado interno |
| `NotasFiscaisTab.jsx` | 1150 | `vinculados`, derivado de `itensVinc` |
| `NotasFiscaisTab.jsx` | 1173 | `naoVinculados`, derivado de `itensVinc` |
| `AdminView.jsx` | 503 | `form.ingredientes` da ficha técnica |
| `AdminView.jsx` | 925 | `form.itens` da compra |
| `ConfiguracoesView.jsx` | 1625 | faixas de horário |
| `DeliveryView.jsx` | 2653 | faixas de entrega |
| `SecaoDelivery.jsx` (mobile) | 214 | faixas de horário |
| `CheckoutView.jsx` | 718 | entradas do split de pagamento |
| `JarvasPanel.jsx` | 228 | mensagens do chat |

Como o `uid` entra: um campo a mais no objeto da linha, gerado onde a linha é criada
(a constante de linha vazia, o `push` do "adicionar", o `map` que carrega do banco).

**Restrição dura desta rodada: o `uid` não pode vazar para o payload gravado no Supabase.**
Cada caminho de save foi lido antes de qualquer troca, um por um. O resultado:

| Lista | Caminho de save | Veredito |
|---|---|---|
| `manualItens`, `itensVinc` e derivados | `NotasFiscaisTab`, os dois saves mapeiam campo a campo | `uid` não passa |
| `form.ingredientes` da ficha | `AdminView:241` → `onSave("fichas_tecnicas", ...)` → `supabase.from("config").upsert({key, value})` | jsonb livre, o `uid` passaria |
| `form.itens` da compra | `AdminView:825` → `onSave("compras", ...)` → mesmo `config` jsonb | jsonb livre, o `uid` passaria |
| `form.compras` do produto | `ProdutosView:375`, `unidades_compra` montado campo a campo | `uid` não passa |
| split do pagamento | `CheckoutView:316` `buildPayloadPagamentos` e `375` `buildPrintPagamentos`, campo a campo | `uid` não passa |
| `horario.faixas` (duas telas) | `normalizarFaixas` (`src/lib/deliveryHorario.js`) reconstrói cada faixa como `{abre, fecha}` | o `uid` é descartado no caminho |
| `faixas_taxa` | `sanitizarConfig` → `normalizarFaixaTaxa` (`src/lib/deliveryAdmin.js`) reconstrói cada faixa | o `uid` é descartado no caminho |
| mensagens do `JarvasPanel` | state local, não é gravado | não se aplica |

Daí saem duas regras de implementação.

Nas duas listas do `AdminView` o objeto da linha é gravado inteiro dentro de um jsonb sem
colunas fixas, então o `uid` **é removido explicitamente no save**, e não confiado a
normalizador nenhum.

Nas três listas de faixa o `uid` **vive só no state da tela**: entra depois do
`normalizarHorario` (na carga, e de novo depois de salvar) e no `addFaixa`, e sai antes de
gravar. O motivo é que o normalizador reconstrói a faixa campo a campo, então um `uid`
gravado não sobreviveria a um ida e volta, e a linha voltaria do banco sem chave. Além
disso a forma de saída dos dois normalizadores está travada por teste
(`deliveryAdmin.test.js:240` e `deliveryHorario.test.js:270` comparam com `toEqual`), e
esta rodada não muda contrato de biblioteca. `FAIXA_PADRAO` continua congelado como está;
o `uid` é acrescentado por quem cria a linha, não pela constante.

A geração fica em um lugar só, `src/lib/uidLista.js`, com fallback para ambiente sem
`crypto.randomUUID` (jsdom antigo, navegador em contexto não seguro).

### Balde C — o índice é a identidade, fica com justificativa escrita (19)

As 19 ocorrências que ficam, com o motivo de cada uma:

| Arquivo | Linha | Lista | Por que o índice é a identidade |
|---|---|---|---|
| `AdminView.jsx` | 499 | cabeçalho da ficha técnica | array literal escrito na linha, tamanho fixo |
| `AdminView.jsx` | 758 | cabeçalho da tabela de fichas | array literal escrito na linha |
| `AdminView.jsx` | 870 | cabeçalho da tabela de compras | array literal escrito na linha |
| `AdminView.jsx` | 342 | ingredientes de uma ficha salva, em leitura | lista só de exibição, e não há chave de domínio: `produtoId` é nulo no ingrediente manual e o nome repete |
| `ConfiguracoesView.jsx` | 144 | barras de força da senha | `Array.from` de tamanho fixo, a posição é o próprio dado |
| `ConfiguracoesView.jsx` | 499 | cabeçalho da tabela de usuários | array literal escrito na linha |
| `NotasFiscaisTab.jsx` | 755 | cabeçalho dos itens manuais | array literal escrito na linha |
| `NotasFiscaisTab.jsx` | 887 | cabeçalho das notas | array literal escrito na linha |
| `NotasFiscaisTab.jsx` | 1096 | cabeçalho do vínculo | array literal escrito na linha |
| `NotasFiscaisTab.jsx` | 1294 | cabeçalho do histórico | array literal escrito na linha |
| `ProdutosView.jsx` | 515 | cabeçalho da tabela de produtos | array literal escrito na linha |
| `SubprodutosView.jsx` | 371 | cabeçalho da tabela de subprodutos | array literal escrito na linha |
| `ImpostosAdmin.jsx` | 549 | badges de contagem | array literal de dois itens, montado na própria expressão |
| `LoginPage.jsx` | 259 | pips de tentativa | `Array.from({length: MAX_ATTEMPTS})`, a posição é o número da tentativa |
| `LancarSheet.jsx` | 221 | linhas do teclado ABC | constante de módulo, nunca muda |
| `CupomNfce.jsx` | 65 | avisos do cupom | strings de um cupom já emitido, render de impressão sem interação |
| `CupomNfce.jsx` | 137 | pagamentos do cupom | mesma impressão, e método repete num split |
| `Sidebar.jsx` | 476 | pagamentos de uma venda fechada | leitura de venda imutável, e método repete num split |
| `EstoqueView.jsx` | 509 | abas de unidade de compra | o índice É a seleção: `setModo(p.id, idx)` guarda o índice |

Cada uma ganha um comentário de uma linha com o motivo daquela lista, não um comentário
genérico repetido.

## Critérios de aceite

1. `grep -rn "key={\(i\|idx\|index\)}" src/` não devolve nenhuma ocorrência sem
   justificativa escrita na linha de cima ou na própria linha.
2. Balde A: as 10 trocas usam a chave indicada, com o fallback por índice preservado, e
   nenhum callback perdeu o índice de que dependia.
3. Balde B: as 11 listas renderizam por `uid`, gerado em um único lugar
   (`src/lib/uidLista.js`).
4. Nenhum `uid` gerado nesta rodada chega ao banco por um caminho que antes não gravava o
   campo. Verificado lendo cada save afetado, um por um.
5. Balde C: as 19 restantes têm comentário específico, e nenhum comentário é cópia literal
   de outro.
6. `src/lib/uidLista.js` tem teste próprio: gera valor diferente a cada chamada, é
   idempotente sobre item que já tem `uid`, preserva os demais campos, não altera o array
   quando nada mudou, e funciona sem `crypto.randomUUID` disponível.
7. Nenhum teste existente foi removido ou enfraquecido; a contagem da suíte só sobe.
8. `npm test` verde, com a contagem de arquivos e de testes registrada antes e depois.
9. `npm run build` passa.
10. TD015 marcado como Resolvido em `docs/09_BACKLOG/tech-debt.md`, com a regra escrita e a
    contagem final por balde.
11. Nenhum comportamento de tela mudou. A rodada troca chave de reconciliação, não lógica:
    nenhum handler, cálculo, filtro ou payload alterado além da adição do `uid`.

## Fora de escopo

- Extrair CSS inline dos arquivos tocados. É o T06 (F018); misturar as duas coisas
  transformaria o diff em algo irrevisável.
- Renomear, reordenar ou reorganizar as listas.
- Dar `uid` a listas que não estão nas 40 ocorrências.

## Decisões tomadas nesta rodada

**Decisão 1 — o índice fica onde ele é a identidade, em vez de inventar chave.**
A alternativa seria uma chave derivada do próprio índice ou do texto do cabeçalho. A
primeira é a mesma chave por índice com fantasia; a segunda quebra em arrays de cabeçalho
que têm duas colunas vazias (`["", "Nome", ..., ""]`), gerando chave duplicada. Chave
honesta com o motivo escrito vale mais que chave maquiada.

**Decisão 2 — `uid` dentro do objeto da linha, e não numa estrutura paralela.**
Guardar as chaves fora dos dados (um `useRef` com lista espelhada) evitaria qualquer risco
de payload, mas exigiria manter duas listas em sincronia em cada inclusão e cada remoção,
o que é mais superfície de bug do que a que estamos fechando. O `uid` no objeto é o padrão
que o repositório já adotou em `comandaItens.js`.

**Decisão 3 — `Sidebar.jsx:476` fica no balde C, e não com o método de pagamento como
chave.** Método pode repetir num split (o `totalPorMetodo`, em `src/utils/pagamentos.js`,
soma por método justamente porque repete), então o método não é único. A lista é de uma
venda já fechada, imutável na tela. Índice, com o motivo escrito.

**Decisão 4 — `AdminView.jsx:342` desce do balde A para o C.** O spec previa
`ing.produtoId ?? ing.nome ?? i`, mas a leitura do arquivo desmontou a premissa: o
ingrediente adicionado manualmente nasce sem `produtoId`, e o nome não é único dentro de
uma ficha, nada impede duas linhas "Leite". A cadeia de fallback produziria chave
duplicada exatamente nas fichas mais bagunçadas, que é onde ela precisaria funcionar.
A lista é só de exibição, então o índice honesto vale mais que a chave que parece estável
e não é. Balde A cai para 10 e o C sobe para 19.

**Decisão 5 — os helpers de faixa ficam duplicados nas duas telas de horário, e não em
`deliveryHorario.js`.** `faixaNova()` e `horarioParaEdicao()` aparecem iguais em
`ConfiguracoesView.jsx` e em `SecaoDelivery.jsx`. O lugar "certo" seria o módulo de
horário, mas ele se declara puro logo no cabeçalho, "sem I/O, sem env, para nascerem com
teste", e `novoUid` toca `crypto` e `Date.now()`. Duas linhas repetidas custam menos do
que quebrar um contrato declarado e o arquivo de teste que o trava.

### Decisão 6, a chave dos cancelamentos é `uid`, não `id`

O plano dizia `c.id ?? i`. Ler o arquivo mostrou que a linha da tabela de cancelamentos não
é a venda nem o item: ela é uma linha achatada, montada na hora a partir dos itens cancelados
de cada venda e de cada pedido, e não tem `id` nenhum. O que existe é o `uid` do item da
comanda, que `garantirUidItens` (`src/lib/comandaItens.js`) já atribui desde antes desta
rodada. Então a montagem da linha passou a copiar esse `uid`, e a chave ficou `c.uid ?? i`.

O `?? i` continua ali de propósito e está comentado no código: venda fechada antes de os
itens nascerem com identidade não tem `uid` para oferecer, e o relatório abre o histórico
inteiro, inclusive o antigo.

### Decisão 7, o `uid` dos fornecedores nasce no `ProdutosView`

O plano colocou `form.compras` no balde A com a nota "o `uid` vem do balde B", mas nenhuma
das onze listas do balde B é essa. A review pegou o furo: a chave `c.uid ?? idx` estava
escrita e caía sempre no índice, porque nada carimbava `uid` na linha de fornecedor.

A lista é editável no sentido pleno: `addCompra` empurra uma linha, `removeCompra` tira do
meio, e o cartão em edição é apontado por posição (`editingCompra === idx`). Então ela ganhou
`uid` nos dois pontos onde a linha nasce, a carga de `unidades_compra` e o `addCompra`. O save
já estava lido no quadro de veredito e monta `unidades_compra` campo a campo, então o `uid`
continua fora do banco.

A contagem por balde não muda: as 40 ocorrências continuam A 10, B 11, C 19. O que muda é
onde o `uid` é gerado, que passa a incluir o `ProdutosView`.

## Veredito da review

**Aprovado, 11 de 11 critérios em sim.** A auditoria leu os arquivos de verdade, com grep e
leitura direta, e não o diff resumido.

| # | Critério | Evidência |
|---|---|---|
| 1 | Nenhum `key={i}` sem justificativa | 19 ocorrências reais em 12 arquivos, todas com `// TD015:` na linha de cima; a vigésima que o grep cru conta é a prosa dentro de `src/lib/uidLista.js` |
| 2 | Balde A, 10 trocas com fallback | Sidebar 501, CartPanel 145, CozinhaView 179, PDVView 1457 e 2123, CheckoutView 487, RelatorioView 1133, ProdutosView 681, CombosView 343 e 448; PDVView mantém `transQtds[idx]` e CombosView mantém `setQtdComp(idx, ...)`, os dois callbacks que dependiam do índice |
| 3 | Balde B, 11 listas por `uid` | AdminView 512 e 937, ConfiguracoesView 1639, DeliveryView 2659, NotasFiscaisTab 762, 1105, 1159 e 1182, CheckoutView 724, JarvasPanel 233, SecaoDelivery 226, todas com `uid` vindo de `@/lib/uidLista` |
| 4 | Nenhum `uid` novo no banco | `listaSemUid` nos dois saves do AdminView (fichas 251, compras 842); os três inserts do NotasFiscaisTab, o save do ProdutosView e os payloads do CheckoutView montam campo a campo, lidos um por um |
| 5 | Balde C com comentário específico | 26 comentários `// TD015:` no total, 19 in loco mais o do `?? i` do RelatorioView e 6 de cabeçalho de arquivo; `sort | uniq -d` não devolve nada, nenhum é cópia literal |
| 6 | `uidLista.js` com teste próprio | `src/lib/uidLista.test.js`, 16 testes, cobre as cinco propriedades pedidas mais o caso do `randomUUID` que lança em contexto não seguro |
| 7 | Nenhum teste enfraquecido | `git diff --stat -- "src/**/*.test.*"` vazio; o único arquivo de teste no diff é o novo, não rastreado |
| 8 | `npm test` verde | 232 arquivos / 4102 testes antes, 233 arquivos / 4118 testes depois, tudo passando |
| 9 | `npm run build` passa | Build limpo, PWA gerada, 64 entradas no precache, só o aviso usual de tamanho de chunk |
| 10 | TD015 Resolvido no backlog | `docs/09_BACKLOG/tech-debt.md`, com a regra escrita e a contagem A 10, B 11, C 19 |
| 11 | Nenhum comportamento mudou | O diff inteiro de `src` filtrado para as linhas que não são chave, `uid` ou comentário sobra só o lado antigo das mesmas linhas; as duas simplificações `map((item, i) =>` para `map(item =>` estão em corpos que nunca usavam o índice |

### O que a review encontrou e corrigiu sozinha

Um furo real, e ele era do tipo silencioso: no `ProdutosView` a chave `c.uid ?? idx` estava
escrita como se o `uid` existisse, mas nenhuma linha de `form.compras` recebia `uid` em lugar
nenhum, então ela caía sempre no índice sem nada apitar. Nem o build, nem a suíte, nem o grep
do critério 1 pegariam isso: a chave está lá, com a cara certa. Só a leitura do arquivo
inteiro pega.

A correção está na Decisão 7. O consertado foi verificado com a suíte inteira e com o build,
depois da mudança, não antes.

### O que precisou de decisão

Nada foi escalado. As duas divergências entre plano e código, a chave dos cancelamentos e o
`uid` dos fornecedores, foram decididas dentro da rodada e estão escritas como Decisão 6 e
Decisão 7.
