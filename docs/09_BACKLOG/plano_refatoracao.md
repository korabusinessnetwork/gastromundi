# Plano de refatoração completa, do início ao fim

**Status:** aceito pelo dono em 2026-11-23 (ADR-015), fase 0 em andamento
**Data:** 2026-11-23
**Base:** levantamento de 2026-11-23 (commit `9ffff74`)

## 1. Objetivo e limites

Reorganizar o sistema inteiro por camadas e por domínio, **sem mudar o que o usuário vê
nem como o sistema se comporta**, exceto nos três pontos em que a mudança corrige um
defeito real (gravações que podem ficar pela metade, fase 1).

Fica de fora, de propósito:

- **Reescrever do zero.** Os testes existentes são a rede de proteção desta refatoração.
- **Trocar de stack.** O ADR-004 continua valendo: Supabase direto, sem API própria, sem
  Drizzle, sem Clerk.
- **Feature nova.** Nenhuma tarefa deste plano entrega funcionalidade.
- **Custo.** Tudo aqui é gratuito: ESLint, CLI do Supabase, Playwright, Vitest.

## 2. Regras que valem para todas as tarefas

1. **Cada tarefa é uma rodada do loop** (`/spec`, `/build`, `/review`), com spec própria
   em `specs/` e registro em `specs/_loop.md`, como as rodadas anteriores.
2. **Rodada pronta** quer dizer as três coisas juntas: review aprovada sem ressalvas,
   `npm test` verde e `npm run build` limpo. A partir da tarefa 0.2, também `npm run lint`
   sem erro.
3. **Nenhum teste existente é removido ou enfraquecido.** Asserção só muda quando o
   comportamento muda de propósito, e isso precisa estar escrito na spec. Mudança de
   caminho de import em teste é permitida.
4. **Comportamento visível não muda.** Toda rodada que mexe em tela compara screenshot
   antes e depois (o roteiro de telas é criado na tarefa 0.1).
5. **Merge:** PR aberto, `git merge --ff-only` e `git push origin main`, conforme o
   `CLAUDE.md`. Rodada com migration **não é mesclada calada**: o dono é avisado antes,
   porque o push na `main` publica o frontend na Vercel.
6. **Ordem:** a fase seguinte só começa com a anterior fechada. Única exceção: a fase 5
   (estilos) pode correr em paralelo a partir do fim da fase 1, desde que nunca toque um
   arquivo que outra rodada aberta esteja mexendo.
7. **Congelamento por arquivo:** enquanto uma rodada mexe num arquivo, nenhuma feature
   nova toca esse mesmo arquivo.
8. **Texto de tela:** nenhum travessão novo (`travessaoGuard.test.js` cobra).
9. **Métricas:** toda rodada termina rodando `node scripts/metricas-refatoracao.mjs`
   (criado na tarefa 0.1) e anota no `_loop.md` o número que mudou.

## 3. Decisões do dono antes de começar

| # | Decisão | Recomendação | Bloqueia |
|---|---|---|---|
| D1 | Adotar TanStack Query (grátis, MIT) para os dados vindos do banco | **Não neste plano.** Dividir o contexto primeiro; reavaliar depois da fase 2 | Fase 2 |
| D2 | Adotar TypeScript | **Só os tipos gerados do banco** (tarefa 0.3), usados via JSDoc. Conversão de arquivos fica fora do plano | Tarefa 0.3 |
| D3 | Apagar `teste-obsidian.txt`, `executavel/` e `pesquisas-diarias/` da raiz | Apagar `teste-obsidian.txt` e `pesquisas-diarias/`. **`executavel/` fica**: é a pasta criada de propósito para o `KoraPonte.exe` (commit `ba801ba`), a recomendação original estava errada | Tarefa 0.5 |
| D4 | Destino dos scripts de cliente em `supabase/` (`GO_LIVE_casacoffee.sql`, `SEED_*_casacoffee.sql`, `CUTOVER_*`) | Mover para `supabase/ops/` com um README dizendo que são históricos | Tarefa 0.5 |
| D5 | Token de acesso do Supabase (gratuito) para gerar os tipos | Necessário, guardado como segredo do ambiente, nunca no código | Tarefa 0.3 |
| D6 | Quando aplicar as migrations novas da fase 1 em produção | Aplicar cada uma antes do merge da rodada dela | Tarefas 1.1, 1.2, 1.3 |

