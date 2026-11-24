---
description: Audita o build contra o spec, corrige o que for seguro sozinho, e só declara feito quando limpo
---

Argumento opcional (caminho do spec, se não for o mais recente): $ARGUMENTS

1. Releia o spec (o indicado em $ARGUMENTS, ou o mais recente em `specs/`).
2. Releia todos os arquivos que o `/build` tocou.
3. Para cada critério de aceite do spec, responda explicitamente sim/não/parcial, com a evidência (linha ou trecho de código).
4. Para cada item marcado como não/parcial:
   - Se a correção for **segura e não-ambígua** (bug óbvio, campo faltando, edge case não tratado, aritmética float onde deveria ser inteiro, RLS ausente): corrija agora mesmo, sem perguntar.
   - Se a correção envolver **decisão de produto, mudança de schema em produção, ou ambiguidade de regra de negócio**: NÃO corrija sozinho. Guarde para a rodada de decisão do passo 7.
5. Depois de corrigir o que era seguro corrigir, refaça a auditoria do zero (não assuma que a correção funcionou — releia o resultado).
6. Repita o passo 3–5 até todos os critérios estarem "sim", ou até só restarem itens que exigem decisão humana.

## 7. A rodada de decisão

O que sobrou para o dono **não é uma lista, é uma rodada de perguntas** — mesmo formato do
grilling. Uma lista de pendências não se resolve sozinha: ela é relida, adiada e herdada
pela rodada seguinte. Uma pergunta com recomendação se responde com uma palavra.

Regras da rodada:

- **Tudo de uma vez.** Junte todas as pendências que dá pra perguntar agora e faça numa
  rodada só, numerada. Uma pendência cuja resposta depende de outra ainda aberta fica para
  a rodada seguinte, não para esta.
- **Toda pergunta com recomendação.** Nunca entregue a pendência crua — diga o que você
  faria e por quê. O dono corrige uma proposta muito mais rápido do que preenche um vazio.
- **Fato é seu, decisão é dele.** Se a pendência depende de algo que dá pra levantar
  (o que o schema já tem, o que um ADR já decidiu, quanto custa a alternativa paga), vá
  levantar antes de perguntar, e traga o número junto.

```
❓ **Q1** — **<título>**: <o que precisa de decisão, e o que trava enquanto não decidir>

➡️ <sua recomendação, com o porquê>
```

**Pendências herdadas.** As pendências antigas listadas em `specs/_loop.md` só continuam
abertas porque são repetidas a cada rodada em vez de perguntadas. Quando esta rodada tocar
a mesma área de uma delas, traga-a para esta rodada de decisão, no mesmo formato e com
recomendação. Fora disso, mantenha só a listagem no ledger — sem insistir.

## Saída final

Se tudo passou:
```
✅ feito — todos os critérios de aceite cobertos, sem ressalvas.
[lista dos critérios com evidência]
```

Se algo precisa de decisão humana:
```
⚠️ revisão parcial — X de Y critérios cobertos.
Corrigido automaticamente: [lista]
Precisa da sua decisão: [as perguntas do passo 7, numeradas e com recomendação]
```

Nunca declare "feito" se houver qualquer critério do spec ainda como "não" — nesse caso, ou você corrigiu, ou está perguntado na rodada de decisão. Não existe terceira opção silenciosa.

## Regras v2 (skill `engenharia-com-evidencia`, adaptadas do obra/superpowers, licença MIT)

Acrescentadas em 2026-11-24 conforme a versão atual da skill `loop-spec-build-review`. Em
conflito com o texto acima, a Regra v2 vence.

- **Duas etapas separadas, a partir do diff:** primeiro o spec (cada critério sim/não/parcial
  com evidência), depois a qualidade (padrões do projeto, segurança, testes). Classifique cada
  problema como crítico, importante ou menor. Crítico trava o "feito".
- **Evidência fresca:** rode build, lint e a suíte completa nesta rodada antes de qualquer
  veredicto. Mostre o comando e o resultado no relatório. Resultado de rodada anterior não vale.
- Correção de bug encontrado no review segue a depuração sistemática: teste que reproduz,
  correção na causa raiz, nova verificação. Se 3 correções falharem, o item vai para "precisa
  da sua decisão" com o diagnóstico.
