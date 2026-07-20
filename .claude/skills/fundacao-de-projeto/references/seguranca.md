# Plano de Segurança — guia da fundação

Segurança não é uma fase final; é **definition-of-done** em toda camada. Este
guia codifica o modelo de ameaças e os controles obrigatórios de qualquer app
novo, e alimenta o doc versionado em `docs/11_SEGURANCA/`. Na fase bootstrap,
**todos os controles abaixo são atingíveis com ferramentas gratuitas** — nenhum
depende de serviço pago.

## Princípio

> Prevenir o erro é melhor que reportar o erro. Desabilite, valide e isole
> antes de deixar a falha acontecer — no código e nos dados.

## Modelo de ameaças por camada

| Camada | Ameaça principal | Controle obrigatório |
|--------|------------------|----------------------|
| Cliente/UI | Vazamento de segredo, XSS, dado sensível em `localStorage` | Só chave pública (`anon`) no front; nunca `service_role`; nada sensível em `localStorage`; escapar/sanitizar entrada |
| Rede/API | Requisição forjada, dado fora de contrato | Validação por schema (Zod) na fronteira; envelope `{data,error,meta}`; HTTPS sempre |
| Autorização | Um tenant lê dados de outro | **RLS** (Row Level Security) em TODA tabela; `tenant_id` na política; testar isolamento |
| Dados | Query vazando colunas sensíveis | Nunca `select *` em tabelas sensíveis (usuários, caixa, pedidos, logs) — campos explícitos |
| Lógica de negócio | Regra sensível burlável no cliente | Lógica sensível (dinheiro, permissão, fiscal) em Edge Function/backend, não no front |
| Observabilidade | PII/segredo em log | Log sem dado pessoal/financeiro em texto claro; `activity_log` fire-and-forget |
| Segredos | Chave commitada no repo | Só `import.meta.env.VITE_*`; `.env` no `.gitignore`; secret scanning no CI |

## Controles obrigatórios (checklist de release)

### Segredos e configuração
- [ ] Nenhuma chave/URL/secret/senha hardcodada — tudo via `import.meta.env.VITE_*`
- [ ] `.env*` no `.gitignore`; `.env.example` versionado só com nomes das vars
- [ ] `service_role` (ou equivalente admin) **jamais** exposta ao cliente
- [ ] Secret scanning ativo (gratuito: GitHub secret scanning / `gitleaks`)

### Autenticação e autorização
- [ ] Auth verificada **antes** de renderizar rota protegida
- [ ] RLS ativa em **todas** as tabelas antes de ir a produção (uma tabela
      esquecida é uma brecha) — RLS é definition-of-done da tabela
- [ ] Isolamento multi-tenant testado: usuário do tenant A não acessa dados do B
- [ ] Sessão/token em mecanismo seguro, não em `localStorage` de longa duração

### Entrada e dados
- [ ] Todo input do usuário validado antes de qualquer operação no banco
- [ ] Sem `select *` em tabelas sensíveis; sempre campos explícitos
- [ ] Toda chamada ao backend tratada com `try/catch` ou checagem de `.error`
- [ ] Uploads validados (tipo, tamanho) e servidos sem execução

### Logging e observabilidade
- [ ] Nenhum `console.log` de senha, token ou dado financeiro
- [ ] Logs/auditoria sem PII em texto claro
- [ ] Log de atividade nunca bloqueia a operação principal (fire-and-forget)

### Ciclo e dependências
- [ ] Dependências críticas com versão fixada (sem `latest`)
- [ ] `npm audit` (gratuito) sem vulnerabilidade crítica aberta
- [ ] Dependabot/renovate (gratuito) para atualizações de segurança

## Compliance (LGPD / GDPR quando aplicável)

- Dado pessoal só tratado com base legal válida; nada de compartilhamento sem
  consentimento.
- Direito de **exportar e excluir** os dados (portabilidade e esquecimento) —
  previsto no roadmap desde a fundação.
- Dados de um tenant **nunca** vazam para outro (isolamento é requisito legal,
  não só técnico).
- Se coletar dado de menores: consentimento parental verificável.
- Transparência de IA: o usuário sempre sabe quando fala com IA e de onde vem a
  informação; a IA não inventa números/fatos sobre o negócio.

## Resposta a incidentes (mínimo viável)

1. **Detectar** — de onde veio (log, report, scanning). Registrar em
   `memory/bugs.md` com severidade.
2. **Conter** — revogar chave vazada, desabilitar rota, isolar tenant afetado.
3. **Corrigir** — patch + teste que prova a correção.
4. **Registrar** — post-mortem curto em `memory/learnings.md`; se muda
   arquitetura/política, abrir ADR.
5. **Prevenir** — o aprendizado vira restrição (`memory/restrictions.md`) ou
   padrão (`memory/patterns.md`) para não repetir.

## Custo (fase bootstrap)

Todos os controles acima usam tiers gratuitos (Supabase RLS, GitHub secret
scanning/Dependabot, `npm audit`, `gitleaks`, Zod). Monitoramento pago (ex.:
Sentry), WAF pago, pentest contratado e emissão fiscal com provedor pago são
**adiados por padrão** — ao esbarrar num deles, apresente custo aproximado,
alternativa gratuita, impacto e recomendação (agora × depois) para o dono
decidir. Ver `memory/restrictions.md` (Restrições de Custo).

## Como usar este guia na fundação

1. Copie a estrutura para `docs/11_SEGURANCA/README.md` adaptando ao produto.
2. Rode o **checklist de release** como gate antes de cada deploy.
3. Toda decisão de segurança relevante (auth, criptografia, política de dados)
   vira ADR em `docs/08_DECISOES/`.
4. Restrições de segurança permanentes moram em `memory/restrictions.md` e têm
   prioridade máxima — não se removem sem ADR de exceção.
