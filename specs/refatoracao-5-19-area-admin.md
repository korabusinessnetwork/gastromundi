# Refatoração 5.19: Área Admin (grade, Fornecedores e Compras) sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `admin/ComprasTab.jsx` (21), `admin/FornecedoresTab.jsx` (9), `admin/GradeInicial.jsx` (3),
  `AdminView.jsx` (3) e `admin/ModalBase.jsx` (2) para 0.
- O hover das linhas das tabelas e dos cartões da grade era JavaScript e virou `:hover`.
- A cor saiu dos dados: `SECOES` e `STATUS_COMPRA` (em `admin/apoio.jsx`) guardavam a cor de
  cada seção e de cada status. Agora guardam só o tom (`destaque`, `azul`, `verde`,
  `laranja`) e o CSS define a cor em `grade-inicial__card--<tom>` e
  `compras-tab__status--<status>`. A etiqueta da tabela e o botão de status da janela leem a
  mesma variável. Os dois laranjas `#f97316` de Impostos e da Configuração Fiscal saíram do
  JSX para o CSS, com comentário: o design system não tem token para eles (tarefa 5.x).
- O botão Salvar da janela padrão usa `:disabled` (a condição visual era a mesma do
  `disabled`), e a largura da janela chega por `--admin-modal-w`. O espaço do `sz` chega por
  `--admin-pad`.
- O botão de remover item da compra ganhou nome para leitor de tela.

Antes da conversão o Supabase falso ganhou dois fornecedores e três compras, uma em cada
status, e o roteiro ganhou oito telas: hover na grade, Fornecedores (lista, hover, novo),
Compras (lista, nova compra com item e status Pago, fornecedor digitado, excluir).

## Diferenças

Contra o código de antes da conversão, 158 telas: 0 com diferença e 1 leve. A leve é a aba de
Reservas do PDV, que esta rodada não toca: 16 pixels de suavização de fonte no texto da barra
lateral, ruído de renderização. Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os cinco arquivos sem estilo inline | guard de estilo: saem da linha de base |
| 2 | Área Admin igual na tela | `comparar`: 0 diferença nas telas da área |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante.
- **Defeito antigo achado pela foto, fora do escopo:** a data da compra aparece um dia antes
  (a compra de 19/11 sai como 18/11). `fmtDt` em `admin/apoio.jsx` faz `new Date("2026-11-19")`,
  que o JavaScript lê como meia-noite UTC, ou seja, 21h do dia anterior em Brasília. Afeta a
  lista de Compras de todo estabelecimento no Brasil. Não foi corrigido aqui para a rodada
  continuar só de estilo; a correção é ler a data como dia local.
