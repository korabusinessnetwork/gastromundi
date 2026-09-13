# Mapeamento de fluxos

Como montar o `MAPA-DE-FLUXOS.md` sem depender do Matheus. Nenhuma fonte sozinha dá o mapa completo, use as cinco e cruze o resultado.

## Fonte 1: navegar no app (a mais importante)

Suba o sistema e use como usuário, um papel por vez. Clique em tudo que é clicável, abra todo item de menu, todo botão de ação, todo modal.

Anote enquanto navega:
- toda ação que muda estado (criar, editar, excluir, aprovar, pagar, enviar, importar, exportar),
- toda tela que só lê dado (também é fluxo, com variações de filtro, busca, ordenação e paginação),
- todo caminho que leva a outra tela, inclusive os que só aparecem em certos estados.

Se existirem papéis diferentes (admin, operador, cliente), navegue com cada um. O que um papel vê e o outro não vê é fluxo de permissão, e permissão é criticidade alta por padrão.

## Fonte 2: rotas e telas

Leia o roteador do front (`routes`, `App.tsx`, pasta `pages/` ou `app/`) e liste todas as rotas, inclusive as que não têm link no menu. Rota sem link costuma ser rota esquecida, e rota esquecida costuma estar quebrada ou desprotegida.

Para cada rota: quem pode acessar, o que ela carrega, quais ações ela oferece, o que acontece com id inexistente na URL.

## Fonte 3: endpoints e handlers

Liste a superfície de back-end: rotas de API, server actions, edge functions, RPCs, triggers. Para cada uma: método, autenticação exigida, validação de entrada, efeito colateral.

Endpoint que existe e nenhuma tela chama é um fluxo próprio, teste direto por `curl` ou cliente HTTP. Endpoint sem checagem de autenticação vira teste de segurança na suíte crítica.

## Fonte 4: banco e permissões

Leia migrations, schema e políticas de RLS. Extraia:
- tabelas com dado sensível e quem consegue ler ou escrever nelas,
- constraints e validações que existem no banco mas talvez não existam na interface,
- jobs, triggers e funções agendadas, que são fluxos sem tela e quase nunca são testados.

Todo fluxo de escrita ganha uma variação "usuário do tenant A tenta acessar dado do tenant B" quando o sistema for multi-tenant.

## Fonte 5: testes e documentação existentes

Leia `tests/`, `docs/`, `README.md` e o `memory/`. Eles dizem o que o time considera comportamento correto, o que já é coberto (não precisa reescrever) e o que já foi bug antes (é onde vale insistir).

Comportamento descrito em ADR ou no `CLAUDE.md` é o esperado. Divergência entre o documento e o sistema é bug, e o documento vence, a não ser que o sistema esteja em produção assim há tempo, e aí é divergência a registrar, não bug a corrigir sozinho.

## Formato de cada fluxo

```
F12 | área: financeiro | ator: admin | criticidade: alta
  objetivo: estornar um pagamento aprovado
  entrada: pagamento id=seed-pay-02, status aprovado
  passos: /financeiro > abrir pagamento > "estornar" > confirmar
  esperado: status vira estornado, lançamento de crédito criado, e-mail na fila, log de auditoria
  variações: estorno duplicado | valor parcial | sem permissão | pagamento já estornado
  origem: navegação + POST /api/pagamentos/:id/estorno + policy rls pagamentos_update
```

Regras:
- **ID estável** (`F01`, `F02`...). Ele é usado no `SUITES.json`, nos bugs, nos testes e na matriz de cobertura. Nunca renumere.
- **Objetivo em uma frase, do ponto de vista do usuário.**
- **Esperado precisa ser observável.** "Funciona" não serve. "Status vira estornado e aparece toast de sucesso" serve.
- **Criticidade alta** sempre que houver dinheiro, autenticação, permissão, dado pessoal ou integração externa. Média para o resto do que escreve. Baixa para o que só lê.

## Bateria obrigatória de variações

Além das variações específicas do fluxo, toda suíte roda esta lista contra os fluxos dela:

| Variação | O que procurar |
|---|---|
| entrada inválida | validação ausente, erro genérico, crash |
| campo vazio e campo enorme | quebra de layout, truncamento silencioso, erro 500 |
| lista vazia, 1 item, 500 itens | estado vazio sem mensagem, paginação, lentidão |
| duplo clique em ação | registro duplicado, cobrança dupla |
| refresh e voltar do navegador no meio | perda de dado, estado inconsistente |
| sessão expirada | redirect certo, ou tela branca |
| permissão negada | dado vazando na resposta mesmo com a tela escondendo |
| rede lenta e offline | ausência de loading, request pendurado, sem retry |
| acentuação e emoji | encoding no banco, no PDF, no e-mail |
| caractere especial em busca | erro de query, injeção |

## Quando o mapa está pronto

Quando uma nova passada de navegação não encontra nenhum fluxo que já não esteja no mapa, e todo item de menu, toda rota e todo endpoint apareceram em pelo menos um fluxo. Registre no mapa a data e a fonte de cada passada, para a próxima varredura saber o que mudou.
