# Baixa no caixa sempre vira baixa no estoque

> Pedido do dono, literal: *"sempre que der baixa no caixa tem q dar baixa no estoque"*.
> Não é uma feature — é uma invariante que o sistema dizia cumprir e não cumpria.

## 1. O furo (por que a invariante estava quebrada)

Não existe coluna `controla_estoque` em `products`. O que decide se um produto é
controlado é a **existência da linha dele na tabela `estoque`** — e nada mais.

E três camadas conspiravam para essa linha não existir e ninguém perceber:

1. **`addProduct` nunca criou a linha.** Todo produto cadastrado pelo app nascia fora
   do controle de estoque, para sempre.
2. **O PDV pulava a baixa desses produtos.** `useFinalizarPagamento` tinha
   `if (!(prodId in estoque)) continue;` com o comentário "produto sem entrada no mapa
   de estoque = sem controle de estoque". O comentário racionalizava um acidente: como
   a linha nunca nascia, a guarda valia para o catálogo inteiro. Vendia sem descontar.
3. **A RPC não reclamava.** `baixar_estoque` é um `UPDATE ... WHERE produto_id = ...`:
   produto sem linha → zero linhas afetadas, **nenhum erro**. E `processarBaixaEstoque`
   tratava "sem linha de volta" como sucesso, devolvendo `anterior - qty` — um saldo
   inventado, exatamente o padrão que originou o TD012.

O resultado é o pior formato possível de defeito: silencioso e disfarçado de normal. A
`EstoqueView` lista **todos** os produtos e mostra `estoque[p.id] ?? 0`, então um produto
que nunca foi contado aparece com saldo "0" — igualzinho a um produto controlado que
acabou. Não havia como distinguir na tela.

Um agravante independente: a guarda dava ao **mapa em memória deste aparelho** poder de
veto sobre a baixa. Carga de estoque que falhou no bootstrap = mapa vazio = venda inteira
sem descontar nada, em silêncio.

## 2. Escopo

Fazer valer a invariante nos quatro pontos onde ela vazava:

- A RPC cria a linha do produto antes de descontar (migration `20260919`), mais backfill
  dos produtos que já existem.
- `addProduct` cria a linha junto com o produto.
- O PDV manda **todo** item vendido para a baixa — quem decide se há o que descontar é o
  servidor, não o cliente.
- "RPC OK sem linha de volta" vira **falha explícita** (`estoque_sem_linha`), em produto e
  em subproduto, com o alerta do Jarvas que já existe para baixa recusada.

## 3. Fora de escopo

- **Bloquear a venda.** Continua valendo: baixa de estoque nunca trava o pagamento.
- **Avisar o operador na tela do PDV.** Decisão de produto ainda pendente desde o TD012.
- **`controla_estoque` em `products`.** É a saída limpa para "produto que não se conta"
  (couvert, taxa de serviço), mas é decisão de produto — anotada no backlog, não feita aqui.
- **`estoque_subprodutos`.** Lá a linha nasce com o cadastro do subproduto, que tem
  `controla_estoque` de verdade. Linha faltando ali é inconsistência de dados: o app passa
  a **acusar**, não a criar por conta própria.

## 4. As quatro mudanças

### 4.1 Migration `20260919_baixa_estoque_cria_linha.sql` (o remendo que sustenta o resto)

`INSERT ... ON CONFLICT (produto_id) DO NOTHING` no começo da `baixar_estoque`, com
`tenant_atual_id()` explícito. É a correção **load-bearing**: vale para produto criado pelo
app, por importação ou por SQL direto.

O INSERT vem **antes** da checagem de idempotência de propósito — uma baixa reenviada da
fila offline também precisa receber a linha de volta, senão o app lê "nenhuma linha" e acusa
falha numa baixa que já tinha sido aplicada.

O backfill cria a linha (saldo 0, mínimo padrão) para os produtos que já existem: sem ele, a
linha só nasceria na primeira venda de cada um, e até lá a tela seguiria mostrando saldo "0"
que não é saldo nenhum.

### 4.2 `addProduct` cria a linha

Redundante com a RPC de propósito. A RPC garante a baixa; o `addProduct` garante que a tela
de Estoque esteja honesta **antes** da primeira venda, e não a partir dela. Falhar aqui não
desfaz o produto (ele existe e é vendável) — reporta e segue.

### 4.3 O PDV não veta mais

`if (!(prodId in estoque)) continue;` foi removido, junto com o `estoque` do destructure. O
servidor decide. Estoque zerado também não pula: a RPC clampa em zero e o Jarvas sinaliza a
venda sem estoque (oversell), comportamento que já existia e continua.

### 4.4 "Sem linha" é falha, não sucesso

`processarBaixaEstoque` devolve `{ code: "estoque_sem_linha" }` e o saldo **anterior** —
nunca uma estimativa. `baixarEstoqueSubproduto` passa a olhar o `data` da RPC (ignorava por
completo) e sintetiza o mesmo erro.

Isso é o que impede a rodada de trocar um problema por outro: tirar o veto do cliente sem
isto trocaria um pulo silencioso por uma mentira silenciosa. As quatro mudanças são uma
unidade só.

## 5. Efeito colateral declarado

Produto que ninguém quer controlar (couvert, taxa de serviço) passa a ter linha e a gerar
alerta de venda sem estoque a cada venda. Hoje não há como desligar o controle por produto —
a saída é dar entrada do saldo. Um `controla_estoque` em `products` resolve, e está no
backlog como decisão de produto.

O barulho é o preço de o inventário ser verdadeiro, e é reversível pelo caminho oposto ao do
defeito: alerta demais aparece, baixa de menos não aparecia.

## 6. Critérios de aceite

1. Produto fora do mapa de estoque local **passa** pela baixa.
2. Mapa de estoque vazio (carga falhou) não impede baixa nenhuma.
3. Item cancelado e item sem produto vinculado continuam de fora.
4. Cadastrar produto cria a linha de `estoque` com `produto_id` correto.
5. Falha ao criar a linha não desfaz o produto; reporta com `acao: "addProduct:estoque"`.
6. RPC de produto sem linha de volta devolve `estoque_sem_linha` e o saldo anterior — nunca
   `anterior - qty`.
7. RPC de subproduto sem linha de volta gera o alerta de baixa recusada com a chave própria
   do subproduto.
8. Migration idempotente, com REVOKE/GRANT re-aplicáveis e `tenant_id` explícito.
9. Suíte inteira verde.

## 7. Resultado

`207 arquivos / 3632 testes` verdes (+5 testes líquidos: 7 novos, 1 removido por afirmar o
contrário do que o pedido do dono manda).

## 8. Aplicação no banco

A migration precisa ser aplicada no painel do Supabase. Sem ela, o app não regride (o
`addProduct` já cria a linha dos produtos novos), mas os produtos antigos continuam sem linha
— e agora **acusam** `estoque_sem_linha` em vez de falhar calado. RLS: nenhuma policy nova; a
função é `SECURITY DEFINER` e segue sendo a única a escrever ali em nome do operador.
