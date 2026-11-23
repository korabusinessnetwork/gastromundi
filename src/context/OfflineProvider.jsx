import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { OfflineContext } from "./OfflineContext";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { useStatusRede } from "@/hooks/useStatusRede";
import { filaOffline, contarPendenciasFiscais, assinarFilaOffline } from "@/lib/offline/filaApp";

/**
 * Dono do estado offline (tarefa 2.9 do plano de refatoração): se há rede, se
 * a última carga abriu sem internet, quantas operações esperam na fila local,
 * as notas fiscais pendentes, e a porta para enfileirar.
 *
 * Fica por fora de todos os outros provedores: catálogo, comandas e caixa
 * enfileiram por `useOffline()`. A DRENAGEM da fila não mora aqui, porque ela
 * reenvia operações de todos os assuntos; ela fica na coordenação do
 * `AppProvider`, que atualiza o contador pelo canal interno `useOfflineCarga()`.
 *
 * "Recarregar os dados" é a carga da coordenação: chega por `recarregarRef`.
 */
const OfflineCargaContext = createContext(null);

export function useOfflineCarga() {
  const ctx = useContext(OfflineCargaContext);
  if (!ctx) throw new Error("useOfflineCarga deve ser usado dentro de <OfflineProvider>");
  return ctx;
}

export function OfflineProvider({ tenantIdRef, recarregarRef, children }) {
  const redeOnline = useStatusRede();
  // A última carga de dados não alcançou o banco e o app seguiu com o que
  // estava salvo neste computador (o snapshot). É um sinal DIFERENTE do
  // `redeOnline`: `navigator.onLine` só sabe se a placa de rede deste aparelho
  // está de pé, e o caso comum do restaurante é justamente o outro, roteador
  // ligado e link do provedor caído. Aí o navegador continua se dizendo online
  // enquanto nenhuma leitura chega ao Supabase. Quem precisa separar "o ajuste
  // ainda vem" de "o ajuste não vem mais" (a aba Pedidos sem Internet) tem de
  // olhar os dois sinais, não só o do navegador.
  //
  // Ele se apaga de duas formas: no começo de cada nova carga (bootstrap) e
  // quando este computador reconecta (efeito do evento `online`, mais abaixo).
  const [abriuSemInternet, setAbriuSemInternet] = useState(false);
  const [pendenciasOffline, setPendenciasOffline] = useState(() => filaOffline.tamanho());
  // Notas fiscais que ficaram na fila: a venda saiu, a nota não. Fica visível
  // para o admin/contador em "Notas emitidas": pendência fiscal não pode
  // existir em silêncio.
  const pendenciasFiscais = useMemo(
    () => contarPendenciasFiscais(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendenciasOffline],
  );
  // A fila mora no IndexedDB (F021 fatia 2), que responde depois do primeiro
  // render: o `useState` acima leu o espelho ainda vazio. Quando a hidratação
  // traz o que ficou da sessão anterior, o número chega por aqui.
  useEffect(() => assinarFilaOffline(() => setPendenciasOffline(filaOffline.tamanho())), []);

  // O carimbo conta o que aconteceu na ÚLTIMA carga, e nada relê os dados
  // sozinho depois. Se ele nunca se apagasse, a tela seguiria afirmando no
  // presente que o estabelecimento está sem internet com a conexão já de
  // volta, e escondendo o botão "Recarregar a tela", que nessa hora é
  // justamente o que resolve. Quando este computador reconecta, o navegador
  // avisa (mesmo evento que o `redeOnline` já escuta) e o carimbo cai.
  //
  // O aviso só existe quando é ESTE aparelho que perde e recupera a rede.
  // Link do provedor que volta sem o computador ter caído não emite evento
  // nenhum: nesse caso quem apaga o carimbo é uma pessoa, pedindo a carga de
  // novo pela tela (`recarregarDadosDoEstabelecimento`). Nada aqui tenta
  // sozinho de tempos em tempos.
  useEffect(() => {
    const aoVoltarAConexao = () => setAbriuSemInternet(false);
    window.addEventListener("online", aoVoltarAConexao);
    return () => window.removeEventListener("online", aoVoltarAConexao);
  }, []);

  // Enfileira uma operação para reenvio quando a internet voltar e atualiza o
  // contador do badge. Carimba a op com o tenant da sessão (JWT). No dreno,
  // ops de outro tenant são puladas e preservadas (isolamento em origem
  // compartilhada). Ver fila.js.
  const enfileirarOffline = (op) =>
    setPendenciasOffline(filaOffline.enfileirar({ ...op, __tenant: tenantIdRef.current }));

  const enfileirarOfflineEstavel = useFuncaoEstavel(enfileirarOffline);
  const recarregarDadosEstavel   = useFuncaoEstavel(() => recarregarRef.current());

  const valorOffline = useMemo(() => ({
    redeOnline, abriuSemInternet, pendenciasOffline, pendenciasFiscais,
    enfileirarOffline: enfileirarOfflineEstavel,
    recarregarDadosDoEstabelecimento: recarregarDadosEstavel,
  }), [redeOnline, abriuSemInternet, pendenciasOffline, pendenciasFiscais,
    enfileirarOfflineEstavel, recarregarDadosEstavel]);

  // ── Carga e dreno (só o AppProvider chama) ──────────────────────
  const valorCarga = useMemo(() => ({
    definirAbriuSemInternet: setAbriuSemInternet,
    definirPendencias: setPendenciasOffline,
  }), []);

  return (
    <OfflineCargaContext.Provider value={valorCarga}>
      <OfflineContext.Provider value={valorOffline}>
        {children}
      </OfflineContext.Provider>
    </OfflineCargaContext.Provider>
  );
}
