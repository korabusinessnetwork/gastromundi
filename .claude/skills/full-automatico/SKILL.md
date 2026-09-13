---
name: full-automatico
description: Modo Full Automático do Matheus. Recebe o plano de uma aplicação e constrói ela do início ao fim sozinho, sem pedir confirmação a cada passo, decidindo com defaults sensatos, registrando as decisões, contornando tarefas que dependem do Matheus (mocks, .env.example, lista de pendências) e só falando com ele em caso de extrema necessidade. Use SEMPRE que o Matheus disser "full automático", "full auto", "/full-automatico", "roda do início ao fim", "faz tudo sozinho", "toca o projeto sem me perguntar", "aqui está o plano, executa", ou quando ele colar ou apontar um plano de app pedindo execução completa. Toda tarefa do modo Full Automático é executada obrigatoriamente pela skill /ciclo, com permissão para rodar frentes em paralelo sem uma sobrescrever a outra. Também dispara com "/full-automatico trilha". Use também para RETOMAR uma execução quando existir a pasta `.full-auto/` no projeto e ele disser "continua", "continuar" ou "retoma".
---

# Full Automático

O Matheus entrega um plano e sai da frente. Daqui em diante você é o dono do projeto até ele estar pronto, rodando e verificado. Ele não está olhando a tela: cada pergunta desnecessária congela a execução por horas. Por isso a regra de ouro é:

> **Antes de perguntar qualquer coisa, passe pelo filtro de escalação.** Se não for extrema necessidade, decida, registre em `DECISOES.md` e siga.

O filtro completo, com exemplos de "escala" e "não escala", está em `references/escalacao.md`. Leia na Fase 0.

Regra de escrita do Matheus: em qualquer texto em português que você gerar (docs, relatórios, mensagens), não use travessão, use vírgula.

---

## Fase 0: Preparação (uma vez por projeto)

1. **Achar o plano.** Ordem de busca: o que veio junto do comando, arquivo que o Matheus citou, `PLAN.md`, `PLANO.md`, `docs/`, `README.md`. Se não existir plano nenhum, essa é a única pergunta obrigatória da skill inteira. Qualquer outra lacuna do plano você preenche.
2. **Ler as referências:** `references/escalacao.md` sempre. `references/paralelismo.md` antes da primeira onda paralela. `references/setup.md` se o hook ainda não estiver instalado.
3. **Criar a pasta de estado `.full-auto/`** copiando os modelos de `assets/templates/` desta skill:
   - `ESTADO.md`: status, fase atual, tarefa atual, próximo passo. É o seu "ponto de salvamento".
   - `TAREFAS.md`: checklist de tudo que falta.
   - `DECISOES.md`: toda escolha que você fez no lugar do Matheus, com o porquê.
   - `PENDENCIAS-DO-MATHEUS.md`: o que só ele pode fazer, com passo a passo.
   - `LOG.md`: uma linha por tarefa concluída.
4. **Instalar o hook de continuidade** se `.claude/settings.json` do projeto ainda não tem o Stop hook `full-auto-stop.js`:
   ```bash
   node <pasta-desta-skill>/scripts/instalar-hook.js .
   ```
   Ele copia o hook para `.claude/hooks/` e faz merge no `settings.json` sem apagar nada existente. O hook impede o Claude Code de encerrar enquanto houver tarefa pendente. Detalhes em `references/setup.md`.
5. **Git como botão de desfazer.** `git init` se precisar, crie a branch `full-auto/<slug-do-projeto>` e faça um commit inicial. Commits pequenos e frequentes são o que deixa o Matheus confiar numa execução sem supervisão.
6. **Fundação Kora.** Se é um projeto novo da Kora e não tem `memory/`, `docs/` e ADRs, aplique a skill `fundacao-de-projeto` em **modo não interativo**: responda o questionário de intake você mesmo a partir do plano, preencha lacunas com os defaults dela (React + Vite + Supabase, multi-tenant white-label, custo zero) e marque cada resposta em `respostas-intake.md` como `[do plano]` ou `[default]`. Não abra o questionário para o Matheus.

## Fase 1: Quebrar o plano em tarefas

Transforme o plano em tarefas pequenas e verificáveis no `TAREFAS.md`. Cada tarefa cabe em mais ou menos um commit e tem um critério de pronto que dá para checar (comando que passa, tela que abre, endpoint que responde).

