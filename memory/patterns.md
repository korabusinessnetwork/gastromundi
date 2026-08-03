# Padrões do Projeto GastroMundi

## Objetivo
Registrar padrões consolidados de código, arquitetura, UX e processo que a equipe adotou oficialmente. Este arquivo é a referência definitiva de "como fazemos aqui".

## Contexto
Padrões surgem de decisões repetidas. Quando a mesma solução é adotada três ou mais vezes, ela deve ser elevada a padrão e registrada aqui. Padrões reduzem fricção, inconsistências e retrabalho.

## Regras Gerais
- Um padrão só entra aqui após ser validado em produção ou revisão técnica
- Padrões devem ter exemplos concretos quando possível
- Padrões obsoletos devem ser marcados como `[DEPRECADO]` com data e motivo

## Validações
- Novos padrões devem ser propostos via PR com referência a, no mínimo, dois casos de uso reais
- Padrões de segurança exigem revisão do tech lead antes de serem adotados

## Permissões
- Qualquer desenvolvedor pode propor um padrão
- Aprovação exige consenso da equipe técnica (mínimo 2 revisores)

## Exceções
- Em casos de urgência, um padrão pode ser adotado provisoriamente com tag `[EXPERIMENTAL]`
- Padrões experimentais têm prazo de 30 dias para validação ou descarte

## Auditoria
- Data de adoção de cada padrão deve ser registrada
- Revisões periódicas recomendadas: trimestrais

## Eventos
- `pattern.added` — novo padrão consolidado
- `pattern.deprecated` — padrão marcado como obsoleto
- `pattern.revised` — padrão atualizado

## Configurações Futuras
- Criar linter ou checklist automatizado baseado nos padrões documentados
- Integrar este arquivo ao processo de code review como referência obrigatória

## Casos de Uso
- Onboarding técnico de novos devs
- Code review
- Decisões de refatoração
- Avaliação de bibliotecas e ferramentas

## Critérios de Aceite
- [ ] Cada padrão tem nome, contexto, exemplo e justificativa
- [ ] Padrões estão organizados por categoria
- [ ] Status de cada padrão está atualizado

---

## Padrões de Código

### Nomenclatura de Componentes
- Componentes em **PascalCase** (ex.: `UserCard`, `BillingPanel`).
- Um componente por arquivo; o nome do arquivo acompanha o nome do componente (`UserCard.tsx`).
- Hooks customizados em **camelCase** com prefixo `use` (ex.: `useCurrentTenant`).
- Tipos e interfaces em **PascalCase**; constantes globais em **UPPER_SNAKE_CASE**.
- Eventos de domínio em **dot.case** no passado/substantivo (ex.: `decision.added`), conforme convenção do Event Bus.

### Estrutura de Arquivos
- Organização **por feature/módulo**, não por tipo técnico: cada módulo agrupa seus componentes, hooks e serviços.
- Código compartilhado entre módulos vive em uma camada comum (ex.: `shared/`).
- Acesso ao backend isolado em uma camada de serviços, nunca espalhado direto nos componentes — facilita troca futura de provedor (ver `memory/decisions.md`).
- Convenção de pastas detalhada e exemplos visuais em `docs/06_COMPONENTES/` e `docs/03_REGRAS_DE_NEGOCIO/`.

### Gerenciamento de Estado
- **Estado de servidor** (dados do backend): gerenciado por camada de data-fetching com cache; nunca duplicado em estado global manual.
- **Estado global de UI** (sessão, tenant atual, tema, feature flags): exposto via Context API (ver `docs/01_ARQUITETURA/overview.md`).
- **Estado local**: mantido no componente sempre que não precisar ser compartilhado.
- Regra de ouro: elevar estado apenas quando há mais de um consumidor real.

### Conferência textual de SQL: tirar comentário antes, e proibir a forma, não a palavra
Vale para todo guard que lê migration em `src/**/*SqlGuard.test.js` e para todo autoteste
`DO $$` que inspeciona `pg_get_functiondef()`.

- **Sempre remova os comentários antes de conferir.** O corpo consertado normalmente *explica em
  português* a fórmula que substituiu, então a palavra do bug continua no arquivo depois de sumir
  do código. Em JS: descartar a linha que começa com `--` **e** cortar o `--` de fim de linha
  (`linha.replace(/--.*$/, "")`). Em SQL: `regexp_replace(v_def, '--.*', '', 'gn')` — a flag `n`
  faz o `.` não atravessar a quebra de linha. O erro simétrico é pior e passa calado: um comentário
  citando a guarda faz a guarda ser dada como presente sem ela existir.
- **Proíba a forma defeituosa, não o token.** `lpad(x, 3, '0')` trunca e `to_char(n,'FM000')`
  estoura, mas `lpad` e `to_char` em si são corretos — um guard que bane o token obriga quem vier
  depois a reintroduzir o bug para o teste passar.
- **Prove a regex nos dois lados.** Um caso que ela deve pegar e um que ela não pode pegar, no
  mesmo teste: sem isso, afrouxar a regex até não pegar nada vira o caminho fácil de "fazer passar".
- **Laço sobre arquivos precisa provar que rodou.** Conte os blocos conferidos e exija `> 0` — laço
  vazio não asserta nada e o teste fica verde sem ter olhado coisa nenhuma.
- **Proibição textual para antes do `DO $conf$`.** O bloco de conferência cita, dentro dos `LIKE`,
  exatamente o que a migration não pode ter — procurar essas palavras no arquivo inteiro acusa o
  vigia. Recorte primeiro: `const migracao = sql.slice(0, sql.indexOf("DO $conf$"))` e proíba só ali.
- **Ancore no que é exclusivo do que você proíbe.** Para provar que nenhuma política de escrita
  nasceu, procure `CREATE POLICY` / `GRANT ... ON TABLE` — `FOR (INSERT|UPDATE|DELETE)` casa também
  o `FOR UPDATE` dos locks de linha, que é o oposto de um problema.
- **Normalize a quebra de linha antes de ancorar.** Os fontes deste repositório são gravados com
  CRLF: `recorte(arquivo, inicio, "}\n")` devolve −1 e o teste falha sem nada de errado no código.
  `readFileSync(caminho, "utf8").replace(/\r/g, "")` na leitura resolve de uma vez.
- **Conjunto de isenção é mais perigoso que conjunto de exigência.** Quando o guard monta uma lista
  do que ele vai *pular* (tabela derrubada, arquivo legado, caso conhecido), errar para mais nessa
  lista some com a verificação em silêncio — enquanto errar para mais numa exigência só produz um
  falso positivo que alguém conserta. Faça a lista de isenção a mais estreita que o texto permitir e
  diga na mensagem de erro por que cada item saiu. Foi o que quase furou o `schemaSqlGuard`: o
  `DROP TABLE _numeros` da `20260903` é de uma `CREATE TEMP TABLE` de verificação, e ia isentar da
  cobertura qualquer tabela real que um dia tivesse esse nome.

### Superfície pública endereçada por slug: precedência e cache por origem
Vale para toda tela anônima que mostra os dados de **um** estabelecimento escolhido pelo endereço —
hoje a vitrine `/cardapio`, amanhã qualquer página pública por tenant.

