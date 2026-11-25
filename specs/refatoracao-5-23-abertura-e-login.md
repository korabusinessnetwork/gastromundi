# Refatoração 5.23: abertura de caixa e login sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-25), tarefa T02.

## A mudança

- `modals/AberturaCaixaModal.jsx` (14) e `pages/LoginPage.jsx` (14) para 0.
- Abertura de caixa: a moldura, o campo com "R$" à esquerda e os botões foram para o
  `AberturaCaixaModal.css`. O botão "Abrir Caixa" fica verde por `--pronto` quando o valor é
  válido, e não por `:disabled`: enquanto grava ele trava mas continua verde, como antes.
- Login: a tela de endereço inexistente, a de carregamento, o aviso de erro e o aviso de
  segurança foram para o `LoginPage.css`. A largura e o espaço que vêm do `sz` chegam por
  `--login-max` e `--login-pad`. O aviso de erro ganhou `role="alert"`.
- Sem emoji (decisão 037): o banco "🏦" da abertura virou `LuLandmark`, na cor verde do ícone.

O roteiro ganhou quatro telas: login com senha errada, login num endereço de estabelecimento
que não existe, abertura de caixa vazia e com valor. Para a tela de endereço inexistente o
roteiro aprendeu a abrir uma tela por outro nome de máquina (`host`), com `*.localhost`
mapeado para a própria máquina e liberado no bloqueio de rede do Supabase falso.

## Diferenças

Contra o código de antes da conversão, 185 telas: 2 com diferença e 2 leves.
- Abertura de caixa (as duas): o banco emoji virou ícone. Vistas lado a lado.
- As leves são o ruído de fonte de sempre na aba Reservas, fora da área.

O login, nas seis fotos (três estados em computador e celular), ficou idêntico. Nenhum erro
de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline e sem emoji | os dois guards |
| 2 | A única mudança de tela é o emoji trocado por ícone | `comparar`: 2 diferenças, vistas |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante.