## 4. Metas de saída (o que define "terminou")

Medidas por `npm run metricas` (tarefa 0.1) em 2026-11-23. A coluna "Hoje" substitui as estimativas do levantamento, que contavam só a forma mais comum de cada padrão. A auditoria final (fase F) só fecha com todas em "sim".

| Métrica | Hoje | Meta |
|---|---|---|
| Linhas do `AppContext.jsx` | 2.194 | arquivo removido, ou no máximo 150 linhas só compondo provedores |
| Arquivos de código (sem teste) acima de 600 linhas | 22 | 0 |
| Maior número de `useState` num único arquivo | 70 (`DeliveryView`) | no máximo 15 |
| Chamadas ao Supabase fora das pastas `dados/` | 226 (64 em 14 telas, 51 no contexto, 111 em `lib/`) | 0, cobrado por regra de lint |
| Gravações em várias etapas feitas pelo navegador | 3 conhecidas | 0 |
| `style={{}}` que não seja só variável CSS | 1.526 | 0, cobrado por teste guard |
| Cor hexadecimal escrita no JSX | 23 | 0 |
| Tela de celular importando código de `components/desktop/` | 1 | 0, cobrado por regra de lint |
| Erros de lint | 147 na primeira passada | 0 |
| Testes | 242 arquivos, 4.273 testes, 91 s | igual ou maior, nenhum removido sem justificativa na spec |
| Build | limpo, maior pacote JS com 2.387 kB (703 kB comprimido) | limpo, e o maior pacote não maior que a linha de base |
| Screenshots do roteiro de telas | linha de base da tarefa 0.1 | sem diferença visual não explicada |

---

## 5. Fases e tarefas

### Fase 0, linha de base e ferramentas (nada muda para o usuário)

**0.1 Linha de base medida e reproduzível**
- Criar `scripts/metricas-refatoracao.mjs`, que imprime todas as métricas da seção 4.
- Rodar `npm test` e `npm run build` e gravar em `docs/09_BACKLOG/refatoracao_metricas.md`:
  arquivos de teste, quantidade de testes, tempo da suíte e tamanho de cada pacote do build.
- Criar `scripts/screenshots-refatoracao.mjs` (Playwright) com o roteiro de telas, rodando
  contra um Supabase falso com dados de demonstração. No computador: login, console,
  cardápio público, as quatro abas do `/palm`, os dez módulos de `/app` e as onze abas de
  Configurações. No celular: login, console, cardápio, as abas do `/palm` e os nove módulos
  abertos pela aba Mais. As imagens não vão para o repositório: `--ref <commit>` fotografa
  qualquer commit, então a comparação com a linha de base é refeita quando precisar.
- Anotar o commit de partida no `_loop.md`, para a auditoria final comparar contra ele.
- **Pronto quando:** o script de métricas roda sem argumento e reproduz os números da
  tabela; as screenshots da linha de base existem para todas as telas do roteiro.

**0.2 Lint**
- Adicionar ESLint (configuração `eslint.config.js`) com `react-hooks` e regras de import.
  Script `npm run lint`.
- Regras que nascem como **aviso**, e viram **erro** na fase em que a meta é cumprida:
  `@/lib/supabase` proibido em tela e no contexto (erro no fim da fase 1) e em `lib/`
  (erro no fim da fase 6, quando `lib/` deixa de existir); `components/desktop` proibido
  dentro de `pages/mobile` (erro no fim da fase 4).
- Corrigir os erros que aparecerem sem mudar comportamento. O que for bug de verdade (por
  exemplo, dependência faltando em `useEffect` que muda comportamento) vira rodada própria,
  não correção silenciosa.
- **Pronto quando:** `npm run lint` termina com 0 erros e a contagem de avisos está anotada.

**0.3 Tipos gerados do banco** (depende de D2 e D5)
- `supabase gen types typescript` para `src/types/database.ts`, com script
  `npm run tipos:banco`.
- `jsconfig.json` apontando o alias `@/` para o editor reconhecer os tipos via JSDoc.
- **Pronto quando:** o arquivo é gerado a partir do schema de produção e uma função de
  dados de exemplo mostra o tipo da linha no editor.

