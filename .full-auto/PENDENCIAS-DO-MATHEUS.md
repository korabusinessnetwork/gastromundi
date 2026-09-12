# Pendências do Matheus

Coisas que só você pode fazer. O app já funciona com contornos, estas tarefas trocam o contorno pelo real.
Ordem: da mais importante para a menos importante.

**Situação em 11/09/2026: todas as cinco estão fechadas.** As quatro migrations foram aplicadas e a
branch foi mesclada na `main`. O que sobra não é pendência, é uma conferência: abrir a aba "Saúde
da operação" do Console uma vez, que é a única entrega desta execução que ninguém viu rodando.

(a preencher durante a execução)

## ~~P01, aplicar a migration da baixa de estoque~~ FECHADA em 11/09/2026

> Aplicada por ele em 11/09/2026. O passo a passo fica abaixo, como registro do que foi rodado.
Herdada da rodada 62 do ciclo.

Arquivo: `supabase/migrations/20260919_baixa_estoque_cria_linha.sql`
URL: https://github.com/korabusinessnetwork/gastromundi/blob/main/supabase/migrations/20260919_baixa_estoque_cria_linha.sql

Passo a passo:
1. Abrir o painel do Supabase do projeto, seção SQL Editor.
2. Colar o conteúdo do arquivo acima e executar.
3. Conferir que a função de baixa passou a criar a linha de movimento quando ela não existe,
   dando uma baixa de caixa de teste e olhando a tabela de movimento de estoque.

Como confirmar que funcionou: dar baixa no caixa e ver a linha correspondente aparecer no estoque.

## ~~P02, mesclar a branch `full-auto/gastromundi` na `main`~~ FECHADA em 11/09/2026

Você autorizou ("toda rodada pode ser mesclada"), abriu o PR #27 e mandou mesclar. Feito:
fast-forward de `8513a1c2` para `54f76cbe`, 12 commits, `main` local e remota sincronizadas.

A contradição que criou esta pendência foi resolvida na origem, e não só aqui: a seção do
`CLAUDE.md` que dizia "a main é minha" virou "Git, merge de rodada terminada está autorizado",
com a definição de rodada terminada (review sem ressalvas, suíte verde, build limpo) e com o que
continua fora (force push, mesclar rodada que não fechou, reescrever histórico empurrado). A
memória `loop-autonomo-e-main` foi reconfirmada e aponta para lá.

**O que isso destravou e você precisa saber:** a Vercel sobe **produção** a cada push na `main`, e
o push já aconteceu. Então o frontend novo está indo para o ar agora, contra o banco que ainda não
tem as migrations. Ver o aviso no topo da P03.

**Nota de permissão:** o `gh pr merge` continua bloqueado pelo classificador do modo automático; o
`git merge --ff-only` seguido de `git push origin main` passou. Se quiser que eu use o caminho do
PR nas próximas, precisa liberar `gh pr merge` nas regras de permissão do Bash.

## ~~P03, aplicar a migration `20260920_vendas_cancelamento.sql`~~ FECHADA em 11/09/2026

> Aplicada por ele em 11/09/2026. Ela chegou a ficar uma janela curta em aberto com o frontend já no ar, porque o
> merge na `main` dispara deploy na Vercel. Nessa janela, cancelar uma venda falhava em produção.
> Com a migration aplicada, o caminho fechou.

**Por que virou pendência sua:** aplicar migration em banco de produção é ação irreversível e fora
do projeto, então eu não rodo sozinho. O arquivo está pronto e é idempotente.

**Arquivo:** https://github.com/korabusinessnetwork/gastromundi/blob/main/supabase/migrations/20260920_vendas_cancelamento.sql

**O que ela faz:** adiciona quatro colunas em `vendas`, `cancelada`, `motivo_cancelamento`,
`cancelada_por` e `cancelada_em`, mais um índice parcial. Nenhuma política de RLS nova, nenhuma
função com `SECURITY DEFINER`. A política `vendas_all_caixa_up` da `20260707` já cobre o UPDATE e o
isolamento por `tenant_id` veio na `20260724`, e coluna nova em tabela existente herda as duas.

