# Refatoração 5.25: configurações restantes sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-25), tarefa T04.

## A mudança

- Doze arquivos para 0: `ConfiguracoesView` (6), `configuracoes/UnidadesMedidaTab` (13),
  `CategoriasGrupoTab` (7), `DeliveryTab` (7), `StrengthBar` (3), `Avatar`, `ErrBox`,
  `PermCheck`, `RoleBadge`, `ToggleChip` (1 cada), `impressao/PonteLocalConfig` (5) e
  `ImportarExportarTab` (2). A área de Configurações fica sem estilo inline.
- Cor que vem do dado passa só como variável: `--cargo-cor` (cargo), `--perm-cor` (célula da
  matriz de permissões), `--chip-cor` (meio de pagamento), `--forca-cor` (força da senha),
  `--avatar-tam` e `--progresso` (barra de importação). A cor de cada tipo de unidade saiu de
  `TIPOS_UNIDADE` para `unidades-medida-tab__grupo--<tipo>`.
- Estado virou classe ou `:disabled`: aba ativa, toggle do horário automático (reusa o
  `geral-tab__toggle--ligada` do Geral), campo preenchido, botão "Adicionar" pronto, select
  com grupo, Salvar e Excluir travados. O hover do botão de remover unidade era JavaScript e
  virou `:hover`.
- Sem emoji (decisão 037): o "⚠" do aviso de exclusão de unidade e o "⚠️" da caixa de erro
  dos usuários viraram `LuTriangleAlert`. O emoji que sobra no Importar/Exportar é o reserva
  do emoji do produto (T10).
- Os botões de remover unidade ganharam nome para leitor de tela.

**Correção de regressão, intencional:** desde a rodada 5.14 a regra
`.geral-tab__card { gap: var(--geral-pad) }` vinha depois do `.delivery-tab__detalhes { gap: 18px }`
e o anulava; como a aba Delivery não definia `--geral-pad`, os blocos dos detalhes do horário
automático ficavam colados ("Sáb" encostado em "HORÁRIOS"). A tela só mostra esses detalhes
com o horário automático ligado, e a foto de então tinha ele desligado, por isso passou. Os
18px voltam por `.geral-tab__card.delivery-tab__detalhes`.

O roteiro ganhou sete telas: unidade com o mouse no remover, preenchendo uma nova, excluindo
(com produtos afetados), Radar com uma categoria num grupo, Delivery com o horário automático,
força da senha e erro do formulário de usuário.

**Lacunas de foto:** a parte do modo local da Ponte (só aparece com o programa da ponte
rodando na máquina) e as barras de progresso da importação (só durante uma importação).
Conferidas linha a linha.

## Diferenças

Contra o código de antes da conversão, 197 telas: 4 com diferença e 2 leves, todas vistas.
- Delivery automático: os 18px entre os blocos voltam (a correção acima).
- Unidades, adicionar: o campo com foco ganha a borda da regra global de foco.
- Unidades, excluir, e Usuários, erro: o emoji de alerta virou ícone.
- As leves são ruído de fonte (Reservas e o login no celular), fora da área.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os doze arquivos sem estilo inline, sem emoji fora o do campo do produto | os dois guards |
| 2 | Mudanças de tela só as explicadas | `comparar`: 4 diferenças, vistas |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Na primeira passada pus `role="alert"` no
  `ErrBox`, que já fica dentro de um alerta em quem o usa; três testes acusaram o alerta
  duplicado e o atributo saiu. Menor e antigo: a janela de excluir unidade sai com fonte
  serifada e título apagado, o caso do TD026 (registrado lá).