**0.4 Documentação de partida**
- Corrigir o `CLAUDE.md`: o Tailwind não está instalado; o padrão real é CSS co-localizado.
- Escrever o ADR-015, "Organização por domínio", com a estrutura-alvo da seção 6.
- **Pronto quando:** ADR aceito pelo dono e `CLAUDE.md` sem informação falsa.

**0.5 Limpeza da raiz** (depende de D3 e D4)
- Executar o que o dono decidiu para os arquivos soltos e os scripts de cliente.
- **Pronto quando:** a raiz e `supabase/` não têm arquivo sem dono nem nome de cliente
  fora de `supabase/ops/`.

**0.6 Migrations com prefixo repetido**
- Listar todas as colisões de prefixo (hoje: 20260703, 20260724, 20260725, 20260726,
  20260728, 20260731, 20260919, 20260920, 20260925) e a data inexistente `20260732`.
- **Não renomear** arquivo já aplicado em produção. Criar teste guard que recusa
  migration **nova** com prefixo repetido ou data inválida.
- **Pronto quando:** o guard existe e falha ao receber um arquivo de exemplo inválido.

### Fase 1, acesso a dados e gravações atômicas (corrige risco real)

**1.1 Salvar combo numa transação só**
- Hoje `CombosView.jsx` (linhas 213 a 247) atualiza o combo, apaga os subprodutos, apaga
  os produtos e insere de novo, em chamadas separadas. Se a rede cair no meio, o combo fica
  sem itens.
- Criar a RPC `salvar_combo` (migration), `SECURITY DEFINER` com `search_path` fixo e
  checagem de tenant, como as RPCs atuais. A tela passa a chamar só ela.
- Teste guard da migration e teste de componente cobrindo a recusa da RPC com a frase e o
  código verbatim (aprendizado de 2026-08-01).
- **Pronto quando:** nenhuma escrita de combo sai do navegador fora da RPC; aviso de RLS
  e de migration dado ao dono (D6).

**1.2 Importar nota fiscal numa transação só**
- Hoje `NotasFiscaisTab.jsx` (linhas 468 a 500) grava a nota, depois os itens, depois as
  entradas de estoque. Se falhar depois da nota, ela fica gravada sem itens e a reimportação
  é recusada como "nota já importada".
- RPC `importar_nota_fiscal` cobrindo nota, itens, entradas e atualização de saldo.
- **Pronto quando:** a importação é tudo ou nada, com teste para a falha no meio.

**1.3 Excluir unidade de medida numa transação só**
- Hoje `ConfiguracoesView.jsx` (linhas 1118 em diante) desvincula a unidade dos produtos em
  várias etapas antes de excluir. O mesmo fluxo existe em `SecaoUnidades.jsx` no celular.
- RPC `excluir_unidade_medida`; as duas telas chamam a mesma função.
- **Pronto quando:** as duas telas usam a RPC e a falha no meio não deixa produto
  desvinculado com a unidade ainda existente.

**1.4 Camada de dados para as telas**
- Criar `src/features/<dominio>/dados/` e mover para lá toda chamada ao Supabase que hoje
  está em tela: `ProdutosView`, `SubprodutosView`, `AdminView`, `ImpostosAdmin`,
  `ConfiguracoesView`, `NotasFiscaisTab`, `CombosView`, `SecaoMesas`, `SecaoUnidades`.
- Os repositórios que já existem em `src/lib/` (`vendasRepo`, `fiscalConfigRepo`,
  `nfceEmitidasRepo`) seguem onde estão até a fase 6; não duplicar.
- Toda função de dados devolve `{ data, error }` ou lança erro com mensagem humana, nunca
  as duas coisas, e nunca usa `select *` em tabela sensível.
- **Pronto quando:** `grep` de `supabase.from` e `supabase.rpc` em `src/components` e
  `src/pages` devolve zero.

**1.5 Camada de dados para o contexto** (juntada à fase 2 em 2026-11-23, decisão do dono)
- Eram cerca de 60 chamadas no `AppContext.jsx`, contando login, sessão e tempo real, e a
  fase 2 divide esse mesmo arquivo logo em seguida. Fazer as duas coisas em separado
  mexeria duas vezes no trecho mais arriscado do sistema. Então cada provedor da fase 2
  já nasce com as chamadas dele na camada `dados/`.
- **Pronto quando:** junto com a tarefa 2.8, o contexto não importa `@/lib/supabase`, e a
  regra de lint vale também para `src/context/`.

