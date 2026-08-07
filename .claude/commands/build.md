---
description: Implementa a partir do spec mais recente, seguindo os padrões do projeto
---

Argumento opcional (caminho do spec, se não for o mais recente): $ARGUMENTS

1. Localize o spec: use o arquivo indicado em $ARGUMENTS, ou o mais recente em `specs/` caso nada seja informado.
2. Releia o spec inteiro antes de tocar em qualquer arquivo — inclusive a seção "Origem e decisões que este item honra", que é onde moram as decisões que o dono já tomou na entrevista do `/spec`.
3. Implemente exatamente o que está no escopo — nada do que está listado em "fora de escopo".
4. Siga os padrões já estabelecidos do projeto sem perguntar:
   - SQL em snake_case, migrations no formato `YYYYMMDD_descricao.sql`
   - JS/TS em camelCase, componentes React em PascalCase
   - RLS e políticas de segurança quando a tabela envolver dados multi-tenant
   - Aritmética de valores monetários sempre em inteiros (centavos), nunca float
   - Nada de `console.log` esquecido, nada de TODO sem justificativa
5. Ao concluir cada critério de aceite do spec, marque mentalmente como implementado — isso será conferido no `/review`.
6. **Se você esbarrar numa decisão que o spec não resolve, isso é uma falha do spec, não sua deixa para adivinhar.** Pare. Faça a pergunta no formato do grilling — numerada, com a sua recomendação:

```
❓ **Q1** — **<título>**: <o que o spec não resolve>

➡️ <o que você faria, e por quê>
```

   Quando o dono responder, **escreva a resposta de volta no spec** (em "Origem e decisões" e, se ela restringe comportamento, como critério de aceite novo) antes de continuar. Decisão que fica só no chat some na rodada seguinte.
7. Não rode testes de aprovação aqui — isso é responsabilidade do `/review`. Este comando só constrói.
8. Ao final, reporte:
   - Arquivos criados/modificados
   - Quais critérios de aceite você acredita já estarem cobertos
   - Qualquer desvio do spec que você teve que fazer, e por quê

Termine com: "Build concluído. Rode /review para auditar contra o spec."
