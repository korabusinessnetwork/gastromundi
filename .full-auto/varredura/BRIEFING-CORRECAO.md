# Briefing de correção, GastroMundi

**Para quem vai corrigir.** Este arquivo é autossuficiente: cole ele inteiro no seu Claude
Code, dentro do repositório, e ele tem tudo que precisa. Foi escrito por uma varredura de QA
que rodou em 12/09/2026 e que **não corrigiu nada de propósito**, só mediu e documentou.

- Repositório: `korabusinessnetwork/gastromundi`
- Branch com a varredura: `claude/dreamy-wright-b35oyo` (commit `832e892`)
- Base: `main` em `54f76cbe`
- Estado: `npm test` verde com 238 arquivos e 4191 testes. Nenhum arquivo de produção foi
  alterado pela varredura.
- Relatório completo: `.full-auto/varredura/RELATORIO-VARREDURA.md`
- Achados com evidência: `.full-auto/varredura/BUGS.md`

São 4 bugs, na ordem em que devem ser atacados: um S1, um S2 e dois S3.

---

## Regras do projeto que você precisa seguir

Estão em `CLAUDE.md` na raiz, leia antes de mexer. As que mais pegam aqui:

1. **Travessão é proibido** em qualquer texto em português que apareça na tela ou que você
   escreva para o dono, incluindo mensagem de commit e descrição de PR. Use vírgula. Existe
   um teste (`src/lib/travessaoGuard.test.js`) que quebra a suíte se você esquecer.
2. **Rode `npm test` antes de commitar.** A suíte tem 4191 testes e leva cerca de 90
   segundos.
3. **Um bug por commit.** O projeto trabalha com a skill `/ciclo`; se ela existir na
   máquina, use. Se não existir, siga a mesma ordem: o teste que reproduz falha primeiro, a
   correção faz passar, a bateria completa continua verde.
4. **Se a correção quebrar qualquer outro teste, `git revert` na hora** e registre a
   tentativa, em vez de ir empilhando ajuste.
5. **Migration não é aplicada por você.** O banco é Supabase gerenciado. Migration nova
   nasce em `supabase/migrations/` e quem aplica no painel é o dono. Escreva o arquivo,
   atualize `supabase/schema.sql` junto (há um guard que cobra isso) e avise que ficou
   pendente de aplicação.
6. **Nada de credencial, URL de API ou segredo no código.** Sempre `import.meta.env.VITE_*`.

---

## Como reproduzir, se quiser ver com os próprios olhos

A varredura deixou um ambiente de QA inteiro no repositório. Ele monta um Postgres local
com o schema real do projeto e roda o app num navegador de verdade, sem tocar em produção.

```bash
tests/e2e/rodar.sh
```

Isso sobe o banco, aplica `supabase/schema.sql` mais as 121 migrations, roda o seed de QA,
levanta uma ponte que fala o protocolo do Supabase, builda o app e executa as suítes.
Precisa de PostgreSQL 16 instalado (só o binário, o cluster é criado pelo script), Node 22 e
um Chromium para o Playwright. Detalhes e limites em `.full-auto/varredura/AMBIENTE.md`.

Hoje o comando termina em "bateria verde (fora os pendentes de bug conhecido)". Os
"pendentes" são exatamente os testes que provam os bugs abaixo.

**Se não conseguir subir o ambiente:** dá para corrigir B02 e B03 sem ele, porque são SQL e
o raciocínio está todo aqui. B01 e B04 pedem o app rodando.

---

## B01 (S1), fechar a conta direto do carrinho abre o pagamento com R$ 0,00

### O que o usuário vê

1. PDV com o caixa aberto.
2. Clicar num número livre da grade de comandas, por exemplo o 15, informar a mesa e entrar
   na comanda. Repare: essa comanda ainda **não existe no banco**, é a "comanda virtual".
3. Clicar duas vezes num produto. O painel da direita mostra "ADICIONANDO (2)" e "Total da
   comanda R$ 15,00".
4. Clicar em "Finalizar Comanda · R$ 15.00". O diálogo de confirmação conta certo: "2 itens
   consumidos, TOTAL R$ 15,00". Confirmar em "Sim, finalizar".

**Esperado:** a tela de pagamento abre com 2 itens e Total R$ 15,00, como acontece quando o
operador clica em "Lançar Pedido" antes.

**Obtido:** a tela abre com "Comanda 15 · 0 itens", Total R$ 0,00 e a frase "Todos os itens
foram removidos. Volte para a comanda para lançar novos itens.". O botão de confirmar
pagamento fica travado.

**E a comanda no banco está correta**, com o item de 2 unidades e total 15. Nada foi
perdido, só sumiu da tela.

### Por que é S1

A mensagem é falsa e induz ao erro caro. O operador lê "os itens foram removidos" no meio do
serviço e o movimento natural é lançar tudo de novo. Se ele fizer isso, a comanda passa a ter
4 unidades e o cliente paga o dobro.

### Frequência: é intermitente, e isso importa

