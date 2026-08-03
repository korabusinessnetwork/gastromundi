# CONSOLE-UX 31 — cobertura de teste dos dois arquivos do Console sem `.test.jsx`

## 1. Escopo

Escrever testes de componente para os únicos dois arquivos do Console da
Plataforma que ainda não têm `.test.jsx`:

- `src/components/console/AlterarLayoutModal.jsx` — troca de layout de um
  estabelecimento existente;
- `src/pages/console/ConsoleLoginPage.jsx` — porta de entrada da plataforma
  (só o papel `plataforma` entra; qualquer outra sessão é encerrada).

Os testes protegem o comportamento que o CLAUDE.md exige verificável: a
prevenção de erro do modal (salvar travado sem mudança, sem clique duplo, erro
do servidor visível) e a barreira de autenticação da tela de login (só
`plataforma` navega para `/console`, o resto é deslogado com aviso).

## 2. Fora de escopo

- Nenhuma mudança em `AlterarLayoutModal.jsx` nem em `ConsoleLoginPage.jsx` —
  esta rodada só adiciona teste; se um teste revelar bug, aí sim o `/review`
  corrige o código.
- Não testar a RPC `alterar_layout_tenant` nem `login()` de verdade (são
  dublados); a fronteira de segurança real é o banco (RLS + SECURITY DEFINER),
  fora do alcance de um teste de componente.
- Não mexer no catálogo `src/layouts/` (tem teste próprio em `index.test.js`).

## 3. Origem e decisões que este item honra

- Ledger `specs/_loop.md`, item recomendado para a rodada 57 (CONSOLE-UX 31).
- CLAUDE.md: "Fluxos críticos do PDV têm testes de componente em
  `src/**/*.test.jsx`" e "**Sempre** verificar autenticação antes de renderizar
  rotas protegidas" — o Console é a ferramenta de venda, mesmo peso.
- Reaproveita as convenções já fixadas nos testes de Console existentes
  (`AlterarPlanoModal.test.jsx`, `NovoEstabelecimentoModal.test.jsx`) e de
  página (`LoginPage.test.jsx`): mock de `@/lib/console` por `vi.hoisted` +
  `vi.importActual`, mock de `@/context/AppContext` via `@/test/mockApp`.

## 4. Arquivos afetados

- `src/components/console/AlterarLayoutModal.test.jsx` (novo)
- `src/pages/console/ConsoleLoginPage.test.jsx` (novo)

Sem arquivo de produção tocado.

## 5. Critérios de aceite

1. `AlterarLayoutModal.test.jsx`: o modal abre com o "Salvar layout"
   **desabilitado** quando a escolha ainda é o layout atual do tenant
   (`semMudanca`), e habilita ao escolher outro layout.
2. `AlterarLayoutModal.test.jsx`: escolher um layout diferente e salvar chama
   `alterarLayout(tenant.id, layoutCodigo)` com o código escolhido e repassa o
   `data` retornado para `onAlterado`.
3. `AlterarLayoutModal.test.jsx`: erro do servidor no salvar aparece na tela
   (`role="alert"`) com a mensagem derivada de `mensagemDeErroDoConsole`, e
   `onAlterado` **não** é chamado.
4. `AlterarLayoutModal.test.jsx`: a descrição do layout escolhido é mostrada
   abaixo do seletor (o super-admin sabe o efeito antes de salvar).
5. `AlterarLayoutModal.test.jsx`: Esc fecha o modal (chama `onFechar`) — o
   contrato do `useFecharModal` para os modais simples do Console.
6. `ConsoleLoginPage.test.jsx`: sessão de papel `plataforma` já ativa navega
   para `/console` (rota-marcador observável) sem mostrar erro.
7. `ConsoleLoginPage.test.jsx`: sessão de papel diferente de `plataforma` é
   deslogada (`logout` chamado) e a tela mostra "Esta conta não tem acesso ao
   Console.", sem navegar para `/console`.
8. `ConsoleLoginPage.test.jsx`: enviar com usuário ou senha vazios mostra
   "Preencha usuário e senha." e **não** chama `login`.
9. `ConsoleLoginPage.test.jsx`: envio válido chama `login(usuario, senha)` com
   o que foi digitado; erro retornado por `login` aparece na tela.
10. Suíte inteira (`npx vitest run`) verde ao final, sem `console.log`
    esquecido nem `TODO` nos arquivos novos.

## 6. Edge cases conhecidos

- `mensagemDeErroDoConsole` retorna `SEM_INTERNET` se `estaOffline()`; em jsdom
  `navigator.onLine` é `true`, então o caminho de erro testável é o de mensagem
  do servidor (usar uma mensagem em português, que passa inteira).
- `setAppMock` não dispara re-render: para o efeito de `plataforma`/recusa,
  montar já com `currentUser` no estado final (mesmo padrão de
  `LoginPage.test.jsx`), não simular a transição null→logado.
- `sanitizeInput(username, 30)` corta espaços/limite; o teste do caminho válido
  usa um usuário simples que sobrevive à sanitização.
- Layout inicial vem de `layoutDoTema(tenant?.tema)`; usar um tenant com
  `tema: { layout: "padrao" }` para o estado inicial ser determinístico.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, `npx vitest run` verde, sem TODO pendente,
sem `console.log` esquecido e sem regressão nos fluxos existentes.
