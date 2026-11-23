# Refatoração 2.1 e 2.2: prova de redesenho e fatia da sessão

> Pedido do dono (2026-11-23): *"pode seguir"*, com a fase 2 absorvendo a tarefa 1.5.

## 2.1, prova de redesenho

Teste com o `AppProvider` real mostrando que a tela que só lê o usuário logado é
redesenhada quando a taxa de serviço muda. Escrito com `it.fails`: descreve o
comportamento desejado, passa hoje porque falha, e quebra de propósito no dia em que a
tarefa 2.8 trocar a sonda para `useSessao()`.

## 2.2, fatia da sessão

- Chamadas de Auth, `users` e `role_permissions` saem do contexto para
  `features/sessao/dados/` (parte da tarefa 1.5).
- `useFuncaoEstavel`: identidade fixa para as ações, sempre chamando a versão atual.
- `SessaoContext` e `useSessao()`, com valor memorizado: usuário logado, equipe,
  estabelecimento, assinatura, permissões por cargo, plano e as ações da sessão.
- Forma da divisão registrada no plano: o estado continua no `AppProvider` até a 2.7 e
  muda de lugar na 2.9, nova.

## Fora de escopo

- Trocar `useApp()` por `useSessao()` nas telas (tarefa 2.8).
- Mover o estado da sessão para fora do `AppProvider` (tarefa 2.9).

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | O teste da 2.1 falha pelo motivo certo (redesenho a mais), e está marcado `it.fails` | cópia temporária com `it` comum; suíte |
| 2 | Tela lendo `useSessao()` não é redesenhada quando a taxa de serviço muda | teste |
| 3 | As ações da sessão têm a mesma identidade entre renders | teste |
| 4 | `useSessao()` fora do provedor dá erro claro | teste |
| 5 | Nenhuma chamada a Auth, `users` ou `role_permissions` no `AppContext.jsx` | `grep` |
| 6 | Os 10 arquivos de teste do contexto passam sem alteração | suíte; diff |
| 7 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 8 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
