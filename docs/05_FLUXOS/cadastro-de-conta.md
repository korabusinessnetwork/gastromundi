# Cadastro de conta pelo site (kora.codes)

## O que é

A porta comercial da plataforma: quem chega em `kora.codes` sem ser cliente
consegue **pedir a própria conta** — diz quem é, qual é o negócio, em que
endereço quer ficar e com qual plano quer começar. O pedido entra numa fila
que o dono da plataforma resolve no Console; ao aprovar, nasce o
estabelecimento **com o responsável como administrador dele**.

Substitui o desenho anterior, em que o "Entrar" do site levava direto ao
`/login` — que no domínio nu cai no estabelecimento de *fallback*. Ou seja: a
porta da plataforma abria o login de **um cliente específico**, com a marca
dele, e quem era cliente de outro nem conseguia entrar (a credencial vive no
namespace do endereço dele, `usuario@<slug>.local` — ADR-009). Decisão 035.

## As duas portas

| Rota | Quem usa | O que faz |
|------|----------|-----------|
| `/entrar` | Já é cliente | Pergunta o endereço do estabelecimento, confere pela RPC pública `branding_por_slug` e redireciona para `https://<endereço>.kora.codes/login` |
| `/criar-conta` | Ainda não é cliente | Registra o pedido de conta (`registrar_solicitacao_conta`) |

Ambas só existem no **apex** (`ehApexInstitucional()`); em subdomínio de
tenant, dev ou preview elas redirecionam para `/login` — lá o host já diz qual
é o estabelecimento e não há o que perguntar.

`/entrar` é **fail-open** quando a conferência do endereço falha por rede:
segue para o endereço mesmo assim. Quem sabe dizer se o endereço existe é a
tela de lá, e prender a pessoa numa mensagem de erro seria pior — o login do
estabelecimento dela pode estar perfeitamente no ar. Endereço que a RPC
responde "não existe" (sem erro de rede) **não** redireciona: mostra
"não encontramos" ali mesmo.

## Por que é PEDIDO, e não criação na hora

Criar estabelecimento é ato da **plataforma** (decisão 027): a RPC
`provisionar_tenant` e a Edge Function `provisionar-estabelecimento` exigem
super-admin `plataforma`. Abrir isso ao anônimo daria a qualquer script o
poder de fabricar tenants, endereços e usuários de auth.

Então o visitante **solicita**; quem cria continua sendo o Console, com um
clique a mais e nenhuma porta nova no banco.

## O que o cadastro coleta

Responsável (nome, WhatsApp, e-mail), nome do estabelecimento, endereço
desejado e o plano de interesse (presets do site — valores de referência,
não cobrança).

**Nenhuma senha.** Senha guardada em tabela de pedido é segredo em texto
claro; a credencial nasce no provisionamento e chega ao cliente pelo cartão
de primeiro acesso que o Console já emite.

O endereço se escreve sozinho a partir do nome do negócio (`normalizarSlug`,
espelho de `slugify_tenant`) e continua editável. Endereço reservado é
recusado na tela; endereço já ocupado é recusado **pelo banco**, que devolve
o próximo livre — a tela oferece "Usar bardoze2" a um clique.

## Banco (migration `20260926_solicitacoes_conta.sql`)

- Tabela `public.solicitacoes_conta` — **sem `tenant_id` na origem**: quem
  pede ainda não é estabelecimento (decisão 017). O `tenant_id` é preenchido
  na aprovação e é o vínculo entre a pessoa e o estabelecimento que nasceu
  para ela.
- RLS ligada e **fechada**: sem policy de escrita, sem GRANT para `anon`.
  Leitura só do super-admin (`is_super_admin()`).
- `registrar_solicitacao_conta(...)` — única porta pública (SECURITY DEFINER,
  `anon` + `authenticated`). Valida tudo de novo no banco, normaliza o
  endereço, recusa reservado/em uso (com sugestão livre) e tem os dois freios
  de abuso do padrão da casa: 3 envios por contato e 30 no site, ambos em
  10 minutos.
- `decidir_solicitacao_conta(id, status, tenant_id, observacao)` — aprova ou
  recusa. Guarda de `is_super_admin()` **antes de qualquer escrita**; aprovar
  exige o `tenant_id` do estabelecimento criado (sair de "pendente" sem que
  nada tenha nascido seria mentir na fila); pedido já decidido não é decidido
  de novo.

Guard de regressão do texto da migração:
`src/lib/solicitacoesSqlGuard.test.js`.

## Console — aba "Pedidos de conta"

- Lista quem está esperando, **do mais antigo para o mais novo** (quem pediu
  primeiro espera há mais tempo), com selo de contagem no nome da aba.
- Cada cartão traz o que decide a conversa: negócio, endereço pedido,
  contato clicável (WhatsApp/e-mail), plano e valor de referência.
- **Aprovar = criar**: abre o formulário "Novo estabelecimento" já preenchido
  (nome, endereço, responsável). Quando o estabelecimento nasce, o pedido sai
  da fila vinculado a ele e a tela volta para "Estabelecimentos", onde está o
  cartão de primeiro acesso.
- **Recusar** pede confirmação, com motivo opcional guardado no pedido.
- Falha de leitura **diz que não sabe** em vez de mostrar "nenhum pedido" —
  vazio silencioso aqui é cliente novo sem resposta.
- Falha ao dar baixa depois de criar o estabelecimento vira **aviso** no
  cartão de acesso: o estabelecimento existe, e o risco é o dono aprovar o
  mesmo pedido duas vezes.

## Arquivos

| Camada | Arquivo |
|--------|---------|
| Telas | `src/pages/apex/ApexEntrarPage.jsx` · `ApexCriarContaPage.jsx` · `ApexPortaShell.jsx` · `ApexPorta.css` |
| Catálogo comercial do site | `src/pages/apex/catalogoDoSite.js` (compartilhado com `ApexPlanos`) |
| Dados | `src/lib/solicitacoes.js` (público) · `src/lib/console.js` (`listarSolicitacoes`, `decidirSolicitacao`, `pendentesPrimeiro`, `resumirPlanoSolicitado`) |
| Endereço (slug) | `src/lib/slugEstabelecimento.js` — regras compartilhadas entre Console e site, sem dependências (entra no bundle público) |
| Console | `src/components/console/SolicitacoesFila.jsx` + `.css` |
| Banco | `supabase/migrations/20260926_solicitacoes_conta.sql` |

## Por que é intuitivo (princípio nº 1)

- **Uma pergunta por vez**: quem já é cliente responde "qual é o seu
  endereço"; quem não é encontra a porta de cadastro logo abaixo, na mesma
  tela, sem ter que adivinhar.
- **A pessoa vê para onde vai**: o endereço completo (`bardoze.kora.codes`)
  aparece embaixo do campo enquanto ela digita, nas duas telas.
- **Prevenção de erro**: endereço reservado é barrado antes do envio;
  endereço ocupado volta com o próximo livre a um clique, em vez de pedir
  que a pessoa invente outro nome.
- **A confirmação não promete o que não houve**: ninguém entrou em lugar
  nenhum — a tela diz que vamos preparar o KORA e chamar no WhatsApp com o
  acesso.
- **No Console, trabalho parado é visível**: o número de pedidos esperando
  fica no nome da aba, sem depender de o dono lembrar de abri-la.
