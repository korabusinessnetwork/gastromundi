-- Tabela de unidades de medida por tipo
CREATE TABLE IF NOT EXISTS unidades_medida (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome       TEXT NOT NULL,
  abreviacao TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('estoque', 'compra', 'consumo')),
  ordem      INT  DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE unidades_medida ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unidades_medida' AND policyname = 'allow_all_unidades_medida'
  ) THEN
    CREATE POLICY "allow_all_unidades_medida" ON unidades_medida FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Dados iniciais
INSERT INTO unidades_medida (nome, abreviacao, tipo, ordem) VALUES
  -- Estoque
  ('Unidade',      'un',  'estoque', 1),
  ('Quilograma',   'kg',  'estoque', 2),
  ('Grama',        'g',   'estoque', 3),
  ('Litro',        'L',   'estoque', 4),
  ('Mililitro',    'ml',  'estoque', 5),
  ('Caixa',        'cx',  'estoque', 6),
  ('Pacote',       'pct', 'estoque', 7),
  ('Dúzia',        'dt',  'estoque', 8),
  -- Compra
  ('Caixa',        'Caixa',    'compra', 1),
  ('Fardo',        'Fardo',    'compra', 2),
  ('Saca',         'Saca',     'compra', 3),
  ('Pacote',       'Pacote',   'compra', 4),
  ('Lata',         'Lata',     'compra', 5),
  ('Garrafa',      'Garrafa',  'compra', 6),
  ('Galão',        'Galão',    'compra', 7),
  ('Unidade',      'Unidade',  'compra', 8),
  -- Consumo
  ('Unidade',      'un',     'consumo', 1),
  ('Mililitro',    'ml',     'consumo', 2),
  ('Grama',        'g',      'consumo', 3),
  ('Fatia',        'fatia',  'consumo', 4),
  ('Dose',         'dose',   'consumo', 5),
  ('Copo',         'copo',   'consumo', 6),
  ('Prato',        'prato',  'consumo', 7),
  ('Porção',       'porção', 'consumo', 8)
ON CONFLICT DO NOTHING;
