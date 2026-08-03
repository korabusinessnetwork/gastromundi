# Laboratório de ciclo contínuo — PDV Haiku 4.5

Um loop infinito que melhora uma aplicação **automaticamente**, rodando localmente no
Windows com o modelo mais barato do Claude.

## O quê?

- **Aplicação:** PDV offline (React+Vite, localStorage, sem backend)
- **Modelo:** Claude Haiku 4.5 (US$ 1,00/1M entrada)
- **Ciclo:** especifica → constrói → testa → revisa → aprende → fecha (8 passos)
- **Repetição:** infinita ou controlada (arquivo `STOP`)
- **Memória:** disco (`memory/`), ledger (`specs/_loop.md`), Obsidian

Decisão técnica completa: veja `docs/08_DECISOES/adr-010.md`.

## Bootstrap

```powershell
cd $REPO_GASTROMUNDI
.\tools\ciclo-lab\bootstrap.ps1
```

Isso cria `D:\projetos\pdv-lab` com:
- Estrutura Vite+React pronta
- Testes verdes (semente)
- Comandos do operador (`.claude/commands/*.md`)
- Portão de segurança (git push bloqueado)
- Git inicializado

**Verificação pós-bootstrap:**

```powershell
cd D:\projetos\pdv-lab
npm install
npm test       # deve passar (testes da semente)
node tools/smoke.mjs --rota=/  # sobe o dev server, abre no navegador, screenshot
```

## Rodar o loop

```powershell
$repo = "C:\Users\...\gastromundi"  # caminho do GastroMundi
& "$repo\tools\ciclo-lab\run.ps1"
```

Isso executa infinitamente:

```
claude -p "/ciclo-lab" \
  --model claude-haiku-4-5 \
  --permission-mode acceptEdits
```

Cada rodada:
1. Reconstrói estado de `specs/_loop.md`, `memory/`, `backlog/`
2. Roda `/ciclo-lab` (escolhe item, especifica, constrói, testa, revisa, aprende)
3. Escreve entrada no ledger e no Obsidian
4. Grava custo em `.loop/custo.csv`
5. Continua

**Para parar:**

```powershell
# Criar um arquivo STOP na raiz do lab
New-Item D:\projetos\pdv-lab\STOP
# A próxima rodada vai ver e encerrar
```

## Limite de rodadas (piloto)

Para a primeira vez, rode limitado a 20 rodadas (não infinito):

```powershell
& "$repo\tools\ciclo-lab\run.ps1" -MaxRodadas 20
```

Depois, leia `D:\projetos\pdv-lab\.loop\custo.csv` e avalie se o custo real bate com a
estimativa. Então deixe rodando sem limite.

## Arquivos chave

```
D:\projetos\pdv-lab\              ← Laboratório (repo local, não pushed)
├── src/                          ← Código React
├── specs/                        ← Uma spec por rodada + _loop.md (ledger)
├── memory/                       ← learnings, patterns, bugs, decisions
├── backlog/                      ← features, bugs, tech-debt (TODO items)
├── .claude/
│   ├── commands/                 ← ciclo-lab.md, proximo.md, spec.md, …
│   ├── hooks/deny-push.mjs       ← Portão: nega git push, rm -rf, rede
│   └── settings.json             ← Allowlist: npm test, git commit…
├── .loop/
│   ├── custo.csv                 ← Rodada, custo USD, duração
│   └── run.log                   ← Erros e warnings
├── .githooks/post-commit         ← Escreve nota em Obsidian após cada commit
└── tools/smoke.mjs               ← Testa a rota em navegador, screenshot

D:\Vault\kora\                    ← Obsidian (já existe)
├── Commits/                      ← Uma nota por commit (post-commit hook)
├── Reviews/                      ← Uma nota por review (passo 6 do /ciclo-lab)
├── Ciclos/                       ← Uma nota por rodada (passo 8)
├── Aprendizados/                 ← Digest de meta-rodadas (cada 10)
└── Screenshots/                  ← smoke test screenshot (rodada-N.png)
```

## Operação (para o Claude no contexto de uma rodada)

