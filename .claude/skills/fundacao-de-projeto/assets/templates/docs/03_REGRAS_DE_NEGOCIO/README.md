# 03 — REGRAS DE NEGÓCIO · {{PRODUTO}}

> Regras que definem como o negócio funciona, por módulo. Documento antes de codar.

## O que vive aqui

- **Regras por módulo**: autenticação, faturamento, inventário, pedidos, relatórios, etc.
- **Cálculos e validações**: preços, descontos, impostos, prazos, limites
- **Fluxos de estado**: quando um pedido passa de "aberto" para "confirmado"?
- **Exceções e edge cases**: o que acontece se X falhar? Quando reverter?
- **Conformidade**: LGPD, fiscal, regulatória (ex: retenção de dados, notas)
- **Condições do Jarvas** (IA): quando alertar, quando sugerir, quando bloquear

## O que NÃO vive aqui

- Implementação técnica → `src/`
- Decisões sobre como armazenar → `04_MODELAGEM/`
- Interface (como mostrar a regra) → `06_COMPONENTES/`
- Fluxos visuais → `05_FLUXOS/`

## Arquivos sugeridos

- `modulo-autenticacao.md` — roles, permissões, 2FA, token lifetime
- `modulo-pedidos.md` — ciclo de vida, validações, cancelamento, reembolso
- `modulo-faturamento.md` — cálculo de taxas, planos, billing cycles
- `modulo-inventario.md` — movimentação, reserva, ajustes, unidades
- `JARVAS.md` — insights, alertas, sugestões (referência para IA)
- `conformidade.md` — LGPD, compliance fiscal, retenção de dados

## Como preencher

1. **Entreviste stakeholders**: o que DEVE acontecer, o que NUNCA pode acontecer
2. **Escreva em pseudocódigo**: "Se (pedido.status == aberto AND data > prazo) ENTÃO..."
3. **Documente exceções**: "E se o pagamento falhar?" — sempre tem plano B
4. **ANTES de codar feature**: regra de negócio vive aqui, versioned
5. **Regra muda? Update e marca data**: produto anda, documentação acompanha

## Ligações

- `CLAUDE.md` — referência ao Jarvas (IA transversal)
- `05_FLUXOS/` — fluxos que executam essas regras
- `07_APIS/` — validações que garantem as regras (ex: endpoint valida estado)
