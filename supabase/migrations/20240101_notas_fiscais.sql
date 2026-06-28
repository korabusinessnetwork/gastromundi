-- Notas Fiscais importadas via XML NF-e
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chave_acesso    TEXT UNIQUE,
  numero          TEXT,
  serie           TEXT,
  data_emissao    DATE,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  valor_total     NUMERIC(12,2),
  origem          TEXT DEFAULT 'xml',
  status          TEXT DEFAULT 'importada',
  xml_raw         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Itens de cada nota (referencia products, não insumos)
CREATE TABLE IF NOT EXISTS notas_fiscais_itens (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_fiscal_id     UUID REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
  descricao_xml      TEXT,
  codigo_xml         TEXT,
  unidade_xml        TEXT,
  quantidade         NUMERIC(12,4),
  preco_unitario     NUMERIC(12,4),
  preco_total        NUMERIC(12,2),
  fator_conversao    NUMERIC(10,4) DEFAULT 1,
  quantidade_estoque NUMERIC(12,4)
);

-- Entradas de estoque geradas por cada nota
CREATE TABLE IF NOT EXISTS estoque_entradas (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id     UUID REFERENCES products(id) ON DELETE CASCADE,
  nota_fiscal_id UUID REFERENCES notas_fiscais(id) ON DELETE SET NULL,
  quantidade     NUMERIC(12,4),
  preco_unitario NUMERIC(12,4),
  data_entrada   DATE DEFAULT CURRENT_DATE,
  observacao     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- RLS permissivo (ajuste conforme política do projeto)
ALTER TABLE notas_fiscais        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais_itens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_entradas     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_notas_fiscais"       ON notas_fiscais        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notas_fiscais_itens" ON notas_fiscais_itens  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_estoque_entradas"    ON estoque_entradas     FOR ALL USING (true) WITH CHECK (true);
