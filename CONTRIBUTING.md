# Como trabalhamos no mesmo repositório

Somos várias pessoas empurrando código para o mesmo lugar. Duas regras bastam:
**cada um trabalha na sua branch** e **a `main` só recebe código por Pull Request**.

O repositório força as duas — não depende de ninguém lembrar.

## 1. Configuração (uma vez por máquina)

```bash
npm install
npm run setup:git -- seu-nome      # ex.: npm run setup:git -- bonato
```

Isso grava quem você é (`git config kora.dev`, só na sua máquina, não vai para o
GitHub) e liga os hooks versionados em `.githooks/`.

Nomes em uso: `bonato`, `matheus`, `guilherme`.

## 2. O dia a dia

```bash
git switch main && git pull                 # parte sempre do que está na main
git switch -c bonato/pdv-sangria            # seu-nome/o-que-voce-vai-fazer
# ...trabalha, commita...
npm test
git push -u origin bonato/pdv-sangria
```

Depois abra um Pull Request para a `main` e peça revisão de um sócio.

O nome da branch é `seu-nome/assunto`. Além de organizar a lista no GitHub, é o
que permite ao repositório saber o que é seu.

## 3. O que fica bloqueado

| Situação | Resultado |
|---|---|
| commit ou push na `main` / `master` | bloqueado — use Pull Request |
| commit ou push em branch de outra pessoa | bloqueado |
| commit ou push em branch sem prefixo de nome | bloqueado |
| qualquer coisa na sua própria `seu-nome/...` | liberado |
| branches `claude/...` (sessões do Claude Code na web) | liberado |

O bloqueio acontece em duas camadas, então vale tanto para o terminal quanto para
o Claude Code:

- `.githooks/pre-push` — hook do próprio git, pega o que você digita à mão.
- `.claude/hooks/guard-git-branch.mjs` — hook `PreToolUse`, roda antes de todo
  comando que o Claude executa. É determinístico: instrução escrita no `CLAUDE.md`
  o modelo pode ignorar num dia de contexto cheio; hook, não.

As duas camadas usam a mesma regra, em `scripts/git-guard/guard.mjs`, com testes
em `scripts/git-guard/guard.test.mjs`.

### Precisa mesmo mexer na branch de outra pessoa?

Combine com a pessoa antes e rode só aquele comando com o escape:

```bash
KORA_ALLOW_ANY_BRANCH=1 git push
```

Ele não desliga a proteção da `main` — essa não tem escape local.

## 4. Proteção da `main` no GitHub (feita pelo dono do repositório)

Os hooks rodam na máquina de quem configurou o repositório. Quem clonar e esquecer
o `npm run setup:git` fica sem eles. A rede de segurança que não depende de máquina
nenhuma é a do GitHub — configure uma vez:

**Settings → Branches → Add branch protection rule**, com `main` em *Branch name
pattern*, e marque:

- **Require a pull request before merging** — com *Require approvals: 1*
- **Do not allow bypassing the above settings** (vale também para administradores)

Com isso, push direto na `main` passa a ser impossível no servidor, para qualquer
pessoa e qualquer ferramenta.
