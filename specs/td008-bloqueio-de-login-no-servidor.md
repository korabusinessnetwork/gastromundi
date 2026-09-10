# TD008 — o bloqueio de tentativas de login sai do navegador e vai para o servidor

**Item:** TD008 (`docs/09_BACKLOG/tech-debt.md`) · **Rodada:** 65 · **Data:** 2026-09-10

## O problema, em uma frase

A tela de login promete "Bloqueio após 5 tentativas" (`src/pages/LoginPage.jsx:278`), e
quem conta essas cinco é o `localStorage` do navegador de quem está tentando entrar
(`src/utils/session.js:183`, `ATTEMPT_KEY`). Duas linhas no console do navegador apagam o
contador, e a promessa da tela vira enfeite: o atacante segue chutando senha sem nunca ver
"Conta bloqueada".

O próprio `session.js` já admite isso por escrito ("Isto não é barreira de segurança"). O
que falta não é consciência do buraco, é o freio existir do lado que o cliente não controla.

## Por que o padrão do `senha_admin_tentativas` não cola direto

`verificar_senha_admin` (20260802) conta falhas em `public.senha_admin_tentativas` com
`auth_id = auth.uid()` como chave. Isso funciona porque a senha de gerente é digitada por
alguém **já logado**.

No login não existe `auth.uid()`: a chamada acontece antes da sessão. Então a chave tem que
ser algo que o cliente informa, e a função tem que ser alcançável pela role `anon`. É o
mesmo desenho do rate-limit do delivery público (`20260921_delivery_rate_limit_sem_telefone.sql`),
que já roda com a chave anon neste projeto.

**Chave escolhida:** o próprio e-mail que o login monta, `username@slug.local`
(`emailDoLogin`, `src/lib/tenantSlug.js:252`). Ele já namespaceia por tenant, então o mesmo
`admin` em dois estabelecimentos tem dois contadores, e o cliente não precisa mandar nada
que ele já não mande ao Supabase Auth um instante depois.

## Escopo

Entra:

1. Migration nova criando `public.login_tentativas` (RLS ligada, **sem policy**, no molde do
   `senha_admin_tentativas`) e três funções `SECURITY DEFINER` com `SET search_path`:
   - `login_tentativas_estado(p_chave text)` — consulta, não conta (`anon`);
   - `login_tentativas_falha(p_chave text)` — só soma (`anon`);
   - `login_tentativas_sucesso()` — zera, **sem parâmetro**, chave tirada do e-mail do JWT (`authenticated`).
2. `login()` (`src/context/AppContext.jsx`) consultando o servidor antes de chamar o
   `signInWithPassword` e registrando o desfecho depois.
3. O contador de `localStorage` rebaixado a **espelho do servidor**: continua alimentando os
   pips de `LoginPage`, e deixa de ser quem decide o bloqueio.
4. Teste da regra e da degradação.
5. `supabase/schema.sql` descrevendo a tabela nova (exigência do guard do TD016).
6. Pendência de aplicar a migration registrada em `.full-auto/PENDENCIAS-DO-MATHEUS.md` com a URL do GitHub.

Não entra: captcha/Turnstile, mudar o rate limit do próprio Supabase Auth, bloqueio por IP,
e qualquer coisa que custe dinheiro (regra de bootstrap do `CLAUDE.md`).

## Números, e por que exatamente estes

Os mesmos que a tela promete hoje, para o comportamento visível não mudar:

| Regra | Valor | De onde vem |
|---|---|---|
| Falhas até bloquear | 5 | `MAX_ATTEMPTS`, e o texto de `LoginPage.jsx:278` |
| Duração do bloqueio | 2 minutos | `LOCKOUT_MS` |
| Janela em que as falhas somam | 15 minutos | `JANELA_TENTATIVAS_MS` |

Mudar qualquer um deles junto com a mudança de lugar misturaria duas coisas na mesma
rodada: quem olhasse o resultado não saberia se o comportamento novo veio do servidor ou do
número novo.

## Três decisões que precisam estar escritas

### 0. Quem zera o contador não pode ser o `anon`

