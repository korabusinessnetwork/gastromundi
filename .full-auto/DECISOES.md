# Decisões tomadas no lugar do Matheus

Uma entrada por decisão. Ele revisa no final e pode reverter qualquer uma.

## D01 Sincronizar o repositório antes de qualquer trabalho
- **Contexto:** o `main` local estava 39 commits atrás do `origin/main`, com quatro arquivos alterados e dois não rastreados na cópia de trabalho.
- **Decisão:** conferi que nenhum dos 39 commits tocava os arquivos alterados localmente e fiz `git pull --ff-only`. As alterações locais (README, package.json, settings.local.json, scripts/setup-git.mjs, scripts/devs.json) continuam intactas e não commitadas.
- **Por quê:** trabalhar sobre uma base velha produziria conflitos e retrabalho. O avanço rápido é reversível e não descarta nada.
- **Como reverter:** `git reset --hard 8513a1c2` não é necessário, o estado anterior era `d45e8bbd`.

## D02 O plano de origem é o backlog vivo, não o PLAN.md
- **Contexto:** o `PLAN.md` da raiz descreve o redesenho da tela `/palm`, que já foi entregue, validado e aprovado (`VALIDATION.md` fecha com "Aprovado"). Não existe plano novo escrito.
- **Decisão:** em vez de parar para perguntar, adotei como plano o backlog já registrado pelo dono: o ledger `specs/_loop.md`, os documentos de `docs/09_BACKLOG/` e a fila de features da memória do projeto.
- **Por quê:** a única pergunta obrigatória da skill é a ausência total de plano, e plano existe, está apenas espalhado em vez de num arquivo só.
- **Como reverter:** apagar `.full-auto/TAREFAS.md` e escrever um `PLAN.md` novo.

## D03 Trabalhar em branch própria e mesclar na main ao fim de cada tarefa
- **Contexto:** a skill pede a branch `full-auto/<slug>`; a memória do projeto registra que o dono autorizou de forma permanente mesclar cada rodada terminada na `main`.
- **Decisão:** branch `full-auto/gastromundi`, com merge na `main` local ao fechar cada tarefa verificada. Push só quando o dono estiver acompanhando ou ao final, para não publicar trabalho meio feito.
- **Por quê:** junta as duas regras sem violar nenhuma, e mantém o botão de desfazer.
- **Como reverter:** `git checkout main` e apagar a branch.

## D04 Primeiro item: o ADR do PDV offline-first (F021)
Data: 2026-09-10.
Nada bloqueia venda ou uso hoje, então o critério passou a ser a prioridade escrita no backlog.
F018 e F021 são os dois itens Alto abertos. O F021 é o menor caminho até algo verificável,
porque a fila e o replay já rodam e o que falta primeiro é a decisão registrada, que é de graça
e destrava as fatias seguintes sem refazer escolha. O `controla_estoque` em `products`, que a
rodada 62 sugeriu, é decisão de produto do dono e continua parado, não virou tarefa.

## D05 Não esperar o ok do `/proximo`
Data: 2026-09-10.
A skill `/proximo` termina pedindo o ok do Matheus antes de reiniciar o ciclo. No modo Full
Automático essa espera está suspensa, conforme a regra de escalação desta skill e a memória
`loop-autonomo-e-main`, que autoriza emendar uma rodada na outra sem pedir comando.

## D06 A migration pendente da rodada 62 continua sendo ação do dono
Data: 2026-09-10.
`supabase/migrations/20260919_baixa_estoque_cria_linha.sql` precisa ser aplicada no painel do
Supabase. Eu não aplico nada em banco de produção, então o item foi para
`PENDENCIAS-DO-MATHEUS.md` e a execução segue sem ele.
