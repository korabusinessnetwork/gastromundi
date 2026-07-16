# Ativar um novo estabelecimento (self-service pela UI)

> Runbook **operacional do app de hoje** (stack real: Supabase direto — ADR-004).
> Diferente de `onboarding-flow.md`, que descreve o onboarding-**alvo** (roadmap,
> com `/dashboard` e flags que ainda não existem). Este aqui é o caminho real
> que um estabelecimento novo (ex.: Casa Coffee Colab) segue para sair do zero
> e começar a vender — **sem SQL, sem depender do time**. É o fluxo que sustenta
> o produto como SaaS white-label multi-tenant (decisão 017).

## Antes de começar (feito pela plataforma, 1 vez)

Estes passos são da **Kora** (super-admin), não do dono do estabelecimento:

1. **Provisionar o tenant** — `SELECT public.provisionar_tenant('Nome', 'slug', 'plano', '{tema}')`.
   Cria o estabelecimento, resolve o `slug` (subdomínio), aplica o plano e já
   **semeia os 3 grupos-default** (`comida`, `bebida`, `cafe` — migração `20260743`).
2. **Tema white-label** (opcional) — rodar o `UPDATE tenants SET tema = ...` do
   estabelecimento (ex.: `SEED_tema_casacoffee.sql`). Sem tema custom, herda o
   visual padrão. Login e sidebar já mostram o nome + "by Kora".
3. **Criar o usuário dono/gerente** — no painel de auth, com `app_metadata`
   contendo `tenant_id` e `gastro_role` (`dono` ou `gerente`). É esse usuário que
   fará todo o resto sozinho, pela tela.

A partir daqui **é tudo self-service**, feito pelo dono/gerente logado.

## O que já vem pronto (não precisa configurar)

Um tenant vazio **opera sem quebrar** — os defaults do app cobrem o essencial:

| Item | Default | Onde muda depois |
|------|---------|------------------|
| Meios de pagamento | dinheiro · crédito · débito · pix | Configurações → **Meios de Pagamento** |
| Taxa de serviço | desligada | Configurações → **Meios de Pagamento** |
| Caixa | fechado (abre no início do dia) | **Frente de Caixa** |
| Grupos de categoria | comida · bebida · cafe (já semeados) | Configurações → **Grupos de Categoria** |
| Alerta de validade | padrão do sistema | Configurações |

Ou seja: o dono **não precisa mexer em nada disso** para começar. Só o cardápio
é obrigatório.

## Passo a passo (dono/gerente logado)

### 1. Cadastrar o cardápio — **obrigatório** · menu "Cadastro Produtos"
- Botão de novo produto → nome, **preço**, **categoria** (texto livre: "Cafés",
  "Doces", "Salgados"…), emoji e unidade.
- A categoria **aparece sozinha** nos filtros e no PDV assim que o primeiro
  produto dela é salvo — não há tela separada de "criar categoria".
- O `tenant_id` é preenchido **automaticamente** (isolamento por RLS) — o produto
  nasce visível só para este estabelecimento.
- Repita até o cardápio estar completo. Isso já basta para **vender no PDV**.

### 2. (Opcional) Ajustar pagamento e taxa — menu "Configurações" → aba "Meios de Pagamento"
- Ligar/desligar meios, adicionar métodos custom (ex.: "vale-refeição"), e
  **taxa de serviço** (os 10%) se o estabelecimento cobra.

### 3. (Opcional) Cadastrar mesas — "Configurações" → aba "Mesas" *(gerente)*
- Só se o estabelecimento **atende em mesa** (garçom no Palm). Cafeteria de balcão
  pode pular e trabalhar por comanda/pedido avulso.
- Define número, capacidade e posição no salão.

### 4. (Opcional) Agrupar categorias — "Configurações" → aba "Grupos de Categoria" *(gerente)*
- Mapeia cada categoria do cardápio a um grupo (`comida`/`bebida`/`cafe`). Alimenta
  o **Radar de Oportunidades** e o agrupamento no Palm. Não afeta a venda em si.

### 5. (Opcional) Convidar a equipe — menu "Área Admin"
- Criar usuários `caixa` / `garcom` / `cozinha` com as permissões certas. O garçom
  usa o **Palm** (celular); caixa/cozinha usam o desktop.

### 6. Abrir o caixa e vender — menu "Frente de Caixa"
- Informar o fundo de troco → caixa aberto → lançar pedidos, receber, fechar.

## Pronto para vender — critérios

- [ ] Tenant provisionado e login funcionando no subdomínio
- [ ] Pelo menos **1 produto** cadastrado (o mínimo real para operar)
- [ ] Meios de pagamento conferidos (o default já serve)
- [ ] (Se atende em mesa) mesas cadastradas
- [ ] Caixa aberto com fundo de troco

Com o item obrigatório (cardápio) feito, o estabelecimento **vende no mesmo dia**.

## Por que é intuitivo (princípio nº 1)

- **Zero configuração para o caminho feliz**: só o cardápio é obrigatório; todo o
  resto tem default seguro — o dono não trava numa tela de setup.
- **Categoria sem tela extra**: digita a categoria no produto e ela aparece — menos
  um conceito para aprender.
- **Ordem natural**: cadastro → (ajustes opcionais) → abrir caixa → vender, seguindo
  a própria sequência do dia de trabalho.
- **Rótulos do dia a dia**: "Frente de Caixa", "Cadastro Produtos", "Meios de
  Pagamento" — nada de jargão técnico.