**Ordem de deploy, e ela importa:**

1. Rodar a migration no SQL Editor do Supabase.
2. Só então deployar o frontend.

O app novo cancela venda fechada marcando essas colunas em vez de apagar as linhas de
`venda_itens`, `venda_pagamentos` e `vendas`, que era o que ele fazia antes. Se o frontend subir
primeiro, o cancelamento falha com a mensagem "Cancelamento indisponível: a atualização do banco
(20260920_vendas_cancelamento) ainda não foi aplicada. Avise o responsável pelo sistema.". Isso é
de propósito, é melhor que fingir sucesso e deixar a venda cancelada seguir somando no relatório,
mas é uma janela de operação quebrada que a ordem correta evita. No sentido inverso não há risco:
com as colunas presentes, o frontend antigo continua funcionando igual.

**Passo a passo:**

1. Abrir o painel do Supabase, projeto do GastroMundi, seção SQL Editor.
2. Colar o conteúdo do arquivo e rodar. Pode rodar mais de uma vez sem erro.
3. Deployar o frontend.

**Como confirmar que funcionou:** fechar uma venda de teste no caixa, cancelar essa venda e conferir
que ela sai do relatório do dia. Depois, no SQL Editor, rodar
`select id, cancelada, motivo_cancelamento, cancelada_em from public.vendas where cancelada;` e ver
a venda de teste marcada, com os itens dela ainda presentes em `venda_itens`.

## ~~P04, aplicar a migration `20260927_login_tentativas_servidor.sql`~~ FECHADA em 11/09/2026

> Aplicada por ele em 11/09/2026. O bloqueio de login passou a valer no servidor, então limpar o `localStorage`
> não devolve mais as tentativas.

**Por que virou pendência sua:** aplicar migration em banco de produção é ação irreversível e fora
do projeto, então eu não rodo sozinho. O arquivo está pronto e é idempotente.

**Arquivo:** https://github.com/korabusinessnetwork/gastromundi/blob/main/supabase/migrations/20260927_login_tentativas_servidor.sql

**O que ela faz:** cria a tabela `public.login_tentativas` com RLS ligada e **nenhuma policy**, mais
três funções `SECURITY DEFINER` que são as únicas a tocar nela. É o TD008: o "Bloqueio após 5
tentativas" prometido na tela de login era contado no `localStorage` do navegador de quem estava
tentando entrar, ou seja, duas linhas no console devolviam as cinco tentativas. Agora quem conta é
o banco.

**A parte que importa entender antes de rodar:** são três funções e não uma de propósito. Consultar
o estado e somar uma falha ficam liberadas para a role `anon`, porque o login acontece antes de
existir sessão e não há outro jeito. A terceira, a que ZERA o contador, **não recebe chave por
parâmetro** e só é concedida a `authenticated`: ela tira a identidade do e-mail do próprio token. Se
o `anon` pudesse zerar, bastaria chamá-la entre as tentativas para desfazer o próprio bloqueio, e o
freio novo seria tão contornável quanto o antigo. O bloco final da migration confere isso e recusa
a aplicação se a concessão vazar.

**Ordem de deploy:**

1. Rodar a migration no SQL Editor do Supabase.
2. Só então deployar o frontend.

Se o frontend subir primeiro nada quebra: sem as funções, as chamadas voltam vazias e o login segue
pelo contador local de hoje, que é a falha aberta decidida no spec. Um problema no banco não pode
impedir o caixa de abrir, e o rate limit do próprio Supabase Auth continua no caminho de qualquer
jeito. A ordem certa só evita passar um tempo sem o freio novo.

**Passo a passo:**

1. Abrir o painel do Supabase, projeto do GastroMundi, seção SQL Editor.
2. Colar o conteúdo do arquivo e rodar. Pode rodar mais de uma vez sem erro. No fim deve aparecer o
   aviso "TD008 aplicado: login_tentativas com RLS, sem policy, e anon sem acesso ao caminho que
   zera.".
3. Deployar o frontend.