O desenho óbvio, uma função `registrar(chave, sucesso boolean)` liberada para o `anon`, tem um
buraco que anula a rodada inteira: bastaria chamá-la com `sucesso => true` entre as tentativas
para zerar o próprio contador, e o freio voltaria a ser contornável, só que agora do lado do
servidor. Por isso são três funções, e a que zera não recebe chave por parâmetro: ela lê o
e-mail do próprio JWT e só é concedida a `authenticated`. Ao `anon` sobram ler o estado e somar
falha, duas coisas que ele já consegue fazer errando senha de verdade.


### 1. A checagem falha ABERTA quando a RPC não responde

Se a chamada de estado der erro (rede caída, migration ainda não aplicada, função revogada),
o login **segue** e cai no contador local, como hoje.

O sentido é o oposto do TD009 etapa 3, onde a gravação de venda falha fechada de propósito,
e a diferença é qual estrago cada escolha causa. Lá, fingir sucesso deixava dinheiro fora do
relatório. Aqui, falhar fechado significa que um problema no banco impede o caixa de abrir:
o restaurante para de vender por causa de um *freio*. E não é desproteção total, porque o
rate limit do próprio Supabase Auth continua no caminho, do lado do servidor, sempre.

O registro da falha que não completa também não derruba o login: `login_tentativas_falha` é
melhor-esforço, e o pior caso é uma tentativa não contada.

### 2. O limite conhecido: dá para bloquear a conta de outra pessoa

Contagem por usuário no servidor tem um preço conhecido: qualquer um que saiba o nome de
usuário pode gastar cinco tentativas erradas e deixar aquela conta bloqueada por dois
minutos, de qualquer lugar. Isso não existia enquanto o contador era do navegador.

Aceito nesta rodada porque: (a) dois minutos é curto e o bloqueio se dissolve sozinho;
(b) é o preço de qualquer rate limit por identidade, e a alternativa (não ter freio) é o
próprio TD008; (c) o remédio de verdade é prova de humanidade no formulário, que é uma
feature própria e não cabe aqui. Fica declarado no final do arquivo, não escondido.

## Critérios de aceite

| # | Critério |
|---|---|
| 1 | Migration nova cria `public.login_tentativas` com `ENABLE ROW LEVEL SECURITY` e **nenhuma** `CREATE POLICY` — só as funções `SECURITY DEFINER` tocam a tabela |
| 2 | As três funções são `SECURITY DEFINER` **com** `SET search_path` (guard `hardeningSegurancaSqlGuard.test.js` quebra sem isso); estado e falha têm `GRANT EXECUTE` para `anon` (pré-login) e a de sucesso **não** |
| 3 | A função de falha aplica 5 falhas / janela de 15 min / bloqueio de 2 min, e a de sucesso zera o contador da identidade do JWT |
| 4 | `login()` consulta o servidor **antes** do `signInWithPassword` e não vai à rede de auth quando o servidor diz bloqueado |
| 5 | `login()` registra falha e sucesso no servidor, e o número mostrado ao usuário vem da resposta do servidor |
| 6 | O contador local vira espelho: `LoginPage` continua pintando os pips sem mudar, e limpar o `localStorage` **não** destrava o bloqueio |
| 7 | RPC indisponível não trava o login (falha aberta) e não polui a trilha de inconsistência com erro previsto |
| 8 | Endereço de acesso inválido continua sem consumir tentativa e sem chamar RPC nenhuma (os três testes de `AppContext.login.test.jsx` seguem passando sem edição) |
| 9 | `supabase/schema.sql` descreve a tabela nova e a linha de RLS dela |
| 10 | Migration é idempotente e traz `ORDEM DE DEPLOY` no cabeçalho |
| 11 | Suíte verde, sem teste removido nem enfraquecido para passar |

## Arquivos afetados (previsão)

- `supabase/migrations/20260927_login_tentativas_servidor.sql` (novo)
- `supabase/schema.sql`
- `src/context/AppContext.jsx` (`login`)
- `src/lib/loginTentativas.js` (novo, o cliente das três RPCs, isolável em teste)
- `src/lib/loginTentativas.test.js` (novo)
- `src/context/AppContext.loginBloqueio.test.jsx` (novo)
- `docs/09_BACKLOG/tech-debt.md`, `.full-auto/PENDENCIAS-DO-MATHEUS.md`, `specs/_loop.md`
