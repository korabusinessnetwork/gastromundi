# Skills de escopo global

Estas três skills **não são do GastroMundi**. Elas tratam de fundação de projeto novo,
negócio e conteúdo, e o lugar delas é a sua máquina, valendo em qualquer pasta, não
dentro deste repositório.

Elas estão aqui versionadas por um motivo só: a sessão remota do Claude Code roda num
contêiner descartável, então o que é instalado em `~/.claude/skills/` lá dentro some
quando a sessão acaba. Guardar a cópia no git é o que faz o ajuste sobreviver.

## Como instalar na sua máquina

```bash
cp -r .claude/skills-globais/fundacao-de-projeto              ~/.claude/skills/
cp -r .claude/skills-globais/business-fundamentos-iman-gadzhi ~/.claude/skills/
cp -r .claude/skills-globais/viral                            ~/.claude/skills/
```

No Windows, o caminho equivalente é `C:\Users\<você>\.claude\skills\`.

Depois disso, esta pasta pode continuar aqui como backup. Ela não dispara nada:
o Claude Code só carrega skill de `.claude/skills/`, e esta pasta tem outro nome
de propósito.

## O que foi alterado em relação ao pacote original

| Skill | Alteração |
|---|---|
| `fundacao-de-projeto` | nenhuma, não citava nome |
| `business-fundamentos-iman-gadzhi` | 4 menções ao nome do autor trocadas para Guilherme |
| `viral` | 3 menções trocadas para Guilherme, e `ask_user_input_v0` corrigido para `AskUserQuestion`, que é o nome real da ferramenta no Claude Code |

As listas de ventures dentro das skills continuam citando Casa Coffee Colab e
Atmosfera Viral, que vieram do pacote original. Ficaram como estavam porque não dá
para saber daqui se são suas.
