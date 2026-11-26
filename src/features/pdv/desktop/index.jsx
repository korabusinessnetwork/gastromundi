import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuTriangleAlert, LuChevronDown, LuChevronUp, LuLock, LuSearch, LuX, LuLayoutGrid, LuList, LuReceipt, LuCalendarCheck } from "react-icons/lu";
import { produtosVencendo } from "@/features/estoque/regras/validade";
import { classificarEstoque } from "@/features/estoque/regras/estoqueSituacao";
import { nomeTrava } from "@/features/comandas/regras/comandaLock";
import ComandaGrid   from "./ComandaGrid";
import CheckoutView  from "./CheckoutView";
import ClienteComandaModal from "./ClienteComandaModal";
import MesaMapView   from "./MesaMapView";
import MesaReservasView from "./MesaReservasView";
import ModalCupomNfce from "@/features/fiscal/desktop/ModalCupomNfce";
import SaldoModal from "./pdv/SaldoModal";
import { usePdv } from "@/features/pdv/hooks/usePdv";
import CabecalhoPdv from "./pdv/CabecalhoPdv";
import AreaPedido from "./pdv/AreaPedido";
import ModalNovaComanda from "./pdv/ModalNovaComanda";
import ModalCancelarComanda from "./pdv/ModalCancelarComanda";
import ModalTransferirItens from "./pdv/ModalTransferirItens";
import ConfirmarCancelarPedido from "./pdv/ConfirmarCancelarPedido";
import ModalEscolherMesa from "./pdv/ModalEscolherMesa";
import "./PDVView.css";

