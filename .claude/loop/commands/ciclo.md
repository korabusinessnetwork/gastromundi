---
description: Roda uma rodada completa do ciclo — planejar, executar, revisar, arrumar, aprender, commitar e apontar o próximo passo
---

Item desta rodada (opcional): $ARGUMENTS

Você vai executar **uma rodada completa** do ciclo e **parar**. O loop não se reinicia sozinho: no
fim você apresenta o próximo item e espera o ok do dono.

## O que rodar, na ordem

Execute cada passo seguindo as instruções do comando correspondente (`spec.md`, `build.md`,
`review.md`, `aprender.md`, `proximo.md`) — os arquivos estão em `~/.claude/commands/`. Não invente
variação: o comportamento de cada passo é o que está escrito lá.

1. **Escolher o item.** Com argumento, é ele. Sem argumento, use o próximo item recomendado em
   `specs/_loop.md`; se o ledger não existir ou não tiver recomendação, rode o passo `/proximo`
   primeiro, apresente a recomendação e **pare** para o dono confirmar.
2. **Planejar** (`/spec`). Ao terminar, mostre escopo, fora de escopo e critérios de aceite, e siga —
   o dono interrompe se discordar.
3. **Executar** (`/build`).
4. **Revisar e arrumar** (`/review`), com as correções e o teto de 3 rodadas.
5. **Aprender** (`/aprender`) — só se a review passou sem ressalvas.
6. **Commit e push** (regras abaixo).
7. **Próximo passo** (`/proximo`).
8. **Atualizar o ledger** `specs/_loop.md` e **parar** com o resumo da rodada.

## Git

Só depois de uma review sem ressalvas:

- **Nunca commite com a suíte de testes vermelha.**
- **Nunca faça push na branch padrão.** Se estiver em `main`/`master`, crie a branch de trabalho
  antes e diga qual criou.
- Commit com o que a rodada tocou, mensagem `<tipo>: <item> (rodada N)` — `feat`, `fix`, `refactor`,
  `docs`, `test`, conforme o trabalho.
- Push com `git push -u origin <branch>`. Em falha de rede, tente de novo com espera crescente
  (2s, 4s, 8s, 16s). Falha que não seja de rede: pare e relate.
- **Não abra pull request** — só quando pedido explicitamente.

## Quando o ciclo trava

Se a review parou numa parada obrigatória, ou o `/spec` bateu no portão de custo:

- **não** faça commit, **não** faça push, **não** rode o `/aprender`;
- escreva a pendência em `specs/_loop.md`;
- apresente a pergunta específica que destrava e pare.

Rodada travada é resultado legítimo. Empurrar código pela metade não é.

## Ledger `specs/_loop.md`

Crie se não existir. Uma seção por rodada, mais recente no topo:

```markdown
## Rodada N — <item> — <data>
- Spec: specs/<slug>.md
- Resultado da review: aprovado sem ressalvas | parcial (<pendências>)
- Aprendido: <o que foi registrado, com o arquivo>
- Commit: <hash curto> na branch <branch>
- Pendente de decisão: <nenhuma | pergunta>
- Próximo item recomendado: <identificador> — <porquê em uma frase>
```

## Resumo final (o que o dono lê)

Termine com, no máximo, uma frase por linha:

1. O que foi construído.
2. O que a review corrigiu sozinha.
3. O que foi aprendido e onde ficou registrado.
4. Commit e branch.
5. O que falta no sistema, em uma frase.
6. Próximo item recomendado e o comando pronto: `/ciclo <item>`.

E pare. A próxima rodada começa quando o dono mandar.
