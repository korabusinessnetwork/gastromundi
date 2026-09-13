---
name: full-automatico-varredura
description: "Variante do Full Automático para QA de sistema existente: mapeia sozinho todos os fluxos que o sistema tem hoje, divide em suítes e dispara sessões em paralelo (uma worktree, uma porta e um banco por suíte) que executam cada fluxo de ponta a ponta, guardam evidência e reportam bugs com passo a passo de reprodução e severidade. Use SEMPRE com \"/varredura\", \"full auto varredura\", \"testa todos os fluxos\", \"testa o sistema inteiro\", \"roda QA sozinho\", \"abre várias sessões em paralelo e testa tudo\", \"quero saber o que está quebrado antes de lançar\", \"cria testes pros fluxos que já existem\". Também dispara com \"/varredura corrigir\" (corrigir os bugs achados), \"/varredura suite <id>\" (sessão de uma suíte) e \"/varredura continuar\" (retomar)."
---

# Full Automático: Varredura de Fluxos

O sistema já existe e já roda. O Matheus não entrega plano nem lista de testes, ele entrega o projeto e sai da frente. Daqui em diante você descobre sozinho quais fluxos existem, divide o trabalho em sessões paralelas, executa cada fluxo de verdade e devolve um mapa honesto do que passa, do que quebra e do que não deu para testar.

Três regras de ouro, nesta ordem:

> **1. Varredura não muda o sistema.** As frentes de teste só escrevem em `tests/` e em `.full-auto/varredura/`. Nenhum arquivo de produção é alterado durante a varredura. Correção é o modo separado da Fase 5.
>
> **2. Nunca testa contra dado real.** Ambiente local, banco próprio por suíte, seed determinístico, integração externa em mock. Se a única forma de testar um fluxo é tocar em produção ou em dado de cliente, o fluxo fica `NAO_TESTADO` com o motivo, e a execução segue.
>
> **3. Antes de perguntar qualquer coisa, passe pelo filtro de escalação.** Se não for extrema necessidade, decida, registre em `DECISOES.md` e siga.

Regra de escrita do Matheus: em qualquer texto em português que você gerar (docs, relatórios, mensagens), não use travessão, use vírgula.

## O que este modo herda da skill `full-automatico`

Este modo é uma variante, não um sistema novo. Leia a skill `full-automatico` na Fase 0 e reaproveite dela, sem reimplementar:

- a pasta de estado `.full-auto/` e os templates de `assets/templates/`,
- o Stop hook de continuidade (`scripts/instalar-hook.js`, `scripts/full-auto-stop.js`),
- o vigia de limite de uso (`scripts/vigia-limite.js`),
- o filtro de escalação completo (`references/escalacao.md`),
- o procedimento de paralelismo sem colisão (`references/paralelismo.md`), que aqui é a espinha dorsal e não um extra,
- a obrigação de rodar **toda tarefa de escrita de código pela skill `/ciclo`**, respondendo você mesmo qualquer pergunta que o `/ciclo` faria ao Matheus.

O que muda é a entrada e a saída: onde o `full-automatico` lê um plano e entrega um app, aqui você lê o sistema e entrega um mapa de fluxos, uma bateria de testes que fica no repositório e uma lista de bugs reproduzíveis.

Referências próprias desta skill, leia cada uma no momento indicado:

- `references/mapeamento-de-fluxos.md`: como descobrir os fluxos, na Fase 1.
- `references/sessoes-paralelas.md`: como montar e despachar as suítes, na Fase 2.
- `references/bug-report.md`: formato do achado e escala de severidade, antes da Fase 3.

---

## Fase 0: Preparação (uma vez por projeto)

