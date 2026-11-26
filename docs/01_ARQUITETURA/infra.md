# Infraestrutura, GastroMundi

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
- `infra.deploy`, deploy realizado em qualquer ambiente
- `infra.incident`, incidente de infraestrutura registrado
- `infra.config.changed`, variável de ambiente ou configuração alterada

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

Estado real revisado na refatoração 6.12 (2026-11-26).

| Ambiente | Onde | Banco | Observação |
|----------|------|-------|-----------|
| Desenvolvimento | `localhost:5173` (`npm run dev`) | o projeto Supabase configurado no `.env.local` | Testes e o roteiro de fotos usam um Supabase falso, sem rede |
| Prévia | URL de prévia da Vercel por branch | o mesmo projeto Supabase | O site da Kora e o Console ficam inertes sem `VITE_ROOT_DOMAIN` |
| Produção | Vercel, domínio `kora.codes` e subdomínios dos estabelecimentos | projeto Supabase de produção | Não há staging separado |

## Variáveis de Ambiente

```env
VITE_SUPABASE_URL=         # URL do projeto Supabase (pública)
VITE_SUPABASE_ANON_KEY=    # chave anon (pública; o acesso real é decidido pela RLS)
VITE_ROOT_DOMAIN=          # domínio da plataforma (liga o site da Kora e os subdomínios)
VITE_CONSOLE_SUBDOMAIN=    # opcional: o Console em subdomínio próprio
```

Segredos (chave de serviço, certificado A1 e CSC da NFC-e) ficam nas funções de borda e no Vault do
Supabase, nunca em variável `VITE_*`.

## Processo de Deploy

1. **Rodada numa branch**, com suíte verde, build limpo, lint sem erro e o roteiro de fotos
   comparado.
2. **Pull Request** com a spec da rodada. O push leva a nota de atualização
   (`kora.codes/patchnotes`); o `.githooks/pre-push` recusa sem ela.
3. **Merge na `main`** (avanço rápido). A integração da Vercel **publica produção a cada push na
   `main`**.
4. **Migration** é aplicada no Supabase de produção **antes** do merge da rodada que depende dela
   (ADR-015, D6), com aviso ao dono. Rodada com migration pendente não é mesclada calada.

```
branch (verificada) ──▶ PR ──▶ merge na main ──▶ Vercel publica produção
```

## Estratégia de Rollback

- **Frontend:** voltar ao build anterior na Vercel (cada deploy fica guardado), rápido e sem perda de dados.
- **Banco de dados:** migrações devem ser **reversíveis** sempre que possível; mudanças destrutivas (drop de coluna/tabela) são feitas em etapas (expandir → migrar → contrair) para permitir rollback seguro.
- **Critério de acionamento:** erro crítico em produção (perda de dados, falha de auth, indisponibilidade) aciona rollback imediato; o tech lead decide entre rollback e hotfix.
- **Pós-rollback:** registrar incidente e abrir post-mortem (ver `memory/learnings.md`).

## Considerações Multi-tenant na Infraestrutura

- Todos os tenants compartilham a mesma aplicação e banco (modelo `tenant_id` + RLS, ver `docs/01_ARQUITETURA/overview.md`).
- Backups e restaurações operam sobre o banco compartilhado; restaurações pontuais por tenant devem preservar o isolamento.
- Limites de capacidade (conexões, storage) são monitorados globalmente, com atenção a tenants de maior volume.
- Evolução futura: tenants enterprise podem exigir recursos dedicados, decisão a ser registrada via ADR.
