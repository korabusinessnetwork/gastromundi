-- F010 — Clientes: documento (CPF/CNPJ) opcional no cadastro.
--
-- Guarda SÓ OS DÍGITOS em `documento` (sem máscara) e o tipo escolhido no
-- toggle da tela em `documento_tipo` ('cpf' | 'cnpj'). Ambos NULOS quando o
-- operador não informa documento (nome + telefone seguem sendo o mínimo).
--
-- RLS: são colunas novas em tabela já existente — herdam as policies de
-- public.clientes (definidas em 20260713_clientes.sql). Nenhuma policy nova
-- é necessária. Idempotente (IF NOT EXISTS) para poder reaplicar sem erro.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS documento      text,
  ADD COLUMN IF NOT EXISTS documento_tipo text;

-- tipo só pode ser cpf/cnpj (ou nulo quando sem documento)
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_documento_tipo_chk;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_documento_tipo_chk
  CHECK (documento_tipo IS NULL OR documento_tipo IN ('cpf', 'cnpj'));

-- busca por documento (dígitos, sem máscara)
CREATE INDEX IF NOT EXISTS clientes_documento_idx ON public.clientes (documento);
