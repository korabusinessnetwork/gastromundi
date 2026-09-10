# Paralelismo sem colisão

O Full Automático pode rodar várias frentes ao mesmo tempo. Este arquivo define como fazer isso sem uma frente sobrescrever a outra.

## Vocabulário

- **Maestro:** a sessão principal do Full Automático. É a única que escreve em `.full-auto/`, decide as ondas e integra o trabalho.
- **Frente:** uma unidade de trabalho paralela. Pode ser um subagente (modo A) ou uma sessão separada do Claude Code (modo B).
- **Trilha:** um grupo de tarefas que só mexe em uma parte do projeto (ex.: `api`, `front`, `admin`, `docs`).
- **Onda:** um conjunto de tarefas sem dependência entre si, que rodam juntas.

## Quando paralelizar

Paralelize quando houver 2 ou mais tarefas `[ ]` que:
1. não dependem uma da outra (coluna `depende:`),
2. estão em trilhas diferentes, e
3. não precisam alterar os mesmos arquivos compartilhados.

Não paralelize: a fundação inicial, a criação do modelo de dados, e a integração final. Essas são sempre sequenciais e do maestro.

Teto: até 10 frentes simultâneas. Na prática, 3 a 5 costuma render mais, porque cada merge custa uma verificação.

## Modo A: subagentes na mesma sessão (padrão)

1. O maestro escreve os **contratos** da onda (interfaces, rotas, formatos de dados, tipos) num arquivo commitado, ex.: `docs/contratos/onda-2.md`, e faz commit. As frentes partem desse commit.
2. Para cada tarefa da onda, despacha um subagente **com isolamento de worktree** (cada um recebe uma cópia própria do repositório numa branch própria). Todos no mesmo bloco de chamadas, para rodarem ao mesmo tempo.
3. O prompt de cada subagente contém:
   - a tarefa e o critério de pronto,
   - os diretórios que ele pode alterar (e só esses),
   - o contrato da onda,
   - a instrução de rodar a tarefa pelo `/ciclo`, respondendo sozinho qualquer pergunta que o `/ciclo` faria,
   - a proibição de alterar arquivos compartilhados,
   - a instrução de terminar com: branch, arquivos alterados, resultado da verificação, e mudanças que ele **precisa** em arquivos compartilhados (ex.: "adicionar dependência zod").
4. Os papéis de modelo seguem a skill `multi-model-orchestrator`.

## Modo B: várias sessões do Claude Code em paralelo

Use quando o Matheus quiser abrir várias sessões ou quando as trilhas forem grandes.

1. O maestro divide o `TAREFAS.md` em trilhas e cria `.full-auto/trilhas/<trilha>.md` para cada uma, com as tarefas daquela trilha. Commit.
2. O Matheus (ou o maestro, se tiver como abrir sessões em segundo plano) inicia uma sessão por trilha:
   ```
   claude --worktree <trilha> --permission-mode auto
   /full-automatico trilha <trilha>
   ```
3. Numa sessão de trilha, o Full Automático:
   - copia `.full-auto/trilhas/<trilha>.md` para o `TAREFAS.md` da própria worktree (o Stop hook passa a olhar só as tarefas dela),
   - trabalha só nos diretórios da trilha,
   - não altera arquivos compartilhados; anota o que precisa em `.full-auto/PEDIDOS-AO-MAESTRO.md`,
   - ao terminar, marca `status: CONCLUIDO` na própria worktree e faz commit na branch dela.
4. O maestro, na cópia principal, integra as branches das trilhas conforme forem terminando.

## Arquivos compartilhados (só o maestro altera)

- `package.json`, lockfiles (`package-lock.json`, `pnpm-lock.yaml`), configs de build e lint
- migrations e schema do banco (evita colisão de timestamp e de ordem)
- arquivos de registro central: rotas principais, `index` de exports, providers, menu
- tipos e contratos compartilhados
- `.env.example`, `README.md`, `CLAUDE.md`, `memory/`, `docs/` de governança
- tudo em `.full-auto/` da cópia principal

Se uma frente precisa mudar um desses, ela pede no relatório. O maestro aplica antes de integrar.

## Integração (merge) pelo maestro

Para cada frente que terminou, uma por vez:
1. Aplica os pedidos de mudança em arquivos compartilhados.
2. Faz merge da branch da frente na branch `full-auto/<slug>`.
3. Se houver conflito: junta as duas mudanças. **Nunca** usa `--ours`/`--theirs` às cegas nem descarta trabalho de uma frente. Se o conflito for de lógica e não der para juntar, a frente mais recente é refeita em cima do resultado atual (volta para `[ ]` com nota).
4. Roda a verificação completa (install, build, testes). Quebrou: corrige antes de integrar a próxima.
5. Marca as tarefas como `[x]` no `TAREFAS.md` principal, registra no `LOG.md`.

## Outros cuidados

- **Portas:** frentes que sobem o app usam portas diferentes (ex.: 5173, 5174, 5175...).
- **Banco local:** cada frente usa o próprio banco local ou schema de teste; nunca o mesmo arquivo SQLite ao mesmo tempo.
- **Base das worktrees:** o `settings.json` do projeto precisa de `"worktree": { "baseRef": "head" }` para as frentes partirem do trabalho atual, e não da `main`. O `instalar-hook.js` já configura isso.
- **Arquivos fora do git:** o `.worktreeinclude` na raiz copia `.env` e `.env.local` para cada worktree. O `instalar-hook.js` já cria.
- **Limpeza:** worktrees de subagente sem mudanças são removidas sozinhas. As outras, o maestro remove depois do merge (`git worktree remove`).
