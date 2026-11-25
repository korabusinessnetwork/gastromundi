# Refatoração 5.14: abas Usuários, Meios de Pagamento e Geral sem estilo inline e sem emoji

> Pedido do dono (2026-11-25): *"Continue"*. Primeira rodada sob a regra sem emoji (decisão 037).

## A mudança

- `configuracoes/UsuariosTab.jsx`: 25 atributos `style` para 0 (sobram as variáveis de
  espaçamento e `--cargo-cor`, a cor de cada cargo, que vem de dado). Os quatro ícones de
  cargo eram emoji (coroa, pessoa de terno, computador, talheres) e viraram `LuCrown`,
  `LuBriefcase`, `LuMonitor` e `LuUtensils`, na cor do cargo. Hover da linha em CSS; cargo
  escolhido por `--ativo`; `:disabled` em Salvar e Excluir.
- `configuracoes/MeiosPagamentoTab.jsx`: 19 para 0. O aviso "nenhum meio ativo" tinha "⚠️" e
  ganhou `LuTriangleAlert`. Método ativo, formulário aberto e confirmar liberado por
  modificador; `:disabled` nos cartões (só o administrador muda) e em Salvar.
- `configuracoes/GeralTab.jsx`: 16 para 0. Interruptor ligado por modificador; os dois campos
  com valor inválido ganharam `aria-invalid` (borda vermelha pela regra); os dois Salvar usam
  `:disabled`, a mesma condição de antes.
- Emoji no código: 118 para 112.

Antes da conversão o roteiro ganhou sete telas: usuários (hover, novo, editar, excluir),
meios de pagamento (novo método, nenhum ativo) e geral (valor inválido e valor alterado).

## As diferenças, e o comparador

O comparador só contava como diferença o que passa de 0,1% dos pixels. Isso escondia trocas
pequenas, como um ícone. Agora ele também lista as mudanças abaixo do limite, como "leves".
O "0 diferença" das rodadas anteriores quer dizer "nada acima de 0,1%"; as bordas de foco
daquelas rodadas foram conferidas pixel a pixel na hora.

Nesta rodada, contra `--ref HEAD`, 121 telas: 2 com diferença e 2 leves, todas esperadas.
- Usuários: os emojis dos cargos viraram ícones.
- Novo meio de pagamento e Geral com valor alterado: o campo focado segue a regra global de
  foco (destaque cheio).
- Nenhum meio ativo: o "⚠️" virou o ícone de alerta (20 por 19 pixels).

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | As três abas sem estilo inline fora de variável CSS e sem emoji | os dois guards: as três saem das duas linhas de base |
| 2 | As únicas mudanças de tela são os ícones e o foco | `comparar`: 2 diferenças e 2 leves, cada uma vista |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o modal de usuário rola por dentro, e a tela
  de edição foi fotografada rolada até o fim; o topo dela (nome, login, cargo) aparece na
  tela de novo usuário.