**1.6 Salvar subproduto numa transação só** (achada na tarefa 1.4)
- Hoje `SubprodutosView.jsx` grava o subproduto e, numa segunda chamada, o saldo dele em
  `estoque_subprodutos`. Se a segunda falhar na criação, o subproduto já existe e o
  "tentar de novo" cria um duplicado.
- RPC `salvar_subproduto`, `SECURITY INVOKER`, no mesmo molde das tarefas 1.1 a 1.3.
- **Pronto quando:** criar e editar subproduto é tudo ou nada, com cenários SQL locais.

### Fase 2, dividir o `AppContext`

**2.1 Prova de re-render**
- Teste que conta renders: hoje, mudar `movimentosCaixa` redesenha a `CozinhaView`, que
  não usa esse dado. O teste nasce documentando o comportamento atual e é invertido na
  tarefa 2.8.
- **Pronto quando:** o teste existe e mede o problema.

**Como a divisão é feita** (decidido na tarefa 2.2, 2026-11-23). A carga inicial, o login
e a fila offline atravessam todos os assuntos ao mesmo tempo: o `bootstrap` lê tudo numa
leva só, e a fila offline reenvia venda, comanda e estoque na mesma drenagem. Separar a
POSSE desse estado em seis provedores de uma vez é o jeito mais fácil de quebrar o modo
offline. Então cada rodada da 2.2 à 2.7 faz, nesta ordem:
1. as chamadas ao Supabase daquele assunto saem para `features/*/dados/` (tarefa 1.5);
2. o `AppProvider` passa a fornecer também o contexto daquele assunto, com valor
   memorizado e ações de identidade fixa (`useFuncaoEstavel`);
3. nasce o gancho do assunto (`useSessao`, `useCaixa`...), com teste de que a tela que o
   usa não é redesenhada por mudança de outro assunto.

O estado continua morando no `AppProvider` até a 2.7. Depois da 2.8 (telas trocando
`useApp` pelos ganchos), a tarefa 2.9 move o estado e as ações de cada assunto para o
arquivo do próprio provedor, já protegida pelos limites e pelos testes de cada fatia.

**2.2 a 2.7 Uma fatia por rodada, nesta ordem**

| Tarefa | Provedor | Conteúdo (hoje no `AppContext`) |
|---|---|---|
| 2.2 | `SessaoProvider` | login, logout, sessão, inatividade, `currentUser`, `users`, tenant, tema, assinatura, permissões por cargo, módulos e add-ons |
| 2.3 | `OfflineProvider` | rede, fila offline, drenagem, pendências fiscais, `abriuSemInternet` |
| 2.4 | `ConfigProvider` | meios de pagamento, métodos personalizados, TEF, taxa de serviço, ponte local, dias de validade, limite de sangria |
| 2.5 | `CatalogoProvider` | produtos, estoque, mínimos, baixa de subproduto, grupos de categoria, realtime de estoque |
| 2.6 | `ComandasProvider` | comandas pendentes, travas, lançadas, realtime de comandas |
| 2.7 | `CaixaProvider` | vendas, fechamentos, fundo, caixa aberto, movimentos, `addSale`, cancelamento, realtime de vendas |

- Em cada rodada: as chamadas ao Supabase daquele trecho saem para `features/*/dados/`
  (tarefa 1.5), valor do provedor memorizado com `useMemo`, funções com `useCallback`,
  e `useApp()` continua funcionando como fachada que junta os provedores, para nenhuma tela
  quebrar no meio do caminho.
- Os 10 arquivos `AppContext.*.test.jsx` acompanham o código para o provedor certo.
- **Pronto quando (cada uma):** o contexto da fatia existe com valor memorizado, as
  chamadas ao Supabase daquele assunto saíram do `AppContext.jsx`, e um teste prova que a
  tela que usa o gancho não é redesenhada por mudança de outro assunto.

**2.8 Telas nos ganchos de cada assunto** (feita em 2026-11-23)
- As telas trocaram `useApp()` pelos ganchos (`useSessao`, `useCaixa` e os demais), por um
  codemod que lê os campos de cada desestruturação e para com erro em campo sem fatia.
- O teste da 2.1 deixou de ser `it.fails`: a tabela de fatias cobre o caso, e o guard
  `telasSemUseApp.test.js` impede que uma tela volte a usar a fachada.