1. **Ler o contexto antes de julgar qualquer coisa:** `CLAUDE.md`, `memory/`, `docs/` (inclusive ADRs), `README.md`, `.full-auto/DECISOES.md` se existir. Comportamento descrito ali é comportamento esperado, não bug.
2. **Checar conflito com execução em andamento.** Se `.full-auto/ESTADO.md` existir com `status: EXECUTANDO` e houver tarefas `[ ]` ou `[~]` de uma construção ou de um refino, **não inicie a varredura**: os três modos usam os mesmos arquivos. Termine aquela execução primeiro.
3. **Preparar `.full-auto/`** com os templates da skill `full-automatico` (`ESTADO.md`, `TAREFAS.md`, `DECISOES.md`, `PENDENCIAS-DO-MATHEUS.md`, `LOG.md`) mais os arquivos próprios deste modo, cujos modelos estão em `assets/templates/` desta skill:
   - `varredura/MAPA-DE-FLUXOS.md`: inventário de todos os fluxos, é o contrato do que precisa ser testado.
   - `varredura/SUITES.json`: o particionamento dos fluxos em suítes e o ambiente de cada uma.
   - `varredura/BUGS.md`: achados consolidados, deduplicados, com severidade.
   - `varredura/COBERTURA.md`: matriz fluxo por status, atualizada ao fim de cada onda.
   - `varredura/RELATORIO-VARREDURA.md`: relatório final.
   - `varredura/suites/<id>/`: relatório bruto e evidências de cada frente.
4. **Instalar o hook de continuidade** se ainda não estiver no `.claude/settings.json` do projeto: `node <pasta-da-skill-full-automatico>/scripts/instalar-hook.js .`
5. **Git como rede de proteção.** Branch `varredura/<slug-do-projeto>` a partir do estado atual, commit inicial. As branches das frentes saem daqui.
6. **Deixar o sistema de pé em ambiente local**, e registrar o passo a passo em `.full-auto/varredura/AMBIENTE.md`:
   - instalação limpa das dependências, build, typecheck, subir back-end e front-end,
   - `.env` local a partir do `.env.example`, com valores falsos e integrações externas apontando para mock,
   - banco local (Supabase CLI, Docker, SQLite, o que o projeto usar) com as migrations aplicadas,
   - **seed determinístico de QA** com um usuário por papel e dados que cubram os estados chatos: lista vazia, um item, muitos itens, texto longo, acentuação, registro inativo ou arquivado. Se o projeto não tem seed, escrever um (`npm run seed:qa`) é a primeira tarefa, roda pelo `/ciclo` e fica no repositório.
   - **Se o app não sobe**, tente até 3 abordagens diferentes de setup. Continuou sem subir: isso é um bug S1 bloqueante, escreva em `BUGS.md`, coloque `status: AGUARDANDO_MATHEUS` e mande uma única mensagem. Sem app de pé não existe varredura.

## Fase 1: Mapear todos os fluxos

Você é quem produz a lista. Leia `references/mapeamento-de-fluxos.md` e combine as cinco fontes que ele descreve: navegação real pelo app, rotas e telas, endpoints e handlers, banco e permissões, testes e documentação existentes.

Cada fluxo vira um bloco no `MAPA-DE-FLUXOS.md`:

```
F07 | área: pedidos | ator: garçom | criticidade: alta
  objetivo: fechar a conta de uma mesa e gerar o comprovante
  entrada: mesa com 3 itens lançados
  passos: abrir /mesas, selecionar mesa 4, "fechar conta", escolher pagamento, confirmar
  esperado: comprovante na tela, pedido vira status=pago, estoque baixa, mesa libera
  variações: pagamento parcial | mesa vazia | duplo clique em confirmar | sem permissão
  origem: navegação + src/pages/Mesas.tsx + POST /api/pedidos/:id/fechar
```

Critérios do mapa:

- **Fluxo é o que o usuário consegue fazer**, não arquivo nem função. "Fechar conta" é fluxo, `formatarMoeda()` não é.
- **Criticidade alta** para tudo que toca dinheiro, autenticação, permissão, dado do cliente e integração externa. Esses são testados primeiro e sempre.
- **Cobrir também o que não é tela:** jobs agendados, webhooks, importação e exportação, e-mail, migrations, políticas de RLS.
- **Nenhum fluxo fica de fora do mapa por ser difícil de testar.** Ele entra no mapa e, se for o caso, sai com status `NAO_TESTADO` e o motivo.

Não peça aprovação do mapa. Lacuna de intenção você resolve pelo comportamento atual do sistema, registrando em `DECISOES.md` que o esperado foi inferido do comportamento e não de especificação.