Ordem padrão, ajuste se o plano pedir outra: fundação e config → modelo de dados e migrations locais → back-end e serviços → front-end → integração ponta a ponta → testes → polimento de UX → documentação (README com "como rodar").

Não peça aprovação da lista de tarefas. Se o plano for ambíguo, escolha a interpretação mais simples que entrega o objetivo declarado e registre em `DECISOES.md`. Se o plano tiver algo tecnicamente ruim (ex.: segredo no front-end), faça do jeito certo e registre o desvio.

## Adendo obrigatório: sempre usar a skill `/ciclo`

No modo Full Automático, **toda tarefa é executada através da skill `/ciclo`**. Não existe tarefa feita "por fora" dela, nem as pequenas. O `/ciclo` é o motor de cada tarefa; esta skill é o maestro que decide a ordem, guarda o estado e segura as perguntas.

Regras de convivência entre as duas:

- **Invoque o `/ciclo` passando a tarefa e o critério de pronto** que estão no `TAREFAS.md`, mais o trecho do plano relevante.
- **Qualquer pergunta, entrevista ou pedido de aprovação que o `/ciclo` faria ao Matheus, você mesmo responde**, a partir do plano, do `DECISOES.md` e dos padrões do projeto. Registre as respostas em `DECISOES.md`. O filtro de escalação desta skill vale por cima do `/ciclo`: ele não pode furar a regra de só chamar o Matheus em extrema necessidade.
- **A tarefa só vira `[x]` quando o `/ciclo` fechar aprovado** e a verificação de verdade (build, testes, app rodando) passar.
- **Se o `/ciclo` não estiver instalado ou não puder ser invocado pelo Claude**, não pare a execução: faça o ciclo manualmente (especificar, construir, revisar contra o critério, corrigir até aprovar), registre em `PENDENCIAS-DO-MATHEUS.md` que o `/ciclo` precisa ser instalado ou liberado para invocação automática, e siga.

## Fase 2: Loop de execução

Para cada tarefa, nesta ordem:

1. Marque `[~]` no `TAREFAS.md` e atualize `ESTADO.md` (tarefa atual, próximo passo).
2. **Rode a tarefa pela skill `/ciclo`** (ver adendo acima), seguindo os padrões do projeto (os de `CLAUDE.md` e `memory/` se existirem).
3. **Verifique de verdade**: build, typecheck, lint, testes, e rode o app quando fizer sentido. "Compilou" não é "pronto".
4. Confirme que o `/ciclo` fechou aprovado contra o critério de pronto da tarefa. Se não fechou, rode o `/ciclo` de novo com o que falhou.
5. Se travar: tente até 3 abordagens **diferentes** (não a mesma coisa três vezes). Depois disso marque `[!]` com o diagnóstico, e siga para as próximas tarefas que não dependem dela. Bloqueio de uma tarefa não é motivo para chamar o Matheus.
6. Concluiu: marque `[x]`, faça commit (`feat(escopo): descrição`), escreva uma linha no `LOG.md`.

## Permissão para rodar em paralelo

Você **tem permissão** para rodar várias frentes ao mesmo tempo sempre que isso for possível, e deve fazer isso quando existirem tarefas independentes, porque encurta a execução. A condição é uma só: **nenhuma frente pode sobrescrever o trabalho de outra.** O procedimento completo está em `references/paralelismo.md`. O resumo:

- **Só paraleliza o que não tem dependência.** Use as colunas `depende:` e `trilha:` do `TAREFAS.md` para montar as ondas.
- **Cada frente trabalha isolada numa git worktree própria** (subagentes com isolamento de worktree, ou sessões `claude --worktree <trilha>`). Ninguém edita a mesma cópia dos arquivos ao mesmo tempo.
- **Cada frente é dona exclusiva dos seus diretórios.** Arquivos compartilhados (`package.json`, lockfile, migrations, rotas centrais, tipos compartilhados, `.full-auto/`) só a sessão maestro altera. As frentes pedem a mudança no relatório delas.
- **Contratos antes do fan-out:** interfaces, rotas e tipos definidos pelo maestro antes de despachar, no padrão da skill `multi-model-orchestrator` (inclusive os papéis de modelo dela).
- **Cada frente também roda pelo `/ciclo`.** O adendo vale para todas.
- **Só o maestro integra:** faz merge de uma branch por vez, roda a verificação completa depois de cada merge, e resolve conflito juntando as duas mudanças. Nunca descarta o trabalho de uma frente para fazer a outra passar.

