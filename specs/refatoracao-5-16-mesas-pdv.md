# Refatoração 5.16: mapa de mesas e aba de Reservas do PDV sem estilo inline e sem emoji

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `PDVView/MesaMapView.jsx` (20) e `PDVView/MesaReservasView.jsx` (18) para 0.
- As cores dos quatro status da mesa saíram do objeto `STATUS` do JavaScript e viraram as
  classes `mesa-tom--livre`, `--aberta`, `--reservada` e `--manutencao` no
  `MesaMapView.css`, que definem `--mesa-cor`, `--mesa-bg` e `--mesa-borda`. O mapa (legenda
  e cartões) e a aba de Reservas (resumo, número da mesa, botão ativo, aviso de comanda
  aberta) leem as mesmas variáveis, então continua havendo uma fonte só. `STATUS` guarda só o
  rótulo. O amarelo literal de "Aberta" foi junto para o CSS, com o comentário do TD018.
- O que depende de medida chega por variável: espaçamento do `sz` (`--mesa-pad`,
  `--reservas-pad`), tamanho do cartão (`--mesa-w`, `--mesa-h`), colunas da grade
  (`--mesa-cols`), tamanho da área posicionada e a posição de cada mesa (`--mesa-x`,
  `--mesa-y`).
- O destaque ao passar o mouse no cartão era JavaScript e virou `:hover`, fora da mesa em
  manutenção, como antes.
- Sem emoji (decisão 037): a cadeira dos dois estados vazios virou `LuArmchair`. O botão de
  limpar a busca ganhou nome para leitor de tela, e o erro ganhou `role="alert"`.

Antes da conversão o Supabase falso ganhou seis mesas (livres, reservada, em manutenção e uma
com comanda aberta) e o roteiro ganhou quatro telas: mapa, mapa com o mouse num cartão,
Reservas e Reservas com busca sem resultado.

## Diferenças

Contra `--ref HEAD`, 133 telas: 0 com diferença e 1 leve. A leve é a borda do número da mesa
aberta em Reservas, 216 pixels com o tom um ponto diferente, do arredondamento da
transparência para `color-mix` (`55` em hexadecimal para 33%), o mesmo de toda a fase 5. Vista
lado a lado: igual a olho. O mapa, com e sem o mouse no cartão, ficou idêntico.

A primeira captura mostrou o cartão da mesa sem cor nem caixa: três substituições do CSS não
tinham entrado porque o arquivo tinha linhas em branco entre as regras. Corrigido e
recapturado.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline e sem emoji | os dois guards: saem das linhas de base |
| 2 | Mapa e Reservas iguais na tela, inclusive o hover | `comparar` nas quatro telas novas |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor, antigo e fora do escopo: o cartão da mesa
  aberta mostra o valor com ponto ("R$ 32.00"), porque usa `toFixed(2)` em vez do formatador
  de dinheiro do sistema. Fica registrado para a rodada que tratar formatação.