## Fase 2: Dividir em suítes e disparar as sessões em paralelo

Leia `references/sessoes-paralelas.md`, é o coração desta skill. Resumo do que ele define:

- **Uma suíte é um conjunto de fluxos da mesma área que não disputa dado com outra suíte.** Até 8 fluxos por suíte. Fluxos que compartilham o mesmo registro ficam juntos, na mesma suíte, para não colidirem.
- **Cada suíte roda numa frente isolada**: worktree própria, branch `varredura/qa-<id>`, porta própria, banco ou schema próprio, usuário de teste próprio. Escreva isso em `SUITES.json` e use `scripts/preparar-suites.js` para criar tudo de uma vez.
- **Teto de 10 frentes simultâneas**, na prática 3 a 5 rendem mais. Despache todas as frentes da onda **no mesmo bloco de chamadas**, senão elas rodam em fila.
- **A frente de teste não corrige código de produção.** Ela só executa, observa, guarda evidência, escreve teste automatizado em `tests/` e reporta.
- Os papéis de modelo seguem a skill `multi-model-orchestrator`: fluxo crítico e de segurança nos modelos mais fortes, suíte de cadastro simples e varredura de estado vazio nos mais baratos.

Antes do fan-out, o maestro fixa e commita o que as frentes compartilham: `AMBIENTE.md`, o seed, as credenciais de teste, o formato do relatório e a convenção de nomes dos testes. Depois disso, despacha.

## Fase 3: O que cada frente faz

Prompt de cada frente inclui: os fluxos da suíte, o `MAPA-DE-FLUXOS.md`, o `AMBIENTE.md`, a porta e o banco dela, o formato de `references/bug-report.md`, e as proibições. Dentro da frente, para cada fluxo:

1. **Executar o caminho feliz de verdade**, no app rodando, com o usuário do papel certo. Ler código não é testar.
2. **Executar as variações** listadas no mapa mais a bateria obrigatória: validação de entrada, permissão negada, lista vazia, volume alto, texto longo, duplo clique, refresh no meio, voltar do navegador, sessão expirada, rede lenta e offline.
3. **Comparar com o esperado** e registrar o resultado: `PASSOU`, `FALHOU`, `FLAKY`, `BLOQUEADO` ou `NAO_TESTADO`, sempre com evidência.
4. **Toda falha é reproduzida 3 vezes** antes de virar bug. Reproduziu 3 de 3, é `FALHOU` confirmado. Reproduziu de forma inconstante, é `FLAKY` com a frequência observada (ex.: 2 de 5). Não reproduziu, não vira bug, vira nota.
5. **Escrever o teste automatizado que fica** para todo fluxo de criticidade alta que passou, em `tests/e2e/<suite>/`, com o seed de QA. Para fluxo que falhou, escrever o teste que falha hoje e marcá-lo como pendente (`test.fail` ou equivalente), assim a correção já nasce com prova.
6. **Encerrar com o relatório da frente** em `.full-auto/varredura/suites/<id>/RELATORIO.md`: status por fluxo, bugs no formato padrão com evidência anexada, testes criados, o que não deu para testar e por quê, e mudanças que ela **precisa** em arquivos compartilhados.

Proibições da frente, inegociáveis: não alterar código de produção, não alterar arquivos compartilhados (`package.json`, lockfile, migrations, rotas centrais, `.full-auto/` da cópia principal), não apontar para banco ou API de produção, não usar credencial real, não explorar vulnerabilidade além do mínimo necessário para comprovar que existe.

## Fase 4: Consolidação pelo maestro

Uma frente por vez, conforme forem terminando:

