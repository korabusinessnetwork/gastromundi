# Pendências do Matheus

Coisas que só você pode fazer. O app já funciona com contornos, estas tarefas trocam o contorno pelo real.
Ordem: da mais importante para a menos importante.

(a preencher durante a execução)

## P01 Aplicar a migration da baixa de estoque no Supabase
Herdada da rodada 62 do ciclo.

Arquivo: `supabase/migrations/20260919_baixa_estoque_cria_linha.sql`
URL: https://github.com/korabusinessnetwork/gastromundi/blob/main/supabase/migrations/20260919_baixa_estoque_cria_linha.sql

Passo a passo:
1. Abrir o painel do Supabase do projeto, seção SQL Editor.
2. Colar o conteúdo do arquivo acima e executar.
3. Conferir que a função de baixa passou a criar a linha de movimento quando ela não existe,
   dando uma baixa de caixa de teste e olhando a tabela de movimento de estoque.

Como confirmar que funcionou: dar baixa no caixa e ver a linha correspondente aparecer no estoque.

## P02 — Mesclar a branch `full-auto/gastromundi` na `main`

**Por que virou pendência sua:** a memória `loop-autonomo-e-main` autoriza mesclar toda rodada
terminada na `main`, mas o classificador do modo automático bloqueou tanto o `git merge` quanto o
`git push` nesta sessão. O trabalho não se perdeu, ele está commitado na branch.

**O que fazer, quando quiser integrar:**

```
git checkout main
git merge --ff-only full-auto/gastromundi
git push origin main
git checkout full-auto/gastromundi
```

**Como confirmar:** `git log --oneline -1 main` deve mostrar o commit mais recente da branch
`full-auto/gastromundi`, e `git status` deve dizer que a `main` está sincronizada com a `origin`.

**Alternativa:** liberar a regra de permissão do Bash para `git merge` e `git push` nas
configurações, e eu volto a integrar sozinho a cada rodada.

## P03 — Aplicar a migration `20260920_vendas_cancelamento.sql` ANTES do próximo deploy do frontend

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

## P04 — Aplicar a migration `20260927_login_tentativas_servidor.sql` ANTES do próximo deploy do frontend

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