- **A ordem é subdomínio > query > fallback**, nessa sequência, e quem resolve devolve também **de
  onde veio** (`slugDaVitrine` em `src/lib/tenantSlug.js`). O endereço publicado sempre ganha: um
  `?loja=` na URL nunca sequestra um subdomínio de tenant que já está no ar. Sem essa ordem, ligar
  o subdomínio depois vira uma migração de comportamento; com ela, é ligar a env e pronto.
- **O que vem da URL é entrada de usuário.** O slug da query passa por `slugValido` antes de virar
  parâmetro de RPC, e o slug que sai do banco passa por `encodeURIComponent` antes de virar URL.
- **Cache carimbado por origem não pode ser escrito por tela de outro estabelecimento.** O
  `brandingCache` é carimbado com o slug da **origem** (`resolverSlugTenant()`), não com o slug que a
  tela está mostrando. Quando a origem é compartilhada — que é o caso hoje, sem subdomínio —, uma
  tela em modo prévia que gravasse o cache faria a marca dela aparecer na tela de login de todo mundo
  daquela origem. Prévia não lê (pintaria a marca errada no 1º quadro) e não grava (vazaria).
- **Sem slug, degrade, não suma.** Tenant sem `slug` (bootstrap que falhou, banco anterior à
  `20260740`) abre a superfície sem parâmetro, no comportamento antigo. Botão que desaparece por
  dado faltando é pior que botão que faz o que fazia antes.

### O Console lê a operação por agregado, nunca por policy
Vale para toda tela do super-admin que precisa de dado que mora em tabela operacional (venda,
pedido, caixa, estoque) — hoje "Uso e faturamento", amanhã qualquer painel de plataforma.

- **Não existe `OR is_super_admin()` em tabela operacional.** Esse ramo só está em `tenants` e
  `assinaturas`, que é o que o Console lê agregado (ADR-008 §5 e decisão v2 nº 2). Pôr o ramo em
  `vendas` faria um token de plataforma vazado abrir a base operacional inteira, de todos os
  clientes, o tempo todo. O caminho certo é o outro braço da mesma decisão: **RPC `SECURITY
  DEFINER`** que revalida o papel dentro do banco (`IF public.is_super_admin() IS NOT TRUE THEN
  RAISE … USING ERRCODE = 'insufficient_privilege'`) e devolve **agregado**.
- **A assinatura de retorno é a trava, não a intenção.** `analytics_plataforma` (20260912) devolve
  `tenant_id, faturamento_centavos, pedidos, ultima_venda` — nenhuma coluna que identifique uma
  venda (`comanda`, `mesa`, `cashier`, `cliente_id`, item, valor unitário). Contagem e soma
  atravessam; linha de venda de cliente, não. Uma coluna a mais na tela é uma coluna a mais
  vazando por PostgREST.
- **Parâmetro de período é lista fechada validada no banco**, não no front: a RPC é chamável direto
  com qualquer token `authenticated`, então `p_dias NOT IN (7, 30, 90)` recusa com
  `check_violation` no servidor. O front só escolhe o que oferecer.
- **O autoteste `DO $conf$` protege o banco onde já rodou; o `*SqlGuard.test.js` protege o
  arquivo.** Os dois, sempre. O bloco em SQL some no primeiro `CREATE OR REPLACE` que alguém
  escrever para "só mais uma coluninha" — o guard textual na suíte é o que sobrevive a isso.

### Cruzamento por tenant nunca casa tenant ausente
Toda função que filtra uma lista por `tenant_id` para decidir o que a tela mostra.

- **Curto-circuite antes de comparar:** `tenantId ? linhas.filter((l) => l.tenant_id === tenantId) : []`.
  Sem isso, `null === null` casa — e o tenant chega nulo com facilidade, porque toda tela que abre
  a partir de um card escreve `tenant?.id ?? null` enquanto o modal ainda não recebeu o registro.
  O resultado é dado de ninguém exibido como dado de alguém.
- **O teste que pega isso é o do caso vazio**, não o do caminho feliz: um caso "tenant nulo não liga
  nada por acidente" com uma linha de `tenant_id` nulo na entrada. Ler o código não denuncia —
  `l.tenant_id === tenantId` parece obviamente certo.
- **Vale para qualquer chave anulável**, não só tenant: `usuario_id`, `caixa_id`, `pedido_id`.
  Comparar por identidade sempre pareia duas ausências.

---

### Estado compartilhado é reconferido no handler, não só na tela
Caixa aberto, comanda travada, turno ativo, assinatura em dia: tudo que mora no banco e chega por
realtime muda **enquanto o modal está aberto**, num aparelho que não é este.

- **Sumir com o botão é conveniência; a regra mora onde a escrita acontece.** O ponto de entrada
  gated por `caixaAberto` na `Sidebar` dá a impressão de que a condição está aplicada — mas quem
  abriu o modal antes do estado virar continua com um caminho até o insert.
- **A checagem vai imediatamente antes do insert**, no handler do `AppContext`, e devolve
  `{ error: { message } }` no mesmo formato do erro do Supabase — a tela já sabe mostrar isso.
- **O sintoma quando falta é mudo:** a linha entra com o recorte de uma sessão já conferida e
  nenhum fechamento futuro a soma. Não há erro, não há tela quebrada, só dinheiro fora da conta.
- **Não substitui a RLS nem é substituído por ela:** a policy responde "este cargo pode escrever",
  não "agora é hora". Estado de operação é a camada de cima.

---

### CSS do filho que sobrescreve classe do pai: quem decide é a especificidade
Ao extrair `style={{ }}` para o `.css` co-localizado (decisão 018 / ADR-007), a classe base quase
sempre mora num arquivo importado por **outro** componente — `vitrine.css` é importado por
`CardapioPage.jsx`, e as telas de checkout que usam `.campo`, `.btn` e `.linha-sacola__extra` são
filhas dela.

- **Uma classe nova sozinha (`.checkout-entrega__buscando`) tem a mesma especificidade da classe
  base (0,1,0)**, então o empate é desempatado pela ordem em que o Vite concatena o bundle — e essa
  ordem não é garantida para o `.css` do filho. Funciona em dev e pode inverter em produção.
- **A regra que sobrescreve usa duas classes:**
  `.linha-sacola__extra.checkout-pagamento__troco-erro` (0,2,0) vence sempre, sem depender de ordem.
- **`margin: 0 0 6px` na classe base zera o topo.** O shorthand apaga `margin-top`; a regra nova
  precisa declarar `margin-top` explicitamente em vez de contar com o valor anterior.
- **Prop que vira estilo entra como custom property, com unidade:** o JSX escreve
  `--klogo-size` já com o `px` no valor, e o CSS deriva o resto com
  `calc(var(--klogo-size) * 0.28)`. Sem o `px`, o `calc()` recebe número puro e **descarta a
  declaração inteira em silêncio** — nada quebra, o elemento só some de tamanho.