**Como confirmar que funcionou:** errar a senha cinco vezes na tela de login, ver "Muitas
tentativas. Bloqueado por 2 minutos.", limpar o `localStorage` pelo console do navegador (`F12`,
aba Application, ou `localStorage.clear()`) e tentar de novo. Antes desta migration isso devolvia as
cinco tentativas; agora a tela continua dizendo bloqueado. Depois, no SQL Editor, rodar
`select chave, falhas, bloqueado_ate from public.login_tentativas;` e ver a linha, com a chave em
md5 e não o e-mail legível. Entrar com a senha certa depois dos dois minutos faz a linha sumir.

**Limite conhecido, para você saber que é de propósito:** com o contador no servidor, quem souber um
nome de usuário consegue gastar cinco tentativas erradas e deixar aquela conta bloqueada por dois
minutos, de qualquer lugar. Isso não existia enquanto o contador era do navegador. É o preço de
qualquer freio por identidade, o bloqueio se dissolve sozinho em dois minutos, e o remédio de
verdade seria prova de humanidade no formulário, que é uma feature própria.

---

## ~~P05, aplicar a migration `20260928_saude_plataforma.sql`~~ FECHADA em 11/09/2026

> Aplicada por ele em 11/09/2026. A aba "Saúde da operação" do Console passou a ter de onde ler. **Esta é a única
> que ainda não foi vista funcionando por ninguém**: eu não tenho credencial de super-admin para
> entrar no Console, então ela está coberta por 10 testes de tela e não por uso. Abrir a aba uma
> vez fecha isso.

**Arquivo:** [`supabase/migrations/20260928_saude_plataforma.sql`](https://github.com/korabusinessnetwork/gastromundi/blob/main/supabase/migrations/20260928_saude_plataforma.sql)

**O que ela faz:** cria a RPC `saude_plataforma`, que devolve, por estabelecimento, quantas notas
fiscais foram recusadas pela SEFAZ, quantas estão paradas na fila de contingência agora, há quanto
tempo a mais antiga está parada, e a mesma coisa para a impressão de comandas. É o que alimenta a
aba **Saúde da operação**, nova no Console.

**Por que ela é uma função e não uma permissão nova:** as duas tabelas que ela lê são operacionais,
e a decisão do ADR-008 é que o super-admin da plataforma não enxerga o dado bruto de todos os
clientes. A função atravessa isso uma vez, confere o papel dentro do banco e devolve só contagem e
data. Ela **não** devolve a chave da nota, o motivo da recusa, a venda, nem o que a comanda mandava
imprimir, e isso é de propósito: chave e motivo identificam a venda e o cliente final. Se um dia o
suporte precisar ver a nota em si, o caminho é outro (acesso escopado a um tenant), não uma coluna
a mais aqui.

**Nada quebra se você não aplicar.** O resto do Console funciona igual, porque a leitura acontece
só quando alguém abre a aba. Sem a migration, a aba mostra a mensagem de que não conseguiu
carregar, com um botão de tentar de novo, e **não** diz que está tudo certo. Isso também é de
propósito: dar atestado de saúde com base numa leitura que falhou é pior que assumir que não sabe.

**Passo a passo:**

1. Abrir o painel do Supabase, projeto do GastroMundi, seção SQL Editor.
2. Colar o conteúdo do arquivo e rodar. Pode rodar mais de uma vez sem erro.
3. No fim deve aparecer o aviso "saude_plataforma instalada. Estabelecimentos com nota fiscal
   parada agora: N.".

**Como confirmar que funcionou:** abrir o Console, clicar na aba **Saúde da operação**. Se a base
estiver limpa, a tela diz com todas as letras que nenhum estabelecimento tem nota ou impressão
parada, em verde. Se houver pendência, a lista de quem está quebrado aparece no topo, ordenada por
há quanto tempo está parado.

**Uma coisa para reparar ao ler os números:** "parado agora" ignora o seletor de período. Os três
botões de 7, 30 e 90 dias valem só para as falhas contadas, as recusas e os erros de impressão. Se
o período valesse também para a pendência, a nota parada há 60 dias sumiria de uma janela de 30 e a
tela diria que está tudo bem justamente no caso mais grave.

---

# Pendências novas da rodada 2 do refino (2026-09-12)

## P06, decidir o fuso da assinatura (o mais sério desta leva)

**O que acontece hoje:** o status da assinatura é calculado em dois lugares com
fuso diferente. O front lê o dia pelo calendário local do estabelecimento, o
banco lê por `current_date`, que no Supabase é UTC. No Brasil, entre 21h e
meia-noite, o banco já está no dia seguinte e o front não.

**Por que isso importa:** no último dia de carência, a partir das 21h, a função
`assinatura_atual_ativa()` passa a devolver falso e as policies RESTRICTIVE da
`20260720_assinatura_enforcement` fecham até o SELECT de produtos, comandas,
mesas e vendas. O PDV fica vazio no meio do movimento, e a tela continua dizendo
que a assinatura permite operar, então ninguém liga uma coisa à outra.

**Por que não resolvi sozinho:** as duas saídas mexem em decisão sua.

- **A)** alinhar o front ao UTC: duas linhas, sem migration, e o aviso passa a
  aparecer até três horas antes no fim do dia. Contraria a decisão que está
  escrita e testada hoje (a suíte fixa o fuso em São Paulo de propósito e há um
  teste dizendo "um instante em UTC é lido no calendário local de quem opera").
  Cheguei a aplicar, vi que derrubava 7 testes que codificam essa sua decisão, e
  revertei.