1. Aplicar os pedidos de mudança em arquivos compartilhados (ex.: adicionar Playwright ao `package.json`).
2. Fazer merge da branch da frente, que só contém `tests/` e evidências. Conflito aqui é raro, e se houver, junte as duas mudanças, nunca descarte o trabalho de uma frente.
3. Rodar a bateria completa de testes já integrada depois de cada merge.
4. **Deduplicar os bugs**: mesma causa aparecendo em telas diferentes vira um bug com várias ocorrências, não três bugs. Atribuir severidade S1 a S4 pela escala de `references/bug-report.md` e escrever em `BUGS.md` ordenado por severidade.
5. Atualizar `COBERTURA.md` com a matriz fluxo por status e os totais: quantos fluxos existem, quantos passaram, quantos falharam, quantos ficaram sem teste.
6. Commit, linha no `LOG.md`, `ESTADO.md` atualizado.

Se sobraram fluxos do mapa fora das suítes da onda, monte a próxima onda e repita a Fase 2. A varredura só fecha quando todo fluxo do mapa tem um status.

## Fase 5: Modo corrigir (só sob `/varredura corrigir`)

Por padrão a varredura **não corrige nada**, porque um relatório honesto vale mais que uma correção apressada no meio de um QA. Quando o Matheus pedir `/varredura corrigir`, ou quando ele tiver dito desde o começo que quer varrer e consertar:

- Ordem: S1, depois S2, depois S3. S4 vira backlog.
- **Correção é sequencial e do maestro**, não paralela. Bugs quebrados em áreas diferentes podem ser paralelizados pelo procedimento do `full-automatico`, mas nunca dois bugs no mesmo arquivo ao mesmo tempo.
- Cada bug roda pela skill `/ciclo`, um bug por commit, na ordem: o teste que reproduz falha, a correção faz passar, a bateria completa continua verde.
- Se a correção quebra qualquer outro teste, `git revert` na hora e o bug volta para `BUGS.md` com nota de tentativa, igual à regra do refino.
- Bug cuja correção exige decisão de produto do Matheus não é corrigido por conta própria, vira linha em `.full-auto/IDEIAS-DE-PRODUTO.md` e fica documentado no bug.
- Ao final, **reexecutar a suíte afetada inteira**, não só o teste do bug, e atualizar `COBERTURA.md`.

## Quando falar com o Matheus

O filtro de `references/escalacao.md` vale inteiro. Específicos deste modo:

- **Escala imediatamente, em uma única mensagem:** falha de segurança que expõe dado de cliente ou permite acesso indevido em produção, suspeita de que o ambiente de teste está apontando para dado real, e app que não sobe depois de 3 tentativas de setup.
- **Não escala:** bug encontrado, por pior que seja, se o sistema não estiver em produção com aquele caminho exposto (registra e segue), dúvida sobre qual é o comportamento correto (usa o comportamento atual como esperado e registra), fluxo que não dá para testar sem credencial paga (mock, `NAO_TESTADO` com motivo, item em `PENDENCIAS-DO-MATHEUS.md`), decisão de ferramenta de teste, e escolha de quantas suítes rodar.

## Honestidade (inegociável)

A varredura inteira existe para o Matheus poder confiar no número no fim. Portanto:

- `NAO_TESTADO` é um status legítimo e aparece no relatório, inventar `PASSOU` é o pior erro possível nesta skill.
- Fluxo cujo teste você escreveu mas não executou é `NAO_TESTADO`, não `PASSOU`.
- Bug sem passo a passo que você mesmo reproduziu não entra em `BUGS.md`.
- Não infle a lista com preferência de estilo sua, e não esconda bug feio para o relatório ficar bonito.
- Porcentagem de cobertura só entra no relatório se vier de execução medida, não de estimativa.

## Encerramento

1. Verificação final: instalação limpa, build, bateria de testes criada rodando inteira num único comando.
2. Escrever `.full-auto/varredura/RELATORIO-VARREDURA.md` pelo modelo de `assets/templates/`: quantos fluxos foram mapeados e testados, matriz de cobertura, bugs por severidade com reprodução, fluxos `NAO_TESTADO` com motivo, testes que ficaram no repositório e como rodá-los, e as pendências dele.
3. `ESTADO.md` para `CONCLUIDO` (ou `AGUARDANDO_MATHEUS` se escalou).
4. Mensagem final curta: quantos fluxos existem, quantos passaram, os S1 e S2 em uma linha cada, o comando único para rodar a bateria, e como pedir a correção (`/varredura corrigir`).
