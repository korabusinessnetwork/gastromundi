# Setup no Claude Code

## 1. Instalar a skill

Pessoal (vale para todos os projetos):

```powershell
# Windows / PowerShell
Expand-Archive full-automatico.skill -DestinationPath $HOME\.claude\skills\
```

Ou por projeto: coloque a pasta em `.claude/skills/full-automatico/` na raiz do repositório.

Invocação: `/full-automatico <plano ou caminho do plano>` ou só falar "full automático" com o plano.

## 1.1 Pré-requisito: skill `/ciclo`

O Full Automático executa toda tarefa pela skill `/ciclo`. Ela precisa estar instalada (em `~/.claude/skills/` ou no projeto) e **não pode ter `disable-model-invocation: true`** no frontmatter, senão o Claude não consegue chamá-la sozinho. Sem ela, o Full Automático faz o ciclo manualmente e anota a pendência.

## 2. Iniciar a sessão sem prompts de permissão

Modo recomendado: **auto mode**. Um classificador revisa as ações no lugar do Matheus, então não aparece pedido de confirmação a cada comando, mas ações perigosas continuam barradas.

```powershell
claude --permission-mode auto
```

Observações:
- Em planos Pro, Max e Team o auto mode já é o padrão no terminal.
- `"defaultMode": "auto"` no `.claude/settings.json` do projeto NÃO tem efeito; use a flag ou o `~/.claude/settings.json`.
- `--dangerously-skip-permissions` só dentro de container ou VM isolada. Nunca na máquina principal.

## 3. Hook de continuidade (Stop hook)

O script `scripts/instalar-hook.js` faz isto automaticamente:

```powershell
node <pasta-da-skill>/scripts/instalar-hook.js .
# com travas extras de segurança (recomendado):
node <pasta-da-skill>/scripts/instalar-hook.js . --com-protecoes
```

Resultado no `.claude/settings.json` do projeto:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/full-auto-stop.js"]
          }
        ]
      }
    ]
  }
}
```

Como o hook decide:
- Sem pasta `.full-auto/` no projeto → não interfere (a skill não está ativa).
- `status: CONCLUIDO`, `AGUARDANDO_MATHEUS` ou `PAUSADO` no `ESTADO.md` → deixa parar.
- Existe `[ ]` ou `[~]` no `TAREFAS.md` → bloqueia a parada e manda continuar.
- Tudo marcado mas status não é `CONCLUIDO` → bloqueia uma vez pedindo o relatório final.
- Se nada mudar em `TAREFAS.md`/`ESTADO.md` entre 3 bloqueios seguidos → deixa parar (evita loop infinito quando o Claude travou de verdade) e anota no `LOG.md`.

O Claude Code encerra o turno após 8 bloqueios consecutivos de Stop hook. Para execuções muito longas, retome com `/full-automatico continuar`, ou deixe uma rede de segurança rodando na sessão:

```
/loop 20m /full-automatico continuar
```

(O `/loop` vale só enquanto a sessão estiver aberta e expira em 7 dias.)

Para pausar manualmente: troque o status no `ESTADO.md` para `PAUSADO`.

## 3.1 Paralelismo

O instalador também configura, sem apagar nada existente:
- `"worktree": { "baseRef": "head" }` no `settings.json`, para as frentes paralelas partirem do trabalho atual.
- `.worktreeinclude` com `.env` e `.env.local`, para cada worktree receber as variáveis de ambiente.

Para abrir sessões paralelas por trilha (modo B de `references/paralelismo.md`):

```powershell
claude --worktree api --permission-mode auto
# dentro da sessão:
/full-automatico trilha api
```

## 4. Travas de segurança (`--com-protecoes`)

Adiciona ao `settings.json`:

- **deny** (bloqueado sempre): `git push --force`, `git push -f`.
- **ask** (sempre pede confirmação, mesmo no auto mode): `git push`, `supabase db push`, `vercel --prod`, `npm publish`.

As regras `ask` são intencionais: são exatamente as ações de "extrema necessidade", então elas chamam o Matheus por construção, mesmo que o Claude esqueça o filtro.
