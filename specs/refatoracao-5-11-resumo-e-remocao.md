# Refatoração 5.11: resumo do pedido e janela de remover item sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `checkout/ResumoPedido.jsx`: 26 atributos `style` para 0 (sobra a largura de `sz` como
  variável). A versão de celular virou o modificador `--mob`; modo de remoção ligado, taxa de
  serviço aplicada ou retirada (valor riscado) e o tom do ajuste (desconto ou acréscimo)
  viraram modificadores.
- `checkout/PopupRemocao.jsx`: 24 para 0 (sobram as variáveis de espaçamento). As peças que a
  janela de desconto da 5.8 criou com prefixo `ajuste` e que servem a qualquer janela do
  pagamento (moldura, cabeçalho, rótulo, senha, botões) foram renomeadas para `pag-janela` e
  passaram a servir às duas; o que é só do desconto continua `ajuste`, o que é só da remoção
  é `remocao`. A senha com erro ganhou `aria-invalid`; o botão de remover usa `:disabled`, a
  mesma condição de antes.

Antes da conversão o roteiro ganhou cinco telas: a finalização com taxa de serviço aplicada
e retirada (a taxa entra só nessas telas, por rota da tela), com acréscimo aplicado, em modo
de remoção, e a janela de remover com a quantidade no máximo.

## Teste que dependia da hora do dia

A suíte rodada à 1h da manhã de Brasília falhou num teste do Console sem relação com a
rodada. O teste cria a "última venda" duas horas antes de agora e espera "Hoje"; a tela
mostra dia de calendário, então antes das 2h a venda era de ontem. Corrigido no teste: o
relógio para ao meio-dia da data de hoje, que continua relativa. Visto falhando antes da
correção e passando depois, na mesma hora.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline fora de variável CSS | guard: os dois saem da linha de base |
| 2 | Resumo, remoção e janela de desconto (renomeada) idênticos | `comparar` contra `--ref HEAD`: 101 telas, 0 diferença |
| 3 | Testes passam, a qualquer hora | suíte, rodada de madrugada |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o resumo em largura de celular não é
  fotografado (o celular usa o PDV do Palm); as regras `--mob` copiam os valores de antes.