- A fachada `useApp()` continua existindo só para os testes do próprio contexto. Ela sai
  na 2.9, junto com a mudança do estado, porque esses testes precisam ser reescritos
  provedor por provedor de qualquer jeito.

**2.9 Mover o estado para os provedores** (feita em 2026-11-23, rodadas 80 a 84)
- As seis fatias são donas do próprio estado, cada uma no seu arquivo: `SessaoProvider`,
  `OfflineProvider`, `ConfigProvider`, `CatalogoProvider`, `ComandasProvider`,
  `CaixaProvider`. A carga e o dreno da fila continuam numa coordenação central, que
  hidrata cada fatia por um canal interno (`use*Carga()`).
- Antes de qualquer estado mudar de lugar nasceu a rede de proteção de ponta a ponta da
  fila offline (`AppContext.offlinePontaAPonta.test.jsx`).

**2.10 A coordenação no próprio arquivo e o fim da fachada** (feita em 2026-11-23; a fase 2 está concluída)
- O que sobrou no `AppContext.jsx` (carga, dreno da fila, análise do Jarvas, pontes de
  impressão) vai para `src/app/CoordenacaoDaCarga.jsx`, e o `AppContext.jsx` passa a só
  compor os provedores.
- Os 12 arquivos de teste do contexto trocam `useApp()` pelos ganchos de cada assunto, e
  a fachada sai.
- **Pronto quando:** o `AppContext.jsx` só compõe os provedores e `useApp` não existe mais.

### Fase 3, quebrar as telas grandes

Método para todas: o estado e os efeitos vão para um hook da feature
(`features/<dominio>/hooks/`), cada região visual vira subcomponente com seu `.css`, e os
testes da tela continuam passando sem alteração de asserção. Telas grandes saem em
fatias, como o `PDVView` e o `DeliveryView` já saíram na F018.

| Tarefa | Arquivo | Linhas hoje | Fatias previstas |
|---|---|---|---|
| 3.1 | `DeliveryView.jsx` | 2.706 | 4 |
| 3.2 | `PDVView/index.jsx` | 2.198 | 3 |
| 3.3 | `ConfiguracoesView.jsx` (uma aba por arquivo) | 1.846 | 3 |
| 3.4 | `RelatorioView.jsx` | 1.609 | 2 |
| 3.5 | `ConsolePage.jsx` e `lib/console.js` | 1.551 e 1.578 | 3 |
| 3.6 | `CheckoutView.jsx` | 1.372 | 2 |
| 3.7 | `AdminView.jsx` | 1.342 | 2 |
| 3.8 | `NotasFiscaisTab.jsx` | 1.310 | 2 |
| 3.9 | `ProdutosView.jsx`, `Sidebar.jsx`, `MobilePage.jsx` | 986, 814, 808 | 3 |

- **Pronto quando:** nenhum arquivo de código passa de 600 linhas e nenhum componente
  passa de 15 `useState`.

**Andamento:** 3.1 e 3.3 feitas em 2026-11-23, um componente por arquivo (Delivery com
355 linhas, Configurações com 82). O menu e a galeria de fotos da Delivery viraram o
gancho `features/delivery/hooks/useGaleriaFotos.js`. No mesmo dia, um componente por arquivo
em Admin (3.7), Impostos, Pontos de impressão, Combos e Clientes, que saíram do limite, e em
Relatórios, Notas Fiscais e Produtos, que ficaram menores mas ainda pedem ganchos. Depois,
os ganchos: Notas Fiscais (3.8), Produtos e Relatórios (3.4) saíram do limite, com o estado em
`features/estoque`, `features/cardapio` e `features/relatorios`. Em 2026-11-24, o Console (3.5):
tela com 313 linhas, gancho em `features/console`, aba Estabelecimentos em arquivo próprio. E o
Checkout (3.6): tela com 116 linhas, gancho em `features/pdv/hooks/useCheckout.js`. Depois,
Mesas e Estoque, com ganchos em `features/mesas` e `features/estoque`. E a Sidebar (gancho em
`src/app/hooks/`) e a tela do celular (gancho em `src/pages/mobile/hooks/`). E o PDV (3.2): tela
com 332 linhas, gancho em `features/pdv/hooks/usePdv.js`; desde então nenhum arquivo passa de
15 `useState`. Depois, o PDV do celular e a coordenação da carga: desde então nenhuma tela
passa de 600 linhas, e restam três bibliotecas de regras em `src/lib/`. Por fim, `console.js`,
`deliveryAdmin.js` e `delivery.js` viraram pastas com um arquivo por assunto.

