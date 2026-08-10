# VALIDATION — /palm mobile (garçom + comanda)

Fase 3 do fluxo do orquestrador multi-modelo. Objetivo: substituir o `/palm`
antigo (`MobilePage.jsx` monolítico com estilo inline) pela nova UI mobile
das telas 1a–1h, **preservando 100% da lógica de negócio** e separando CSS
do JSX (decisão 018). Escopo travado com o dono: "Núcleo garçom+comanda" +
"Substituir /palm pelo novo".

## Arquitetura entregue

- **Shell** `src/pages/mobile/MobilePage.jsx` — guarda todo o estado e handlers
  (idênticos à versão anterior), orquestra componentes puros e faz a
  navegação por 4 abas.
- **Layout** `src/pages/mobile/MobilePage.css` — só esqueleto (coluna rolável +
  barra fixa + pill offline). Tokens `--gm-*`, sem hex.
- **Componentes apresentacionais** em `src/pages/mobile/` (12 + `fmt.js`),
  cada um com CSS co-localizado.

## Checagens executadas

| Checagem | Ferramenta | Resultado |
| --- | --- | --- |
| Resolução de todos os imports (shell + 12 componentes + CSS) | `esbuild --bundle` | ✅ 787.8 kb JS / 60.2 kb CSS, 0 warning |
| Sintaxe JSX do shell e das sheets | `esbuild` (loader jsx) | ✅ |
| Suíte completa (unidade + componentes PDV) | `vitest run` | ✅ 107 arquivos, **1432 testes** |
| Token `warn` no design system (`colors.test.js`) | `vitest` | ✅ (dentro dos 1432) |
| Consistência consumidor↔produtor (props) | revisão manual + bundle | ✅ (ver abaixo) |
| `AppContext` expõe `moduloHabilitado` e `tenant` | `grep` (linha 1431) | ✅ |
| Sem referência a símbolos removidos (`mode`, `AMBER`, `sz`, `varColor`…) | `grep` | ✅ (só comentário/1 string literal) |
| Artefato `package-lock.json` | `git checkout --` | ✅ revertido |

## Defeitos encontrados e corrigidos (Fase 3)

1. **Comentário CSS terminando cedo** — 3 arquivos de componente
   (`PedidoTab.css`, `EsperasSheet.css`, `DetalheComandaSheet.css`) tinham
   `--gm-*/--fs-*/--lh-*` dentro de `/* … */`; o `*/` de `--gm-*/` fechava o
   comentário antes da hora, jogando o resto como CSS solto. Reescrito para
   `--gm, --fs, --lh`. Bundle voltou a 0 warning.
2. **`LancarSheet` sem saída** — o design não previa `onFechar` (passo
   obrigatório). Adicionado `onFechar` **opcional**: um "×" discreto no
   cabeçalho, renderizado só quando o shell passa o callback (backward
   compatible). CSS `.lancar-sheet__fechar` co-localizado.

## Adaptadores de dados (ponto de atrito consumidor↔produtor)

O shell traduz os formatos internos para o que cada componente espera:

- **EsperasSheet** — helper produz `{comanda, mesa, items}`; a sheet quer
  `{id, nome, itensTexto, total, erro}`. Adaptado no shell; `onRemover(id)`
  remove por `comanda` via `removerEspera`, fechando a sheet quando esvazia.
- **Radar de oportunidades** — `radarOportunidades` não traz `onClick`; o
  shell injeta `onClick` que abre o detalhe da comanda correspondente.
- **ComandasTab** — `estadoDaOrder` deriva `vazia|comItens|lancada`
  (`lancadas` é um `Set` → `.has(order.id)`).
- **MaisTab** — módulos filtrados por permissão do usuário **e** plano do
  tenant (`moduloHabilitado`); nada hardcodado por cliente (decisão 017).

## Preservação de comportamento

Estado e handlers copiados sem alteração de lógica; única renomeação:
`mode` (pedido/grid/painel) → `aba` (pedido/comandas/painel/**mais** nova).
Guardas de tela cheia mantidas (bootstrap + caixa fechado); offline segue
**não-bloqueante** (pill flutuante), preservando o modo offline-first.
`AMBER` inline (`#f59e0b`) substituído pelo token de marca `--gm-warn`.

## Veredito

✅ **Aprovado.** Bundle limpo, 1432 testes verdes, props consistentes,
lógica preservada, CSS separado do JSX. Pronto para integração.
