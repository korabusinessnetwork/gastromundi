# Mapa do `src/` — onde fica cada coisa

Este arquivo existe para orientação rápida: antes de procurar com busca por texto,
olhe aqui. O caminho de um arquivo já deve dizer **o que ele é** e **a quem serve**.

## O critério: híbrido — tipo + domínio

- **Compartilhado entre telas** → agrupado por **TIPO**, em `src/components/ui/<tipo>/`
- **Serve a uma feature só** → agrupado por **DOMÍNIO**, em `src/components/<dominio>/`,
  com subpasta por tipo dentro do domínio quando há volume
- **Regra de negócio / acesso a dados** → nunca no componente, sempre em `src/lib/<dominio>/`
- **CSS junto do componente** (decisão 018): `Componente.jsx` + `Componente.css` +
  `Componente.test.jsx` andam sempre como uma unidade

Por que não só por tipo: o `CartPanel` do PDV não tem uso fora do PDV — jogá-lo numa
pasta global `paineis/` afastaria ele do resto do PDV. Por que não só por domínio:
`Notification` e `CampoDocumento` são usados por todo mundo e não pertencem a ninguém.

## Onde procurar

### `src/components/ui/` — compartilhado, por tipo

| Pasta | Conteúdo |
|---|---|
| `campos/` | entradas de formulário reutilizáveis (`CampoDocumento`) |
| `feedback/` | avisos e status ao usuário (`Notification`, `IndicadorRede`) |
| `listas/` | listagens genéricas (`ListaArrastavel`) |
| `marca/` | identidade visual (`KLogo`) |
| `paineis/` | painéis laterais/flutuantes globais (`JarvasPanel`) |
| `pontes/` | pontes com o mundo externo (impressão local) |
| `botoes/` | *reservado* — hoje não há botão comum extraído |
| `cards/` | *reservado* — hoje não há card comum extraído |

`botoes/` e `cards/` estão criados e vazios de propósito: o projeto ainda usa
`<button>` e `<div>` de card inline nas telas. Quando um deles for extraído para uso
em mais de um domínio, é aqui que ele nasce.

### `src/components/<dominio>/` — específico da feature

`admin` · `assinatura` · `caixa` · `clientes` · `configuracoes` · `console` ·
`cozinha` · `delivery` · `estoque` · `financeiro` · `fiscal` · `impressao` ·
`mesas` · `navegacao` · `pdv` · `produtos` · `relatorios`

Subpastas por tipo já em uso dentro dos domínios:
`modais/` · `paineis/` · `cards/` · `campos/` · `listas/` · `grades/` · `botoes/` ·
`hooks/` · `mesas/` (PDV) · `tipos/` (relatórios)

Exemplos de leitura do caminho:

- `components/pdv/paineis/CartPanel.jsx` — painel do carrinho, só do PDV
- `components/pdv/grades/ProductGrid.jsx` — grade de produtos do PDV
- `components/caixa/modais/AberturaCaixaModal.jsx` — modal de abertura de caixa
- `components/fiscal/botoes/BotaoReimprimirNfce.jsx` — botão de reimpressão de NFC-e
- `components/relatorios/tipos/*` — um arquivo por tipo de relatório

### `src/pages/` — telas roteadas, uma pasta por superfície

`desktop/` · `mobile/` (com `tabs/`, `sheets/`, `modulos/`, `chrome/`) ·
`console/` · `apex/` (com `chrome/`, `secoes/`, `demo/`) ·
`delivery/` (com `listas/`, `modais/`, `etapas/`, `hooks/`) · `login/`

### `src/lib/<dominio>/` — regras de negócio e dados

| Pasta | Assunto |
|---|---|
| `caixa/` | abertura, fechamento e movimentos de caixa |
| `clientes/` | cadastro e fiado |
| `comum/` | utilitários de domínio sem dono (documento, períodos, navegação) |
| `console/` | console administrativo, autenticação admin, assinatura |
| `cozinha/` | fila e status da cozinha |
| `delivery/` | cardápio, pedidos, horário, fotos e alertas do delivery |
| `estoque/` | movimentação de estoque e validade |
| `financeiro/` | lançamentos e resumo financeiro |
| `fiscal/` | NFC-e, configuração fiscal, impostos, QR Code |
| `host/` | resolução de host (apex, console, slug do tenant) |
| `importacao/` | importação/exportação de dados |
| `impressao/` | impressão e drivers da ponte local |
| `infra/` | observabilidade e recuperação de deploy |
| `jarvas/` | motor e assistente do Jarvas |
| `offline/` | fila e sincronização offline |
| `produtos/` | categorias, combos e subprodutos |
| `relatorios/` | geração e exportação de relatórios |
| `seguranca/` | testes de guarda de SQL/RLS/edge functions |
| `tenant/` | identidade, tema e branding por estabelecimento |
| `vendas/` | comandas, pedidos em espera, painel do garçom, TEF |

Na raiz de `src/lib/` ficam só `supabase.js` e `logger.js` — usados por praticamente tudo.

### O resto

`context/` (Context API) · `hooks/` (hooks globais) · `routes/` (React Router) ·
`layouts/` (cascas de página) · `constants/` · `styles/` · `utils/` · `test/` (setup do Vitest)

## Ao criar um arquivo novo

1. Só uma tela usa? → `components/<dominio>/`. Mais de um domínio usa? → `components/ui/<tipo>/`.
2. Já existem dois ou mais arquivos do mesmo tipo no domínio? → crie a subpasta por tipo.
3. Tem regra de negócio ou consulta ao Supabase? → tire do componente e ponha em `lib/<dominio>/`.
4. Tem estilo? → `.css` co-localizado, com o mesmo nome do componente.
