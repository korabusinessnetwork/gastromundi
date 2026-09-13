---
description: Varredura de QA do sistema inteiro, mapeia os fluxos que existem hoje, testa em paralelo e reporta bugs reproduzíveis
---

Ative a skill `full-automatico-varredura` (`.claude/skills/full-automatico-varredura/SKILL.md`) e siga
o modo indicado por: $ARGUMENTS

Modos:

- sem argumento, varredura completa a partir da Fase 0.
- `corrigir`, executa a Fase 5 sobre os bugs já registrados em `.full-auto/varredura/BUGS.md`.
- `suite <id>`, sessão de uma única suíte, trabalhando só em `.full-auto/varredura/suites/<id>/` e em `tests/e2e/<id>/`.
- `continuar`, retoma de onde o `.full-auto/varredura/` parou.
