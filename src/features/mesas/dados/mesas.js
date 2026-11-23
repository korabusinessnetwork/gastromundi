// Camada de dados das mesas (ADR-015, tarefa 1.4 do plano de refatoração).
// Usada pelo mapa de mesas do computador e pela seção de mesas do celular.
// Cada função devolve o `{ data, error }` do Supabase sem interpretar: quem
// decide a frase de erro continua sendo a tela.

import { supabase } from "@/lib/supabase";

const COLUNAS = "numero,capacidade,posicao_x,posicao_y,status_manual";

export function listarMesas() {
  return supabase.from("mesas").select(COLUNAS).order("numero");
}

export function criarMesa({ numero, capacidade, posicao_x, posicao_y }) {
  return supabase.from("mesas").insert({ numero, capacidade, posicao_x, posicao_y });
}

export function alterarCapacidadeMesa(numero, capacidade) {
  return supabase.from("mesas").update({ capacidade }).eq("numero", numero);
}

export function excluirMesa(numero) {
  return supabase.from("mesas").delete().eq("numero", numero);
}

/** Grava a posição de todas as mesas de uma vez (o "Salvar layout" do mapa). */
export function salvarLayoutMesas(linhas) {
  return supabase.from("mesas").upsert(linhas, { onConflict: "tenant_id,numero" });
}

/** Tira a reserva da mesa quando a comanda dela é paga. */
export function limparReservaMesa(numero) {
  return supabase.rpc("limpar_reserva_mesa", { mesa_numero: numero });
}
