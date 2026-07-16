# Migração de Dados — Importação e Exportação (brief para implementação)

> **Para quem é este documento**: o dev/sócio que vai construir a solução de
> import/export de dados do KORA. Ele fecha o escopo, o formato, a arquitetura
> recomendada e os critérios de aceite. Dúvida de produto → Matheus (dono).

## 1. O problema

Todo estabelecimento que troca de PDV chega com dados presos no sistema antigo:
cardápio/produtos, categorias, clientes, estoque. Redigitar tudo na mão é a maior
fricção do onboarding — e o maior motivo de desistência na troca de sistema.

**Objetivo**: qualquer estabelecimento consegue **entrar** no KORA trazendo seus
dados (import) e **sair** levando seus dados (export) sem depender de a gente
mexer no banco. Import/export vira parte do produto, não um favor manual.

## 2. Princípios inegociáveis (vêm do CLAUDE.md do repo — leia ele antes)

1. **Intuitividade**: quem importa é o dono do restaurante, não um dev. Fluxo
   guiado, preview antes de gravar, erros apontados linha a linha em português
   claro ("linha 12: preço vazio"), nunca um stack trace.
2. **Multi-tenant**: o produto é SaaS white-label. A importação NUNCA aceita
   `tenant_id` vindo do arquivo ou do cliente — o tenant é o da sessão logada,
   garantido pela RLS. Nada específico de um cliente hardcodado.
3. **Segurança**: a `service_role` key NUNCA vai ao frontend nem a script
   distribuído. Zero segredo em código. Validar todo input antes de gravar.
4. **Custo zero** (bootstrap): sem serviço pago, sem fila externa, sem worker
   dedicado. O volume real (centenas a poucos milhares de linhas) roda no
   navegador + Supabase que já temos.

## 3. Arquitetura recomendada

**Dentro do próprio app (Área Admin do tenant), via Supabase SDK + RLS.**

- O app já fala direto com o Supabase autenticado como o usuário do tenant
  (ADR-004). A RLS já isola por tenant — o import herda essa segurança de graça.
- Sem backend novo, sem deploy novo, sem chave nova. É o caminho mais barato,
  mais seguro e o único que é **self-service** (o cliente migra sozinho —
  escala de vendas sem escalar suporte).
- Parsing e validação do arquivo: **client-side**, em funções puras
  (`src/lib/importacao/…`), que nascem com testes unitários (padrão do repo).
- Gravação em lote: upsert em blocos (ex.: 200 linhas por chamada) com
  progresso visível.

**Alternativas descartadas (e por quê):**

| Alternativa | Por que não agora |
|---|---|
| Script CLI com `service_role` | Não é self-service, chave sensível circulando, não escala com N clientes |
| API própria (Express etc.) | ADR-002 é roadmap; criar backend só pra isso contradiz ADR-004 e custa infra |
| Edge Function de import | Válida como fase futura p/ arquivos grandes; desnecessária no volume atual |

## 4. Escopo por fases

### Fase 1 — MVP (o que resolve migração já)

**Import de produtos via planilha (CSV)** + **export de produtos e clientes**.

- Tela na Área Admin: `Configurações → Importar / Exportar dados`.
- Fluxo do import (wizard de 3 passos, sempre com saída visível):
  1. **Modelo**: botão "Baixar planilha modelo" (CSV com cabeçalho + 2 linhas
     de exemplo). O modelo é o contrato.
  2. **Preview (dry-run)**: usuário sobe o arquivo → tabela de conferência
     mostrando o que será criado/atualizado/ignorado + erros por linha.
     **Nada é gravado neste passo.** Com qualquer erro bloqueante, o botão de
     confirmar fica desabilitado (prevenção de erro > mensagem de erro).
  3. **Confirmar**: grava em lote com barra de progresso; ao final, resumo
     ("42 produtos criados, 3 atualizados, 1 ignorado") e link pro cardápio.
- Export: botões "Exportar produtos (CSV)" e "Exportar clientes (CSV)" — gera
  no cliente e baixa. Mesmo layout de colunas do modelo de import
  (**export de A importa em B** — é isso que resolve portabilidade).

### Fase 2 — abrangência

- Import de **clientes** (mesmo wizard, outro modelo).
- Import de **estoque inicial** (quantidade + mínimo por produto).
- **De-para de concorrentes**: aceitar o export nativo dos PDVs mais comuns da
  nossa praça (levantar os 2–3 que os leads reais usam antes de codar) e
  converter para o nosso modelo — um "tradutor" por origem, todos desaguando
  no MESMO pipeline de validação da Fase 1.

### Fase 3 — programático (quando houver demanda real)

- Edge Function `importar-dados` para volumes grandes/automação e para o
  Console da plataforma importar em nome de um tenant no onboarding assistido.

### Fora de escopo (não gastar energia agora)

- Histórico de vendas/financeiro do sistema antigo (valor baixo, risco alto de
  dado inconsistente; o cliente começa histórico limpo no KORA).