**A fase 3 está concluída (2026-11-24):** nenhum arquivo de código passa de 600 linhas (eram
22) e nenhum passa de 15 `useState` (o máximo era 70). Ficam para as fases 4 e 6 os 13 imports
de `src/features/` para `components/desktop/`, contados pelo lint e pela métrica.

### Fase 4, celular e computador compartilham a lógica

**4.1** Mover `useFinalizarPagamento` e `useCancelarComanda` de
`components/desktop/views/PDVView/` para `features/pdv/hooks/`. **Feita em 2026-11-24**, com o
`consolePagamentoGuard` reapontado para os ganchos onde a lógica do caixa mora desde a fase 3.

**4.2 PDV feita em 2026-11-24:** rótulo da comanda, meios de pagamento padrão, bloqueio do TEF
sem internet e troco em dinheiro passam a existir uma vez só (`lib/rotuloComanda.js`,
`features/pdv/regras/pagamento.js`).

**4.3 Delivery feita em 2026-11-24:** avançar e cancelar pedido são `avancarPedido` e
`cancelarPedido` em `lib/deliveryPedidos.js`, usados pelas duas telas. O agrupamento por
status continua de cada tela, porque as duas mostram coisas diferentes.

**4.4 Estoque feita em 2026-11-24:** a situação do saldo (`situacaoDoSaldo`) e a leitura da
quantidade digitada (`lerQuantidade`) passam a ser uma regra só. Saldo negativo vira ruptura nas
duas telas, como já era no alerta do PDV, e contagem negativa no celular deixa de gravar zero.

**4.5 Clientes feita em 2026-11-24:** as contas de fiado em aberto vêm de
`contasDeFiadoEmAberto`, sobre a regra `contaEmAberto` do financeiro.

**4.6 Financeiro feita em 2026-11-24:** o painel do celular busca as contas em aberto (previsto
e vencido) e usa `resumirContasEmAberto`; antes as contas já marcadas vencidas pelo computador
sumiam do celular.

**4.7 Relatórios feita em 2026-11-24:** o ticket médio, escrito oito vezes, é `ticketMedio` em
`lib/vendas.js`.

**4.8 Cozinha feita em 2026-11-24:** `itensNaoCancelados` (14 cópias), `statusCozinha` e
`referenciaDaEtapa`. Corrigido: no computador, pedido sem status ficava sem o botão de iniciar.

**4.9 Cardápio feita em 2026-11-24:** busca por nome sem acento em todas as telas
(`nomeBateComBusca`, 9 lugares) e gerência numa regra só (`ehGerencia`, 11 cópias).

**4.10 Configurações no celular feita em 2026-11-24:** catálogo dos meios de pagamento, edição
do horário do delivery e regras de mesa nova numa cópia só.

**A fase 4 está concluída (2026-11-24):** nenhum arquivo de `pages/mobile` nem de `features/`
importa de `components/desktop`, e as duas regras de lint são erro.

**4.2 a 4.9** Um módulo por rodada: PDV, Delivery, Estoque, Clientes, Financeiro,
Relatórios, Cozinha e Cardápio. Em cada um, comparar a tela do computador com o módulo do
celular, extrair a lógica repetida para um hook da feature e fazer as duas telas usarem o
mesmo hook. A aparência de cada uma continua diferente.

**4.10 Configurações no celular** (2.004 linhas hoje): as seções passam a usar os mesmos
hooks e funções de dados das abas da fase 3.3.

- **Pronto quando:** nenhum arquivo de `pages/mobile` importa de `components/desktop`
  (regra de lint vira erro) e a review não encontra regra de negócio escrita duas vezes.

### Fase 5, visual e tema (continuação da F018, pode correr em paralelo depois da fase 1)

**5.1** Teste guard `inlineStyleGuard.test.js`, no mesmo molde do `travessaoGuard`: conta
`style={{}}` que não seja atribuição de variável CSS e falha se o número **subir**. A lista
de arquivos permitidos só diminui. **Feita em 2026-11-24:** 96 arquivos, 1.516 atributos na
linha de base.

