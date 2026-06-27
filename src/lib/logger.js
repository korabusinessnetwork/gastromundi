import { supabase } from "./supabase";

/**
 * Fire-and-forget log insert into operator_logs.
 * Never awaited — never blocks the caller.
 * Errors are swallowed so a log failure never crashes a user action.
 *
 * SQL to create the table (run once in Supabase SQL editor):
 *
 *   CREATE TABLE operator_logs (
 *     id          bigserial PRIMARY KEY,
 *     operator_id text        NOT NULL,
 *     action_type text        NOT NULL,
 *     payload     jsonb,
 *     created_at  timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX operator_logs_operator_id_idx ON operator_logs (operator_id);
 *   CREATE INDEX operator_logs_created_at_idx  ON operator_logs (created_at DESC);
 *
 * @param {string} operatorId  - username / login handle of who performed the action
 * @param {string} actionType  - colon-namespaced verb: "auth:login", "comanda:abrir", etc.
 * @param {object} [payload]   - arbitrary jsonb data (msg, role, amounts, etc.)
 */
export function logAction(operatorId, actionType, payload) {
  void (async () => {
    try {
      await supabase.from("operator_logs").insert({
        operator_id: String(operatorId ?? "unknown"),
        action_type: String(actionType),
        payload:     payload ?? null,
      });
    } catch {
      // intentionally silent
    }
  })();
}