### Alfa sobre token: `alfa()` ou `color-mix`, nunca hex concatenado
Antes do ADR-007, cor com transparência se escrevia colando dois dígitos hex no fim da cor
(`#7c3aed` + `"66"`). Com custom properties o mesmo idioma produz `var(--gm-accent)66`, que é
**CSS inválido** — e inválido depois de substituir `var()` não cai para a regra anterior: as
longhands vão para `unset`, então `border-style` volta a `none` e **a borda some** em vez de mudar
de cor.

- **A forma certa é `alfa(C.x, "NN")`** (`src/constants/colorAlfa.js`), que devolve
  `color-mix(in srgb, var(--gm-x) N%, transparent)`. A conversão do hex antigo é
  `Math.round(parseInt("NN",16)/255*100)` — `1a`→10%, `18`→9%, `44`→27%, `55`→33%, `0f`→6%.
- **Nada acusa a forma errada:** o Vite não valida string de estilo, o jsdom não computa CSS e a
  suíte fica verde. Só a leitura pega. (`BUG001` mapeou 26 linhas em 7 arquivos; corrigido na
  rodada 14.)
- **Procure pela cauda, não pela cabeça.** Grep por `varColor(` perde metade dos casos: o token
  também chega por variável (`` `${tipo.color}44` ``, `` `${cor}22` ``) e o `}` às vezes fecha um
  ternário, não a chamada. As duas buscas que pegam tudo são
  `grep -rE '\+\s*"[0-9a-fA-F]{2}"' src` e ``grep -rE '\}[0-9a-fA-F]{2}`' src``.
- **`alfa()` aceita as duas formas de cor**, então mapa de cores misto não precisa de tratamento
  especial: nome de token (`C.red`, ou `corSituacao = situacao === "falta" ? C.red : C.green`) vai
  pelo ramo `var(...)`, e string já resolvida (`ACTION_TYPE_META.auth = varColor(C.blue)`) ou hex
  literal (`"#f59e0b"`) vai pelo ramo literal. `alfa(tipo.color, "44")` funciona igual para os 5
  tipos que guardam token e para o 1 que guarda hex.
- **Duas falhas diferentes, mesmo defeito.** Em `border` (atalho), o valor inválido leva todas as
  longhands a `unset` → `border-style: none` → a borda **some**. Em `style.borderColor` (CSSOM, nos
  `onFocus`/`onBlur` feitos à mão), só a cor vai a `unset` → `currentColor` → a borda fica **da cor
  do texto**. Procurar "borda sumiu" não acha o segundo caso.

### Borda de input na classe entrega o foco para o `inputs.css` global
`src/styles/inputs.css` já pinta foco de todo input do sistema: a borda accent vem de
`input:not([aria-invalid="true"]):not([type="checkbox"]):not([type="radio"]):focus` (0,3,1) e o anel
de um `:focus` universal. Um `border` **inline** vence isso, e é por isso que várias telas
reimplementam o foco à mão com `onFocus`/`onBlur` mexendo em `e.currentTarget.style`.

- **Movida a borda para a classe co-localizada (0,1,0), o global volta a vencer** — o foco passa a
  ser pintado pelo `inputs.css`, com o mesmo resultado visual, e os dois handlers de JavaScript
  saem junto (feito em `.pdv__barcode-input`).
- **A borda de repouso continua sendo do componente:** a regra global usa `:where()`
  (especificidade 0), então a classe define espessura e cor parada sem disputa.
- **O `background` é o inverso:** o global usa cadeia de `:not()` (~0,8,1) e passa a vencer a classe
  assim que o inline sai — só não muda nada porque o valor é o mesmo `var(--gm-input-bg)`. Conferir
  esse par antes de tirar o inline de um input com fundo próprio.
- **Campo com estado de erro é a exceção: a troca não é neutra, e `aria-invalid` é obrigatório.**
  O item acima ("mesmo resultado visual") vale para input sem erro, como o `.pdv__barcode-input`.
  Quando a borda inline era um ternário (`senhaErro ? red : input-border`), movê-la para a classe
  (0,1,0) entrega o foco para a regra global (0,4,1) — que pinta **accent** e apaga o vermelho justo
  enquanto o operador digita a senha errada, que é quando o sinal importa. O `inputs.css` já prevê
  isso com `:not([aria-invalid="true"])`, mas só funciona se o JSX declarar o atributo. Regra: ao
  extrair a borda de um input com erro, `aria-invalid={!!erro}` entra na mesma edição, e a cor de
  erro vira `.classe[aria-invalid="true"]`. Feito em `.pdv__saldo-input` (rodada 15).

### Estado de lista na extração de CSS: o gancho nativo inverte o índice
Ao trocar ternário de `map()` por seletor, o índice do JavaScript é 0-based e o do CSS é 1-based —
os dois idiomas mais comuns invertem:

- `idx % 2 === 0` (pinta o **primeiro**) é `:nth-child(odd)`, **não** `even`. Trocar por engano
  inverte a listra e nada acusa: a suíte passa e a tela continua zebrada, só que ao contrário.
- `idx < lista.length - 1 ? borda : "none"` (divisória em todos menos o último) é
  `border-bottom` na classe + `:last-child { border-bottom: none }`.
- O ganho não é só menos inline: as duas formas em JavaScript recalculam a lista inteira quando um
  item entra ou sai, e a versão em CSS não depende de `length` nenhum.

Feito em `.pdv__saldo-cancelado` (rodada 15). Vale para as listas que sobraram em `DeliveryView`,
`RelatorioView` e `NotasFiscaisTab`, que usam o mesmo idioma.

### `:disabled` só substitui o ternário quando a expressão é a mesma
Botão com `style={{ background: cond ? accent : faint }}` e `disabled={outraCond}` parece pedir
`:disabled` — mas as duas expressões quase nunca são iguais, porque o `disabled` costuma carregar
também a flag de "está salvando" que o fundo nunca teve. Nos cinco modais do PDV, **três dos seis
botões** estavam assim: `!nome.trim() || criando` contra `nome.trim()`, `!pode || transferindo`
contra `pode`, `salvandoMesa || !mesaInput.trim()` contra `mesaInput.trim()`.

- Usar `:disabled` nesses três acende o cinza **durante a ação** — o botão fica apagado enquanto o
  texto diz "Abrindo...", que é justamente quando o operador precisa ver que algo está acontecendo
  (princípio nº 1, "estados sempre visíveis"). Nada acusa: a suíte passa, o fundo só muda no meio de
  uma operação que o teste não observa.
- Regra: comparar as duas expressões **caractere a caractere** antes de escolher o gancho. Iguais →
  `:disabled`. Diferentes → modificador de classe com a expressão de hoje (`--ativo`, `--pode`,
  `--salvando`), e o `:disabled` fica reservado para as declarações que de fato acompanham o
  atributo (tipicamente `cursor` e `opacity`).
- O mesmo vale por **declaração**, não por botão: no "Confirmar Cancelamento" o `background` casava
  com o `disabled` e o `box-shadow` não (dependia só de `motivo.trim()`), então um foi para
  `:disabled` e o outro para o modificador.