- Fotos de produto (não existe campo hoje; produto usa `emoji`).
- Sincronização contínua com outro sistema (isso é integração, não migração).

## 5. Modelo de dados alvo (estado real do banco — `supabase/schema.sql`)

### `public.products` (destino do import de produtos)

| Coluna | Tipo | Obrigatória | Observação |
|---|---|---|---|
| `name` | text | ✅ | chave natural do upsert (por tenant, case-insensitive, trim) |
| `price` | numeric | ✅ | preço de venda |
| `category` | text | ✅ | texto livre; ver grupos abaixo |
| `emoji` | text | — | default por grupo se vazio (ex.: 🍽️/🥤/☕) |
| `active` | boolean | — | default `true` |
| `unidade_estoque` | text | — | default `'un'` |
| `produzivel` | boolean | — | default `true` (aparece na Cozinha) |
| `tenant_id` | uuid | — | **NUNCA vem do arquivo** — RLS/sessão |

Colunas avançadas (`unidades_compra` jsonb, `unidade_consumo`,
`fator_consumo_estoque`) ficam FORA do modelo CSV do MVP — defaults servem e
o dono ajusta depois na tela de produto.

### Tabelas satélites relevantes

- `categoria_grupo (category → grupo_id)` + `grupos_categoria (nome)`: toda
  categoria nova criada pelo import precisa ser mapeada a um grupo
  (comida/bebida/cafe). No preview, pedir o grupo de cada categoria nova
  (select simples) — é o que faz a categoria aparecer certa no PDV/Cozinha.
- `estoque (produto_id, quantidade, minimo)`: Fase 2 — coluna opcional
  `estoque_inicial` no CSV pode alimentar aqui.
- `itens_fiscal` (NCM, CFOP, CSOSN…): NÃO importar no MVP — dado fiscal é
  delicado e pertence ao fluxo do add-on NF-e.
- `clientes (nome, telefone, endereco, observacoes)`: modelo trivial na Fase 2;
  dedupe por telefone normalizado (só dígitos).

### Template CSV de produtos (contrato do MVP)

```csv
nome;preco;categoria;emoji;ativo;unidade
X-Salada;24,90;Lanches;🍔;sim;un
Suco de Laranja 300ml;9,00;Bebidas;🍊;sim;un
```

## 6. Regras de parsing e validação (onde migração costuma quebrar)

- **Encoding**: aceitar UTF-8 e Windows-1252/Latin-1 (Excel BR exporta assim);
  detectar e converter — acento quebrado é o bug nº 1 de import no Brasil.
- **Separador**: `;` como padrão (Excel pt-BR) e `,` como fallback —
  detectar pelo cabeçalho.
- **Dinheiro pt-BR**: aceitar `24,90`, `1.234,56`, `R$ 24,90` e `24.90`;
  normalizar para numeric. Preço ≤ 0 ou não numérico = erro bloqueante.
- **Cabeçalho tolerante**: casar por nome normalizado (sem acento/caixa/espaço)
  — `Preço`, `preco`, `PRECO` são a mesma coluna.
- **Booleanos pt-BR**: `sim/não`, `s/n`, `1/0`, `true/false`.
- **Dedupe/idempotência**: upsert por `name` normalizado dentro do tenant.
  Linha duplicada no próprio arquivo = aviso (vale a última). Rodar o mesmo
  arquivo duas vezes não pode duplicar nada.
- **Limites**: tamanho máximo de arquivo (ex.: 2 MB / 5.000 linhas) com
  mensagem clara; truncar campos texto absurdos.
- Todas essas regras em **funções puras com teste** (`vitest`) — o repo já tem
  697 testes e esse padrão é obrigatório pra lógica de dinheiro/conversão.

## 7. Critérios de aceite (checklist de entrega)

- [ ] Baixo o modelo, preencho 3 produtos no Excel BR (com acento e `24,90`), importo: preview correto, confirmo, produtos aparecem no PDV com categoria no grupo certo.
- [ ] Reimportar o MESMO arquivo → 0 criados, N atualizados/ignorados (idempotente).
- [ ] Arquivo com erros mistos → preview aponta cada linha com mensagem em português; confirmar fica bloqueado; linhas boas não são gravadas junto com as ruins sem o usuário decidir.
- [ ] Export de produtos de um tenant → import no outro tenant funciona sem editar o arquivo (portabilidade real).
- [ ] Logado no tenant A não existe caminho de gravar no tenant B (testar com dois tenants — RLS).
- [ ] `npm test` verde; funções de parsing com testes unitários próprios.
- [ ] Nenhum segredo novo no front; nenhum `select *` em tabela sensível.
- [ ] CSS separado do JSX (decisão 018); rótulos em português de balcão.

## 8. Processo de trabalho

- Ler `CLAUDE.md`, `memory/` e `docs/03_REGRAS_DE_NEGOCIO/` antes de codar.
- Branch própria + PR pro Matheus revisar; nada direto na main.
- Entregar Fase 1 fechada antes de abrir Fase 2 — MVP pequeno e redondo vale
  mais que meia solução grande.