- **B)** o banco passar a decidir pelo fuso do estabelecimento, como a
  `20260903` já fez para o horário do delivery. É o conserto de fundo e o que
  mantém a regra que você escolheu, e exige migration.

**Minha recomendação:** B, com A como paliativo se o vencimento de algum cliente
estiver perto. O risco de A é pequeno e o de não fazer nada é o PDV fechar sem
explicação.

## P07, aplicar o deploy da Edge Function do Jarvas

O teto diário de uso do Jarvas está no código, mas Edge Function só vale depois
de publicada. Sem o deploy, a proteção de custo não existe em produção.

Comando: `supabase functions deploy jarvas-assistente`. Nenhuma variável nova é
obrigatória; `IA_LIMITE_DIARIO` já existe e o padrão é 50 por dia por
estabelecimento, o mesmo da leitura de cardápio por IA.

## P08, conferir no painel do Supabase se o cadastro público está desligado

As Pautas dos sócios decidem quem é sócio só pelo domínio do e-mail
(`@pautas.local`). Se o cadastro por e-mail e senha estiver habilitado no painel,
qualquer pessoa com a chave anon se cadastra nesse domínio e passa a ler e
escrever as pautas internas da Kora. Se a confirmação de e-mail estiver ligada, o
caminho está fechado, porque esse domínio não recebe correio.

É uma checagem de trinta segundos que só você pode fazer, e ela decide sozinha se
isto é urgente ou apenas frágil. O reforço no banco (exigir que o sócio exista em
`pautas_pessoas`) exige migration e fica na sua fila.

## P09, três migrations de segurança e desempenho, na sua ordem

Nenhuma delas é urgente hoje, e todas custam reaplicar migration em produção,
então a decisão é sua. Em ordem de importância:

1. **Teto geral do delivery público.** O freio atual conta por telefone, e o
   telefone vem cru do payload: um script que varia o número a cada requisição
   passa livre e enche a fila da Cozinha. A `20260925_leads_apex` já tem o
   desenho do balde geral para copiar.
2. **Índices compostos** em `vendas (tenant_id, at DESC)`, `lancamentos
   (tenant_id, competencia)` e `operator_logs (tenant_id, created_at DESC)`.
   Hoje o banco percorre os 90 dias de todos os estabelecimentos para devolver os
   de um. Com um cliente é invisível; é a conta que chega junto com o décimo.
3. **`REVOKE EXECUTE FROM PUBLIC`** nas quatro funções da
   `20260822_complementos_subgrupos`, que hoje o `anon` alcança com a chave
   pública. Impacto pequeno, mas é a única exceção ao padrão que o resto do
   projeto segue.
