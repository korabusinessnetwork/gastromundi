# 05 — FLUXOS · {{PRODUTO}}

> Fluxos ponta-a-ponta: o caminho que um usuário (ou sistema) segue de início ao fim.

## O que vive aqui

- **Fluxos de usuário**: autenticação, onboarding, compra, suporte
- **Fluxos de sistema**: integração com pagamento, sincronização, backup
- **Fluxos de erro**: o que acontece quando falha? Como recuperar?
- **Diagramas de sequência**: ator → sistema → banco, em ordem temporal
- **Handoffs**: onde passa de um módulo para outro (ex: app → API → email)
- **Transações críticas**: fluxos que não podem falhar (payment, financial)

## O que NÃO vive aqui

- Telas individuais → `06_COMPONENTES/`
- Regras de cada passo → `03_REGRAS_DE_NEGOCIO/`
- APIs que executam passos → `07_APIS/`
- Decisões arquiteturais → `08_DECISOES/`

## Arquivos sugeridos

- `fluxo-autenticacao.md` — sign-up, login, 2FA, logout (sequence diagram)
- `fluxo-pedido.md` — criação, validação, pagamento, confirmação, entrega
- `fluxo-onboarding.md` — novo tenant, configuração inicial, primeira operação
- `fluxo-integracao-pagamento.md` — checkout → gateway → webhook → confirmação
- `fluxo-erro.md` — o que fazer quando X falha (retry, rollback, notificar)
- `diagramas/` — Mermaid sequence diagrams, UML, swimlanes

## Como preencher

1. **Desenhe antes de codar**: sequence diagram em Mermaid, stakeholders revisam
2. **Inclua atores**: usuário, sistema, API, banco de dados, serviço externo
3. **Marque pontos críticos**: onde pode falhar? Precisa de log? Transação?
4. **Fluxo feliz E fluxo de erro**: ambos importam igualmente
5. **Atualize quando mudar**: regra muda → fluxo muda → update aqui

## Ligações

- `03_REGRAS_DE_NEGOCIO/` — regras que cada passo valida
- `07_APIS/` — endpoints que implementam cada passo
- `05_FLUXOS/` — se fluxo A chama fluxo B, documenta a composição
