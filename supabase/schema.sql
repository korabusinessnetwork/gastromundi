-- =============================================================
-- GASTROMUNDI by Kora — Schema Supabase
-- Execute este script no SQL Editor do seu projeto Supabase
-- =============================================================

-- ── Extensão para UUID ──────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Tabelas ────────────────────────────────────────────────────

create table if not exists users (
  id          uuid    primary key default gen_random_uuid(),
  name        text    not null,
  username    text    not null unique,
  password    text    not null,
  role        text    not null,
  permissions jsonb   not null default '{}',
  active      boolean not null default true
);

create table if not exists products (
  id        uuid    primary key default gen_random_uuid(),
  name      text    not null,
  price     numeric not null,
  category  text    not null,
  emoji     text,
  active    boolean not null default true
);

-- Pedidos em aberto — tem Realtime ativado
create table if not exists pending (
  id          text    primary key,
  comanda     text,
  items       jsonb   not null default '[]',
  status      text    not null default 'open',
  note        text,
  total       numeric,
  garcom      text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Vendas finalizadas
create table if not exists sales (
  id    text primary key,
  data  jsonb not null default '{}',
  at    timestamptz not null default now()
);

-- Fechamentos de caixa
create table if not exists fechamentos (
  id          bigserial primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

-- Logs de auditoria
create table if not exists logs (
  id        bigserial primary key,
  type      text,
  user_name text,
  role      text,
  msg       text,
  at        timestamptz not null default now()
);

-- Configurações de caixa
create table if not exists config (
  key   text primary key,
  value jsonb not null
);

-- ── Realtime ────────────────────────────────────────────────────
-- Habilite Realtime para a tabela pending no dashboard:
-- Database → Replication → Tables → marque "pending"

-- ── Row Level Security ──────────────────────────────────────────
alter table users       enable row level security;
alter table products    enable row level security;
alter table pending     enable row level security;
alter table sales       enable row level security;
alter table fechamentos enable row level security;
alter table logs        enable row level security;
alter table config      enable row level security;

create policy "acesso_total" on users       for all using (true) with check (true);
create policy "acesso_total" on products    for all using (true) with check (true);
create policy "acesso_total" on pending     for all using (true) with check (true);
create policy "acesso_total" on sales       for all using (true) with check (true);
create policy "acesso_total" on fechamentos for all using (true) with check (true);
create policy "acesso_total" on logs        for all using (true) with check (true);
create policy "acesso_total" on config      for all using (true) with check (true);

-- ── Seed: Usuários padrão ───────────────────────────────────────
-- Senhas com prefixo SEED: são hasheadas automaticamente pelo app.

insert into users (name, username, password, role, permissions) values
  ('Administrador', 'admin',   'SEED:Admin@2025!',   'admin',   '{"pdv":true,"palm":true,"produtos":true,"relatorio":true,"configuracoes":true,"transferir":true}'),
  ('Caixa',         'caixa',   'SEED:Caixa@2025!',   'caixa',   '{"pdv":true,"palm":true,"produtos":false,"relatorio":false,"configuracoes":false,"transferir":true}'),
  ('Garçom',        'garcom',  'SEED:Garcom@2025!',  'garcom',  '{"pdv":false,"palm":true,"produtos":false,"relatorio":false,"configuracoes":false,"transferir":false}'),
  ('Gerente',       'gerente', 'SEED:Gerente@2025!', 'gerente', '{"pdv":true,"palm":true,"produtos":true,"relatorio":true,"configuracoes":false,"transferir":true}')
on conflict (username) do nothing;

-- ── Seed: Produtos padrão ───────────────────────────────────────

insert into products (name, price, category, emoji) values
  ('Cerveja 600ml',    15, 'Bebidas', '🍺'),
  ('Refrigerante',      8, 'Bebidas', '🥤'),
  ('Água Mineral',      5, 'Bebidas', '💧'),
  ('Suco Natural',     12, 'Bebidas', '🍹'),
  ('Caipirinha',       20, 'Drinks',  '🍸'),
  ('Long Neck',        12, 'Bebidas', '🍺'),
  ('Porção de Fritas', 28, 'Comidas', '🍟'),
  ('Hambúrguer',       32, 'Comidas', '🍔'),
  ('Petisco Misto',    35, 'Comidas', '🍱'),
  ('Combo 2 Cervejas', 24, 'Combos',  '🍺')
on conflict do nothing;

-- ── Seed: Config inicial ────────────────────────────────────────

insert into config (key, value) values
  ('caixa_aberto', 'true'),
  ('fundo_atual',  '0')
on conflict (key) do nothing;

-- ── Migração (rodar se já tiver dados no banco) ─────────────────
-- Se você já executou o schema antigo, rode os comandos abaixo
-- separadamente no SQL Editor para migrar sem perder dados:
--
-- 1. Converter users.id de bigserial para uuid:
--    ALTER TABLE users DROP CONSTRAINT users_pkey;
--    ALTER TABLE users ALTER COLUMN id SET DATA TYPE uuid USING gen_random_uuid();
--    ALTER TABLE users ADD PRIMARY KEY (id);
--    ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';
--
-- 2. Converter products.id de bigserial para uuid:
--    ALTER TABLE products DROP CONSTRAINT products_pkey;
--    ALTER TABLE products ALTER COLUMN id SET DATA TYPE uuid USING gen_random_uuid();
--    ALTER TABLE products ADD PRIMARY KEY (id);
