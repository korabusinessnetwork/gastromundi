import { useState } from "react";
import { LuCalendarCheck, LuWrench, LuCircleCheck, LuSearch, LuX, LuTriangleAlert } from "react-icons/lu";
import C from "@/constants/colors";
import { varColor } from "@/lib/tenant/tema";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { statusMesa, STATUS } from "./MesaMapView";
import "./MesaReservasView.css";

/**
 * Aba "Reservas" do PDV — onde o operador MARCA cada mesa como
 * Reservada ou em Manutenção (ou volta pra Livre). O mapa de mesas já
 * *lê* e pinta esses estados (MesaMapView.statusMesa); esta tela é o
 * único lugar onde eles são *definidos*.
 *
 * Intuitividade (princípio nº 1):
 * - Um controle segmentado por mesa (Livre / Reservada / Manutenção):
 *   a mesa e a ação ficam lado a lado, um toque resolve, sem modal.
 * - Feedback imediato (update otimista no useMesas) — o operador vê a
 *   cor mudar na hora; se o banco falhar, desfaz e avisa.
 * - Prevenção de erro: "Manutenção" fica desabilitada em mesa com
 *   comanda aberta, porque manutenção esconderia o pedido no mapa.
 */
const OPCOES = [
  { valor: "livre",      label: "Livre",      Icon: LuCircleCheck },
  { valor: "reservada",  label: "Reservada",  Icon: LuCalendarCheck },
  { valor: "manutencao", label: "Manutenção", Icon: LuWrench },
];

export default function MesaReservasView({ mesas, loading, abertas, atualizarStatus }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const [busca, setBusca] = useState("");
  const [erro,  setErro]  = useState("");
  const [salvando, setSalvando] = useState(null); // numero em gravação

  if (loading) {
    return (
      <div className="reservas-view__loading" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: varColor(C.muted) }}>
        Carregando mesas...
      </div>
    );
  }

  if (!mesas.length) {
    return (
      <div className="reservas-view__vazio">
        <div className="reservas-view__vazio-emoji">🪑</div>
        <div className="reservas-view__vazio-titulo" style={{ color: varColor(C.text) }}>
          Nenhuma mesa cadastrada
        </div>
        <div className="reservas-view__vazio-texto" style={{ color: varColor(C.muted) }}>
          Cadastre mesas em Configurações para reservar ou marcar manutenção.
        </div>
      </div>
    );
  }

  const nReservadas = mesas.filter((m) => m.status_manual === "reservada").length;
  const nManutencao = mesas.filter((m) => m.status_manual === "manutencao").length;

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? mesas.filter((m) => String(m.numero).toLowerCase().includes(termo))
    : mesas;

  async function definir(mesa, valor) {
    const atual = mesa.status_manual ?? "livre";
    if (valor === atual || salvando) return;
    setErro("");
    setSalvando(mesa.numero);
    const { error } = await atualizarStatus(mesa.numero, valor);
    setSalvando(null);
    if (error) setErro(`Não foi possível atualizar a Mesa ${mesa.numero}. Tente novamente.`);
  }

  return (
    <div className="reservas-view" style={{ flex: 1, overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px` }}>
      {/* Cabeçalho + resumo */}
      <div className="reservas-view__header">
        <div>
          <div className="reservas-view__titulo" style={{ color: varColor(C.text) }}>Reservas e manutenção</div>
          <div className="reservas-view__subtitulo" style={{ color: varColor(C.muted) }}>
            Marque cada mesa como reservada ou em manutenção — o mapa reflete na hora.
          </div>
        </div>
        <div className="reservas-view__resumo">
          <span className="reservas-view__resumo-badge" style={{ background: STATUS.reservada.bg, border: `1px solid ${STATUS.reservada.border}`, color: STATUS.reservada.cor }}>
            <LuCalendarCheck size={13} /> {nReservadas} reservada{nReservadas !== 1 ? "s" : ""}
          </span>
          <span className="reservas-view__resumo-badge" style={{ background: STATUS.manutencao.bg, border: `1px solid ${STATUS.manutencao.border}`, color: STATUS.manutencao.cor }}>
            <LuWrench size={13} /> {nManutencao} em manutenção
          </span>
        </div>
      </div>

      {/* Busca por mesa */}
      <div className="reservas-view__busca">
        <LuSearch size={16} color={busca ? varColor(C.accent) : varColor(C.muted)} className="reservas-view__busca-icone" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar mesa..."
          className="reservas-view__busca-input"
          style={{ color: varColor(C.text) }}
        />
        {busca && (
          <button type="button" onClick={() => setBusca("")} className="reservas-view__busca-limpar" style={{ color: varColor(C.muted) }}>
            <LuX size={15} />
          </button>
        )}
      </div>

      {erro && (
        <div className="reservas-view__erro" style={{ color: varColor(C.red) }}>
          <LuTriangleAlert size={15} /> {erro}
        </div>
      )}

      {/* Lista de mesas */}
      <div className="reservas-view__lista">
        {filtradas.map((mesa) => {
          const efetivo    = statusMesa(mesa, abertas);
          const manual     = mesa.status_manual ?? "livre";
          const ocupada    = efetivo === "aberta";
          const meta       = STATUS[efetivo];
          return (
            <div key={mesa.numero} className="reservas-view__mesa" style={{ borderColor: varColor(C.border) }}>
              <div className="reservas-view__mesa-info">
                <span className="reservas-view__mesa-numero" style={{ background: meta.bg, border: `1.5px solid ${meta.border}`, color: meta.cor }}>
                  {mesa.numero}
                </span>
                <div className="reservas-view__mesa-detalhe">
                  <span className="reservas-view__mesa-badge" style={{ color: meta.cor }}>{meta.label}</span>
                  {mesa.capacidade != null && (
                    <span className="reservas-view__mesa-cap" style={{ color: varColor(C.muted) }}>{mesa.capacidade} lugares</span>
                  )}
                </div>
              </div>

              <div className="reservas-view__seg" role="group" aria-label={`Status da Mesa ${mesa.numero}`}>
                {OPCOES.map(({ valor, label, Icon }) => {
                  const ativo        = manual === valor;
                  const desabilitado = valor === "manutencao" && ocupada;
                  const meta         = STATUS[valor];
                  return (
                    <button
                      key={valor}
                      type="button"
                      disabled={desabilitado || salvando === mesa.numero}
                      onClick={() => definir(mesa, valor)}
                      title={desabilitado ? "Libere a comanda aberta antes de colocar em manutenção" : label}
                      className={`reservas-view__seg-btn${ativo ? " is-ativo" : ""}${desabilitado ? " is-off" : ""}`}
                      style={ativo ? { background: meta.bg, borderColor: meta.border, color: meta.cor } : { color: varColor(C.muted) }}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  );
                })}
              </div>

              {ocupada && (
                <div className="reservas-view__nota" style={{ color: STATUS.aberta.cor }}>
                  Comanda aberta agora
                </div>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && (
          <div className="reservas-view__semresultado" style={{ color: varColor(C.muted) }}>
            Nenhuma mesa encontrada para "{busca}".
          </div>
        )}
      </div>
    </div>
  );
}
