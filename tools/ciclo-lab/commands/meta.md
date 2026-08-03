---
description: Meta-rodada — o operador revisa e reescreve o próprio operador
---

Esta é uma **meta-rodada** (a cada 10). Você não vai melhorar a aplicação hoje;
vai melhorar o processo que melhora a aplicação.

**Você não pode tocar em `src/`.** Nenhum arquivo de aplicação, nenhum teste de
aplicação. Se a vontade de consertar algo em `src/` aparecer, escreva no
backlog e siga.

## 1. Leia o histórico

- As **últimas 10 rodadas** do ledger `specs/_loop.md`, inteiras.
- `memory/learnings.md` e `memory/bugs.md` completos.
- Os comandos atuais em `.claude/commands/*.md` — são eles que você pode mudar.

## 2. Responda quatro perguntas, com evidência do ledger

1. **O que se repetiu?** Mesmo bug, mesmo tipo de item, mesma lição escrita duas
   vezes com palavras diferentes.
2. **Qual passo desperdiçou rodada?** Rodada revertida no portão 1 ou 2, rodada
   que entregou menos do que a spec prometia, spec que precisou ser reescrita
   no meio.
3. **Qual instrução do `/ciclo-lab` (ou dos sub-comandos) gerou retrabalho?**
   Instrução ambígua, ordem errada de passos, verificação que não pegou o que
   devia pegar.
4. **O que o laboratório aprendeu que vale para fora dele?** Isto é o digest —
   o que atravessa para outros projetos e outros modelos.

Se uma pergunta não tiver evidência nas 10 rodadas, responda "nada a apontar" e
siga. **Meta-rodada que inventa problema para ter o que consertar piora o
processo** — não mudar nada é um resultado legítimo e deve ser registrado como
tal.

## 3. Mude o que a evidência sustenta

Você pode editar:
- `.claude/commands/*.md` — os próprios prompts do operador.
- `memory/patterns.md` — consolidar padrões repetidos, remover o que já não vale.

Uma mudança por meta-rodada, no máximo duas. Cada mudança precisa apontar a
rodada do ledger que a justifica. Prompt que só cresce fica caro e vago: se for
acrescentar instrução, veja primeiro o que dá para tirar.

## 4. Feche

- Commit **separado**, mensagem `meta(ciclo): <o que mudou> (meta N)`. Separado
  de propósito: se a mudança piorar o processo, uma meta-rodada futura reverte
  só ela.
- Bloco no topo do ledger:

  ```
  ## Rodada N — META (<o que mudou no processo>) — YYYY-MM-DD
  - Tipo: meta-rodada
  - O que se repetiu: <...>
  - Passo que desperdiçou rodada: <...>
  - Instrução ajustada: <arquivo e o que mudou, com a rodada que justifica>
  - Não mudei: <o que você considerou e deixou como está, e por quê>
  - Commit: <sha> na branch <branch>
  - Próximo item recomendado: <volta ao ciclo normal com qual item>
  ```

- Digest em `$KORA_VAULT/Aprendizados/YYYY-MM-DD-meta-N.md`, front-matter
  `tipo: aprendizado / projeto: pdv-lab / meta: N`. Escreva para alguém que
  **não conhece este laboratório**: o padrão descoberto, por que ele apareceu, e
  onde mais ele valeria. É esta nota que atravessa para o GastroMundi e para
  outros modelos — promover o conteúdo dela continua sendo decisão humana.

Termine com: `Meta N concluída — <mudou o quê, ou "nenhuma mudança: sem evidência">.`
