# Runbook — Backup e restauração do banco

Backup que ninguém sabe restaurar não é backup. Este documento é curto de
propósito: ele é lido no pior dia, com o cliente no telefone.

## O que existe hoje

`.github/workflows/backup-banco.yml` roda todo dia às **03:00 de Brasília**
(06:00 UTC) e também por botão (**Actions → Backup do banco → Run workflow**),
que é o certo antes de aplicar uma migração de risco.

Cada execução guarda um artefato `backup-banco-<id>` com três arquivos `.gz`:

| Arquivo | Conteúdo |
|---------|----------|
| `01_roles.sql` | papéis e permissões |
| `02_schema.sql` | estrutura (tabelas, funções, RLS) |
| `03_dados.sql` | os dados |

Retenção: **90 dias** (teto do plano gratuito do GitHub).

**Limite honesto:** recupera-se o estado da última execução — na pior hora,
perde-se até um dia de movimento. Point-in-time recovery só existe no Supabase
Pro, decidido para o primeiro cliente pagante.

## Configuração (uma vez)

**Settings → Secrets and variables → Actions → New repository secret**

- Nome: `SUPABASE_DB_URL`
- Valor: botão **Connect** no topo do painel da Supabase → aba **Connection
  String** → **Session pooler**, com a senha real no lugar de
  `[YOUR-PASSWORD]`. Fica parecido com
  `postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:5432/postgres`.

  **Session pooler, e não as outras duas opções:** a *Direct connection* só
  atende em IPv6 e o runner do GitHub é IPv4 — o dump não chega no banco. O
  *Transaction pooler* (porta 6543) não sustenta o que o `pg_dump` faz. Da
  máquina do dono, onde há IPv6, a direta funciona; do CI, não.

Sem o segredo o workflow falha e avisa — de propósito. Silêncio aqui daria a
impressão de estar protegido.

## Conferir que está vivo

Uma vez por mês: **Actions → Backup do banco** → a última execução está verde e
o artefato tem tamanho compatível com o banco. Execução verde com artefato de
poucos KB é sinal de dump vazio (o workflow já barra abaixo de 1 KB).

## Restaurar

1. Baixe o artefato do dia desejado e descompacte (`gunzip *.gz`).
2. Crie um **projeto Supabase novo** (ou peça o reset do atual). Nunca restaure
   por cima de um banco em uso: se o dump estiver ruim, você perde os dois.
3. Aplique **nesta ordem**, com a connection string do projeto de destino:

```bash
psql "$SUPABASE_DB_URL_DESTINO" -f 01_roles.sql
psql "$SUPABASE_DB_URL_DESTINO" -f 02_schema.sql
psql "$SUPABASE_DB_URL_DESTINO" -f 03_dados.sql
```

4. Confira antes de apontar o app:

```sql
select count(*) from public.tenants;
select count(*) from public.vendas;
select max(created_at) from public.vendas;  -- até onde o dump chegou
```

5. Troque `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel para o
   projeto restaurado e refaça o deploy.
6. Avise cada estabelecimento afetado **o que se perdeu** (o intervalo entre o
   `max(created_at)` acima e a queda). Lançamentos e pedidos daquele intervalo
   precisam ser relançados à mão.

## O que o backup NÃO cobre

- **Usuários do Auth** (`auth.users`): o dump é do schema `public`. Restaurar
  em projeto novo exige reprovisionar os acessos pelo Console.
- **Arquivos do Storage** (logos, imagens de produto).
- **Segredos e variáveis de ambiente** das Edge Functions.
