import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { usePedidosCozinha, useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { iniciarPreparo, marcarPronto, tempoDecorridoMin, estaAtrasado } from "@/lib/cozinha";
import C from "@/constants/colors";
import { LuChefHat, LuClock, LuTriangleAlert, LuPlay, LuCheck } from "react-icons/lu";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

const COLUNAS = [
  { status: "aguardando", titulo: "Aguardando", cor: C.blue },
  { status: "em_preparo", titulo: "Em Preparo", cor: "#f59e0b" },
  { status: "pronto",     titulo: "Pronto",      cor: C.green },
];

/**
 * Cozinha / KDS (F007) — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md.
 * Painel em tempo real, organizado por status de preparo. O "pedido"
 * aqui é a comanda em `pending` (ver src/lib/cozinha.js).
 */
export default function CozinhaView() {
  const { currentUser } = useApp();
  const { pedidos, loading } = usePedidosCozinha();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [processando, setProcessando] = useState({});

  // Recalcula tempo decorrido/atraso periodicamente (os dados não mudam, só o relógio)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const marcarProcessando = (id, valor) => setProcessando((prev) => ({ ...prev, [id]: valor }));

  const handleIniciarPreparo = async (pedido) => {
    if (processando[pedido.id]) return;
    marcarProcessando(pedido.id, true);
    try {
      const { error } = await iniciarPreparo(pedido.id, currentUser?.username);
      if (error) console.error("[cozinha] erro ao iniciar preparo:", error);
    } finally {
      marcarProcessando(pedido.id, false);
    }
  };

  const handleMarcarPronto = async (pedido) => {
    if (processando[pedido.id]) return;
    marcarProcessando(pedido.id, true);
    try {
      const { error } = await marcarPronto(pedido.id, currentUser?.username);
      if (error) console.error("[cozinha] erro ao marcar pronto:", error);
    } finally {
      marcarProcessando(pedido.id, false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <LuChefHat size={sz.fontLg} color={C.accent} />
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Cozinha</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>Painel de preparo em tempo real</div>
        </div>
      </div>

      {/* Colunas */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", gap: sz.gap, padding: sz.pad, minHeight: 0 }}>
        {COLUNAS.map((coluna) => {
          const pedidosColuna = pedidos
            .filter((p) => (p.status_cozinha ?? "aguardando") === coluna.status)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          return (
            <div key={coluna.status} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
              {/* Cabeçalho da coluna */}
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: coluna.cor, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: sz.fontBase }}>{coluna.titulo}</span>
                <span style={{ marginLeft: "auto", fontSize: sz.fontSm, color: C.muted, fontWeight: 700 }}>{pedidosColuna.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {loading ? (
                  <div style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: sz.fontSm }}>Carregando…</div>
                ) : pedidosColuna.length === 0 ? (
                  <div style={{ color: C.muted, textAlign: "center", padding: 24, fontSize: sz.fontSm }}>Nenhum pedido aqui.</div>
                ) : (
                  pedidosColuna.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      sz={sz}
                      processando={!!processando[pedido.id]}
                      onIniciarPreparo={() => handleIniciarPreparo(pedido)}
                      onMarcarPronto={() => handleMarcarPronto(pedido)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PedidoCard({ pedido, sz, processando, onIniciarPreparo, onMarcarPronto }) {
  const referencia = pedido.status_cozinha === "em_preparo" ? pedido.em_preparo_em : pedido.created_at;
  const minutos = tempoDecorridoMin(referencia);
  const atrasado = estaAtrasado(pedido);
  const itensAtivos = (Array.isArray(pedido.items) ? pedido.items : []).filter((i) => !i.cancelado);

  return (
    <div style={{
      background: C.surface, borderRadius: 12, padding: 14,
      border: `1.5px solid ${atrasado ? C.red : C.border}`,
      boxShadow: atrasado ? `0 0 0 1px ${C.red}33` : "none",
    }}>
      {/* Cabeçalho do card */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: sz.fontBase }}>{fmtComanda(pedido.comanda)}</span>
        {pedido.mesa && <span style={{ fontSize: sz.fontSm, color: C.muted }}>🪑 {pedido.mesa}</span>}
        <span style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
          fontSize: sz.fontSm - 1, fontWeight: 700,
          color: atrasado ? C.red : C.muted,
        }}>
          {atrasado ? <LuTriangleAlert size={12} /> : <LuClock size={12} />}
          {minutos} min
        </span>
      </div>

      {/* Itens */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        {itensAtivos.map((item, idx) => (
          <div key={idx} style={{ fontSize: sz.fontSm, color: C.text }}>
            <span style={{ fontWeight: 700 }}>{item.qty ?? 1}x</span> {item.name}
            {Array.isArray(item.obs) && item.obs.length > 0 && (
              <div style={{ fontSize: sz.fontSm - 1, color: C.muted, paddingLeft: 16 }}>
                {item.obs.join(" · ")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ação */}
      {pedido.status_cozinha === "aguardando" && (
        <button
          onClick={onIniciarPreparo}
          disabled={processando}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 0", borderRadius: 8, border: "none",
            background: processando ? C.faint : C.accent, color: "#fff",
            fontWeight: 700, fontSize: sz.fontSm + 1, cursor: processando ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <LuPlay size={13} /> {processando ? "Iniciando..." : "Iniciar Preparo"}
        </button>
      )}
      {pedido.status_cozinha === "em_preparo" && (
        <button
          onClick={onMarcarPronto}
          disabled={processando}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "9px 0", borderRadius: 8, border: "none",
            background: processando ? C.faint : C.green, color: "#fff",
            fontWeight: 700, fontSize: sz.fontSm + 1, cursor: processando ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <LuCheck size={13} /> {processando ? "Salvando..." : "Marcar Pronto"}
        </button>
      )}
    </div>
  );
}
