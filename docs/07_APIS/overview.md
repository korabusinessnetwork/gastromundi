# APIs — Visão Geral — GastroMundi

## Objetivo
Documentar todas as APIs utilizadas e expostas pelo GastroMundi: endpoints do Supabase, RPC functions, Edge Functions e integrações externas.

## Contexto
GastroMundi usa Supabase como backend principal. A "API" do produto é majoritariamente o SDK do Supabase (PostgREST, Auth, Storage) com algumas Edge Functions para lógica customizada. Não há servidor Express/Node próprio no frontend — tudo passa pelo Supabase.

## Regras Gerais
- Toda comunicação client-servidor usa o Supabase SDK — sem fetch direto para o banco
- Edge Functions são usadas para lógica que requer chaves de API externas (ex: pagamento)
- Toda rota/função deve ter documentação em `docs/07_APIS/endpoints.md`
- Respostas de erro seguem o padrão documentado em `docs/07_APIS/error-handling.md`

## Validações
- Inputs de Edge Functions devem ser validados com Zod antes de processar
- Autenticação deve ser verificada no início de toda Edge Function protegida

## Permissões
- APIs públicas (sem auth) devem ser explicitamente documentadas e justificadas
- RLS no banco garante isolamento de dados por usuário

## Exceções
- Webhooks externos (ex: gateway de pagamento) são endpoints públicos com validação de assinatura

## Auditoria
- Logs de Edge Functions devem ser monitorados em produção
- Erros de API devem gerar alertas para a equipe

## Eventos
- `api.error` — erro de API registrado para monitoramento

## Configurações Futuras
- Avaliar Supabase Realtime para features colaborativas
- Documentar API com OpenAPI/Swagger quando Edge Functions crescerem
- Rate limiting nas Edge Functions mais sensíveis

## Casos de Uso
- Consulta de dados do usuário
- Operações CRUD no banco
- Processamento de pagamentos via Edge Function
- Integrações com serviços externos

## Critérios de Aceite
- [ ] Todas as Edge Functions estão documentadas em endpoints.md
- [ ] Padrão de autenticação está descrito em authentication.md
- [ ] Tratamento de erros está padronizado em error-handling.md

---

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [endpoints.md](./endpoints.md) | Lista de Edge Functions e RPC functions |
| [authentication.md](./authentication.md) | Como autenticar nas APIs |
| [error-handling.md](./error-handling.md) | Padrão de erros e códigos |

## Camadas de API

```
Frontend (React)
    │
    ├── supabase.from('table').select()     → PostgREST (CRUD direto)
    ├── supabase.auth.*                     → Auth API
    ├── supabase.storage.*                  → Storage API
    ├── supabase.rpc('function_name')       → PostgreSQL RPC
    └── supabase.functions.invoke('name')  → Edge Functions
```