Feito nos seis botões dos modais do PDV (rodada 16). A tabela da comparação está em
`specs/f018-pdv-modais-css.md` §6.

### Enriquecer classe compartilhada: enumerar os usuários antes, não depois
Classe compartilhada nascida de extração de tipografia agrupa por **tamanho**, não por papel — e o
papel só aparece quando ela ganha cor. `.pdv__modal-erro` tinha cinco usuários; quatro eram erro de
verdade e o quinto, em `PDVView/index.jsx`, era a linha "Apelido é opcional. Pressione Enter ou
clique em Entrar para continuar." em `muted`. Acrescentar `color: var(--gm-red); font-weight: 600` à
classe compartilhada — o que os outros quatro pediam — pintaria de vermelho uma informação neutra.

- Antes de mover qualquer declaração para uma classe compartilhada, listar **todos** os usuários e
  conferir o valor de cada um. Se um diverge, ele sai para classe própria com a mesma tipografia
  (aqui `.pdv__mesa-hint`), e a compartilhada recebe só o que é igual em todos.
- O risco é assimétrico e por isso passa batido: quem escreve a regra está olhando para os usuários
  que a motivaram; o divergente é sempre o que não estava na tela no momento.
- Vale igual para `-label`, `-input`, `-aviso` e companhia: `marginBottom` que só um usava desceu
  para a classe do modal, não subiu para a compartilhada.

---

### Duas faixas com a mesma estrutura e cores diferentes: a cor mora no descendente do modificador
As faixas de alerta do PDV (estoque em âmbar, validade em vermelho) são a mesma marcação: cabeçalho
com ícone, label, botão Ver/Ocultar e uma lista de chips. Dar `color` à classe compartilhada
(`.pdv__alerta-label`, `.pdv__alerta-toggle`) obrigaria uma das duas a sobrescrever, e a
sobrescrita é onde a divergência de valor se instala calada.

- A classe compartilhada leva só o que é igual nas duas (layout, tamanho, peso). A cor vem do
  **descendente do modificador da faixa**: `.pdv__alerta--atencao .pdv__alerta-label { color: … }`.
  Uma faixa nova é um modificador novo, não uma sobrescrita.
- **Confira o escopo do estado antes de escolher onde o modificador mora.** O chip parece o mesmo
  caso e não é: dentro da faixa de validade ele alterna as duas cores na mesma lista (vencido
  vermelho, próximo âmbar). Modificador de chip por faixa pintaria a lista inteira de uma cor só.
  A pergunta é "esse estado varia por bloco ou por item?", e a resposta está na condição do JSX
  (`vencido ? … : …` é por item), não na aparência da tela cheia.
- Consequência prática: modificador de bloco (`--atencao`/`--critico`) e modificador de item
  (`-chip--critico`/`--atencao`) coexistem com o mesmo sufixo e significam recortes diferentes. O
  nome não desambigua — o prefixo do bloco BEM é o que diz qual é qual.

### Ao extrair CSS, a classe copia a ausência também
Os dois grupos de abas do `PDVView/index.jsx` pareciam idênticos e não eram: as abas
Mapa/Lista/Comandas declaravam `fontFamily: "inherit"` inline, as abas Produtos/Carrinho do celular
não. `<button>` não herda fonte do documento sozinho — escrever `font-family: inherit` na segunda
classe "por higiene" trocaria a fonte do sistema pela do app num par de botões que o dono vê todo
dia no celular.

- Ao mover declaração de inline para classe, o conjunto de destino é **exatamente** o de origem: o
  que não estava lá não entra, mesmo quando a ausência parece descuido. Corrigir e migrar na mesma
  rodada apaga a evidência de qual dos dois mudou a tela.
- Se a ausência realmente for um defeito, ela vira item separado — o contrato de uma fatia de F018
  é mudança visual zero, e é isso que permite auditar 190 linhas trocadas por diferença de zero.

### Cor calculada em runtime: custom property local no ancestral, não `style` em cada descendente
No kanban do `DeliveryView.jsx`, `baseCorStatus(status)` devolve uma entre seis cores e ela pintava
o título da coluna, a bolinha, o fundo e o texto do contador e a fita esquerda de cada cartão de
pedido — onze `style={{ color: cssCor(base) }}` espalhados, porque "cor que só existe em runtime não
cabe em classe" parecia verdade. Cabe: o JSX define a variável **uma vez** no ancestral
(`style={{ "--cor-status": cssCor(base) }}` em `.delivery-view__coluna`) e o CSS lê
`var(--cor-status, …)` em todos os descendentes, inclusive nos que herdam de outro componente.

- O `style` que sobra deixa de ser estilo e vira **parâmetro**: uma linha, um valor, e nenhuma
  decisão visual no JavaScript. Quantas propriedades a cor pinta e como ela é misturada passa a ser
  problema do `.css` (o contador usa `color-mix(in srgb, var(--cor-status) 12%, transparent)`).
- **Sempre com fallback na leitura**, não no `:root`: `var(--cor-status, var(--gm-muted))`. O
  componente pode ser renderizado fora do ancestral que define a variável, e o fallback é o mesmo
  valor que a função em JavaScript devolve no caso desconhecido — as duas pontas dizem a mesma coisa.
- `color-mix` aceita a variável aninhada (`--cor-status` guarda o texto `var(--gm-blue)`): a
  substituição acontece antes da leitura do valor. Quem prova é o `vite build`, não o vitest.
- Não confundir com token de tema: `--cor-status` é **local**, sem prefixo `--gm-`, e nunca entra em
  `tema.css`. Ela pertence ao componente, como os `--fs-*`/`--lh-*` que o mesmo arquivo já usava.

### Modificador de cor não carrega espaçamento
`.delivery-view__aviso--erro` nasceu com `background`, `color`, `border` **e** `margin-bottom: 12px`,
e funcionou enquanto teve um usuário só. Quando a aba Cardápio trouxe mais dois avisos de erro, os
dois dentro de modal e sem margem, reusar o modificador daria 12px de folga a quem nunca teve — e a
suíte não vê, porque não lê CSS.

- Antes de reusar um modificador existente, ler as declarações dele e separar as que descrevem o
  **papel** (cor, peso, borda) das que descrevem a **posição** (`margin`, `width`, `flex`). O papel
  fica; a posição sai para modificador próprio (`--espacado`), aplicado nos usuários que a tinham.
- O mesmo raciocínio de "Enriquecer classe compartilhada: enumerar os usuários antes, não depois",
  na direção inversa: lá a classe ganha declaração e pode estragar quem já usa; aqui a classe está
  intacta e é o **novo** usuário que herda o que não pediu.
- Vale para qualquer modificador de estado (`--erro`, `--ok`, `--aviso`, `--perigo`): o estado diz
  como a coisa **é**, nunca onde ela fica.

### Estilo inline não duplica CSS: ele desliga o baseline global
`src/styles/inputs.css` define o comportamento de campo do sistema inteiro — fundo, borda de
repouso, anel de foco, borda accent no foco, `[aria-invalid]`, `:disabled`, `::placeholder`. O helper
`inputStyle()` do `DeliveryView` devolvia `border` inline, e inline vence qualquer seletor: os 20
campos do Delivery eram os únicos que não acendiam ao focar. Ninguém reporta isso, porque realce
que nunca existiu não parece defeito.

