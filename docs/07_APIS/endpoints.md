# Endpoints — GastroMundi

## Objetivo
Documentar todos os endpoints de API do GastroMundi: Edge Functions, RPC functions e operações PostgREST relevantes.

## Contexto
GastroMundi não tem servidor HTTP próprio — usa o Supabase como backend. Os "endpoints" são compostos por: operações PostgREST (CRUD), RPC functions (PostgreSQL), Edge Functions (lógica customizada) e APIs do Supabase Auth/Storage.

## Regras Gerais
- Toda Edge Function deve validar o token JWT antes de processar
- Inputs de Edge Functions devem ser validados com schema (Zod ou similar)
- Edge Functions são serverless — devem ser stateless
- Toda Edge Function deve ter tratamento de erro explícito e retorno padronizado

## Validações
- Parâmetros obrigatórios devem retornar 400 se ausentes
- Autenticação inválida retorna 401
- Permissão insuficiente retorna 403

## Permissões
- Endpoints públicos são a exceção — justificativa obrigatória
- Endpoints de webhook têm validação de assinatura em vez de JWT

## Exceções
- Webhooks de gateway de pagamento são públicos com validação de assinatura HMAC

## Auditoria
- Logs de chamadas a Edge Functions devem ser mantidos por 30 dias
- Erros são reportados para sistema de monitoramento

## Eventos
- N/A — os endpoints geram os eventos de domínio descritos nos módulos

## Configurações Futuras
- Adicionar rate limiting às Edge Functions
- Documentar com OpenAPI quando a superfície crescer
- Criar coleção Postman ou Insomnia para testes manuais

## Casos de Uso
- Consulta, criação, atualização e exclusão de dados
- Processamento de pagamentos
- Webhooks de integrações externas

## Critérios de Aceite
- [ ] Toda Edge Function está listada com método, path, auth e descrição
- [ ] Parâmetros de entrada e saída estão documentados
- [ ] Exemplos de request/response estão presentes

---

## Edge Functions

### POST `/functions/v1/billing-checkout`
- **Auth:** JWT obrigatório (user)
- **Descrição:** Inicia fluxo de upgrade de plano via gateway de pagamento
- **Body:** `{ plan: 'pro' | 'enterprise', paymentMethodId: string }`
- **Retorno:** `{ checkoutUrl: string }` ou erro padronizado
- **Status:** A implementar

### POST `/functions/v1/billing-webhook`
- **Auth:** Assinatura HMAC do gateway (sem JWT)
- **Descrição:** Recebe webhooks do gateway de pagamento e atualiza status
- **Body:** Payload do gateway (a definir)
- **Retorno:** `{ received: true }` ou erro
- **Status:** A implementar

### POST `/functions/v1/send-invite`
- **Auth:** JWT obrigatório (admin ou owner)
- **Descrição:** Envia convite por e-mail para novo membro da organização
- **Body:** `{ email: string, role: 'member' | 'admin' }`
- **Retorno:** `{ inviteId: string }` ou erro
- **Status:** A implementar

---

## RPC Functions (PostgreSQL)

| Função | Parâmetros | Retorno | Descrição |
|--------|-----------|---------|-----------|
| A definir | — | — | — |

---

## Operações PostgREST Principais

| Tabela | Operações | Filtros RLS |
|--------|-----------|-------------|
| `profiles` | SELECT, UPDATE | `auth.uid() = id` |
| A definir | — | — |
