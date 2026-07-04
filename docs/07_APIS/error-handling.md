# Tratamento de Erros de API — GastroMundi

## Objetivo
Documentar o padrão de erros de API do GastroMundi: formato de resposta, códigos HTTP, mensagens e tratamento no frontend.

## Contexto
Erros bem padronizados reduzem tempo de debugging, melhoram a experiência do usuário e facilitam integrações. O padrão definido aqui se aplica a todas as Edge Functions e deve ser espelhado no tratamento de erros do PostgREST.

## Regras Gerais
- Toda resposta de erro de Edge Function segue o formato padrão documentado abaixo
- Nunca expor stack traces ou detalhes internos em respostas de produção
- Mensagens de erro são orientadas ao usuário — técnicas ficam apenas nos logs
- Erros de validação retornam 400 com lista de campos inválidos

## Validações
- Códigos HTTP devem ser semanticamente corretos (400 para input inválido, 401 para auth, 403 para permissão, 404 para não encontrado, 500 para erro interno)
- Resposta de erro nunca deve retornar 200 com body de erro (anti-pattern)

## Permissões
- Mensagens de erro detalhadas (com context técnico) são visíveis apenas em desenvolvimento
- Em produção, erro 500 retorna mensagem genérica

## Exceções
- Erros de webhook podem ter formato próprio exigido pelo gateway externo
- Erros do PostgREST têm formato próprio do Supabase — wrapper no frontend normaliza

## Auditoria
- Erros 500 devem gerar alerta para a equipe
- Erros 401/403 são logados para análise de segurança

## Eventos
- `api.error.client` — erro 4xx registrado
- `api.error.server` — erro 5xx registrado e alertado

## Configurações Futuras
- Integrar Sentry ou similar para captura automática de erros
- Criar página de status (status.gastromundi.app) para incidentes

## Casos de Uso
- Frontend trata erro de validação e exibe campos inválidos
- Edge Function retorna erro padronizado após falha
- Usuário vê mensagem clara ao tentar ação sem permissão

## Critérios de Aceite
- [ ] Todas as Edge Functions retornam erros no formato padrão
- [ ] Frontend tem utilitário para normalizar erros do Supabase e Edge Functions
- [ ] Erros 500 não expõem informações internas em produção

---

## Formato Padrão de Erro (Edge Functions)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados de entrada inválidos.",
    "details": [
      { "field": "email", "message": "E-mail inválido" }
    ]
  }
}
```

## Códigos HTTP e Significados

| Código | Nome | Quando usar |
|--------|------|-------------|
| 400 | Bad Request | Input inválido, parâmetros faltando |
| 401 | Unauthorized | Sem token ou token inválido |
| 403 | Forbidden | Token válido, mas sem permissão |
| 404 | Not Found | Recurso não existe |
| 409 | Conflict | Conflito (ex: e-mail duplicado) |
| 422 | Unprocessable Entity | Regra de negócio violada |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Erro inesperado do servidor |

## Códigos de Erro de Domínio

| Código | Descrição |
|--------|-----------|
| `VALIDATION_ERROR` | Input inválido |
| `AUTH_REQUIRED` | Autenticação necessária |
| `PERMISSION_DENIED` | Sem permissão para a ação |
| `NOT_FOUND` | Recurso não encontrado |
| `CONFLICT` | Conflito com estado atual (ex: e-mail duplicado) |
| `PLAN_LIMIT_REACHED` | Limite do plano atingido |
| `PAYMENT_FAILED` | Falha no processamento do pagamento |
| `INTERNAL_ERROR` | Erro interno genérico |

## Tratamento no Frontend

```typescript
// Utilitário para normalizar erros
function parseApiError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const e = error as any
    return e?.error?.message ?? e?.message ?? 'Erro inesperado.'
  }
  return 'Erro inesperado.'
}
```
