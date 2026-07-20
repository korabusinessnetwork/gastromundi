# Padrões Consolidados — {{PRODUTO}}

## Objetivo
- Registrar padrões validados em produção (não especulação)
- Evitar variação e inconsistência no código
- Acelerar onboarding com guias de implementação

## Contexto
- Stack: {{STACK}} (ex: React + Supabase + Vercel)
- Padrões evoluem com a base de código; deprecados ganham tag [DEPRECADO]

## Regras Gerais
- Padrão só entra após validado em produção ou revisão de código (≥ 2 devs)
- Padrão obsoleto = tag [DEPRECADO] + data + sucessor
- Padrão quebrado em issue = escalação ao tech lead

## Validações
- Padrão tem exemplos de código real (não pseudocódigo)?
- Contraexemplo está marcado como anti-padrão?

## Permissões
- Tech lead: aprova/depreca padrões
- Dev: propõe padrões após revisar com time

## Exceções
- Padrão de segurança/compliance: entra imediatamente (sem esperar 2 devs)

## Auditoria
- Code review checa conformidade com padrões
- Linter configurable para policing automático

## Eventos
- `pattern.validated`, `pattern.deprecated`, `pattern.superseded`

## Casos de Uso
- Revisar código de feature nova
- Decidir como estruturar novo módulo
- Treinar dev novo

## Critérios de Aceite
- [ ] Padrão tem mínimo 1 exemplo de uso real
- [ ] Contraexemplos claros (anti-padrão)
- [ ] Exceções documentadas

---

## Padrões de Código

### Nomenclatura
- **Domínio (português)**: `abrirCaixa`, `fecharComanda`, `calcularTroco`
- **Técnico (inglês)**: `useEffect`, `handleSubmit`, `fetchData`
- **Constantes**: `TAXA_PADRAO_CAIXA`, `MAX_ITENS_COMANDA`
- **Booleans**: `isDone`, `canEdit`, `hasError`

✅ `const abrirCaixa = async () => { ... }` (ação em português)
❌ `const handleOpenCashierRegister = () => { ... }` (jargão técnico misturado)

### Estrutura de Arquivos (por-feature)
```
src/features/
├── {{FEATURE}}/
│   ├── components/
│   │   ├── {{Feature}}.jsx
│   │   └── {{Feature}}.test.jsx
│   ├── hooks/
│   │   └── use{{Feature}}.js
│   ├── types.js (ou .ts)
│   ├── constants.js
│   └── index.js (barrel export)
```

✅ `src/features/caixa/components/Caixa.jsx`
❌ `src/components/caixa/Caixa.jsx` + `src/hooks/caixa.js` espalhados

### Gerenciamento de Estado
- **Local**: useState (componente é dono dos dados)
- **Contexto**: {{CONTEXTO_GLOBAL}} (ex: autenticação, tema)
- **Supabase Realtime**: subscriptions em useEffect (cleanup ao desmontar)

✅ Estado crítico + compartilhado = Supabase + Context
❌ Redux; ❌ useState em component pai para passpropping profundo

## Padrões de API / Backend

### Envelope de Resposta
```json
{
  "data": {{DADOS_RETORNADOS}},
  "meta": { "timestamp": "2024-01-15T10:30:00Z", "version": "1" },
  "error": null
}
```

**Em caso de erro:**
```json
{
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "CPF inválido" },
  "meta": { "timestamp": "..." }
}
```

✅ Sempre envelope, mesmo em sucesso
❌ Array nu ou objeto nu sem metadata

### Validação
- Input validation na {{CAMADA_VALIDACAO}} (ex: Zod schema antes de Supabase)
- Mensagens de erro em português, código em enum (pt-BR como fallback)

### Tratamento de Erros
- Código de erro estável (não muda entre versões)
- Retry automático em 5xx (com backoff exponencial)
- Log estruturado sem dados sensíveis (senhas, tokens)

## Padrões de UI/UX

### Feedback Temporal
- **Sucesso**: toast confirmação, <2s
- **Erro**: banner vermelho + botão retry, permanece até ação
- **Carregando**: skeleton ou spinner, ≤ 100ms de latência antes de aparecer

✅ Fechar caixa: spinner, sucesso com toast "Caixa fechada em X min"
❌ Pop-up de erro que some em 3s

### Estados Obrigatórios
Toda tela tem renderização para:
- `loading`: buscando dados
- `empty`: nenhum resultado
- `error`: algo quebrou
- `success`: renderização normal

## Padrões de Processo

### Fluxo de PR
1. Branch `feature/xxx` ou `fix/xxx` de `main`
2. Commit `message em inglês, corpo em pt-BR opcionalmente`
3. PR com checklist (testes passam, design review, casos edge)
4. ≥ 1 aprovação + CI green = merge
5. Delete branch remota

### Code Review
- Verificar se novo padrão? Documentar em `memory/patterns.md`
- Quebra padrão existente? Tag `[DEPRECADO]` o padrão velho
- Segurança? Escalar ao tech lead imediatamente

### Documentação
- Código novo + comentário `// {{O_QUE}} ({{POR_QUE}})`
- Função > 3 linhas = JSDoc (tipos, exemplos)
- Feature = issue linked, ADR se relevante

---

## Padrões [DEPRECADO]

| Padrão | Razão | Data | Sucessor |
|---|---|---|---|
| {{PADRAO_VELHO}} | {{RAZAO}} | {{DATA}} | {{NOVO_PADRAO}} |
| Redux (exemplo) | Context API + Supabase bastam, Redux é overhead | 2024-02-01 | Context API + Hooks |

## Checklist de Novo Padrão

- [ ] Testado em 2+ contextos reais
- [ ] Documentado aqui com exemplo ✅ e contraexemplo ❌
- [ ] Code review aprovada
- [ ] Linter/automação em lugar? (opcional)
