-- Logs de ações dos operadores (usado pelo SaldoModal, cancelamentos, etc.)
CREATE TABLE IF NOT EXISTS operator_logs (
  id          BIGSERIAL PRIMARY KEY,
  operator_id TEXT        NOT NULL,
  action_type TEXT        NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operator_logs_operator_id_idx ON operator_logs (operator_id);
CREATE INDEX IF NOT EXISTS operator_logs_action_type_idx ON operator_logs (action_type);
CREATE INDEX IF NOT EXISTS operator_logs_created_at_idx  ON operator_logs (created_at DESC);

ALTER TABLE operator_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_operator_logs" ON operator_logs FOR ALL USING (true) WITH CHECK (true);