**5.2, primeiro arquivo, feito em 2026-11-24:** `CartPanel` (76 para 0), com o roteiro de fotos
cobrindo o carrinho e suas janelas antes da conversão. Depois, `FichasTecnicasTab` (74 para 0).
Depois, as Notas de Entrada: `NotaAssistenteXml` (72 para 0) e `NotaManual` (57 para 0).
Depois, a aba Vendas do relatório (59 para 0) e o painel de pagamento do PDV (48 para 0).
Depois, o relatório de Desempenho (47 para 0) e a grade de comandas do PDV (46 para 0).
Depois, o fechamento de caixa (41 para 0) e as comandas fechadas (38 para 0).
Depois, o Estoque (36 para 0) e a janela de desconto e acréscimo (35 para 0).
Depois, o painel do Jarvas (35 para 0) e a barra lateral (32 para 0).
Depois, os Subprodutos (31 para 0) e a janela de dinheiro do caixa (28 para 0).
Depois, o resumo do pedido (26 para 0) e a janela de remover item (24 para 0).
Depois, a lista de produtos (21 para 0) e a janela de cadastro de produto (23 para 0).
Depois, os combos (40 para 0) e as janelas de categoria e de exclusão (30 para 0): a área de
Cadastro de Produtos inteira fica sem estilo inline.

**5.2 em diante** Zerar estilo inline por arquivo, na ordem da maior contagem:
`RelatorioView` (159), `CheckoutView` (140), `AdminView` (133), `NotasFiscaisTab` (124),
`Sidebar` (105), `ConfiguracoesView` (101), `CartPanel` (76), `ProdutosView` (73), e depois
os arquivos com menos de 50. Quando o arquivo também está na fase 3, a fatia visual entra
na mesma rodada da quebra, para não mexer duas vezes.
- Valor que vem de dado vira variável CSS no ancestral; estado que o JavaScript consegue
  listar vira modificador de classe (padrão registrado em `memory/patterns.md`).
- Borda de erro que sai do inline leva `aria-invalid` na mesma edição (regra da rodada 15).

**5.x Cores fixas:** as 25 cores hexadecimais no JSX passam a usar `var(--gm-*)`.

**5.z Sem emoji (regra do dono, 2026-11-25):** o sistema não tem emoji. O guard
`emojiGuard.test.js` trava o número (118 em 58 arquivos no dia da regra) e a linha de base só
encolhe. Cada rodada da fase 5 que mexe num arquivo tira o emoji dele junto, trocando ícone
de reserva e aviso por componente de `react-icons/lu` (decisão 037: junto com a fase 5, sem
rodada dedicada). O ícone que o estabelecimento escolhe para cada produto (campo `emoji` do
cadastro) também sai, numa rodada própria depois da fase 5: some o campo de escolha e a
exibição no PDV, na cozinha, no cardápio digital e no relatório.

**5.y Prova do white-label:** rodar o roteiro de screenshots com dois temas de tenant
diferentes e confirmar que nenhuma cor da marca padrão aparece no tema do outro.

- **Pronto quando:** o guard está em zero, sem lista de exceções, e a prova de tema passa.

### Fase 6, organização das pastas

**6.1 a 6.9 Mover para `src/features/<dominio>/`**, um domínio por rodada, com `git mv`
para preservar o histórico: fiscal (os 17 arquivos `nfce*` e afins), delivery, estoque,
caixa, PDV, clientes, console, pautas e apex. Regras puras ficam em `regras/`, os
testes andam junto com o arquivo.

**6.10 Roteador por superfície:** `src/app/rotas/` com um arquivo para cada superfície
(apex, console, cardápio público, estabelecimento). O `routes/index.jsx` só escolhe qual
carregar pelo domínio.

**6.11 Projetos satélites:** `ponte/` e `bot/` ganham um README na raiz dizendo o que são,
como rodar e se compartilham código com o app. Só viram workspace npm se a review mostrar
código duplicado entre eles e o app.

**6.12 Documentação final:** `docs/01_ARQUITETURA/` descreve o estado real (não mais o
modelo-alvo), `CLAUDE.md` ganha a seção de organização por domínio, `memory/patterns.md`
registra os padrões novos, e o ADR-015 passa de "proposto" para "aceito".

- **Pronto quando:** `src/components/desktop/views/` e `src/lib/` com regra de negócio não
  existem mais, e a documentação descreve o código como ele está.

---

