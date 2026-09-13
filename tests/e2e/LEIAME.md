# Bateria de ponta a ponta

Rode tudo com um comando:

```bash
tests/e2e/rodar.sh
```

Ele sobe um Postgres local com o schema real do projeto (`supabase/schema.sql` mais
as 121 migrations), aplica o seed determinístico de QA, levanta a ponte que fala o
protocolo do Supabase, builda o app e o executa num Chromium de verdade.

Nada aqui toca o banco de produção. As credenciais são falsas e o estabelecimento de
teste é criado do zero a cada execução.

## O que cada pasta contém

- `banco/10-*.sql`, isolamento entre estabelecimentos, papéis e superfície anônima.
- `banco/20-*.sql`, dinheiro: estoque idempotente, assinatura, pedido público.
- `banco/30-*.sql`, **falha de propósito**: prova dos bugs já relatados, passa quando forem corrigidos.
- `navegador/acesso.mjs`, login, bloqueio de rota, usuário inativo, credencial de outro estabelecimento.
- `navegador/pdv.mjs`, guarda de caixa fechado, abertura de caixa e fechamento de conta.

## Pré-requisitos

PostgreSQL 16 instalado (só o binário, o cluster é criado pelo script), Node 22 e um
Chromium para o Playwright. Em máquina sem Chromium, aponte `QA_CHROME` para o binário.

O relatório completo da varredura que gerou estes testes está em
`.full-auto/varredura/RELATORIO-VARREDURA.md`.