12 falhas em 15 execuções. Numa medição controlada de 10 execuções seguidas, 9 deram R$ 0,00.
Pela suíte automatizada, que faz um percurso um pouco mais lento, 3 de 5 falharam.

**Consequência prática para você:** uma execução limpa não prova que corrigiu. Rode o caso
pelo menos 5 vezes seguidas antes de dar como resolvido.

Pelo caminho "Lançar Pedido" primeiro, nunca falhou em nenhuma das execuções.

### Onde olhar

- `src/components/desktop/views/PDVView/index.jsx:431`, `handleFinalizar`. É o caminho que
  falha. Ele trata a comanda virtual com `persistirVirtual` (definido em `:548`), depois
  acumula `cartItems` em `ordem.items`, chama `updatePending` com `{ baseItems: anteriores }`
  e faz `setSelected(prev => ({ ...prev, items: acumulados, total: novoTotal }))` seguido de
  `setCartItems([])`.
- `src/components/desktop/views/PDVView/index.jsx:392`, `handleLancar`. É o caminho que
  funciona. Note a diferença visível: ele carimba `launched_at` em cada item novo
  (`cartItems.map(({ _key, ...rest }) => ({ ...rest, launched_at: agora }))`) e o
  `handleFinalizar` não carimba.
- `src/components/desktop/views/PDVView/index.jsx:1240`, onde o `CheckoutView` é montado. Ele
  recebe `items={[...(selected?.items ?? []), ...cartItems]}`.
- `src/components/desktop/views/PDVView/CheckoutView.jsx:112`, o filtro que o checkout aplica.
  Ele só tira `cancelado`, **não filtra por `launched_at`**. Então a ausência do carimbo
  provavelmente não é a causa direta, é só o sintoma visível da diferença entre os dois
  caminhos.
- `src/context/AppContext.jsx:1163`, `updatePending`, e `src/lib/comandaItens.js:36`,
  `mesclarItensComanda({ base, propostos, banco })`. A mesclagem com o que veio do banco é a
  primeira suspeita real.

### Hipótese, não diagnóstico fechado

Como o banco fica certo e a tela fica vazia, o problema está no estado do React, não na
gravação. A intermitência aponta para corrida entre o `persistirVirtual` (que troca o objeto
da comanda), o `updatePending` (que mescla com o que voltou do banco) e o `setSelected`.
Confirme antes de mexer: instrumente `selected.items` logo antes do `setMode("checkout")` e
veja se ele chega vazio.

### O teste que já existe

`tests/e2e/navegador/pdv.mjs`, caso **OP04**. Ele afirma o comportamento certo e hoje
aparece como PENDENTE quando o bug reproduz e como CORRIGIDO quando não reproduz. Depois da
correção, ele precisa aparecer CORRIGIDO em cinco execuções seguidas.

**Vale também escrever um teste de componente** em `src/components/desktop/views/PDVView/`,
no padrão dos que já existem ali, cobrindo "carrinho com itens, clicar em Finalizar, o
checkout recebe os itens". Esse roda no `npm test` e protege o caso sem depender do ambiente
de QA inteiro.

---

## B02 (S2), venda cancelada continua contando como faturamento

### O que acontece

As funções agregadoras do banco somam vendas com `cancelada = true`, enquanto o front tira a
venda cancelada de todos os relatórios. Resultado: a aba Vendas e a aba Desempenho mostram
faturamentos diferentes para o mesmo período, e o Console da plataforma vê o número inflado.

Medido: com duas vendas válidas de R$ 100 e R$ 50 e uma cancelada de R$ 70 no mesmo período,
`relatorio_vendas` devolveu faturamento **220,00 e 4 vendas**. O certo é **150,00 e 2
vendas**. Três execuções, sempre o mesmo número.

### As três ocorrências, mesma causa e mesma correção

| Função | Onde está | Quem usa |
|---|---|---|
| `relatorio_vendas` | `supabase/migrations/20260746_relatorio_vendas_timezone.sql` (definição mais recente; a original é `20260714_relatorio_vendas.sql`) | aba Desempenho do Relatório |
| `jarvas_resumo_vendas` | `supabase/migrations/20260709_jarvas_resumo_vendas.sql` | insights e alertas do Jarvas |
| `analytics_plataforma` | `supabase/migrations/20260912_analytics_plataforma.sql` | Console da plataforma, aba Uso |

Nenhuma das três menciona `cancelada` no corpo. Confira você mesmo com:

```sql
SELECT p.proname,
       CASE WHEN pg_get_functiondef(p.oid) ILIKE '%cancelada%'
            THEN 'filtra' ELSE 'NAO filtra' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ILIKE '%public.vendas%';
```

### Por que aconteceu

A coluna `vendas.cancelada` nasceu em
`supabase/migrations/20260920_vendas_cancelamento.sql:42`, depois das três funções, e
nenhuma delas foi atualizada junto.

### Qual é o comportamento certo

