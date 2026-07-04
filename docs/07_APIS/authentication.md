# Autenticação de API — GastroMundi

## Objetivo
Documentar como a autenticação funciona nas APIs do GastroMundi: JWT, RLS, Edge Functions e webhooks.

## Contexto
GastroMundi usa JWT gerenciado pelo Supabase Auth para autenticação de usuários. O token é enviado automaticamente pelo SDK do Supabase em todas as requisições ao banco e às Edge Functions. RLS (Row Level Security) no PostgreSQL garante isolamento de dados por usuário no nível do banco.

## Regras Gerais
- O SDK do Supabase injeta o token JWT automaticamente — nunca manipular manualmente
- Edge Functions devem verificar o JWT no início de toda rota protegida
- RLS é a última linha de defesa — deve funcionar mesmo se o frontend falhar
- Chaves `service_role` nunca são usadas no frontend — apenas em Edge Functions e scripts de backend

## Validações
- Token expirado deve resultar em 401, com refresh automático tentado pelo SDK
- Claims do JWT (user_id, role) devem ser validados nas Edge Functions
- Webhooks externos usam HMAC signing — nunca JWT

## Permissões
- `anon key`: acesso público limitado ao que RLS permitir em tabelas abertas
- `user JWT`: acesso a dados do próprio usuário conforme RLS
- `service_role key`: acesso irrestrito — apenas via Edge Functions seguras

## Exceções
- Endpoints de webhook de gateway de pagamento são autenticados via assinatura HMAC, não JWT
- APIs de saúde/status podem ser públicas (sem auth)

## Auditoria
- Tentativas de acesso com token inválido devem ser logadas
- Uso da service_role key deve ser auditado

## Eventos
- `auth.token.expired` — token expirado detectado pelo SDK
- `auth.token.refreshed` — token renovado com sucesso

## Configurações Futuras
- Avaliar Supabase Auth Hooks para lógica customizada no login
- Implementar revogação de sessão (logout em todos os dispositivos)

## Casos de Uso
- Usuário autenticado acessa dados protegidos
- Edge Function processa ação em nome do usuário
- Webhook externo é validado antes de processar

## Critérios de Aceite
- [ ] JWT é enviado automaticamente pelo SDK do Supabase
- [ ] RLS bloqueia acesso a dados de outros usuários mesmo com token válido
- [ ] Edge Functions verificam JWT antes de processar
- [ ] Webhooks validam assinatura HMAC antes de processar

---

## Fluxo de Autenticação de API

```
Cliente (React)
    │
    ├── supabase.auth.signIn() → recebe access_token + refresh_token
    │
    ├── SDK injeta Authorization: Bearer <token> em todas as requisições
    │
    ├── PostgREST (banco) → RLS valida auth.uid() contra dados
    │
    └── Edge Function → verifica JWT manualmente:
            const { user } = await supabase.auth.getUser(token)
            if (!user) return 401
```

## Validação de JWT em Edge Function

```typescript
// Padrão para toda Edge Function protegida
const authHeader = req.headers.get('Authorization')
if (!authHeader) return new Response('Unauthorized', { status: 401 })

const token = authHeader.replace('Bearer ', '')
const { data: { user }, error } = await supabase.auth.getUser(token)
if (error || !user) return new Response('Unauthorized', { status: 401 })

// A partir daqui, user é confiável
```

## Validação de Webhook (HMAC)

```typescript
// Para webhooks de gateway de pagamento
const signature = req.headers.get('x-gateway-signature')
const isValid = validateHmacSignature(body, signature, WEBHOOK_SECRET)
if (!isValid) return new Response('Invalid signature', { status: 401 })
```