- `border`, `background` e `color` inline não competem só com a classe da tela — competem com as
  regras de **estado** do baseline (`:focus`, `:disabled`, `[aria-invalid]`, `::placeholder`), que
  é onde mora a consistência entre telas. Propriedade inline que o baseline também governa vale
  como estado desligado, não como duplicação.
- Ao migrar inline → classe, listar quais estados o elemento passa a receber e declarar isso no
  spec como diferença visual esperada. Descobrir na review é tarde: vira dúvida de regressão.
- Antes de criar modificador para cada propriedade do inline, ler a regra de destino inteira —
  parte já pode estar lá (`width: 100%` já estava em `.delivery-view__input`), e modificador que
  não muda pixel nenhum fica no CSS parecendo intencional.

---

### Escala responsiva que vive em JavaScript vira token, não media query em cada tela
*Adotado em 2026-08-02 (rodada 21 do ciclo, F018 fatia 8). Precedente: `src/styles/tipografia.css`.*

`src/constants/sizes.js` calcula tamanhos por faixa de largura (`getSizes(width).pad`,
`.gap`, `.fontMd`…) e o valor viaja pela árvore como prop `sz`. O custo não é o
`style` inline: é a **prop que atravessa componentes que não a usam** só para chegar
ao neto, e o `useResponsive` que re-renderiza a tela inteira a cada pixel de resize.

A conversão que funciona, na ordem:

1. **Um token em `src/styles/tema.css`**, não um arquivo novo por grandeza. Arquivo
   próprio (como `tipografia.css`) se justifica quando a escala tem dezenas de tokens;
   para um, é abstração para o futuro.
2. **Reta entre os dois extremos da curva antiga**, escrita como `min()`/`max()` ou
   `clamp()`: `--gm-pad: min(14.9px + 0.86vw, 48px)` passa por 18px em 360 e 48px em
   3840. Os degraus intermediários viram variação contínua — a tela deixa de "pular"
   ao cruzar breakpoint, que é ganho de UX e não só de código.
3. **Degrau real vira `@media` explícita**, depois do `:root` (mesma especificidade,
   quem decide é a ordem). `clamp()` não faz degrau; se a curva antiga tinha uma queda
   de propósito (aqui 18 → 12px abaixo de 360), ela fica escrita como exceção.
4. **Só então apagar a prop de ponta a ponta** — assinatura, pass-down e o
   `const sz = getSizes(width)`. Componente que fica sem prop nenhuma fica assim.

Duas conferências que a fatia exige:

- **Antes de escrever o `clamp()`, checar se cada argumento entra em jogo.** Piso que
  exigiria viewport negativo é CSS morto com cara de intencional — use `min()` e
  deixe o piso na media query, onde ele de fato mora.
- **`grep` do token antes de criar**: pode já existir referência com fallback
  (`var(--gm-pad, 16px)`) escrita por quem esperava o token. Criar o token faz aquela
  linha mudar de comportamento — é efeito colateral legítimo, mas vai declarado.

Aplicável às outras propriedades do `sz` e aos **15 arquivos** que ainda chamam
`getSizes`. `src/constants/sizes.js` só some quando o último sair.

---

### Migração de estilo em massa: script que conta antes de gravar, e não grava se a conta não bate
*Adotado em 2026-08-02 (rodada 22 do ciclo, F018 fatia 9). Arquivo da rodada:
`src/components/desktop/views/DeliveryView.jsx`, 119 → 28 `style={{`.*

Trocar dezenas de `style={{…}}` por `className` à mão é caro e erra em silêncio; um
`replace all` cego é barato e erra pior — o mesmo bloco de estilo aparece em componentes
que **não** estão na fatia. Nesta rodada, três blocos idênticos aos migrados viviam em
`AbaEntrega` (linhas 2660, 2684 e 2690), que é escopo da fatia 10. Um replace-all os
teria migrado junto, sem aparecer em lugar nenhum do relatório.

O formato que funciona é um script `.cjs` no scratchpad onde **cada substituição declara
quantas ocorrências espera**, e o arquivo só é gravado se todas baterem:

```js
function rep(name, from, to, esperado) {
  const n = s.split(from).length - 1;
  if (n !== esperado) { erros.push(name + ": esperava " + esperado + ", achou " + n); return; }
  s = s.split(from).join(to);
}
// …
if (erros.length) { console.log(erros.join("\n")); process.exit(1); }  // nada é gravado
fs.writeFileSync(p, s);
```

Três consequências que valem para a próxima fatia:

- **Acumular os erros em vez de lançar no primeiro** faz uma rodada de execução revelar
  todos os padrões ambíguos de uma vez, em vez de uma execução por ambiguidade.
- **Contagem que não bate é informação, não obstáculo**: ela apontou exatamente os três
  gêmeos fora de escopo. Desambiguar é estreitar a âncora (incluir a indentação, ou um
  pedaço do handler: `setConfirmarVoltar(false)} className=…`), nunca subir o esperado.
- **Neste `.css`, âncora de seletor precisa do `{\n`.** O arquivo declara a mesma classe
  duas vezes de propósito — a regra estrutural (multi-linha) e a gêmea de uma linha só no
  bloco de TIPOGRAFIA (`.delivery-view__editor-titulo { font-size: … }`). Ancorar em
  `\n.delivery-view__X {` casa as duas; ancorar em `\n.delivery-view__X {\n` casa só a
  estrutural.

Vale também a conferência final, que é uma linha de Node: extrair todo
`componente__[a-z0-9-]+` do JSX e todo `.componente__…` do CSS e listar a diferença. Ela
pega classe aplicada sem regra — o erro que nem o `vitest` (não lê CSS) nem o `vite build`
(CSS órfão compila) reclamam.

E, na mesma passada, **conte o helper que a migração está substituindo**. Se a fatia apaga a
última chamada de `alfa(`/`varColor(`/`inputStyle(` do arquivo, o import fica órfão no topo e
as duas suítes de gate continuam verdes — import não usado é código válido. Foi o que
aconteceu na fatia 10 do `DeliveryView.jsx` com o `alfa`. A regra: contagem do helper que cai
a **zero** é ordem de apagar o import, não resultado neutro.

---

## Padrões de API

### Formato de Resposta
- Respostas seguem envelope consistente com `data`, `error` e `meta` (paginação/cursor quando aplicável).
- Toda resposta é validada por schema (Zod) antes de chegar à UI; dados fora do contrato são rejeitados explicitamente.
- Contrato canônico de endpoints e exemplos em `docs/07_APIS/`.

### Tratamento de Erros
- Erros têm **código estável** (string), mensagem legível e, quando útil, detalhes por campo.
- Falhas nunca são silenciadas: a UI sempre reflete o erro de forma acionável.
- Erros esperados (validação, permissão) são tratados localmente; erros inesperados sobem para uma fronteira de erro global.
- Padrão detalhado em `docs/07_APIS/error-handling.md`.