## 6. Estrutura-alvo

```
src/
  app/              provedores, rotas por superfície, ponto de entrada
  features/
    <dominio>/
      dados/        única camada que fala com o Supabase
      regras/       funções puras com teste
      hooks/        estado da feature, usado pelo computador e pelo celular
      desktop/      telas do computador, cada uma com seu .css
      mobile/       telas do celular, cada uma com seu .css
  shared/
    ui/             componentes do design system
    lib/            utilidades técnicas sem regra de negócio
  types/            tipos gerados do banco
```

---

## 7. Fase F, auditoria final e correção (depois da última tarefa)

Esta fase só começa quando a tarefa 6.12 fechar. Ela repete até não sobrar nenhum achado.

**F.1 Métricas.** Rodar `scripts/metricas-refatoracao.mjs` e preencher a coluna "final"
da tabela da seção 4. Cada meta recebe "sim" ou "não".

**F.2 Critérios de todas as specs.** Reverificar, contra o código atual, todos os
critérios de todas as specs deste plano. Uma rodada posterior pode ter desfeito o que uma
anterior entregou, e a review de cada rodada só olhou a própria.

**F.3 Fluxos críticos rodando de verdade.** Com Playwright, nas larguras de computador e
de celular:
1. Login, abrir caixa, vender em dinheiro, fechar caixa.
2. Lançar comanda pelo `/palm` e cobrar no PDV.
3. Venda com NFC-e em homologação.
4. Pedido pelo cardápio público e aceite no delivery.
5. Sem internet: vender, voltar a rede, conferir que a venda subiu uma vez só.
6. Importar nota fiscal, salvar combo e excluir unidade (os fluxos da fase 1).
7. Console: criar estabelecimento e trocar plano.

Depois, comparar o roteiro de screenshots com a linha de base da tarefa 0.1. Toda
diferença precisa estar explicada numa spec; diferença sem explicação é achado.

**F.4 Segurança.** Rodar `/security-review` sobre o diff inteiro desde o commit de partida.
Confirmar que nenhuma policy de RLS foi afrouxada e que toda RPC nova tem checagem de
tenant e `search_path` fixo.

**F.5 Correção.** Cada achado de F.1 a F.4 vira uma rodada de correção, com spec, build e
review, como qualquer outra. Achado que depende de decisão do dono não é aceito em
silêncio: entra numa lista e o dono decide. Terminadas as correções, **volta para F.1**. A
fase só sai do laço quando F.1 a F.4 terminam com zero achados na mesma passada.

**F.6 Encerramento.**
- `docs/09_BACKLOG/tech-debt.md` atualizado, com os itens resolvidos e a referência de
  commit.
- `specs/_loop.md` com a rodada de encerramento e a tabela de métricas final.
- Relatório para o dono: metas atingidas, decisões tomadas pelo caminho, o que ficou
  conscientemente de fora e por quê.

---

## 8. Riscos e como cada um é contido

| Risco | Contenção |
|---|---|
| PDV em produção quebrar no meio do plano | Uma rodada por vez, testes de componente do PDV rodando antes de qualquer mudança nele, screenshot antes e depois |
| Frontend novo publicado contra banco velho | Rodada com migration não é mesclada sem aviso ao dono (regra 5) |
| Fila offline perder ou duplicar venda na divisão do contexto | `OfflineProvider` sai sozinho numa rodada (2.3), com os testes de idempotência existentes como critério |
| Refatoração parar no meio e deixar duas formas de fazer a mesma coisa | A fachada `useApp` mantém tudo funcionando até a 2.8; as regras de lint impedem código novo no padrão antigo |
| Plano longo perder o rumo | Métricas anotadas em toda rodada e auditoria final contra a tabela da seção 4 |

## 9. Tamanho estimado

| Fase | Rodadas |
|---|---|
| 0 | 6 |
| 1 | 5 |
| 2 | 8 |
| 3 | 24 |
| 4 | 10 |
| 5 | cerca de 15 |
| 6 | 12 |
| F | pelo menos 2 (auditoria e uma passada limpa) |
| **Total** | **cerca de 82** |

No ritmo das rodadas 66 a 69 (duas por dia), são perto de seis semanas de trabalho
contínuo. As fases 0 e 1 sozinhas (11 rodadas) já entregam o ganho de segurança, porque
eliminam as três gravações que podem ficar pela metade.