Cada invocação de `claude -p "/ciclo-lab"` recebe um contexto novo. O `/ciclo-lab`
orquestra oito passos em sequência:

1. **`/proximo`** — escolhe o item (suíte vermelha > bugs > features > tech-debt)
2. **`/spec`** — escreve `specs/<slug>.md` (7 seções + rota de smoke + por que é intuitiva)
3. **`/build`** — implementa exatamente no escopo
4. **Portão 1** — `npm test` verde, ou reverte
5. **Portão 2** — `node tools/smoke.mjs` passa, ou reverte
6. **`/review`** — audita critério por critério, anexa tabela no fim da spec
7. **`/aprender`** — grava em `memory/` o que a rodada ensinou
8. **Fecha** — `git commit`, escreve no ledger e em Obsidian

Se rodada % 10 == 0, roda `/meta` em vez de `/ciclo` — revisa o próprio `/ciclo-lab`.

## Segurança

### Git

- **Portão nega:** `git push`, `git remote`, `git config`, `--no-verify`, `--no-gpg-sign`
- **Portão permite:** `git commit`, `git add`, `git diff`, `git status`, `git reset --hard`
  (o reset é necessário para o portão 1)

### Escrita

- **Portão nega:** Write/Edit/NotebookEdit fora de `D:\projetos\pdv-lab` ou
  `D:\Vault\kora`

### Rede

- **Portão nega:** `curl`, `wget`, `npm publish`, `gh`

Tudo roda localmente, offline. A aplicação é standalone.

## Padrões

Herdados do GastroMundi, de `CLAUDE.md`:

- **Dinheiro em centavos inteiros** — nunca float
- **JS/TS camelCase**, componentes **PascalCase**
- **CSS separado de JSX** (um `.css` per componente, co-localizado)
- **Função pura = teste** — novo puro código nasceu com `.test.js`
- **Intuitividade** — cada tela nova precisa justificar por que é óbvia
- **Sem hardcode** — nada de marca, logo, cor ou regra do cliente
- **Validação e try/catch** — storage pode falhar, balcão não pode parar

## Custo e limite

- **Preço Haiku 4.5:** US$ 1,00/1M entrada, US$ 5,00/1M saída
- **Estimativa por rodada:** ~40–80K entrada + ~8–15K saída → **US$ 0.10–0.25**
- **Ritmo:** ~3–5 min/rodada → ~12–20 rodadas/hora
- **Sem teto, 24h:** **US$ 36–120/dia** (API) ou consumo de cota até limite semanal
  (assinatura)

Mitigation:
- Arquivo `STOP` para parar na próxima rodada
- `custo.csv` com rastreamento real
- Flag `-MaxRodadas` para pilot (20 rodadas recomendadas antes de soltar infinito)

## Aprender mais

- `docs/03_REGRAS_DE_NEGOCIO/PDV.md` — regras de negócio que o PDV respeita
- `docs/08_DECISOES/adr-010.md` — decisão técnica completa
- `.claude/commands/ciclo-lab.md` — orquestração de uma rodada
- `/home/user/gastromundi/specs/_loop.md` — ledger de 33 rodadas do GastroMundi (referência)

## Troubleshooting

### Claude CLI não encontrado

```powershell
# Certifique-se que tem claude CLI instalado e no PATH
claude --version
# Se não, instale: https://code.claude.com
```

### npm install falha

```powershell
cd D:\projetos\pdv-lab
npm install --legacy-peer-deps  # se precisar
```

### Smoke falha

```powershell
cd D:\projetos\pdv-lab
# Manualmente:
npx vite --port 5174
# Em outro terminal:
node tools/smoke.mjs --rota=/ --debug
```

### `.loop/run.log` mostra erro de rodada

```powershell
cd D:\projetos\pdv-lab
git log --oneline -5   # vê os commits
git diff HEAD~1        # vê o que mudou
```

Cada linha do `.loop/run.log` tem exit code e output da rodada que falhou — útil pra
diagnosticar.

---

**Desenvolvido para:** GastroMundi  
**Decisão:** ADR-010  
**Alvo:** Melhoria contínua com modelo barato, sem limites de turnos  
**Status:** Em implementação (bootstrap e semente testados)
