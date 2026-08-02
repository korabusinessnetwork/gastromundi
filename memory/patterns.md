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
