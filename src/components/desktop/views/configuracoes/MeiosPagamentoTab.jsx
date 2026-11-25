import { useState } from "react";
import { useSessao, useConfig } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuPlus, LuTrash2, LuWallet, LuTriangleAlert } from "react-icons/lu";
import { METODOS_TEF_PADRAO, podeUsarTef } from "@/lib/tef";
import ToggleChip from "./ToggleChip";
import { METODOS_CATALOG } from "@/constants/metodosPagamento";

export default function MeiosPagamentoTab({ sz }) {
  const { currentUser } = useSessao();
  const { meiosPagamento, setMeiosPagamento, metodosCustom, setMetodosCustom, metodosTef, setMetodosTef } = useConfig();
  const [ativos,       setAtivos]      = useState(
    meiosPagamento?.length ? meiosPagamento : METODOS_CATALOG.map(m => m.id)
  );
  const [salvando,     setSalvando]    = useState(false);
  const [okMsg,        setOkMsg]       = useState(false);
  const [showForm,     setShowForm]    = useState(false);
  const [novoNome,     setNovoNome]    = useState("");
  const [adicionando,  setAdicionando] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const toggle = (id) => {
    if (!isAdmin) return;
    setAtivos(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    setOkMsg(false);
  };

  const salvar = async () => {
    if (ativos.length === 0 || salvando) return;
    setSalvando(true);
    await setMeiosPagamento(ativos);
    setSalvando(false);
    setOkMsg(true);
  };

  const adicionarCustom = async () => {
    const nome = novoNome.trim();
    if (!nome || adicionando) return;
    setAdicionando(true);
    const id = `custom_${nome.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const novo = { id, label: nome };
    const novosCustom = [...(metodosCustom ?? []), novo];
    const novosAtivos = [...ativos, id];
    await setMetodosCustom(novosCustom);
    await setMeiosPagamento(novosAtivos);
    setAtivos(novosAtivos);
    setNovoNome("");
    setShowForm(false);
    setAdicionando(false);
    setOkMsg(false);
  };

  const removerCustom = async (id) => {
    const novosCustom = (metodosCustom ?? []).filter(m => m.id !== id);
    const novosAtivos = ativos.filter(a => a !== id);
    await setMetodosCustom(novosCustom);
    await setMeiosPagamento(novosAtivos);
    setAtivos(novosAtivos);
    setOkMsg(false);
  };

  const todosMetodos = [
    ...METODOS_CATALOG,
    ...(metodosCustom ?? []).map(m => ({ ...m, Icon: LuWallet, desc: "Forma de pagamento personalizada", custom: true })),
  ];

  return (
    <div className="meios-pagamento-tab" style={{ "--meios-pad": `${sz.pad}px`, "--meios-pad-sm": `${sz.padSm}px`, "--meios-gap": `${sz.gap}px` }}>
      <div className="meios-pagamento-tab__card">
        <div className="meios-pagamento-tab__topo">
          <div className="meios-pagamento-tab__titulo">Meios de Pagamento</div>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(v => !v); setNovoNome(""); }}
              className={`meios-pagamento-tab__btn-adicionar${showForm ? " meios-pagamento-tab__btn-adicionar--aberto" : ""}`}
            >
              <LuPlus size={15} /> Adicionar
            </button>
          )}
        </div>
        <div className="meios-pagamento-tab__ajuda meios-pagamento-tab__ajuda--antes">
          Ative ou desative as formas de pagamento disponíveis no checkout e no fechamento de caixa.
        </div>

        {/* Formulário inline para novo método */}
        {showForm && isAdmin && (
          <div className="meios-pagamento-tab__form-novo">
            <input
              autoFocus
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarCustom(); if (e.key === "Escape") setShowForm(false); }}
              placeholder="Nome da forma de pagamento..."
              maxLength={40}
              className="meios-pagamento-tab__input-novo"
            />
            <button
              onClick={adicionarCustom}
              disabled={!novoNome.trim() || adicionando}
              className={`meios-pagamento-tab__btn-confirmar${novoNome.trim() ? " meios-pagamento-tab__btn-confirmar--pode" : ""}`}
            >
              {adicionando ? "..." : "Confirmar"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="meios-pagamento-tab__btn-cancelar-form"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="meios-pagamento-tab__grid">
          {todosMetodos.map(m => {
            const ativo = ativos.includes(m.id);
            return (
              <div key={m.id} className="meios-pagamento-tab__metodo">
                <button
                  onClick={() => toggle(m.id)}
                  disabled={!isAdmin}
                  className={`meios-pagamento-tab__metodo-card${ativo ? " meios-pagamento-tab__metodo-card--ativo" : ""}`}
                >
                  <m.Icon size={26} />
                  <div className="meios-pagamento-tab__metodo-nome">{m.label}</div>
                  <div className="meios-pagamento-tab__metodo-desc">{m.desc}</div>
                  <div className="meios-pagamento-tab__status-tag">
                    {ativo ? "Ativo" : "Desabilitado"}
                  </div>
                </button>
                {m.custom && isAdmin && (
                  <button
                    onClick={() => removerCustom(m.id)}
                    title="Remover"
                    className="meios-pagamento-tab__btn-remover-custom"
                  >
                    <LuTrash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {ativos.length === 0 && (
          <div className="meios-pagamento-tab__aviso-vazio">
            <LuTriangleAlert size={16} className="meios-pagamento-tab__aviso-icone" /> É necessário pelo menos um meio de pagamento ativo.
          </div>
        )}
      </div>

      {/* Maquininha (TEF) — quais métodos passam pela maquininha. Quem
          passa pela maquininha só cobra com internet; os demais podem
          fechar a comanda offline (a venda sobe sozinha quando voltar). */}
      <div className="meios-pagamento-tab__card">
        <div className="meios-pagamento-tab__titulo meios-pagamento-tab__titulo--tef">
          Maquininha (TEF)
        </div>
        <div className="meios-pagamento-tab__ajuda meios-pagamento-tab__ajuda--antes">
          Marque quais formas de pagamento passam pela maquininha. Essas precisam de internet
          na hora de cobrar; as demais funcionam mesmo sem internet, a venda fica guardada e
          sobe sozinha quando a conexão voltar.
        </div>
        <div className="meios-pagamento-tab__chips">
          {/* dinheiro fica de fora: espécie nunca passa por terminal (podeUsarTef) */}
          {todosMetodos.filter((m) => podeUsarTef(m.id)).map((m) => {
            const listaTef = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
            const usaTef = listaTef.includes(m.id);
            return (
              <ToggleChip
                key={m.id}
                active={usaTef}
                color={varColor(C.accent)}
                sz={sz}
                onClick={() => {
                  if (!isAdmin) return;
                  const lista = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
                  setMetodosTef(usaTef ? lista.filter((id) => id !== m.id) : [...lista, m.id]);
                }}
              >
                {m.label}{usaTef ? " · maquininha" : ""}
              </ToggleChip>
            );
          })}
        </div>
        {!isAdmin && (
          <div className="meios-pagamento-tab__ajuda meios-pagamento-tab__ajuda--depois">
            Somente o administrador pode alterar quais métodos usam a maquininha.
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="meios-pagamento-tab__rodape">
          {okMsg && (
            <span className="meios-pagamento-tab__ok-msg">✓ Configurações salvas</span>
          )}
          <button
            onClick={salvar}
            disabled={salvando || ativos.length === 0}
            className="meios-pagamento-tab__btn-salvar"
          >
            {salvando ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Aba Unidades de Medida ────────────────────────────────────────
