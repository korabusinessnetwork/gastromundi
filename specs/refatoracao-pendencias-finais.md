# Pendências finais do plano de refatoração

> Pedido do dono (2026-11-26): "Faça o que ficou pra trás em Full automático", depois do
> levantamento do que faltou do plano. Tarefas T25 a T29.

## T25. Ganchos de domínio saem de `src/utils/hooks.js`

`useMesas`, `usePedidosCozinha` e `usePedidosDelivery` moravam em `utils/`, que é para
utilidade técnica. Agora:
- `src/features/mesas/hooks/useMesas.js`;
- `src/features/cozinha/hooks/usePedidosCozinha.js`;
- `src/features/delivery/hooks/usePedidosDelivery.js`.

Quem importa e os dois testes que simulavam `@/utils/hooks` apontam para o lugar novo. O teste dos
ganchos de pedidos foi junto, para `features/delivery/hooks/pedidosAoVivo.test.jsx`. Em
`utils/hooks.js` ficam só os ganchos técnicos (`useLS`, `useIsMobile`, `useResponsive`,
`useIdleTimer`). Nenhuma linha de lógica mudou.

## T26. Os 25 avisos de lint examinados, e o lint sem nenhum aviso

- **15 diretivas `eslint-disable` que não suprimiam nada saíram.** Uma delas, em
  `ClienteDetalhe.jsx`, estava na linha errada: ficava dentro do efeito e não protegia a lista de
  dependências, por isso aparecia ao mesmo tempo como diretiva sem uso e como aviso.
- **10 avisos de dependência de gancho, examinados um a um:**
  - **Corrigido:** `ProdutoModal.jsx`. A lista `grupos` era recriada a cada renderização e
    invalidava o cálculo das escolhas; agora é memorizada.
  - **Mantidos de propósito, com o motivo escrito na própria diretiva:**
    - os quatro do `SessaoProvider`: o prazo da sessão, a escuta da autenticação montada uma vez,
      a lista de usuários refletida no logado e a marca repintada só quando muda o tema;
    - os dois de login (`LoginPage`, `ConsoleLoginPage`), que redirecionam quando o login termina;
    - o `tick` da aba de pedidos do delivery, que força o "há X min" a andar;
    - os recarregamentos de `ClienteDetalhe` e `ImpostosAdmin`.

    Mexer na lista desses efeitos mudaria quando eles rodam. O login, por exemplo, passaria a
    redirecionar de novo a cada mudança de tela.

`npm run lint`: 0 erros e 0 avisos (eram 25 avisos).

## T27. A decisão D1 do ADR-015 (TanStack Query) reavaliada

Decisão 038 em `memory/decisions.md`: **o TanStack Query continua fora.**
- O problema que ele resolveria já foi resolvido pelos seis provedores memorizados e pela camada
  `dados/`.
- Trazer a biblioteca seria dependência nova e reescrever 52 pontos de carga sem ganho visível.
- Ficam registrados os gatilhos para reavaliar: a mesma leitura em várias telas ao mesmo tempo,
  cache entre telas para o celular lento, ou paginação de listas grandes.

O ADR-015 aponta para ela. Duas linhas desatualizadas da tabela "Decisões em aberto" também foram
corrigidas: a do cache de servidor e a da ferramenta de testes, que já é o Vitest.

## T28. Site da Kora e pautas no roteiro de fotos

O servidor do roteiro liga `VITE_ROOT_DOMAIN=localhost` e `VITE_PAUTAS_SUBDOMAIN=pautas`. O site da
Kora abre em `localhost` e as pautas em `pautas.localhost`; as telas de sempre continuam em
`127.0.0.1`, que não é o domínio da plataforma.

São 8 telas novas, nas duas larguras (16 fotos):
- **site da Kora:** a vitrine, entrar, criar conta, novidades e a demonstração;
- **pautas:** o login, o quadro com um sócio logado e três pautas (uma em cada situação), e a
  janela de nova pauta.

O cartão e o formulário de pauta, que mudaram de lugar na 6.8, passam a ter foto.

## T29. Os cenários de banco da fase 1 rodados contra um banco

Novo `scripts/cenarios-banco/` (`npm run cenarios-banco`). Ele sobe um Postgres 16 local e
descartável e monta o banco com todas as 125 migrations, a partir do mínimo do Supabase e do núcleo
anterior às migrations. Depois roda os cenários das quatro funções atômicas, com a RLS valendo como
em produção (papel `authenticated` e o JWT de quem age).

| Função | Cenários |
|---|---|
| `salvar_combo` (1.1) | gerente cria e edita; falha no meio desfaz tudo, inclusive os deletes da edição; sem item e quantidade 0 recusados; combo de outro estabelecimento invisível e a edição dele recusada; garçom recusado ao criar e ao editar; anônimo não executa |
| `importar_nota_fiscal` (1.2) | importação com custo por unidade (54 / 12) e data de emissão no histórico e o saldo somado; chave repetida recusada sem somar de novo; falha num item desfaz a nota, os itens, o histórico e a soma já feita; a mesma nota reimporta depois da falha; item vinculado com quantidade 0 recusado; caixa recusado; anônimo não executa |
| `excluir_unidade_medida` (1.3) | gerente e caixa recusados sem mudar produto; unidade inexistente e de outro estabelecimento recusadas; admin exclui e a unidade sai do estoque, do consumo e da compra, mantendo a outra unidade de compra; anônimo não executa |
| `salvar_subproduto` (1.6) | gerente cria e edita com o saldo; preço e quantidade `NaN` recusados; falha no saldo (gatilho de teste) desfaz o subproduto inserido; caixa recusado ao criar e ao editar; deixar de controlar estoque não apaga o saldo; subproduto de outro estabelecimento invisível; anônimo não executa |
| As quatro migrations | aplicam duas vezes sem erro |

**Resultado: 58 conferências, 0 falhas.**

**Achado, sem efeito nos cenários:** a `20260725_fix_search_path_secdef.sql` altera
`baixar_estoque_subproduto`, que só a `20260748` cria. Em produção as duas foram aplicadas fora da
ordem dos nomes. Montar o banco do zero pela ordem dos arquivos dá esse erro. Fica registrado no
README dos cenários. Corrigir isso é migration, e a decisão é do dono.

## Diferenças

DIFERENCAS

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum gancho de domínio em `utils/` | `src/utils/hooks.js` |
| 2 | Lint sem erro nem aviso, com cada exceção justificada | `npm run lint` |
| 3 | D1 reavaliada e registrada | decisão 038 e ADR-015 |
| 4 | Site da Kora e pautas fotografados, sem mudar as telas de antes | roteiro e `comparar` |
| 5 | Cenários de banco da fase 1 rodados contra um banco | `npm run cenarios-banco` |
| 6 | Suíte verde, build limpo | comandos |

## Revisão

- Spec: ver o resultado da comparação acima. Suíte 273 arquivos e 4465 testes, verde; build
  limpo; lint 0 erros e 0 avisos.
- Qualidade: nenhum crítico ou importante.