## Tarefas do Matheus: contornar, anotar, seguir

Quando algo depende de uma ação humana, **não pare**. Construa o contorno e siga em frente:

| Situação | O que fazer em vez de parar |
|---|---|
| Precisa de API key ou credencial | Variável no `.env.example`, adapter com a interface real + implementação mock ativa por padrão |
| Precisa criar conta ou projeto (Supabase, Stripe, Vercel...) | Rode tudo local (Supabase CLI, SQLite, JSON), deixe migrations prontas para aplicar |
| Pagamento, e-mail, SMS, WhatsApp | Provider fake que loga no console, trocável por config |
| Domínio, DNS, deploy | Deixe o projeto pronto para deploy e o comando exato anotado |
| Conteúdo real (textos, fotos, logo, preços) | Placeholder realista e fácil de trocar, centralizado num arquivo |
| Decisão de produto pequena (cor, nome, ordem de menu) | Decida você, registre em `DECISOES.md` |

Cada contorno vira um item em `PENDENCIAS-DO-MATHEUS.md` com: o que ele precisa fazer, passo a passo, onde colar o resultado e como confirmar que funcionou. Ele resolve tudo de uma vez no final.

## Quando falar com o Matheus

Só nestes casos (detalhes e exemplos em `references/escalacao.md`):

1. **Irreversível ou fora do projeto**: apagar dados reais, migration em banco de produção, deploy em produção, force push, mexer em outro repositório ou em arquivos fora da pasta do projeto.
2. **Dinheiro**: qualquer ação que gere cobrança ou contrate serviço pago.
3. **Segurança ou legal**: expor dado pessoal, burlar autenticação, violar termos de serviço, LGPD.
4. **Plano impossível no núcleo**: as leituras possíveis produzem apps diferentes, nenhuma dá para cobrir com feature flag ou config, e escolher errado joga fora a maior parte do trabalho.
5. **Tudo o que resta está bloqueado** e não sobrou nada útil para fazer.

Antes de escalar: termine tudo o que dá para fazer sem essa resposta. Então mande **uma única mensagem** no formato de `references/escalacao.md` (o que precisa, por quê, opções com a sua recomendação, o que já está pronto), e mude `ESTADO.md` para `status: AGUARDANDO_MATHEUS`. Isso libera o hook.

Nunca são motivo para escalar: escolha de biblioteca, nome, cor, layout, estrutura de pastas, formato de dado, erro de build, teste falhando, dependência que não instala (use alternativa), dúvida de "ele ia preferir X ou Y?".

## Continuidade entre sessões e compactação

- O estado vive nos arquivos de `.full-auto/`, não na conversa. Depois de uma compactação de contexto ou numa sessão nova, a primeira coisa é reler `ESTADO.md` e `TAREFAS.md` e continuar do "próximo passo".
- Mantenha o `ESTADO.md` atualizado a cada tarefa. Se a sessão cair no meio, é ele que salva o trabalho.
- O Stop hook bloqueia o encerramento enquanto houver `[ ]` ou `[~]`. O Claude Code aceita no máximo 8 continuações seguidas por hook; se a execução parar por isso, o Matheus retoma com `/full-automatico continuar`.

## Honestidade (inegociável)

A autonomia só funciona se o Matheus puder confiar no relatório. Portanto: nunca marque `[x]` sem verificar, nunca apague ou reescreva tarefas para esvaziar a lista, nunca diga que testou o que não testou, e deixe explícito no relatório tudo o que está mockado.

## Encerramento

Quando todas as tarefas estiverem `[x]` (ou o que sobrou for só `[!]`):

1. Verificação final completa: instalação limpa das dependências, build, testes, subir o app e passar pelo fluxo principal.
2. Escreva `.full-auto/RELATORIO-FINAL.md` usando o modelo de `assets/templates/`.
3. Mude `ESTADO.md` para `status: CONCLUIDO` (o hook libera o encerramento).
4. Mensagem final curta para o Matheus: o que ficou pronto, como rodar (1 comando), a lista de pendências dele em ordem de prioridade, e os bloqueios se houver.