export default function PDVView({ notify }) {
  const tela = usePdv({ notify });
  const {
    mode, setMode, selected, cartItems, toast, alertaAberto, setAlertaAberto, cupomNfce, setCupomNfce, alertaValidadeAberto, setAlertaValidadeAberto, buscaComanda, setBuscaComanda, currentUser, users, bootstrapLoading, metodosCustom, diasAlertaValidade, products, estoque, estoqueMinimos, pending, lancadas, caixaAberto, sales, mesas, mesasLoading, atualizarStatusMesa, showNova, confirmCancelar, showTransferir, showSaldo, setShowSaldo, saldoSenha, setSaldoSenha, saldoSenhaErro, setSaldoSenhaErro, saldoAutorizado, setSaldoAutorizado, saldoSenhaVis, setSaldoSenhaVis, showCancelarComanda, showMesa, mesaPendingOrder, showCliente, setShowCliente, clientePendingOrder, setClientePendingOrder, clienteSel, setClienteSel, salvandoCliente, sz, emPainel, painelEnxuto, abertas, emUsoPorOutro, handleSelectComanda, handleConfirmarClienteComanda, handleConfirmPayment, handleRemoverItemCheckout, handleOpenEmpty,
  } = tela;

  if (bootstrapLoading) {
    return (
      <div className="pdv__loading">
        Conectando ao caixa…
      </div>
    );
  }

  if (!caixaAberto) {
    return (
      <div className="pdv__lock">
        <div className="pdv__lock-card">
          <div className="pdv__lock-icone">
            <LuLock size={36} color={varColor(C.accent)} />
          </div>
          <div className="pdv__lock-titulo">Caixa Fechado</div>
          <div className="pdv__lock-desc">
            O caixa está fechado. Para realizar operações na frente de caixa, solicite ao responsável que abra o caixa.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pdv__raiz"
      style={{ "--pdv-pad": `${sz.pad}px`, "--pdv-pad-sm": `${sz.padSm}px`, "--pdv-gap": `${sz.gap}px` }}
    >

      {/* ── Header (oculto no checkout — ele tem o próprio — e no painel
             enxuto do celular, onde a tela é só busca + lista) ────────── */}
      {mode !== "checkout" && !painelEnxuto && <CabecalhoPdv tela={tela} />}

      {/* ── Alerta de estoque (mapa + lista; fora do painel enxuto) ─── */}
      {emPainel && !painelEnxuto && (() => {
        // Mesma conta da tela de Estoque (src/features/estoque/regras/estoqueSituacao.js). Antes o
        // PDV somava por conta própria — tratava prato sem controle de estoque
        // como zerado e ignorava o mínimo cadastrado — e as duas telas exibiam
        // números diferentes no mesmo instante.
        const { semEstoque: criticos, baixos } = classificarEstoque(products, estoque, estoqueMinimos);
        const total = criticos.length + baixos.length;
        if (total === 0) return null;
        return (
          <div className="pdv__alerta pdv__alerta--atencao">
            {/* Cabeçalho do alerta */}
            <button
              onClick={() => setAlertaAberto(v => !v)}
              className="pdv__alerta-cabecalho"
            >
              <LuTriangleAlert size={16} color={varColor(C.warn)} />
              <span className="pdv__alerta-label">
                {criticos.length > 0 && `${criticos.length} produto${criticos.length !== 1 ? "s" : ""} sem estoque`}
                {criticos.length > 0 && baixos.length > 0 && " · "}
                {baixos.length > 0 && `${baixos.length} produtos com estoque baixo`}
              </span>
              <span className="pdv__alerta-toggle">
                {alertaAberto ? <><LuChevronUp size={14} /> Ocultar</> : <><LuChevronDown size={14} /> Ver</>}
              </span>
            </button>

            {/* Lista de itens */}
            {alertaAberto && (
              <div className="pdv__alerta-lista">
                {criticos.map(p => (
                  <span key={p.id} className="pdv__alerta-chip pdv__alerta-chip--critico">
                    {p.name} · <span className="pdv__alerta-chip-valor">0</span>
                  </span>
                ))}
                {baixos.map(p => (
                  <span key={p.id} className="pdv__alerta-chip pdv__alerta-chip--atencao">
                    {p.name} · <span className="pdv__alerta-chip-valor">{estoque[p.id]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Alerta de validade (C1) — mesmo padrão do alerta de estoque ── */}
      {emPainel && !painelEnxuto && (() => {
        const vencendo = produtosVencendo(products, diasAlertaValidade ?? 7);
        if (vencendo.length === 0) return null;
        const vencidos = vencendo.filter(v => v.vencido);
        const proximos = vencendo.filter(v => !v.vencido);
        const rotuloDias = (dias) => dias < 0
          ? `vencido há ${Math.abs(dias)}d`
          : dias === 0 ? "vence hoje" : `${dias}d`;
        return (
          <div className="pdv__alerta pdv__alerta--critico">
            <button
              onClick={() => setAlertaValidadeAberto(v => !v)}
              className="pdv__alerta-cabecalho"
            >
              <LuTriangleAlert size={16} color={varColor(C.red)} />
              <span className="pdv__alerta-label">
                {vencidos.length > 0 && `${vencidos.length} produto${vencidos.length !== 1 ? "s" : ""} vencido${vencidos.length !== 1 ? "s" : ""}`}
                {vencidos.length > 0 && proximos.length > 0 && " · "}
                {proximos.length > 0 && `${proximos.length} vencendo em breve`}
              </span>
              <span className="pdv__alerta-toggle">
                {alertaValidadeAberto ? <><LuChevronUp size={14} /> Ocultar</> : <><LuChevronDown size={14} /> Ver</>}
              </span>
            </button>
            {alertaValidadeAberto && (
              <div className="pdv__alerta-lista">
                {vencendo.map(({ produto, dias, vencido }) => (
                  <span key={produto.id} className={`pdv__alerta-chip pdv__alerta-chip--${vencido ? "critico" : "atencao"}`}>
                    {produto.name} · <span className="pdv__alerta-chip-valor">{rotuloDias(dias)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab Mapa / Lista (celular fica só na lista) ───────────── */}
      {emPainel && !painelEnxuto && (
        <div className="pdv__tabs">
          {[
            { key: "grid",     label: "Lista",            Icon: LuList },
            { key: "mapa",     label: "Mapa",             Icon: LuLayoutGrid },
            { key: "abertas",  label: "Comandas abertas", Icon: LuReceipt },
            { key: "reservas", label: "Reservas",         Icon: LuCalendarCheck, alignRight: true },
          ].map(({ key, label, Icon, alignRight }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`pdv__tab-btn${mode === key ? " pdv__tab-btn--ativa" : ""}${alignRight ? " pdv__tab-btn--direita" : ""}`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      )}

      {/* ── Toast "Pedido lançado!" no painel enxuto ──────────────
             O toast normal mora no cabeçalho, que some no celular. Sem esta
             versão flutuante, lançar pedido no celular não daria retorno. */}
      {painelEnxuto && (
        <div className={`pdv__toast pdv__toast--flutuante${toast ? " pdv__toast--visivel" : ""}`}>
          ✓ Pedido lançado!
        </div>
      )}

      {/* ── Busca de comandas (lista e comandas abertas) ─────────── */}
      {(mode === "grid" || mode === "abertas") && (
        <div className="pdv__busca">
          <div className="pdv__busca-campo">
            <LuSearch
              size={18}
              className={`pdv__busca-icone${buscaComanda ? " pdv__busca-icone--ativo" : ""}`}
            />
            <input
              value={buscaComanda}
              onChange={e => { if (e.target.value === "" || /^\d+$/.test(e.target.value)) setBuscaComanda(e.target.value); }}
              placeholder="Buscar comanda..."
              inputMode="numeric"
              className={`pdv__busca-input${buscaComanda ? " pdv__busca-input--preenchido" : ""}`}
            />
            {buscaComanda && (
              <button
                onClick={() => setBuscaComanda("")}
                className="pdv__busca-limpar"
              >
                <LuX size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="pdv__body">

        {mode === "mapa" && (
          <MesaMapView
            mesas={mesas}
            loading={mesasLoading}
            abertas={abertas}
            onSelectComanda={handleSelectComanda}
            onOpenEmpty={handleOpenEmpty}
          />
        )}

        {mode === "reservas" && (
          <MesaReservasView
            mesas={mesas}
            loading={mesasLoading}
            abertas={abertas}
            atualizarStatus={atualizarStatusMesa}
          />
        )}

        {mode === "grid" && (
          <div className="pdv__lista-scroll">
            <ComandaGrid
              abertas={abertas}
              visitadas={lancadas}
              selected={null}
              onSelect={handleSelectComanda}
              onOpenEmpty={handleOpenEmpty}
              busca={buscaComanda}
              emUsoPor={(order) => emUsoPorOutro(order) ? nomeTrava(order) : null}
            />
          </div>
        )}

        {/* Só as comandas pendentes de pagamento — o operador localiza
            rápido quem ainda não pagou, sem os slots vazios da lista. */}
        {mode === "abertas" && (
          <div className="pdv__lista-scroll">
            <ComandaGrid
              abertas={abertas}
              visitadas={lancadas}
              selected={null}
              onSelect={handleSelectComanda}
              onOpenEmpty={handleOpenEmpty}
              busca={buscaComanda}
              somenteAbertas
              emUsoPor={(order) => emUsoPorOutro(order) ? nomeTrava(order) : null}
            />
          </div>
        )}

        {mode === "pedido" && <AreaPedido tela={tela} />}

        {mode === "checkout" && (
          <CheckoutView
            comanda={selected}
            items={[
              ...(Array.isArray(selected?.items) ? selected.items : []),
              ...cartItems.map(({ _key, ...r }) => r),
            ]}
            onConfirm={handleConfirmPayment}
            onBack={() => setMode("pedido")}
            onRemoverItem={handleRemoverItemCheckout}
          />
        )}
      </div>

      {/* ── Modal: Cupom NFC-e (Leva 7) ──────────────────────────── */}
      {cupomNfce.aberta && createPortal(
        <ModalCupomNfce
          estadoEmissao={cupomNfce.estado}
          resultado={cupomNfce.resultado}
          venda={cupomNfce.venda}
          onFechar={() => setCupomNfce((c) => ({ ...c, aberta: false }))}
        />,
        document.body,
      )}

      {/* ── Modal: Nova Comanda ──────────────────────────────────── */}
      {showNova && <ModalNovaComanda tela={tela} />}

      {/* ── Popup: Cancelar Comanda ─────────────────────────────── */}
      {showCancelarComanda && <ModalCancelarComanda tela={tela} />}

      {/* ── Popup: Transferir Itens ─────────────────────────────── */}
      {showTransferir && <ModalTransferirItens tela={tela} />}

      {/* ── Popup: Confirmar cancelamento ───────────────────────── */}
      {confirmCancelar && <ConfirmarCancelarPedido tela={tela} />}

      {/* ── Popup: Mesa ──────────────────────────────────────────── */}
      {showMesa && mesaPendingOrder && <ModalEscolherMesa tela={tela} />}

      {/* ── Popup: Cliente da comanda ────────────────────────────── */}
      {showCliente && clientePendingOrder && (
        <ClienteComandaModal
          comanda={clientePendingOrder}
          clienteSel={clienteSel}
          onSelecionar={setClienteSel}
          onConfirmar={handleConfirmarClienteComanda}
          onCancelar={() => { setShowCliente(false); setClientePendingOrder(null); }}
          salvando={salvandoCliente}
          usuario={currentUser?.username}
        />
      )}

      {/* ── Popup: Saldo do Dia ──────────────────────────────────── */}
      {showSaldo && createPortal(
        <SaldoModal
          onClose={() => setShowSaldo(false)}
          senha={saldoSenha}
          setSenha={setSaldoSenha}
          senhaErro={saldoSenhaErro}
          setSenhaErro={setSaldoSenhaErro}
          autorizado={saldoAutorizado}
          setAutorizado={setSaldoAutorizado}
          senhaVis={saldoSenhaVis}
          setSenhaVis={setSaldoSenhaVis}
          users={users}
          sales={sales}
          pending={pending}
          metodosCustom={metodosCustom}
        />,
        document.body
      )}

    </div>
  );
}
