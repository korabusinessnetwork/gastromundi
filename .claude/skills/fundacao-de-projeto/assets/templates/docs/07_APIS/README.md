# 07 — APIS · {{PRODUTO}}

> Contrato de APIs: endpoints, autenticação, error-handling, versioning.

## O que vive aqui

- **Endpoints**: GET /users, POST /orders, PUT /settings, DELETE /items
- **Autenticação**: token JWT, session, OAuth, permissões por endpoint
- **Request/Response**: schema JSON, validações, exemplos
- **Error handling**: códigos de erro estáveis, mensagens úteis
- **Versioning**: como lidar com breaking changes (v1, v2)
- **Rate limiting**: limites por user, throttling, retry strategy
- **Documentação**: OpenAPI/Swagger, exemplos cURL, auth flow

## O que NÃO vive aqui

- Implementação → `src/` (handlers, middlewares)
- Banco de dados → `04_MODELAGEM/`
- Regras de negócio → `03_REGRAS_DE_NEGOCIO/`
- Fluxos → `05_FLUXOS/`

## Arquivos sugeridos

- `endpoints.md` — lista de rotas: método, path, parâmetros, autenticação
- `schemas.md` — Request/Response JSONs com tipos, validações, exemplos
- `authentication.md` — como obter token, JWT structure, refresh flow
- `error-handling.md` — erro codes (4xx, 5xx), envelope de resposta
- `versioning.md` — estratégia de evoluir API sem quebrar clientes
- `openapi.yaml` ou `swagger.json` — spec formal (Swagger UI)

## Como preencher

1. **Comece com OpenAPI/Swagger**: ferramenta gera documentação automaticamente
2. **Envelope padrão**: `{ data: {...}, error: null, meta: {...} }` ou similar
3. **Toda API valida input**: não confie em client, valide server-side
4. **Códigos HTTP corretos**: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 500 Error
5. **Documentação = contrato**: se doc e código divergem, código ganha — mas DOC precisa atualizar

## Ligações

- `03_REGRAS_DE_NEGOCIO/` — regras que cada endpoint deve garantir
- `05_FLUXOS/` — endpoints que compõem cada fluxo
- `11_SEGURANCA/` — checklist de segurança por endpoint
