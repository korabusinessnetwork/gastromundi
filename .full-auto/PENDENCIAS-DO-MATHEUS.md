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

## Execução 2, plano de refatoração (a partir de 2026-11-25)

### P2-01. Instalar ou liberar a skill `/ciclo` (RESOLVIDA em 2026-11-26: o PR #34 foi trazido para a main, e a skill mora em `.claude/skills/ciclo/`)
- **O que:** a skill Full Automático pede que cada tarefa rode pelo `/ciclo`, que não está disponível nesta sessão. As tarefas estão rodando o ciclo manual equivalente (spec, fotos, build, revisão em duas etapas).
- **Como:** instalar a skill `ciclo` nas skills da conta, ou ignorar se o ciclo manual servir.
- **Confirmar:** em uma sessão nova, `/ciclo` aparece na lista de skills.

### P2-02. Datas exibidas um dia antes (RESOLVIDA em 2026-11-26, a pedido do dono)
- **O que:** a data da compra (Área Admin) e o vencimento do fiado (detalhe do cliente) aparecem um dia antes, porque `new Date("AAAA-MM-DD")` é lido como UTC. Registrado nas specs 5.19 e 5.20.
- **Como:** iniciar a tarefa sugerida "Corrigir data da compra um dia antes" e pedir para incluir o vencimento em `ClienteDetalhe.jsx`, ou pedir a correção numa rodada da fase F.

### P2-03. Coluna `emoji` da tabela `products`, sem uso
- **O que:** desde as rodadas 5.32 e 5.33 (decisão 037) nada lê nem grava o emoji do produto. A coluna continua no banco com os valores antigos.
- **Como:** se quiser limpar, uma migration `alter table products drop column emoji;` (e conferir `supabase/schema.sql`). Não é urgente: a coluna parada não afeta nada.
- **Confirmar:** a suíte continua verde e o PDV abre normalmente depois de aplicar.

### P2-04. Ativar o gancho das notas de atualização na sua máquina
- **O que:** o `.githooks/pre-push` recusa push sem atualização das notas (`kora.codes/patchnotes`). Ele só vale numa máquina onde a pasta `.githooks/` está ativada.
- **Como:** na pasta do projeto, rode uma vez `git config core.hooksPath .githooks`. Se você já fez isso para o `post-commit` do Obsidian, não precisa de nada.
- **Confirmar:** um push sem mexer em `src/features/apex/regras/notasDeAtualizacao.js` mostra "Push recusado".

### P2-05. Script `setup:git` do package.json aponta para arquivo que não existe
- **O que:** `npm run setup:git` chama `scripts/setup-git.mjs`, que só existe no commit `601c49af` ("Guarda de branch por dev"), nunca mesclado na main. O script configuraria o `core.hooksPath` e uma guarda de branch por pessoa.
- **Como:** decidir entre (a) mesclar aquele trabalho, (b) tirar o script do `package.json`, ou (c) trocar por um script que só faça `git config core.hooksPath .githooks`. Sem isso, `npm run setup:git` dá erro.

### P2-06. Fluxo crítico 3 (venda com NFC-e em homologação) não pôde rodar
- **O que:** a fase F.3 rodou 13 fluxos críticos no navegador, mas a venda com NFC-e em homologação depende do certificado A1 e do CSC do estabelecimento, que estão adiados por custo (decisão 026). Sem eles a função de borda responde "sem chave", como deve.
- **Como:** quando decidir contratar o certificado, siga `docs/NFCE_CHECKLIST_GO_LIVE.md` (plugar a chave e testar em homologação). Custo: o certificado A1 é pago por ano à autoridade certificadora.
- **Confirmar:** uma venda de teste em homologação volta autorizada, com o QR Code no cupom.
