# Refatoração 5.21: janelas da barra lateral sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `sidebar/ModalSenhaRelatorio.jsx` (15), `sidebar/ConfirmarCancelamentoVenda.jsx` (14) e
  `sidebar/ModalUpgradePlano.jsx` (7) para 0. Com o `ModalComandasFechadas` já convertido, a
  pasta `sidebar` inteira fica sem estilo inline.
- As três janelas repetiam a mesma moldura (overlay, caixa, ícone, título, campos, botões).
  Ela virou o conjunto `sidebar-janela__*` no `Sidebar.css`, com modificadores para o que
  muda de uma para outra (fundo do overlay, margem, largura, espaço, botão de perigo). As
  classes de tipografia compartilhadas (`sidebar__modal-titulo` e outras) ficam como estavam.
- Estado virou atributo ou classe: borda de erro por `aria-invalid`, botões travados por
  `:disabled`, e "Cancelar venda" sem motivo ou senha por `sidebar-janela__btn--incompleto`.
- O erro da senha do Relatório ganhou `role="alert"`.
- **Correção visível, intencional:** o título das janelas de senha do Relatório e de trocar
  de plano ("Acesso Restrito", "Delivery não está no seu plano") não declarava cor; como a
  janela abre num portal no `body`, fora do app, herdava a cor escura da página e saía quase
  invisível no tema escuro. Agora usa `--gm-text`.

O roteiro ganhou cinco telas, que antes não tinham foto: cancelar venda (vazia e com senha
errada), a senha do Relatório (vazia e com erro) entrando como a caixa Carla, que pela regra
de cargo não vê o Relatório, e o convite de plano, com um estabelecimento cujo plano não tem
Delivery (por rota, só nessa tela). O roteiro também ganhou o filtro `SO_TELAS`, uma
expressão regular sobre o nome, para conferir telas novas sem a captura inteira.

## Diferenças

Contra o código de antes da conversão, 170 telas: 3 com diferença e 1 leve.

- Senha do Relatório (as duas) e convite de plano: o título passa a ser legível, a correção
  acima. Vistas lado a lado; o resto da janela ficou igual.
- A leve é a busca da aba Reservas, os mesmos poucos pixels de suavização de fonte das
  rodadas anteriores, fora da área.

Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os três arquivos sem estilo inline | guard de estilo: saem da linha de base |
| 2 | A única mudança de tela é o título legível | `comparar`: 3 diferenças, todas no título |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a mensagem de senha errada da janela do
  Relatório diz "Usuário, senha ou permissão incorretos." sem dizer qual; é de propósito
  (não revelar se o usuário existe) e fica como está.