---

## Padrões de UI/UX

### Feedback de Ações do Usuário
- Toda ação do usuário gera feedback visível em até 100ms (otimista) ou com indicador de progresso.
- Sucesso, erro e estado vazio são tratados explicitamente — nunca uma tela "muda".
- Mensagens seguem o tom de voz definido em `memory/identity.md`.

### Estados de Loading
- Três estados sempre considerados: **carregando**, **vazio** e **erro**, além do estado de sucesso.
- Preferir *skeletons* a spinners em telas com layout previsível.
- Evitar saltos de layout (layout shift) ao carregar conteúdo.

### "Ainda não sei" nunca é dito como "não existe"

*Adotado em 2026-08-01 (aba "Minha assinatura", S1-3).*

Tela de leitura só pode **afirmar** o que já tem em mãos. Antes de escrever uma
frase categórica ("não há assinatura cadastrada", "nenhum pagamento
registrado"), o componente checa se o dado que a sustenta chegou:

- **Contexto ainda em voo** (`tenant`/`assinatura` nulos no bootstrap) é
  *carregando*, não *vazio*: `MinhaAssinaturaTab.jsx` retorna cedo enquanto
  `tenant?.id` é nulo, em vez de renderizar "ainda não há assinatura".
- **Falha de leitura** é *erro com "Tentar de novo"*, nunca lista vazia — vazio
  por falha de rede faz o dono pagar de novo o que já pagou.
- **Zero real** é afirmado por escrito, com o motivo ("nenhum pagamento em
  vigor: 1 lançamento foi cancelado"), para não parecer carregamento travado.

Vale para qualquer tela que responda pergunta de dinheiro ou de acesso: a
diferença entre "não sei" e "não tem" é a diferença entre esperar e agir.

### Fallback de nome nunca é o código técnico

*Adotado em 2026-08-01 (S1-3).*

Quando o rótulo humano vem de outra tabela e a leitura falha, o fallback é uma
**frase neutra** ("Plano contratado"), nunca o identificador cru (`medio`,
`fiscal_integracoes`). Código na tela é jargão técnico (Princípio nº1) e o
usuário não tem como traduzir. Vale para plano, módulo, método e status.

### Rótulo de status é componente, nunca cópia entre telas

*Adotado em 2026-08-02 (CONSOLE-UX rodada 1).*

`SeloStatus` vivia dentro de `PlanosDashboard.jsx`. Quando a lista de
estabelecimentos do Console passou a mostrar a mesma situação de assinatura, a
saída fácil seria repetir o mapa `status → texto` no `ConsolePage.jsx` — e a
partir daí qualquer ajuste de vocabulário em um lado faria as duas abas
discordarem sobre o mesmo tenant ("Ativo" numa, "Em atraso" na outra), sem o
dono ter como saber qual acreditar. O selo virou
`src/components/console/SeloStatus.jsx` + `.css` (decisão 018) e as duas telas
importam. Regra: **enum de domínio que vira texto na tela mora em um
componente só**, e o segundo consumidor extrai em vez de copiar.

Junto vale a outra metade: as duas telas também precisam calcular o status
pela **mesma função** (`resumirPlataforma`, que recalcula pela data em vez de
ler o campo em cache). Texto igual com conta diferente diverge do mesmo jeito.

### O que o servidor confirmou tem precedência sobre o contexto

*Adotado em 2026-08-01 (S1-3-IDENTIDADE).*

Tela que salva por RPC e decide "mudou?" comparando o formulário com o que veio
do `AppContext` precisa guardar, em estado local, **o que a RPC devolveu** — e
ler dele primeiro. Sem isso, "salvou com sucesso" fica dependendo de o contexto
repintar: o banner de sucesso não acende, ou pisca e some, e o botão de salvar
continua aceso como se nada tivesse ido ao banco. Em `IdentidadeTab.jsx` é o
`temaSalvo`, alimentado com `data?.tema` e, quando a RPC não devolve linha, com
o que acabou de ser enviado.

O sintoma é sempre o mesmo: o feedback de sucesso funciona no navegador (porque
o contexto recarrega logo depois) e falha no teste, onde o contexto é estático.
O teste está certo — quem depende de um repintar assíncrono para dizer "salvo"
está afirmando antes de saber.

### Pasta nova dentro do bucket que já existe

*Adotado em 2026-08-01 (S1-3-IDENTIDADE).*

As policies de Storage da `20260826` casam pela **primeira** pasta do caminho
(`(storage.foldername(name))[1] = tenant`). Então qualquer arquivo novo por
tenant cabe em `{tenant_id}/<assunto>/<arquivo>` dentro do `delivery-fotos` já
autorizado, isolado e público — sem bucket novo, sem policy nova, sem mais um
passo manual em produção (e sem repetir o deadlock `40P01` documentado naquela
migration). O logo do estabelecimento mora em `{tenant_id}/identidade/logo.png`.

Trade-off assumido: o nome do bucket fica menos literal do que o conteúdo.
Bucket novo só quando a **regra de acesso** for diferente — não quando só o
assunto for.

---

## Padrões de Processo

### Fluxo de PR
- Branches curtas e focadas; um PR resolve uma unidade lógica de trabalho.
- Todo PR referencia o item de backlog ou ADR correspondente.
- PR só entra com descrição clara, critérios de aceite atendidos e checagens automáticas verdes.

### Revisão de Código
- Mínimo de **1 revisor** para mudanças comuns; **2 revisores** para segurança, dados ou arquitetura.
- Revisão verifica aderência aos padrões deste arquivo e às restrições em `memory/restrictions.md`.
- Feedback é sobre o código, nunca sobre a pessoa (ver cultura em `memory/learnings.md`).

### Fluxo de entrega com dois Claudes (implementa-aqui → aplica-no-VS-Code)
*Adotado em 2026-07-12. Método de trabalho entre o Claude do ambiente remoto (Cowork/web) e o Claude Code do VS Code local.*

Divisão de trabalho que evita o vaivém de copiar arquivo à mão e mantém o
Git como fonte única de verdade:

1. **Claude remoto (aqui) implementa e versiona.** Escreve o código
   (front, RPC/migrations, Edge Functions), roda `npm test`, **commita e
   dá push** na branch de trabalho designada. O código nasce completo e
   testado no Git — não em texto colado no chat.
2. **Claude do VS Code aplica o que exige a máquina/painel do dono.** Puxa
   a branch (`git pull`) e executa só o que o Claude remoto **não** tem
   acesso para fazer: aplicar migrations no Supabase (SQL Editor),
   deployar Edge Functions, subir `npm run dev` para validar local, mexer
   em variáveis de ambiente/Vercel.
3. **O handoff é um prompt curto e explícito**, não o código: qual branch
   puxar, qual migration aplicar (e onde), o que testar. O código já está
   no Git; o prompt só diz o que fazer com ele.

Regras do fluxo:
- **Git é a ponte, nunca o copiar-e-colar.** Nada de mandar arquivo inteiro
  no chat para o dono colar — isso diverge e perde histórico. Push primeiro.
- **Cada Claude faz só o que pode fazer com segurança.** O remoto não tem a
  service_role nem o painel; o do VS Code tem a máquina do dono. Respeitar a
  fronteira evita segredo vazado e passo cego.
- **Toda migration nova avisa que precisa ser aplicada** no Supabase antes de
  o front que depende dela funcionar (senão vira erro `function ... does not
  exist`). O aviso vai explícito no handoff.
- **Destino final é sempre a `main`** (workflow "tudo direto na main",
  decisão do dono em 2026-07-12): valida local → merge na `main` → Vercel
  publica sozinha.

## Estado de tela que mora na URL (Console, rodadas 33–35)

Recorte de situação, aba aberta e período do uso vivem na URL do Console
(`/console?aba=uso&situacao=atencao&dias=90`). O molde, já repetido três vezes,
é sempre o mesmo — copie-o antes de inventar outro:

1. **Normalizador puro** exportado em `src/lib/console.js`
   (`normalizarFiltroSituacao`, `normalizarAba`, `normalizarPeriodo`): recebe o
   texto cru do parâmetro e devolve sempre um valor válido. Não lê `window`,
   não toca no roteador — por isso tem teste de unidade barato. URL editada à
   mão nunca deixa a tela vazia.
2. **A página lê** com `searchParams.get(...)`; não existe `useState` espelhando
   o parâmetro (dois donos do mesmo valor sempre divergem).
3. **A escrita parte de `new URLSearchParams(atual)`** dentro de
   `setSearchParams((atual) => ..., { replace: true })`: cada escrita mexe só na
   própria chave, então os três parâmetros convivem, e o `replace` impede que
   trocar de aba/recorte vire histórico que o "voltar" precise desfazer.
4. **O valor padrão apaga o parâmetro** (`proximo.delete(...)`) em vez de
   escrevê-lo — o endereço fica limpo quando nada foi escolhido.
5. **Componente filho fica controlado**, não guarda o estado
   (`AnalyticsDashboard` recebe `dias` e `aoTrocarPeriodo`): ele não conhece o
   roteador e o teste dele roda sem `MemoryRouter`.

Fora da URL de propósito: o **termo da busca**. Nome de cliente digitado é dado
de terceiro e não deve entrar no histórico do navegador nem em link colado.

Teste dessa família: `MemoryRouter` nunca toca `window.location` — o endereço só
pode ser lido por um espião com `useLocation()` renderizado ao lado da tela
(`EspiaoURL` em `ConsolePage.test.jsx`).

## Botão que copia para a área de transferência (Console, rodada 37)

O cartão de primeiro acesso copia a mensagem que o dono manda ao cliente logo
depois da venda. O molde vale para qualquer botão de copiar:

1. **O texto nasce de uma função pura** exportada
   (`montarMensagemPrimeiroAcesso` em `src/lib/console.js`): o JSX não monta
   string. Assim o teste de tela compara o que foi copiado com o retorno da
   própria função — se ela mudar, a tela acompanha sozinha.
2. **`navigator.clipboard.writeText` dentro de `try/catch`**, com dois estados
   (`copiado` e `copiaFalhou`). Contexto não seguro e permissão negada existem;
   engolir a falha é pior do que não ter o botão, porque o dono acha que copiou
   e manda mensagem vazia. No `catch`, a tela mostra a mensagem num `textarea`
   somente leitura para copiar à mão.
3. **Senha nunca entra no texto copiado.** Ela é digitada no cadastro e não é
   relida de lugar nenhum; a mensagem diz para enviá-la em outro canal. Área de
   transferência e histórico de conversa não são lugar de senha.
4. **Teste:** jsdom não tem área de transferência. Dublar depois do
   `userEvent.setup()` com
   `Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true })`
   — e o caso de falha é `writeText.mockRejectedValue(...)`, que prova que a
   tela não mente.

## Duas escritas em sequência: sucesso parcial nunca vira erro (Console, rodada 38)

O cadastro de estabelecimento faz duas escritas: a Edge Function `provisionar-estabelecimento`
(irreversível — cria `auth.users`) e, em seguida, a RPC `definir_mensalidade_tenant` que grava o
preço combinado. O molde, reusável em qualquer fluxo com uma escrita irreversível seguida de outra:

1. A irreversível vem primeiro; a segunda só roda se a primeira devolveu `data`.
2. Falha da segunda **não** desfaz nem apaga nada, e **não** é reportada como falha da operação:
   o retorno carrega um sinalizador (`mensalidadeFalhou`) e a tela mostra a confirmação normal
   mais um aviso dizendo o que ficou de fora e onde resolver.
3. O estado de "enviando" só sai depois das duas — senão a tela de sucesso aparece no meio.
4. Valor opcional que vale zero (cortesia, piloto) não chama a RPC à toa: zero e vazio são o
   mesmo caminho.

Implementado em `src/components/console/NovoEstabelecimentoModal.jsx` e no cartão de
`src/pages/console/ConsolePage.jsx` (`.console__acesso-alerta`).

## Regra do servidor espelhada no cliente: para avisar, nunca para decidir (Console, rodada 45)

O endereço público do estabelecimento (`tenants.slug`) é derivado e resolvido no
banco: `slugify_tenant` (20260741) apaga acento e tudo que não é `[a-z0-9]`,
`slug_reservado` (20260803) proíbe uma lista de rótulos, e o laço de
`provisionar_tenant` resolve colisão com sufixo numérico. Tudo isso acontecia
**calado**: "Bar do Zé" virava `bardoze`, e um segundo virava `bardoze2` sem
ninguém saber. O molde que resolveu, reusável sempre que o servidor normaliza ou
renomeia algo que o usuário digitou:

1. **O cliente reimplementa a regra como função pura exportada** e diz no JSDoc
   de qual objeto do banco ela é espelho (`normalizarSlug`, `sugerirSlugLivre`,
   `SLUGS_RESERVADOS` em `src/lib/console.js`). O banco continua sendo a
   autoridade — CHECK constraint e laço da RPC seguem lá.
2. **O campo mostra o valor já normalizado a cada tecla.** O que está na tela é
   exatamente o que o servidor vai gravar; nada de o usuário digitar "Bar-do Zé"
   e descobrir depois que virou `bardoze`.
3. **Estado derivado, não `useEffect`.** `slugEfetivo = slugTocado ? slug :
   normalizarSlug(nome)` — enquanto ninguém editou, o endereço É o nome
   normalizado, então não existe frame mostrando um valor velho. Depois de
   editado, para de seguir o nome (senão a escolha do dono seria apagada a cada
   letra corrigida no nome).
4. **Conflito vira escolha, não surpresa:** a mensagem de erro traz o primeiro
   endereço livre e um botão que o aplica em um clique — a mesma sugestão que a
   RPC usaria calada.
5. **Deriva entre as duas pontas é fixada por teste.**
   `src/lib/provisionamentoValidacao.test.js` importa o `normalizarSlug` da Edge
   Function e o do Console e prova, com `it.each` sobre as mesmas entradas, que
   os dois concordam — inclusive no `MAX_SLUG`. Espelho sem esse teste desalinha
   na primeira mudança de um dos lados.
6. **Lista vazia não inventa conflito.** `slugsEmUso` vazio significa "não sei de
   nenhum ocupado" (tenants ainda carregando), não "está tudo livre": o cliente
   não bloqueia, e o banco segue como barreira final.

## Campo com ação no rótulo: o botão fica fora do `<label>` (Console, rodada 46)

O padrão de campo do projeto é `<label>` envolvendo o input — funciona porque o
label não tem nada dentro além do texto e do próprio campo. Quando o campo ganha
uma **ação** ("Gerar senha", "Colar", "Sugerir"), esse padrão quebra:

1. `<button>` dentro de `<label>` entra no nome acessível dos dois. O botão passa
   a se chamar o texto inteiro do label (no caso da senha, incluindo o **valor
   digitado**, que o leitor de tela anuncia em voz alta) e o input fica sem nome.
   `getByLabelText` devolve o botão, não o campo.
2. A forma certa é abrir o wrapper: `<div className="nem-campo">` com
   `<label htmlFor="x">` e `id="x"` no input, e o botão como irmão do label dentro
   de uma linha (`.nem-label-linha`, flex com `space-between`). Custa um `id`
   fixo — aceitável em modal singleton, que é o caso.
3. Deixe um comentário no JSX dizendo por que **este** campo destoa dos vizinhos,
   senão a próxima passada "padroniza" de volta e reintroduz o bug.
4. A suíte pega isso de graça se os testes de tela usarem `getByLabelText` e
   `getByRole("button", { name })` em vez de seletor de classe: nove testes
   falharam juntos e o erro do Testing Library já imprimiu o nome acessível
   errado, com a causa visível na primeira leitura.

## Aviso que orienta sem decidir: força de senha no Console (rodada 46)

A validação que **barra** o envio é a regra da borda (o `MIN_SENHA = 6` da Edge
Function, espelhado no cliente). A força da senha é outra categoria: opinião, não
regra.

1. Função pura exportada (`forcaDaSenha` em `src/lib/console.js`) devolvendo
   `{ nivel, motivo }` — nunca um booleano. O nível pinta, o motivo explica em
   português o que está errado ("é uma das primeiras que qualquer invasor tenta",
   "é igual ao usuário de acesso"), e a tela não precisa saber a regra.
2. Ela **nunca** entra no `validar*` nem no `disabled` do botão. Quem já decidiu
   passa; quem não pensou é avisado. Um teste de tela fixa isso ("o aviso avisa,
   mas não bloqueia") para ninguém "melhorar" depois.
3. Campo vazio devolve `nivel: ""` — não existe avaliar o que ainda não foi
   digitado, e reprovar um campo intocado é o oposto de prevenção de erro.
4. Sorteio de senha é `crypto.getRandomValues` com rejeição de resto
   (`Math.floor(2^32 / n) * n`), nunca `Math.random` nem `% n` direto no valor
   cru — o módulo sem rejeição enviesa os primeiros símbolos do alfabeto.
5. Alfabeto de senha lida em voz alta não tem `0 O o 1 l i` nem maiúscula: a
   senha é ditada ao cliente na hora da venda, e "erro de digitação do cliente" é
   um chamado de suporte com cara de bug.
6. Se a heurística de força reprovar a senha que o **próprio botão** gera, o
   botão se desmente. O caso "10 caracteres, minúscula + dígito" precisa cair em
   "forte", e há teste amarrando as duas funções (`a senha gerada é lida como
   forte`).

## Recusa do servidor vira escolha de um clique, com contagem por texto (Console, rodada 47)

Segunda aplicação do molde da rodada 45 (endereço do cardápio), agora no usuário
de acesso — `sugerirUsuarioLivre` em `src/lib/console.js`. O que se repete e vale
para o próximo campo que colidir:

1. A sugestão só nasce depois de o **servidor** recusar. O Console não lê
   `public.users`, então sugerir antes seria inventar conflito. Quem verifica é o
   envio; a tela só oferece a saída depois do "não".
2. Guardar a **contagem de recusas do mesmo texto**, não o histórico de
   candidatos. `recusasDeUsuario` cresce a cada recusa e zera em QUALQUER
   mudança do campo — digitação ou clique na própria sugestão. Assim o candidato
   nunca se repete e o código não precisa lembrar o que já ofereceu.
3. O candidato distingue pelo estabelecimento antes de recorrer ao número
   (`barze` → `barze.bardoze` → `barze.bardoze2`). Número puro é a última opção,
   porque `admin2` não diz de quem é.
4. Sufixo nunca é cortado pelo limite de tamanho; a base é. Cortar o número faria
   dois candidatos diferentes virarem o mesmo texto.
5. O candidato precisa passar na validação que a própria tela aplica e ser
   sempre diferente do que foi recusado — os dois viram teste, porque a truncagem
   de base longa consegue devolver exatamente o valor recusado.
6. O botão vive DENTRO do `<span className="nem-erro-campo">`: o dono lê o
   problema e a saída no mesmo lugar. Classe `.nem-sugestao` já existe — campo
   novo com conflito reusa, não cria estilo.

## Campo derivado de outro campo: as três peças (Console, rodada 48)

Segunda aplicação do molde da rodada 45 (endereço do cardápio derivado do nome do
estabelecimento), agora no usuário de acesso derivado do nome do responsável —
`usernameSugeridoDoNome` em `src/lib/console.js` e `usernameEfetivo` em
`NovoEstabelecimentoModal.jsx`. O campo derivado tem sempre estas peças:

1. **Uma função pura** que traduz o campo de origem no campo de destino, testada
   sozinha. Nada de derivar inline no JSX.
2. **`xTocado` + `xEfetivo`, nunca `useEffect`.** `const xEfetivo = xTocado ? x :
   derivar(origem)`. Enquanto ninguém tocou, o campo É a derivação, então não
   existe renderização em que a tela mostre valor velho. Daí para baixo — payload,
   validação, força da senha, sugestão de conflito — o que vale é sempre
   `xEfetivo`; deixar um único ponto lendo o estado cru é o bug clássico.
3. **Editar trava a derivação para sempre, inclusive apagar.** O `onChange` marca
   `xTocado` antes de tudo. Campo esvaziado é escolha do dono, não convite a
   preencher de novo. Aceitar uma sugestão de um clique passa pelo mesmo `onChange`,
   então também trava.

Duas consequências que só aparecem na segunda vez:

- **A derivação devolve `""` quando não dá para derivar bem.** Nome que produz menos
  de `MIN_USERNAME` caracteres não vira `ze`: vira campo vazio, e a validação de
  envio explica o que falta. Campo preenchido com algo que a própria tela vai
  recusar é pior que campo vazio — o dono não tem como adivinhar o motivo.
- **Mexer na ORIGEM tem de limpar o erro do destino.** Se o servidor recusou
  `josemaria` e o dono troca o responsável para "Ana Paula", o campo já mostra
  `anapaula`: manter na tela o erro (e a contagem de recusas) de um texto que não
  existe mais faz a sugestão nº 2 aparecer sobre um usuário nunca enviado.
