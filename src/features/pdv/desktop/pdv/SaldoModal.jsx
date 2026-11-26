import { useState, useEffect } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useResponsive } from "@/utils/hooks";
import { totalPorMetodo, rotuloMetodo } from "@/utils/pagamentos";
import { getSizes } from "@/constants/sizes";
import { LuLock, LuX, LuChartBar, LuEye, LuEyeOff } from "react-icons/lu";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { listarCancelamentosDeComandaDesde } from "@/features/auditoria/dados/logsOperador";
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";
import { itensNaoCancelados } from "@/features/comandas/regras/comandaItens";

// ── Modal de Saldo do Dia ─────────────────────────────────────────
export default function SaldoModal({ onClose, senha, setSenha, senhaErro, setSenhaErro, autorizado, setAutorizado, senhaVis, setSenhaVis, sales, pending, metodosCustom }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const isNarrow = width < 540;
  const hoje = new Date().toDateString();
  const [logsComandaCancelada, setLogsComandaCancelada] = useState([]);
  const [showCancelList, setShowCancelList] = useState(false);

  useEffect(() => {
    if (!autorizado) return;
    const inicioDia = new Date(new Date().toDateString()).toISOString();
    listarCancelamentosDeComandaDesde(inicioDia)
      .then(({ data }) => setLogsComandaCancelada(data ?? []));
  }, [autorizado]);

  // Leva 15.3 — vendas canceladas não contam no saldo do dia
  const vendasHoje = (sales ?? []).filter(s => s.at && !s.cancelada && new Date(s.at).toDateString() === hoje);
  const totalVendas = vendasHoje.reduce((s, v) => s + (v.total ?? 0), 0);
  const qtdVendas   = vendasHoje.length;

  const abertas = (pending ?? []).filter(p => p.status !== "closed");
  const totalAberto = abertas.reduce((s, p) => {
    const ativos = itensNaoCancelados(p.items);
    return s + ativos.reduce((x, i) => x + (i.price ?? 0) * (i.qty ?? 1), 0);
  }, 0);

  // Cancelamentos: itens cancelados em comandas abertas + em vendas do dia + comandas inteiras canceladas
  const canceladosAbertos = abertas.flatMap(p =>
    (Array.isArray(p.items) ? p.items : []).filter(i => i.cancelado)
  );
  const canceladosFechados = vendasHoje.flatMap(v =>
    (Array.isArray(v.items) ? v.items : []).filter(i => i.cancelado)
  );
  // Itens de comandas inteiras canceladas (vindos dos logs)
  const canceladosComanda = logsComandaCancelada.flatMap(log => {
    const items = Array.isArray(log.payload?.items) ? log.payload.items : [];
    const motivo = log.payload?.motivo || "";
    const canceladoPor = log.payload?.name || "";
    const comanda = log.payload?.comanda || "—";
    return items.map(i => ({ ...i, motivoCancelamento: motivo, canceladoPor, _comanda: comanda, _comandaCancelada: true }));
  });
  const todosCancelados = [...canceladosAbertos, ...canceladosFechados, ...canceladosComanda];
  const totalCancelado  = todosCancelados.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
  const qtdCancelados   = todosCancelados.reduce((s, i) => s + (i.qty ?? 1), 0);

  const porMetodo = {};
  vendasHoje.forEach(v => { Object.entries(totalPorMetodo(v)).forEach(([m, val]) => { porMetodo[m] = (porMetodo[m] ?? 0) + val; }); });

  const customLabels = Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label]));
  // Cor de cada meio de fábrica no CSS (`pdv__saldo-metodo-pill--<meio>`);
  // meio personalizado fica no tom neutro.
  const METODOS_COM_COR = ["dinheiro", "credito", "debito", "pix"];

  const verificarSenha = async () => {
    const { ok, erro } = await verificarSenhaAdmin(senha);
    if (ok) { setAutorizado(true); setSenhaErro(""); }
    else    { setSenhaErro(erro || "Senha incorreta. Apenas administradores e gerentes têm acesso."); }
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      className="pdv__saldo-overlay"
      style={{ "--saldo-pad": `${sz.pad}px`, "--saldo-pad-sm": `${sz.padSm}px` }}
    >
      <div className={`pdv__saldo-modal${autorizado ? " pdv__saldo-modal--autorizado" : ""}${isNarrow ? " pdv__saldo-modal--estreito" : ""}`}>
        {/* Header */}
        <div className="pdv__saldo-header">
          <div className="pdv__saldo-header-info">
            <div className="pdv__saldo-icone">
              <LuChartBar size={18} />
            </div>
            <div>
              <div className="pdv__saldo-titulo">Saldo do Dia</div>
              <div className="pdv__saldo-subtitulo">
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="pdv__saldo-close-btn">
            <LuX size={18} />
          </button>
        </div>

        {/* Corpo: senha ou dados */}
        {!autorizado ? (
          <div className="pdv__saldo-corpo">
            <div className="pdv__saldo-aviso">
              <LuLock size={16} className="pdv__saldo-aviso-icone" />
              Acesso restrito a administradores e gerentes.
            </div>

            <div className="pdv__saldo-campo">
              <label className="pdv__saldo-label">
                Senha
              </label>
              <div className="pdv__saldo-input-wrap">
                <input
                  autoFocus
                  type={senhaVis ? "text" : "password"}
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setSenhaErro(""); }}
                  onKeyDown={e => e.key === "Enter" && verificarSenha()}
                  placeholder="Digite a senha de acesso"
                  className="pdv__saldo-input"
                  aria-invalid={!!senhaErro}
                />
                <button
                  onClick={() => setSenhaVis(v => !v)}
                  className="pdv__saldo-olho-btn"
                >
                  {senhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              {senhaErro && (
                <div role="alert" className="pdv__saldo-erro">
                  {senhaErro}
                </div>
              )}
            </div>

            <div className="pdv__saldo-acoes">
              <button onClick={onClose} className="pdv__saldo-modal-btn">
                Cancelar
              </button>
              <button
                onClick={verificarSenha}
                disabled={!senha.trim()}
                className="pdv__saldo-modal-btn pdv__saldo-modal-btn--primario"
              >
                Acessar
              </button>
            </div>
          </div>
        ) : (
          <div className="pdv__saldo-corpo pdv__saldo-corpo--dados">

            {/* KPIs */}
            <div className="pdv__saldo-kpis">
              {[
                { label: "Vendas Finalizadas",    value: `R$ ${totalVendas.toFixed(2)}`, sub: `${qtdVendas} comanda${qtdVendas !== 1 ? "s" : ""}`, tom: "vendas" },
                { label: "Em Aberto (estimado)",  value: `R$ ${totalAberto.toFixed(2)}`, sub: `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} ativa${abertas.length !== 1 ? "s" : ""}`, tom: "aberto" },
              ].map(k => (
                <div key={k.label} className="pdv__saldo-kpi">
                  <div className="pdv__saldo-kpi-label">{k.label}</div>
                  <div className={`pdv__saldo-kpi-valor pdv__saldo-kpi-valor--${k.tom}`}>{k.value}</div>
                  <div className="pdv__saldo-kpi-sub">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Card de Cancelamentos */}
            <div className="pdv__saldo-cancelamentos">
              <div className="pdv__saldo-cancelamentos-linha">
                <div className="pdv__saldo-cancelamentos-info">
                  <div className="pdv__saldo-kpi-label">
                    Cancelamentos do Dia
                  </div>
                  <div className="pdv__saldo-kpi-sub">
                    {qtdCancelados} {qtdCancelados === 1 ? "item cancelado" : "itens cancelados"}
                  </div>
                  <div className="pdv__saldo-pills">
                    {canceladosAbertos.length > 0 && (
                      <span className="pdv__saldo-pill">
                        {canceladosAbertos.reduce((s,i)=>s+(i.qty??1),0)} em aberto
                      </span>
                    )}
                    {canceladosFechados.length > 0 && (
                      <span className="pdv__saldo-pill">
                        {canceladosFechados.reduce((s,i)=>s+(i.qty??1),0)} em fechadas
                      </span>
                    )}
                    {canceladosComanda.length > 0 && (
                      <span className="pdv__saldo-pill pdv__saldo-pill--comanda">
                        {canceladosComanda.reduce((s,i)=>s+(i.qty??1),0)} de comanda{logsComandaCancelada.length !== 1 ? "s" : ""} cancelada{logsComandaCancelada.length !== 1 ? "s" : ""} ({logsComandaCancelada.length})
                      </span>
                    )}
                  </div>
                </div>
                <div className="pdv__saldo-kpi-valor">
                  {totalCancelado > 0 ? `- R$ ${totalCancelado.toFixed(2)}` : "R$ 0,00"}
                </div>
              </div>
            </div>

            {/* Total geral */}
            <div className="pdv__saldo-total">
              <div className="pdv__saldo-total-info">
                <div className="pdv__saldo-total-titulo">Total do Dia (projetado)</div>
                <div className="pdv__saldo-kpi-sub">Fechadas + em aberto · cancelamentos não incluídos</div>
              </div>
              <div className="pdv__saldo-total-valor">
                R$ {(totalVendas + totalAberto).toFixed(2)}
              </div>
            </div>

            {/* Por método de pagamento */}
            {Object.keys(porMetodo).length > 0 && (
              <div className="pdv__saldo-secao">
                <div className="pdv__saldo-kpi-label">
                  Vendas por Método
                </div>
                <div className="pdv__saldo-metodos">
                  {Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([metodo, val]) => (
                    <div key={metodo} className="pdv__saldo-metodo">
                      <span className={`pdv__saldo-metodo-pill pdv__saldo-metodo-pill--${METODOS_COM_COR.includes(metodo) ? metodo : "outro"}`}>
                        {rotuloMetodo(metodo, customLabels)}
                      </span>
                      <span className="pdv__saldo-metodo-valor">
                        R$ {Number(val).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detalhe dos itens cancelados — accordion */}
            {todosCancelados.length > 0 && (
              <div className="pdv__saldo-accordion">
                {/* Header clicável */}
                <button
                  type="button"
                  onClick={() => setShowCancelList(v => !v)}
                  className={`pdv__saldo-accordion-btn${showCancelList ? " pdv__saldo-accordion-btn--aberto" : ""}`}
                >
                  <div className="pdv__saldo-accordion-esq">
                    <div className="pdv__saldo-accordion-icone">
                      <LuX size={13} />
                    </div>
                    <span className="pdv__saldo-kpi-label">
                      Itens Cancelados
                    </span>
                    <span className="pdv__saldo-accordion-contagem">
                      {todosCancelados.reduce((s, i) => s + (i.qty ?? 1), 0)}
                    </span>
                  </div>
                  <div className="pdv__saldo-accordion-dir">
                    <span className="pdv__saldo-accordion-total">
                      {totalCancelado > 0 ? `- R$ ${totalCancelado.toFixed(2)}` : "R$ 0,00"}
                    </span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className="pdv__saldo-chevron"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Lista com scroll */}
                {showCancelList && (
                  <div className="pdv__saldo-cancelados-lista">
                    {todosCancelados.map((item, idx) => (
                      <div key={item.uid ?? idx} className="pdv__saldo-cancelado">
                        <div className="pdv__saldo-cancelado-info">
                          <div className="pdv__saldo-cancelado-titulo">
                            <span className="pdv__saldo-item-nome">
                              {item.name}{(item.qty ?? 1) > 1 ? ` ×${item.qty}` : ""}
                            </span>
                            {item._comandaCancelada && (
                              <span className="pdv__saldo-item-selo">
                                comanda cancelada
                              </span>
                            )}
                          </div>
                          {(item.motivoCancelamento || item.canceladoPor || item._comanda) && (
                            <div className="pdv__saldo-item-meta">
                              {item._comanda ? `${item._comanda} · ` : ""}
                              {item.canceladoPor || ""}
                              {item.motivoCancelamento && item.motivoCancelamento !== "—" ? `, ${item.motivoCancelamento}` : ""}
                            </div>
                          )}
                        </div>
                        <div className="pdv__saldo-item-preco">
                          - R$ {((item.price ?? 0) * (item.qty ?? 1)).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comandas em aberto */}
            {abertas.length > 0 && (
              <div className="pdv__saldo-secao">
                <div className="pdv__saldo-kpi-label">
                  Comandas em Aberto
                </div>
                <div className="pdv__saldo-comandas">
                  {abertas.map(p => {
                    const ativos = itensNaoCancelados(p.items);
                    const subtotal = ativos.reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);
                    return (
                      <div key={p.id} className="pdv__saldo-comanda">
                        <div className="pdv__saldo-comanda-info">
                          <div className="pdv__saldo-comanda-nome">{fmtComanda(p.comanda)}</div>
                          {p.garcom && <div className="pdv__saldo-comanda-meta">{p.garcom}</div>}
                        </div>
                        <div className="pdv__saldo-comanda-dir">
                          <div className={`pdv__saldo-comanda-valor${subtotal > 0 ? "" : " pdv__saldo-comanda-valor--vazia"}`}>
                            {subtotal > 0 ? `R$ ${subtotal.toFixed(2)}` : "Sem itens"}
                          </div>
                          <div className="pdv__saldo-comanda-meta">
                            {ativos.reduce((s, i) => s + (i.qty ?? 1), 0)} item(ns)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="pdv__saldo-modal-btn pdv__saldo-modal-btn--rodape"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
