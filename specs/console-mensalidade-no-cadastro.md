# CONSOLE-UX 12 — a mensalidade combinada entra no cadastro (rodada 38)

## 1. Escopo

O formulário "Novo estabelecimento" passa a perguntar a **mensalidade combinada**, e
o Console grava esse valor logo depois de criar o estabelecimento, pela RPC que já
existe (`definir_mensalidade_tenant`) — de modo que um cliente vendido nunca mais
entre na base valendo R$ 0,00 por esquecimento.

## 2. Fora de escopo

- Migration nova ou qualquer mudança de schema — a RPC `definir_mensalidade_tenant`
  (20260911) já existe e é a única porta de escrita de `valor_mensal`.
- Mudar a Edge Function `provisionar-estabelecimento`. A mensalidade é gravada pelo
  front, em seguida, com o `tenant_id` que a borda já devolve.
- Marcar na **lista** quem está sem mensalidade (fica para a rodada 39) — nesta
  rodada trata-se só do momento do cadastro.
- Desconto, ciclo diferente de 30 dias, primeiro mês grátis, proporcional.
- Cobrança automática, boleto, gateway — qualquer coisa paga.
- Mexer no `DefinirMensalidadeModal`, que continua sendo o caminho para mudar o
  preço de quem já existe.

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Decisão 024 / ADR-006 §4: o estabelecimento entra no ciclo de cobrança no ato do
  cadastro. A migration 20260908 escreveu, na própria mensagem, que "o preço é
  combinado depois, na tela do Console" — esta rodada elimina o "depois", que é
  exatamente onde a receita se perde.
- Decisão 027 / ADR-008: escrita em assinatura **só** por RPC `SECURITY DEFINER` com
  guarda de super-admin. Nenhuma policy de UPDATE é criada.
- Princípio nº 1: a próxima ação (dizer quanto o cliente vai pagar) fica no mesmo
  lugar em que a venda acontece, não em outra aba.

## 4. Arquivos afetados

- `src/components/console/NovoEstabelecimentoModal.jsx` — o campo, o eco em reais e
  a chamada de `definirMensalidade` depois do provisionamento.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes do campo.
- `src/pages/console/ConsolePage.jsx` — a mensalidade no cartão de primeiro acesso e
  o aviso do caso "criado, mas o preço não salvou".
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.
- `src/pages/console/ConsolePage.css` — o estilo do aviso, se precisar de classe nova.

Nenhum arquivo de `supabase/` é tocado.

## 5. Critérios de aceite

1. O formulário tem o campo **"Mensalidade combinada"**, logo abaixo do plano, que
   aceita o jeito brasileiro de digitar ("300,00") pela `valorDigitado` já existente.
2. O campo **ecoa em reais** o valor entendido antes de salvar ("Vai ficar R$ 300,00
   por mês"), como o `DefinirMensalidadeModal` faz — ninguém grava 30000 por causa da
   vírgula.
3. Valor inválido (texto, negativo, acima de `MENSALIDADE_MAXIMA`) mostra a frase em
   português e **trava o botão "Criar estabelecimento"** — prevenção antes do erro.
4. Campo **vazio é aceito** de propósito (cortesia, piloto): cria sem mensalidade e a
   dica na tela diz que o preço pode ser definido depois em "Planos e assinaturas".
5. Com valor preenchido, depois do provisionamento dar certo o front chama
   `definirMensalidade(tenant_id, valor)` — nenhuma escrita direta em `assinaturas`,
   nenhuma tabela nova consultada.
6. Se o provisionamento deu certo e **só a mensalidade falhou**, a tela não diz que a
   criação falhou: o cartão de primeiro acesso aparece normalmente, com um aviso
   claro de que o preço não foi salvo e onde defini-lo. O estabelecimento **não** é
   apagado por causa disso.
7. Enquanto a criação e a gravação do preço acontecem, o botão continua em
   "Criando…" e travado — sem clique duplo, sem cartão aparecendo no meio.
8. O cartão de primeiro acesso mostra a mensalidade quando ela foi definida, e a
   **mensagem copiada continua sem qualquer valor financeiro** — ela é para o cliente
   entrar no sistema, não é fatura.
9. Sem `console.log`, sem `TODO`, sem valor de dinheiro em `float` inventado no
   front (o valor vai como número em reais para a RPC, igual ao modal que já existe),
   sem estilo inline, sem cor fora dos tokens.
10. Rodadas 1 a 11 do Console seguem verdes, incluindo os 7 testes do cartão de
    primeiro acesso.

## 6. Edge cases conhecidos

- Provisionamento falha: nada de mensalidade, o erro do formulário é o de hoje.
- Mensalidade falha depois do sucesso: critério 6.
- Valor exatamente `0` digitado: é o mesmo que vazio — cria sem preço, sem chamar a
  RPC à toa.
- Valor no teto (`100000`) passa; um centavo acima é recusado antes de sair da tela.
- Vírgula e ponto misturados ("1.200,50") seguem o que a `valorDigitado` já decide;
  a rodada não muda essa função.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem
`console.log` esquecido, sem migration nova e sem regressão nas rodadas 1 a 11 do
Console.

## 8. Resultado da review — 2026-08-03

**Aprovado sem ressalvas — 10 de 10.** Suíte `npx vitest run`: 199 arquivos / 3301 testes, verde
(era 198 / 3289 — mais 9 testes do modal e 3 da tela).

| # | Critério | Evidência |
|---|---|---|
| 1 | Campo abaixo do plano, parser brasileiro | `NovoEstabelecimentoModal.jsx:184-211`, `valorDigitado` |
| 2 | Eco em reais antes de salvar | `NovoEstabelecimentoModal.jsx:203-204`; teste "ecoa em reais o valor entendido" |
| 3 | Valor inválido trava o botão | `NovoEstabelecimentoModal.jsx:58-65,281`; testes de inválido e de teto |
| 4 | Vazio aceito, com a dica de onde definir depois | `NovoEstabelecimentoModal.jsx:205-210`; teste "vazio é caminho legítimo" |
| 5 | Grava por `definirMensalidade`, sem escrita direta | `NovoEstabelecimentoModal.jsx:102-106`; teste da ordem das chamadas |
| 6 | Falha só do preço não desmente a criação | `ConsolePage.jsx:577-586` (aviso) + `NovoEstabelecimentoModal.jsx:116-117`; testes dos dois lados |
| 7 | Botão travado nas duas escritas | `setEnviando(false)` só depois da segunda (`NovoEstabelecimentoModal.jsx:107`) |
| 8 | Cartão mostra o preço, mensagem copiada sem valor | `ConsolePage.jsx:588-597`; teste "mostra o preço gravado, mas não o manda para o cliente" |
| 9 | Sem log, TODO, float inventado, estilo inline ou cor fora do token | `grep` limpo; `.console__acesso-alerta` usa `var(--gm-warn)` |
| 10 | Rodadas 1 a 11 do Console verdes | `ConsolePage.test.jsx` 99 testes passando |

### Desvio do spec

Nenhum. Nenhum arquivo de `supabase/` foi tocado.

### Ficou para depois

- Marcar na **lista** quem está sem mensalidade definida (rodada 39).
- Cortesia com `valor_mensal = 0` segue sem conseguir renovar — pendência de decisão do dono,
  anterior a esta rodada.