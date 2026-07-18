import { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { HEARTBEAT_MS, travadaPorOutro } from "@/lib/comandaLock";

/**
 * Trava de edição de comanda (Leva 14).
 *
 * Enquanto `ativo` e apontando pra uma comanda real, tenta adquirir a
 * trava dela; segurando, renova a cada HEARTBEAT_MS e libera ao sair.
 * Se outra pessoa chegou primeiro, devolve `bloqueio = { nome, desde }`
 * pra tela mostrar "Em uso por {nome}" — e fica de olho no realtime:
 * quando a trava do outro some/expira, tenta de novo sozinho.
 *
 * Fail-open por construção: sem migration ou sem rede, adquirirTrava
 * devolve ok:true e o hook vira um no-op.
 */
export function useTravaComanda(order, ativo) {
  const { adquirirTrava, liberarTrava, renovarTrava, currentUser, pending } = useApp();
  const [bloqueio, setBloqueio] = useState(null);
  // Bump re-roda a aquisição (usado quando a trava do outro é liberada).
  const [tentativa, setTentativa] = useState(0);
  const seguraRef = useRef(false);

  const id = ativo && order?.id && !order._virtual ? order.id : null;

  // As funções do contexto mudam de identidade a cada render do provider —
  // mantê-las fora das deps evita re-adquirir em loop; refs dão acesso à
  // versão mais recente.
  const fnsRef = useRef({ adquirirTrava, liberarTrava, renovarTrava });
  fnsRef.current = { adquirirTrava, liberarTrava, renovarTrava };

  useEffect(() => {
    if (!id) { setBloqueio(null); return; }
    let cancelado = false;
    let timer = null;

    (async () => {
      const res = await fnsRef.current.adquirirTrava(id);
      if (cancelado) {
        // A tela já fechou enquanto a aquisição viajava — devolve na hora.
        if (res.ok && !res.semTrava) fnsRef.current.liberarTrava(id);
        return;
      }
      if (res.ok) {
        seguraRef.current = true;
        setBloqueio(null);
        if (!res.semTrava) {
          timer = setInterval(() => { fnsRef.current.renovarTrava(id); }, HEARTBEAT_MS);
        }
      } else {
        seguraRef.current = false;
        setBloqueio({ nome: res.nome, desde: res.desde });
      }
    })();

    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      if (seguraRef.current) {
        seguraRef.current = false;
        fnsRef.current.liberarTrava(id);
      }
    };
  }, [id, tentativa]);

  // Bloqueado? Observa o estado local (alimentado pelo realtime): quando a
  // trava do outro é liberada, re-roda a aquisição acima — sem o usuário
  // precisar fechar e reabrir a comanda. O intervalo cobre o caso da trava
  // expirar por TTL (aparelho do outro morreu — não gera evento realtime).
  const atual = id ? pending.find(o => o.id === id) : null;
  const liberouNoRealtime = !!(bloqueio && atual && !travadaPorOutro(atual, currentUser?.username));
  useEffect(() => {
    if (liberouNoRealtime) { setTentativa(t => t + 1); return; }
    if (!bloqueio) return;
    const timer = setInterval(() => setTentativa(t => t + 1), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [liberouNoRealtime, bloqueio]);

  return { bloqueio };
}
