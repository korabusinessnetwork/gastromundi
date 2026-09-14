# F022 fatia, a aba "Saúde da operação" no Console da plataforma

Rodada 69 do ciclo. Data: 2026-09-11.

## O problema

O Console hoje responde duas perguntas sobre a base: **quem paga** (aba "Planos e
assinaturas") e **quem usa** (aba "Uso e faturamento", F022-ANALYTICS). Falta a terceira, e
é a que dá suporte: **para quem o sistema está quebrado agora.**

Duas falhas do sistema são silenciosas do lado da plataforma e barulhentas do lado do
cliente:

1. **Nota fiscal que não sobe.** `nfce_emitidas` guarda status `rejeitada` (a SEFAZ recusou)
   e `pendente` (fila de contingência, emitida offline e ainda não transmitida). Nota
   pendente há dias é obrigação fiscal não cumprida, e quem descobre é o contador do
   cliente, não a plataforma.
2. **Impressão que não sai.** `trabalhos_impressao` guarda `erro` e `pendente`. Comanda que
   não imprime é pedido que não chega na cozinha. Do lado da plataforma isso hoje é
   invisível: a Ponte local falha na casa do cliente e ninguém aqui fica sabendo.

Nenhuma das duas aparece em tela nenhuma do Console, e nenhuma delas dá para consultar sem
abrir o SQL Editor do Supabase.

## A restrição que decide a forma

`nfce_emitidas` e `trabalhos_impressao` são tabelas **operacionais**. A ADR-008, decisão
fechada v2 nº 2, proíbe o ramo `OR is_super_admin()` nas policies operacionais: o
super-admin não lê o dado bruto de todos os tenants, lê agregado por RPC `SECURITY
DEFINER` com guarda de papel dentro do banco. É o mesmo desenho da `20260912`.

E vale o mesmo limite extra: **a função devolve contagem e a data do mais antigo, nunca a
linha do documento.** Chave da nota, número, `venda_id`, o `documento` jsonb do trabalho de
impressão, nada disso atravessa. A plataforma precisa saber que o cliente tem 12 notas
paradas desde terça, não quais notas nem de quem.

## Escopo

| Peça | Arquivo |
|---|---|
| RPC agregada | `supabase/migrations/20260928_saude_plataforma.sql` (nova) |
| Guard da decisão | `src/lib/saudeSqlGuard.test.js` (novo) |
| Leitura e função pura | `src/lib/console.js` (`listarSaude`, `resumirSaude`, `"saude"` em `ABAS_CONSOLE`) |
| Tela | `src/components/console/SaudeDashboard.jsx` + `.css` + `.test.jsx` (novos) |
| Ligação | `src/pages/console/ConsolePage.jsx` (botão da aba e ramo do corpo) |

**Fora de escopo, de propósito:** `login_tentativas` não tem `tenant_id` (a chave é o
identificador de login), então não dá para atribuir bloqueio a estabelecimento sem mudar a
tabela, e isso é decisão de schema, não fatia de tela. Estoque abaixo do mínimo também fica
fora: é operação do cliente, ele já vê no PDV, e a plataforma não tem o que fazer com isso.

## Critérios de aceite

1. A RPC `saude_plataforma(p_dias integer DEFAULT 30)` existe, é `SECURITY DEFINER`,
   `STABLE`, com `SET search_path = public`, e a primeira linha do corpo é a guarda
   `is_super_admin() IS NOT TRUE` (NULL barra igual a false).
2. O `RETURNS TABLE` só tem colunas de agregado. Nenhuma identifica um documento: `chave`,
   `numero`, `venda_id`, `documento`, `protocolo` e `x_motivo` não aparecem em lugar nenhum
   do corpo da função.
3. `p_dias` é lista fechada no banco (7, 30, 90), a mesma que a tela oferece, validada com
   `check_violation`.
4. A migração não cria, altera nem remove policy nenhuma, e não tem `ALTER TABLE`.
5. `REVOKE` de PUBLIC/anon vem **antes** do `GRANT` a authenticated.
6. A migração termina com bloco `DO $conf$` que confere ao vivo: a função existe, é
   `SECURITY DEFINER`, tem `search_path`, tem a guarda, nenhuma coluna proibida, `anon` não
   executa e `authenticated` executa.
7. O que é contagem **do período** e o que é estado **de agora** está separado e é
   explícito: rejeitadas e erros de impressão contam dentro do período; pendências contam o
   que está parado agora, sem corte, mais a data do mais antigo. Pendência antiga é
   justamente o que some se o corte for aplicado.
8. `listarSaude` nunca lança: falha volta `{ data: [], error }`, e a tela diz que não sabe
   em vez de mostrar zero.
9. `resumirSaude` é função pura, sem I/O, com teste próprio cobrindo: estabelecimento sem
   nenhuma pendência, só fiscal, só impressão, os dois, e tenant que a RPC não devolveu.
10. A tela abre pela lista de quem está quebrado, ordenada por gravidade, e só depois os
    números da base. Estado vazio é uma afirmação positiva ("nenhum estabelecimento com
    pendência"), não uma tabela vazia.
11. A leitura acontece dentro da aba, não na página: uma base sem a `20260928` aplicada
    continua com o resto do Console funcionando igual.
12. A aba nova entra em `ABAS_CONSOLE` e `normalizarAba` continua caindo na primeira aba
    para qualquer texto inválido.
13. Testes da tela cobrindo carregando, erro, vazio e com pendência.
14. Suíte inteira verde e `npm run build` limpo.
15. A migração entra em `PENDENCIAS-DO-MATHEUS.md` com o link do GitHub do arquivo: ela não
    é aplicada por esta sessão, e até ser aplicada a aba mostra o estado de erro.

## O que conta como aprovado sem ressalvas

Os 15 critérios em sim, com evidência lida dos arquivos reais, e a suíte verde medida, não
estimada.

---

## Veredito da review, 11/09/2026

**Aprovado sem ressalvas.** Os 15 critérios em sim, com evidência lida dos arquivos reais.

| # | Critério | Evidência |
|---|---|---|
| 1 | RPC com a guarda primeiro | `saude_plataforma`, `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, e o teste confere que o índice da guarda vem antes da validação de período e das duas leituras |
| 2 | só agregado | as sete colunas do `RETURNS TABLE` estão fixadas por igualdade no guard, e as seis palavras proibidas são cobradas no corpo inteiro da função |
| 3 | `p_dias` fechado no banco | `NOT IN (7, 30, 90)` com `check_violation`, e o guard compara a lista com `PERIODOS_ANALYTICS`, que é a mesma que a tela oferece |
| 4 | nenhuma policy tocada | o guard recusa `CREATE/ALTER/DROP POLICY`, `ALTER TABLE`, `USING (` e a forma exata `OR is_super_admin()` |
| 5 | `REVOKE` antes do `GRANT` | conferido por posição no texto, não por presença |
| 6 | conferência ao vivo | o bloco `DO $conf$` cobre existência, `prosecdef`, `proconfig`, guarda, colunas proibidas e as duas concessões, com 8 `RAISE EXCEPTION` |
| 7 | período x estado de agora | recusa e erro filtram por `v_corte`; pendência não, e o guard recusa explicitamente a forma `WHERE nf.created_at >= v_corte`, que faria a pendência antiga sumir |
| 8 | `listarSaude` não lança | erro do banco volta `{ data: [], error }`, com teste |
| 9 | `resumirSaude` pura, com teste | 10 testes em `console.test.js`: sem pendência, só fiscal, só impressão, os dois, tenant ausente da RPC, recusa já resolvida, tempo antes de quantidade, data sem pendência, contagem torta e não mutação dos argumentos |
| 10 | a tela abre pelo que exige ação | `compareDocumentPosition` prova que o alerta vem antes dos cartões; o estado vazio é a frase "nenhum estabelecimento com nota fiscal ou impressão parada", não uma tabela vazia |
| 11 | leitura dentro da aba | `SaudeDashboard` chama `listarSaude` no próprio `useEffect`; a `ConsolePage` não sabe da RPC |
| 12 | aba em `ABAS_CONSOLE` | o teste de `normalizarAba` passou a enumerar a constante em vez de listar três nomes à mão, e cobra que `"saude"` esteja lá |
| 13 | testes da tela | 10 testes em `SaudeDashboard.test.jsx`: carregando, erro, tentar de novo, ordem e conteúdo do alerta, frase só com o que tem pendência, base limpa, tenant ausente, base vazia, troca de período e a nota sobre o período |
| 14 | suíte e build | 237 arquivos / 4181 testes verdes, build só com o aviso pré-existente de chunk acima de 2000 kB |
| 15 | pendência registrada | P05 em `.full-auto/PENDENCIAS-DO-MATHEUS.md`, com o link do GitHub do arquivo |

### Duas decisões que a fatia precisou tomar sozinha

1. **O que "analytics operacional" queria dizer.** A memória `fila-proximas-features` listava
   "analytics operacional (faturamento/pedidos/ticket por tenant)" como fatia futura, mas isso já
   tinha sido entregue em 2026-08-01 como a aba "Uso e faturamento". A memória está vencida nesse
   ponto. O que de fato resta da fila do dono é a outra fatia listada lá, "saúde do sistema (erros,
   pendências)", e é ela que esta rodada entregou. Construir de novo a aba de faturamento seria
   cumprir a letra e desperdiçar a rodada.
2. **O que ficou de fora, e por quê.** `login_tentativas` não tem `tenant_id`, a chave primária é o
   identificador de login em md5, então não dá para atribuir bloqueio a estabelecimento sem mudar a
   tabela, e mudar schema para caber numa tela é decisão de modelagem, não fatia de tela. Estoque
   abaixo do mínimo ficou fora por outro motivo: é operação do cliente, ele já vê no PDV, e a
   plataforma não tem o que fazer com a informação.

### O que fica em aberto

- **A migration não foi aplicada** por esta sessão, e até ser aplicada a aba mostra o estado de
  erro. Está em P05. A escolha de a aba errar em vez de dizer "tudo certo" é o ponto do desenho,
  não um efeito colateral.
- **A tela não diz qual nota falhou**, e isso não é limitação a resolver depois: é a decisão v2 nº 2
  do ADR-008. Quando o suporte precisar do documento em si, o caminho é acesso escopado a um
  tenant, que é o outro braço da mesma ADR.
- **Trabalho de impressão com status `processando`** não entra em nenhuma das duas contagens. Ele
  não é erro nem pendência parada, é trabalho em curso, e uma fila saudável tem alguns. Se aparecer
  caso real de trabalho travado em `processando`, vira fatia própria, com um critério de tempo.