O próprio código do front já decide isso, em
`src/components/desktop/views/relatorio/RelatorioView.jsx:313`:

```js
// Leva 15.3 — vendas canceladas ficam fora de todos os relatórios
const sales = useMemo(() => (salesBrutas ?? []).filter(s => s && !s.cancelada), [salesBrutas]);
```

Então a regra existe, e o banco é que está fora dela.

### Como corrigir

Uma migration nova, aditiva, com `CREATE OR REPLACE FUNCTION` para as três, acrescentando
`AND v.cancelada = false` (ou `AND cancelada = false`, conforme o alias de cada consulta) em
**todo** lugar que lê `public.vendas`: faturamento, número de vendas, série por dia, total por
método e top de produtos. Repare que o `top_produtos` do `relatorio_vendas` já filtra
`vi.cancelado = false`, que é o cancelamento **de item**, coisa diferente do cancelamento da
venda. Os dois filtros precisam conviver.

Atualize `supabase/schema.sql` junto, porque `src/lib/schemaSqlGuard.test.js` cobra.

**Atenção ao custo:** esta correção só vale em produção depois que o dono aplicar a migration
no painel do Supabase. Deixe isso escrito na entrega, não deploye frontend novo contando com
banco novo.

### O teste que já existe

`tests/e2e/banco/30-pendentes-bugs-conhecidos.sql`. Ele monta o cenário das três vendas e
hoje falha com a mensagem exata do desvio. Quando passar, mova o arquivo para
`tests/e2e/banco/21-relatorio.sql`, para ele entrar na bateria normal em vez de ficar na
pasta de pendentes.

---

## B03 (S3), o resumo do Jarvas agrupa vendas por dia em UTC

`jarvas_resumo_vendas` não recebe fuso e agrupa `por_dia` no relógio do servidor. Uma venda
de 10/09 às 23h30 no horário de São Paulo aparece como 11/09.

É bug separado do B02, com causa própria, mas mora no mesmo arquivo, então convém corrigir na
mesma migration. O caminho já existe no projeto: a `relatorio_vendas` resolveu isso ganhando
`p_tz` em `supabase/migrations/20260746_relatorio_vendas_timezone.sql`, usando
`to_char(at AT TIME ZONE p_tz, 'YYYY-MM-DD')`. Faça igual.

**Impacto de deixar como está:** todo insight do Jarvas que fala de "hoje", "ontem" ou "dias
sem vender" usa um calendário deslocado em até 3 horas. Em casa noturna, que é quando o
restaurante mais vende, a distorção é diária.

O caso B03 está no mesmo arquivo de teste pendente.

---

## B04 (S3), nome de produto muito longo estoura o card no PDV

Produto com nome de cerca de 340 caracteres transborda o card na grade do PDV, cobre parte
dos cards vizinhos e empurra o preço para fora do lugar.

Evidência: `.full-auto/varredura/suites/operacao/evidencias/OP06-carrinho.png` e
`OP11-comanda-lancada.png`.

Onde: `src/components/desktop/views/PDVView/ProductGrid.css:118`, a classe
`.produto-card__nome`, que hoje define peso, tamanho e altura de linha e nenhum tratamento de
transbordo. O componente é `ProductGrid.jsx:139`.

**Por que importa mais do que parece:** é um PDV de toque. Card deformado cobre o alvo do
card vizinho, e o operador toca no produto errado no meio do movimento. A decisão 018 do
projeto pede CSS separado do JSX, e aqui já está separado, então é ajuste de CSS puro
(truncar com reticências ou limitar a duas ou três linhas, mantendo a altura do card
estável).

Já existe `ProductGrid.test.jsx` para pendurar o caso.

---

## Ordem sugerida e definição de pronto

1. **B01**, é o único S1 e é o que pode fazer o cliente pagar em dobro. Lembre da
   intermitência: cinco execuções limpas seguidas.
2. **B02 com B03 juntos**, mesma migration, mesmo arquivo de teste pendente.
3. **B04**, ajuste de CSS com teste de componente.

Pronto quer dizer, para cada um: o teste que hoje falha passa, `npm test` continua com os
4191 verdes, `npm run build` limpo, e `tests/e2e/rodar.sh` verde. Para o B02, acrescente que a
migration ficou escrita e que a aplicação no Supabase é pendência do dono.

## Um aviso sobre falso positivo

A varredura derrubou dois achados que pareciam bugs e não eram. Vale o mesmo cuidado aí:

- O `verificar_senha_admin` responde a chamador anônimo sem lançar erro, o que parece um
  oráculo para força bruta. Não é: a função devolve `false` de cara quando `auth.uid()` é
  nulo.
- Existem 11 tabelas com `tenant_id` sem a policy RESTRICTIVE de isolamento que a convenção
  do `supabase/schema.sql:48` descreve. Testado em execução, **não há vazamento**, todas
  isolam por dentro das policies permissivas. É defesa em profundidade faltando, está como
  pendência P07 do dono, e **não é para você corrigir sem ele pedir**.
