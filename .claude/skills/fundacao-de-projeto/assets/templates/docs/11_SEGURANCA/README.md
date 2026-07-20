# 11 — SEGURANÇA · {{PRODUTO}}

> Plano de segurança versionado: ameaças, secrets, RLS, compliance, resposta a incidentes.

**Nota**: Esta é a pasta de PLANO DE SEGURANÇA do projeto — design decisions, policies, checklists. Código de segurança (autenticação, validação, sanitização) vive em `src/`.

## O que vive aqui

- **Modelo de ameaças**: principais riscos (data breach, injection, auth bypass, etc.)
- **Gestão de secrets**: como armazenar/rotacionar chaves, senhas, tokens
- **RLS & isolamento multi-tenant**: como garantir que tenant A não vê dados B
- **Checklist por release**: validação de segurança antes de deploy
- **Política de senhas**: requisitos, armazenamento (hash/salt/pepper)
- **Compliance**: LGPD, GDPR, PCI-DSS (se aplicável)
- **Plano de resposta a incidentes**: escalação, notificação, forensics
- **Auditoria**: logs de atividade crítica, retenção, acesso a logs

## O que NÃO vive aqui

- Código que implementa segurança → `src/middleware/`, `src/auth/`
- Secrets reais (senhas, chaves) → `.env.local`, `.env` (nunca versionados)
- Decisões de arquitetura → `08_DECISOES/`
- Regras de negócio → `03_REGRAS_DE_NEGOCIO/`

## Arquivos sugeridos

- `modelo-ameacas.md` — STRIDE, ranking de riscos, mitigação
- `gestao-secrets.md` — onde vivem (env vars, vault), rotação, acesso
- `multi-tenancy-rls.md` — como RLS garante isolamento, testes de penetração
- `checklist-release.md` — validação de segurança pré-deploy (testes, scanning)
- `politica-senhas.md` — requisitos, hash algorithm (bcrypt), 2FA
- `compliance-lgpd.md` — consentimento, direito ao esquecimento, auditoria
- `plano-incidente.md` — escalação, notificação, forensics, post-mortem
- `auditoria-logs.md` — o que logar, retenção, como acessar logs

## Como preencher

1. **Modelo de ameaças vem primeiro**: entreviste time, list principais riscos
2. **Cada feature de segurança → checklist**: ex. "2FA ativado?" tem testes?
3. **Secrets NUNCA hardcodados**: policy: só `import.meta.env.VITE_*`, `process.env.SECRET`
4. **RLS é obrigatório**: toda tabela multi-tenant assume isolamento por RLS + row-level policy
5. **Teste de segurança pré-deploy**: penetration tests, vulnerability scanning
6. **Incidente? Log tudo, notifique, post-mortem**: aprender com falha

## Ligações

- `memory/restrictions.md` — restrições legais/regulatórias do projeto
- `07_APIS/` — endpoints que precisam de autenticação/autorização
- CLAUDE.md — regras de segurança (nunca hardcodar secrets, logar dados sensíveis, etc.)
- `references/seguranca.md` — templates/checklists reutilizáveis da skill
