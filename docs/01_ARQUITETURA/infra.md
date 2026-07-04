# Infraestrutura — GastroMundi

## Objetivo
Documentar a infraestrutura do projeto GastroMundi: ambientes, deploys, domínios, variáveis de ambiente e estratégia de CI/CD.

## Contexto
GastroMundi utiliza Supabase como backend gerenciado, eliminando a necessidade de infraestrutura de servidor própria no estágio inicial. O frontend é servido via hospedagem estática. A estratégia de infraestrutura prioriza simplicidade operacional e custo controlado.

## Regras Gerais
- Nunca commitar variáveis de ambiente ou chaves de API no repositório
- Todo ambiente (dev, staging, prod) deve ter projeto Supabase separado
- Mudanças em produção devem passar por staging primeiro

## Validações
- Variáveis de ambiente obrigatórias devem ser validadas no startup da aplicação
- Certificados SSL devem estar sempre ativos em produção

## Permissões
- Acesso ao ambiente de produção: apenas tech lead e founders
- Acesso ao staging: toda a equipe técnica
- Acesso ao dev: todos os membros

## Exceções
- Em incidentes críticos, o tech lead pode aplicar hotfixes direto em produção com registro retroativo obrigatório

## Auditoria
- Logs de deploy devem ser mantidos por, no mínimo, 30 dias
- Acessos ao painel de produção devem ser auditados

## Eventos
- `infra.deploy` — deploy realizado em qualquer ambiente
- `infra.incident` — incidente de infraestrutura registrado
- `infra.config.changed` — variável de ambiente ou configuração alterada

## Configurações Futuras
- Definir estratégia de backup do banco de dados
- Avaliar uso de Supabase CLI para migrações automatizadas
- Planejar monitoramento e alertas (Sentry, Uptime Robot ou similar)

## Casos de Uso
- Onboarding de novo desenvolvedor (setup de ambiente local)
- Deploy de nova versão
- Recuperação de incidente
- Auditoria de segurança

## Critérios de Aceite
- [ ] Ambientes documentados com URLs e responsabilidades
- [ ] Lista de variáveis de ambiente obrigatórias está completa
- [ ] Processo de deploy está descrito passo a passo
- [ ] Estratégia de rollback está definida

---

## Ambientes

| Ambiente | URL | Projeto Supabase | Responsável |
|----------|-----|-----------------|-------------|
| Desenvolvimento | localhost:5173 | A definir | Todos |
| Staging | A definir | A definir | Tech lead |
| Produção | A definir | A definir | Tech lead + Founders |

## Variáveis de Ambiente Obrigatórias

```env
VITE_SUPABASE_URL=         # URL do projeto Supabase
VITE_SUPABASE_ANON_KEY=    # Chave anon pública do Supabase
```

## Processo de Deploy

Fluxo padrão, do commit à produção:

1. **Pull Request** — branch focada, com checagens automáticas (lint, typecheck, testes) verdes e revisão aprovada.
2. **Merge na branch principal** — dispara build automatizado.
3. **Deploy em staging** — versão publicada no ambiente de staging para validação.
4. **Validação em staging** — smoke test das jornadas críticas (auth, dashboard, billing).
5. **Promoção para produção** — após aprovação; migrações de banco aplicadas de forma controlada.
6. **Verificação pós-deploy** — checagem de saúde e monitoramento de erros.

```
PR (checks verdes) ──▶ merge ──▶ build ──▶ staging ──▶ validação ──▶ produção ──▶ verificação
```

**Regras:**
- Mudanças em produção **sempre** passam por staging antes (ver "Regras Gerais").
- Migrações de schema são versionadas e aplicadas antes do deploy do código que depende delas.
- Cada ambiente usa um projeto Supabase separado (dev/staging/prod isolados).

## Estratégia de Rollback

- **Frontend:** reverter para o build anterior (deploy imutável e versionado) — rollback rápido e sem perda de dados.
- **Banco de dados:** migrações devem ser **reversíveis** sempre que possível; mudanças destrutivas (drop de coluna/tabela) são feitas em etapas (expandir → migrar → contrair) para permitir rollback seguro.
- **Critério de acionamento:** erro crítico em produção (perda de dados, falha de auth, indisponibilidade) aciona rollback imediato; o tech lead decide entre rollback e hotfix.
- **Pós-rollback:** registrar incidente e abrir post-mortem (ver `memory/learnings.md`).

## Considerações Multi-tenant na Infraestrutura

- Todos os tenants compartilham a mesma aplicação e banco (modelo `tenant_id` + RLS — ver `docs/01_ARQUITETURA/overview.md`).
- Backups e restaurações operam sobre o banco compartilhado; restaurações pontuais por tenant devem preservar o isolamento.
- Limites de capacidade (conexões, storage) são monitorados globalmente, com atenção a tenants de maior volume.
- Evolução futura: tenants enterprise podem exigir recursos dedicados — decisão a ser registrada via ADR.
