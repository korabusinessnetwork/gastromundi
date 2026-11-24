# Refatoração 5.1: o guard do estilo inline

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

1. `src/lib/inlineStyleGuard.test.js`, no molde do `travessaoGuard`: lê a árvore de sintaxe
   de cada `.jsx` e conta todo atributo `style` (objeto, variável ou expressão), menos o objeto
   que só atribui variável CSS (`style={{ "--gm-x": valor }}`), o padrão permitido.
2. A contagem de cada arquivo fica em `inlineStyleGuard.linhaDeBase.json` (96 arquivos, 1.516
   atributos). O teste falha se um arquivo sobe, se um arquivo novo aparece com estilo inline,
   e também se um arquivo desce sem a linha de base acompanhar: ela só encolhe e nunca guarda
   folga. Para registrar uma queda: `GERAR_LINHA_DE_BASE=1 npx vitest run src/lib/inlineStyleGuard.test.js`.
3. A contagem mora em `scripts/contarEstiloInline.mjs`, usada pelo guard e pelas métricas: os
   dois números são o mesmo. A métrica antiga contava pelo texto (`style={{`, 1.505) e não via
   `style={variavel}`.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Arquivo novo com estilo inline faz o guard falhar | sabotagem: `components/TmpGuard.jsx` |
| 2 | Tirar estilo sem atualizar a linha de base faz o guard falhar | sabotagem: um `style` a menos no `CartPanel` |
| 3 | Guard e métrica dão o mesmo número | `npm run metricas` = soma da linha de base |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

4 de 4 critérios em sim.
