# Multi-tenancy e white-label desde a linha 1

Todo app novo construído com esta skill nasce assumindo **múltiplos tenants** e
**identidade white-label**, mesmo que hoje sirva um único cliente. Isso não é sobre
prever o futuro com precisão — é sobre não pagar duas vezes pelo mesmo trabalho.

## Por que assumir multi-tenant mesmo com 1 cliente

Retrofit de multi-tenancy em um sistema single-tenant já em produção é uma das
refatorações mais dolorosas que existem: toda tabela precisa ganhar `tenant_id`, toda
query precisa ser reauditada, todo dado histórico precisa ser migrado para um tenant
"default", e cada bug de isolamento descoberto tarde é um vazamento de dado de um cliente
para outro — o pior tipo de incidente de confiança para um SaaS.

Modelar multi-tenant desde o início custa pouco a mais na fundação (uma coluna extra, uma
política de RLS por tabela, um nível de indireção na config) e evita esse retrofit por
completo. Mesmo um app que hoje **atende um único estabelecimento** deve ser modelado
como se amanhã atendesse cem — porque o roadmap de negócio (vender em escala) é o caso
comum de produtos que começam atendendo o fundador/primeiro cliente. Ver decisão de
produto "SaaS multi-estabelecimento white-label": hoje atende um estabelecimento, o alvo
é vender em escala para vários.

**Regra prática**: mesmo um app conceitualmente single-tenant-por-instância (uma
instância = um cliente, sem tabela de tenants nem seletor de tenant na UI) deve ter isso
como decisão de deploy, não de modelagem — o schema, as queries e o RLS continuam tratando
tenant como dimensão de primeira classe, só que com N=1 por enquanto.

## Isolamento por RLS (Row Level Security)

- **Toda tabela que carrega dado de negócio tem política de RLS** amarrada ao tenant do
  usuário autenticado. Sem exceção "por enquanto só temos um cliente" — a política existe
  desde a criação da tabela.
- RLS é **definition-of-done** de uma tabela nova, não um item de backlog futuro: uma
  tabela sem RLS configurada não está pronta para produção, mesmo que a feature "funcione"
  em teste manual sem ela (porque nesse teste, sem RLS, tudo está visível a todos).
- **Nunca expor a `service_role` key (ou equivalente com bypass de RLS) no front-end.**
  Ela deriva todas as políticas de RLS como se não existissem. Uso de service_role fica
  restrito a contexto de servidor/edge function, nunca em código que roda no navegador —
  isso vale mesmo em stacks "Supabase direto no frontend", onde é tentador usar a chave
  service para "resolver rápido" um caso em que a policy está incomodando.
- Ao criar uma tabela ou função nova, é obrigatório avisar explicitamente que a RLS
  precisa ser configurada/validada no painel (ou via migration) — não assumir que alguém
  vai lembrar depois.
- Teste de isolamento (dois tenants, um usuário de cada, garantir que um não vê dado do
  outro) deveria existir para qualquer tabela sensível antes de considerar a feature
  pronta.

## White-label: identidade vem do tenant, nunca do código

Nada de marca, nome, cor, logo, texto fixo de contato, ou regra de negócio específica de
um cliente **hardcodada** em componente, config ou string do código. Tudo isso é dado —
vem de uma configuração por tenant (tabela `tenants`/`estabelecimentos`, ou um objeto de
tema carregado em runtime), nunca de uma constante no repositório.

Isso vale para:
- Nome do estabelecimento, logo, favicon, cores de marca (tokens de design)
- Textos de UI que hoje "fazem sentido só pro Kora" (nome do produto na tela de
  login, mensagens de boas-vindas, rodapé)
- Regras de negócio que hoje só existem porque "é assim que o cliente atual trabalha"
  (ex.: taxa de serviço fixa, forma de arredondamento, categorias de produto padrão) —
  isso vira configuração por tenant, não `if (tenantId === 'kora-original')`

### Exemplo — config vinda do tenant (bom) vs hardcoded (ruim)

