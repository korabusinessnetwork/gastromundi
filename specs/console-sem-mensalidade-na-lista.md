# CONSOLE-UX 13 — quem está sem mensalidade aparece na lista (rodada 39)

## 1. Escopo

Na aba Estabelecimentos, o card de quem cobra mas está **sem mensalidade definida**
passa a dizer isso na cara, e ganha o botão **"Definir mensalidade"** que abre ali
mesmo o `DefinirMensalidadeModal` que já existe — sem trocar de aba.

## 2. Fora de escopo

- Migration nova ou mudança de schema. A escrita continua sendo a RPC
  `definir_mensalidade_tenant` (20260911), chamada pelo modal que já existe.
- Mexer no `DefinirMensalidadeModal` ou na aba "Planos e assinaturas", que continua
  sendo o lugar do preço de quem já existe.
- Mexer no formulário de criação (rodada 38 já pergunta o preço no cadastro).
- Filtro ou atalho novo por "sem preço" na lista — aqui é só a marca no card e a ação.
- Cobrança automática, desconto, ciclo diferente — qualquer coisa paga.

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da plataforma), 🔴 Critical, bloqueia venda.
- Decisão 027 / ADR-008: escrita em assinatura só por RPC `SECURITY DEFINER` com
  guarda de super-admin. Nenhuma policy de UPDATE é criada.
- Continua a rodada 38: o cadastro novo já nasce com preço, mas quem entrou antes
  (e quem for criado em branco de propósito) segue invisível na aba principal — só
  aparece no aviso do topo da outra aba.
- Princípio nº 1: a marca fica onde o dono olha, e a ação corretiva fica ao lado da
  marca, não em outra tela.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.jsx` — a marca no card, o botão e o modal.
- `src/pages/console/ConsolePage.css` — o estilo da marca e do botão, com tokens.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

Nenhum arquivo de `supabase/` é tocado. Nenhuma consulta nova: `valorMensal` já vem
de `resumirPlataforma`.

## 5. Critérios de aceite

1. O card de um estabelecimento **ativo ou em carência** com `valorMensal <= 0`
   mostra a marca **"Sem mensalidade"** junto da situação.
2. A régua da marca é a mesma do `kpis.semPreco` de `resumirPlataforma` — a lista e o
   aviso da aba de cobrança nunca discordam sobre quem está sem preço.
3. Quem tem mensalidade definida **não** ganha marca nenhuma; quem está bloqueado,
   cancelado ou sem assinatura também não (não é dinheiro esquecido, é outro problema,
   que os selos já contam).
4. O card desses estabelecimentos ganha o botão **"Definir mensalidade"**, com
   `aria-label` que nomeia o estabelecimento, e ele abre o `DefinirMensalidadeModal`
   com a linha certa.
5. Definido o preço, o modal fecha, a lista recarrega e a tela confirma numa faixa de
   uma linha dizendo o nome e o valor definido.
6. Com a leitura das assinaturas quebrada (`erroAssinaturas`), nem a marca nem o botão
   aparecem — a tela não afirma "sem mensalidade" quando não sabe.
7. Nenhuma consulta nova ao banco na `ConsolePage`; a escrita segue só pela RPC, dentro
   do modal existente.
8. Sem `console.log`, sem `TODO`, sem estilo inline, sem cor fora dos tokens.
9. Rodadas 1 a 12 do Console seguem verdes.

## 6. Edge cases conhecidos

- `valorMensal` nulo ou ausente: `resumirPlataforma` já normaliza para 0 — conta como
  sem preço.
- Estabelecimento sem linha de assinatura: sem marca e sem botão (a RPC recusaria);
  o selo "Sem assinatura" já cobre esse caso.
- Cancelado com preço zerado: sem marca — não está sendo cobrado.
- Definir o preço e a lista recarregar: a marca some sozinha, sem clique extra.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem
`console.log` esquecido, sem migration nova e sem regressão nas rodadas 1 a 12 do
Console.

---

## 8. Resultado da review (rodada 39)

Aprovado sem ressalvas — 9 de 9 critérios em sim. Suíte `npx vitest run`: 199 arquivos /
3306 testes, verde (5 testes novos em `ConsolePage.test.jsx`).

Corrigido durante a review: "Registrar pagamento" e "Definir mensalidade" usavam o mesmo
ícone (`LuBanknote`) e podem aparecer no mesmo card — o segundo passou a `LuTag`.

Ficou para uma próxima rodada: nada. A pendência de cortesia (`valor_mensal = 0` não
renova, a RPC recusa `p_valor <= 0`) segue aguardando decisão do dono e é anterior a esta
rodada.
