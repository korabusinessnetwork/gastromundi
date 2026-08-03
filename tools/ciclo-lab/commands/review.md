---
description: Audita o build contra a spec, corrige o que for seguro, e anexa a tabela de evidências
---

Spec (opcional; se vazio, use o mais recente em `specs/`): $ARGUMENTS

1. Releia a spec e **todos** os arquivos que o `/build` tocou. Não confie na
   sua memória do que escreveu — releia o que está no disco.
2. Para cada critério de aceite, responda **sim / não / parcial**, com a
   evidência: arquivo, e a linha ou o trecho de código que prova. Critério sem
   evidência conta como "não".
3. Para cada "não" ou "parcial":
   - Correção **segura e não-ambígua** (bug óbvio, campo faltando, edge case
     descoberto, float onde devia ser centavo inteiro, estado vazio sem
     resposta na tela, estilo inline que devia estar no `.css`): corrija agora,
     sem perguntar.
   - Correção que envolve **decisão de produto ou ambiguidade de regra de
     negócio**: não decida sozinho. Registre a pergunta exata para o dono; ela
     vai para "Pendente de decisão" no ledger.
4. Depois de corrigir, **refaça a auditoria do zero**. Não assuma que a correção
   funcionou — releia o arquivo e rode `npm test` de novo.
5. Repita 2–4 até todos os critérios estarem em "sim", ou até só restar item
   que exige decisão humana.
6. Anexe no fim do arquivo da spec a seção:

   ```
   ## 10. Resultado da review — YYYY-MM-DD

   **Aprovado sem ressalvas — X de Y critérios.**
   Suíte: `npm test` — N arquivos / N testes, verde.
   Smoke: verde na rota <rota>.

   | # | Critério | Evidência |
   |---|---|---|
   | 1 | <critério resumido> | <arquivo → função/linha, o que prova> |

   **Fica para uma próxima rodada:** <o que você viu e não fez>
   ```

   O que estiver em "Fica para uma próxima rodada" vai também para
   `backlog/features.md` ou `backlog/tech-debt.md` — senão some.

7. Escreva a mesma tabela em `$KORA_VAULT/Reviews/YYYY-MM-DD-<slug>.md`, com
   front-matter `tipo: review / projeto: pdv-lab / rodada: N`.

## Saída

Se tudo passou: `✅ feito — X de X critérios cobertos, sem ressalvas.`

Se algo precisa do dono:
```
⚠️ revisão parcial — X de Y critérios cobertos.
Corrigido automaticamente: <lista>
Precisa da decisão do dono: <a pergunta específica de cada item>
```

Nunca declare "feito" com um critério ainda em "não". Ou você corrigiu, ou está
listado como pendência. Não existe terceira opção silenciosa — e o ledger da
próxima rodada vai ser lido como verdade.
