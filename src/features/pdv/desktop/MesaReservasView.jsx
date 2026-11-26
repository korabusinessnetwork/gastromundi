import { useState } from "react";
import { LuArmchair, LuCalendarCheck, LuWrench, LuCircleCheck, LuSearch, LuX, LuTriangleAlert } from "react-icons/lu";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
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
      <div className="reservas-view__loading">Carregando mesas...</div>
    );
  }

  if (!mesas.length) {
    return (
      <div className="reservas-view__vazio">
        <LuArmchair className="reservas-view__vazio-icone" aria-hidden="true" />
        <div className="reservas-view__vazio-titulo">
          Nenhuma mesa cadastrada
        </div>
        <div className="reservas-view__vazio-texto">
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
    <div className="reservas-view" style={{ "--reservas-pad": `${sz.pad}px` }}>
      {/* Cabeçalho + resumo */}
      <div className="reservas-view__header">
        <div>
          <div className="reservas-view__titulo">Reservas e manutenção</div>
          <div className="reservas-view__subtitulo">
            Marque cada mesa como reservada ou em manutenção, o mapa reflete na hora.
          </div>
        </div>
        <div className="reservas-view__resumo">
          <span className="reservas-view__resumo-badge mesa-tom--reservada">
            <LuCalendarCheck size={13} /> {nReservadas} reservada{nReservadas !== 1 ? "s" : ""}
          </span>
          <span className="reservas-view__resumo-badge mesa-tom--manutencao">
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
        />
        {busca && (
          <button type="button" onClick={() => setBusca("")} className="reservas-view__busca-limpar" aria-label="Limpar busca">
            <LuX size={15} />
          </button>
        )}
      </div>

      {erro && (
        <div className="reservas-view__erro" role="alert">
          <LuTriangleAlert size={15} /> {erro}
        </div>
      )}

      {/* Lista de mesas */}
      <div className="reservas-view__lista">
        {filtradas.map((mesa) => {
          const efetivo    = statusMesa(mesa, abertas);
          const manual     = mesa.status_manual ?? "livre";
          const ocupada    = efetivo === "aberta";
          return (
            <div key={mesa.numero} className="reservas-view__mesa">
              <div className={`reservas-view__mesa-info mesa-tom--${efetivo}`}>
                <span className="reservas-view__mesa-numero">{mesa.numero}</span>
                <div className="reservas-view__mesa-detalhe">
                  <span className="reservas-view__mesa-badge">{STATUS[efetivo].label}</span>
                  {mesa.capacidade != null && (
                    <span className="reservas-view__mesa-cap">{mesa.capacidade} lugares</span>
                  )}
                </div>
              </div>

              <div className="reservas-view__seg" role="group" aria-label={`Status da Mesa ${mesa.numero}`}>
                {OPCOES.map(({ valor, label, Icon }) => {
                  const ativo        = manual === valor;
                  const desabilitado = valor === "manutencao" && ocupada;
                  return (
                    <button
                      key={valor}
                      type="button"
                      disabled={desabilitado || salvando === mesa.numero}
                      onClick={() => definir(mesa, valor)}
                      title={desabilitado ? "Libere a comanda aberta antes de colocar em manutenção" : label}
                      className={`reservas-view__seg-btn${ativo ? ` is-ativo mesa-tom--${valor}` : ""}${desabilitado ? " is-off" : ""}`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  );
                })}
              </div>

              {ocupada && (
                <div className="reservas-view__nota mesa-tom--aberta">
                  Comanda aberta agora
                </div>
              )}
            </div>
          );
        })}
        {filtradas.length === 0 && (
          <div className="reservas-view__semresultado">
            Nenhuma mesa encontrada para "{busca}".
          </div>
        )}
      </div>
    </div>
  );
}