```jsx
// RUIM — nome, cor e regra hardcoded no componente
function Header() {
  return (
    <header style={{ background: '#8B0000' }}>
      <img src="/logo-kora.png" alt="Kora" />
      <span>Taxa de serviço: 10%</span>
    </header>
  );
}
```

```jsx
// BOM — tudo vem do tenant, componente é genérico
function Header() {
  const { tenant } = useTenant(); // nome, logoUrl, corPrimaria, taxaServico...

  return (
    <header style={{ background: tenant.corPrimaria }}>
      <img src={tenant.logoUrl} alt={tenant.nome} />
      <span>Taxa de serviço: {formatPercent(tenant.taxaServico)}</span>
    </header>
  );
}
```

```sql
-- RUIM — regra de negócio de UM cliente vazando pro schema/policy geral
CREATE POLICY "só kora vê pedidos"
  ON pedidos FOR SELECT
  USING (estabelecimento = 'kora');

-- BOM — isolamento por tenant, genérico para qualquer cliente
CREATE POLICY "tenant só vê seus próprios pedidos"
  ON pedidos FOR SELECT
  USING (tenant_id = auth.jwt() -> 'tenant_id');
```

**Tokens de design por tenant**: cores, tipografia (se aplicável), espaçamento-base e
logo devem ser resolvidos como tokens carregados a partir da config do tenant (tabela ou
JSON de tema), não como valores fixos no CSS/Tailwind config. O design system continua
único (mesmos componentes, mesma estrutura) — o que varia por tenant é o preenchimento
dos tokens, não o sistema em si.

## Modelagem mínima

- `tenant_id` (ou equivalente, ex. `estabelecimento_id`) em **toda tabela** que guarda
  dado de negócio — incluindo tabelas de configuração, não só as "óbvias" (pedidos,
  produtos). Índice nesse campo em qualquer tabela consultada com frequência.
- Tabela de tenants/estabelecimentos: identidade (nome, slug, tema/tokens visuais), plano
  ativo, status (ativo/suspenso/trial), metadados de contato.
- Tabela de membros/perfis: vínculo usuário ↔ tenant ↔ papel (owner, gerente, operador de
  caixa etc.), permitindo que um usuário pertença a mais de um tenant se o produto
  permitir (ex.: consultor que atende vários estabelecimentos).
- Toda FK de dado operacional aponta, direta ou indiretamente, para o tenant — nunca
  criar uma tabela "global" que mistura dado de tenants diferentes sem coluna de
  isolamento.

## Plano e feature flags por tenant

- Estrutura mínima de planos (ex. `free` / `pro` / `enterprise`) vive como atributo do
  tenant, não do código: o código pergunta "este tenant tem a feature X habilitada?",
  nunca assume um plano fixo.
- Feature flags por tenant permitem rollout gradual, teste com cliente específico, e
  diferenciação comercial entre planos sem branch de código por cliente.
- Limites de uso (nº de usuários, nº de pedidos/mês, integrações disponíveis) são
  configuração de plano, resolvida em runtime a partir do tenant autenticado — nunca uma
  constante global do sistema.

## Checklist — "pronto para multi-tenant"

- [ ] Toda tabela nova tem `tenant_id` e política de RLS correspondente
- [ ] Nenhuma chave com bypass de RLS (`service_role` ou equivalente) aparece em código
      que roda no navegador
- [ ] Nenhuma string de marca, cor, logo ou nome de cliente está hardcoded em componente,
      config ou constante — tudo resolvido a partir do tenant em runtime
- [ ] Regras de negócio específicas de um cliente atual estão modeladas como configuração
      de tenant, não como `if` no código
- [ ] Existe (ou está no roadmap próximo) tabela de tenants/estabelecimentos e de
      membros/perfis com vínculo a papel
- [ ] Planos e limites de uso são atributo do tenant, resolvidos em runtime — não
      constantes globais
- [ ] Há pelo menos um teste ou verificação manual de isolamento entre dois tenants
      diferentes antes de considerar uma feature sensível pronta
- [ ] Ao adicionar tabela/função nova ao banco, o aviso de "configurar RLS no painel" foi
      dado explicitamente
