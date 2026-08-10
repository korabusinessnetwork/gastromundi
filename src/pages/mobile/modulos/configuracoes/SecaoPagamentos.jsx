import { useMemo, useState } from "react";
import { LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuWallet, LuPlus, LuTrash2, LuCircleCheck } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { METODOS_TEF_PADRAO, podeUsarTef } from "@/lib/vendas/tef";
import "./SecaoPagamentos.css";

/**
 * SecaoPagamentos — aba "Meios de Pagamento" das Configurações, versão nativa do Palm.
 *
 * Espelha `MeiosPagamentoTab` em src/components/configuracoes/ConfiguracoesView.jsx:
 * mesmo catálogo de métodos, mesmos métodos personalizados, mesma seleção de
 * maquininha (TEF). Nada de regra nova — tudo passa pelas mesmas funções do
 * AppContext (setMeiosPagamento/setMetodosCustom/setMetodosTef) e por
 * `@/lib/tef` (podeUsarTef), que já são a fonte de verdade usada pelo PDV.
 *
 * Por que é intuitiva no celular:
 * - Cada método é uma linha com ícone + nome + descrição + um interruptor
 *   grande (--tap-min) — o padrão de "ajustes" que qualquer app tem, sem
 *   precisar decorar nada novo (mesma base .cfg-toggle do resto da seção).
 * - Remover um método personalizado pede confirmação inline (linha vira
 *   "Remover X?" com Cancelar/Remover) em vez de sumir num toque só —
 *   ação destrutiva confirmada, como o CLAUDE.md exige.
 * - Quem não é admin nunca vê um controle que vai falhar: os interruptores
 *   ficam desabilitados e uma nota no topo explica o motivo (prevenção de
 *   erro > mensagem de erro).
 * - O botão Salvar mora no rodapé fixo (.mod-rodape), sempre ao alcance do
 *   polegar — igual às outras seções de Configurações do Palm.
 */

const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote, desc: "Pagamento em espécie" },
  { id: "credito", label: "Crédito", Icon: LuCreditCard, desc: "Cartão de crédito" },
  { id: "debito", label: "Débito", Icon: LuSmartphone, desc: "Cartão de débito" },
  { id: "pix", label: "Pix", Icon: LuZap, desc: "Pagamento via Pix" },
];

export default function SecaoPagamentos() {
  const {
    meiosPagamento, setMeiosPagamento,
    metodosCustom, setMetodosCustom,
    metodosTef, setMetodosTef,
    currentUser,
  } = useApp();

  const isAdmin = currentUser?.role === "admin";

  const [ativos, setAtivos] = useState(
    meiosPagamento?.length ? meiosPagamento : METODOS_CATALOG.map((m) => m.id),
  );
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [erro, setErro] = useState("");

  const todosMetodos = useMemo(
    () => [
      ...METODOS_CATALOG,
      ...(metodosCustom ?? []).map((m) => ({ ...m, Icon: LuWallet, desc: "Forma de pagamento personalizada", custom: true })),
    ],
    [metodosCustom],
  );

  const listaTef = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
  // Dinheiro nunca passa por maquininha (podeUsarTef) — nem chega a listar.
  const metodosTefElegiveis = useMemo(
    () => todosMetodos.filter((m) => podeUsarTef(m.id)),
    [todosMetodos],
  );

  const toggleAtivo = (id) => {
    if (!isAdmin) return;
    setAtivos((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
    setOkMsg(false);
    setErro("");
  };

  // Todas as escritas abaixo checam o `{ error }` que o AppContext devolve.
  // Sem isso a tela dizia "Configurações salvas" mesmo quando a RLS de
  // `config` recusava a gravação (o papel caixa falhava em silêncio), e o
  // operador só descobria no checkout seguinte, com o método antigo de volta.
  const toggleTef = async (id) => {
    if (!isAdmin) return;
    setErro("");
    const { error } = await setMetodosTef(
      listaTef.includes(id) ? listaTef.filter((m) => m !== id) : [...listaTef, id],
    );
    if (error) setErro("Não deu para mudar quais métodos passam pela maquininha. Tente de novo.");
  };

  const salvar = async () => {
    if (ativos.length === 0 || salvando) return;
    setSalvando(true);
    setErro("");
    const { error } = await setMeiosPagamento(ativos);
    setSalvando(false);
    if (error) {
      setOkMsg(false);
      setErro("Não deu para salvar os meios de pagamento. Nada foi alterado — tente de novo.");
      return;
    }
    setOkMsg(true);
  };

  const adicionarCustom = async () => {
    const nome = novoNome.trim();
    if (!nome || adicionando) return;
    setAdicionando(true);
    setErro("");
    setOkMsg(false);
    const id = `custom_${nome.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const novo = { id, label: nome };
    const novosCustom = [...(metodosCustom ?? []), novo];
    const novosAtivos = [...ativos, id];

    const { error: erroCustom } = await setMetodosCustom(novosCustom);
    if (erroCustom) {
      setAdicionando(false);
      setErro("Não deu para criar a forma de pagamento. Tente de novo.");
      return;
    }
    // O método já existe no banco; falta só ativá-lo. A mensagem diz
    // exatamente isso para o operador não recriar um método duplicado.
    const { error: erroAtivos } = await setMeiosPagamento(novosAtivos);
    if (erroAtivos) {
      setAdicionando(false);
      setErro(`"${nome}" foi criada, mas não deu para ativá-la. Ative na lista e salve de novo.`);
      return;
    }
    setAtivos(novosAtivos);
    setNovoNome("");
    setShowForm(false);
    setAdicionando(false);
  };

  const confirmarRemocao = async (id) => {
    setErro("");
    setOkMsg(false);
    const novosCustom = (metodosCustom ?? []).filter((m) => m.id !== id);
    const novosAtivos = ativos.filter((a) => a !== id);

    const { error: erroCustom } = await setMetodosCustom(novosCustom);
    if (erroCustom) {
      setErro("Não deu para remover a forma de pagamento. Ela continua disponível.");
      return;
    }
    const { error: erroAtivos } = await setMeiosPagamento(novosAtivos);
    if (erroAtivos) {
      setErro("A forma de pagamento foi removida, mas não deu para atualizar a lista de ativos. Salve de novo.");
      return;
    }
    setAtivos(novosAtivos);
    setRemovendoId(null);
  };

  return (
    <div className="mod-lista">
      {!isAdmin && (
        <p className="cfg-nota">
          Só o administrador pode alterar os meios de pagamento. Você está vendo em modo leitura.
        </p>
      )}

      {/* Catálogo de métodos: liga/desliga + personalizados */}
      <div className="cfg-card cfg-card--coluna">
        <div className="cfg-pagamentos__topo">
          <div className="cfg-card__titulo">Meios de pagamento</div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setShowForm((v) => !v); setNovoNome(""); }}
              className="mod-botao mod-botao--fantasma cfg-pagamentos__btnAdicionar"
              aria-pressed={showForm}
            >
              <LuPlus aria-hidden="true" />
              {showForm ? "Cancelar" : "Adicionar"}
            </button>
          )}
        </div>
        <p className="cfg-card__ajuda">
          Ative ou desative as formas de pagamento disponíveis no checkout e no fechamento de caixa.
        </p>

        {showForm && isAdmin && (
          <div className="cfg-pagamentos__formNovo">
            <input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") adicionarCustom();
                if (e.key === "Escape") setShowForm(false);
              }}
              placeholder="Nome da forma de pagamento…"
              maxLength={40}
              className="cfg-input"
              aria-label="Nome da nova forma de pagamento"
            />
            <button
              type="button"
              onClick={adicionarCustom}
              disabled={!novoNome.trim() || adicionando}
              className="mod-botao mod-botao--primario"
            >
              {adicionando ? "Adicionando…" : "Confirmar"}
            </button>
          </div>
        )}

        <div className="cfg-pagamentos__lista">
          {todosMetodos.map((m) => {
            const ativo = ativos.includes(m.id);
            const removendo = removendoId === m.id;
            return (
              <div key={m.id} className="cfg-pagamentos__linha">
                {removendo ? (
                  <div className="cfg-pagamentos__confirmar">
                    <span className="cfg-pagamentos__confirmarTexto">Remover "{m.label}"?</span>
                    <div className="cfg-pagamentos__confirmarBotoes">
                      <button
                        type="button"
                        className="mod-botao mod-botao--fantasma"
                        onClick={() => setRemovendoId(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="mod-botao mod-botao--perigo"
                        onClick={() => confirmarRemocao(m.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`cfg-pagamentos__icone${ativo ? " cfg-pagamentos__icone--ativo" : ""}`}>
                      <m.Icon aria-hidden="true" />
                    </div>
                    <div className="cfg-pagamentos__textos">
                      <span className="cfg-pagamentos__nome">{m.label}</span>
                      <span className="cfg-pagamentos__desc">{m.desc}</span>
                    </div>
                    {m.custom && isAdmin && (
                      <button
                        type="button"
                        onClick={() => setRemovendoId(m.id)}
                        className="cfg-pagamentos__btnRemover"
                        aria-label={`Remover ${m.label}`}
                        title="Remover"
                      >
                        <LuTrash2 aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleAtivo(m.id)}
                      disabled={!isAdmin}
                      className={`cfg-toggle${ativo ? " cfg-toggle--on" : ""}`}
                      aria-pressed={ativo}
                      aria-label={`${ativo ? "Desativar" : "Ativar"} ${m.label}`}
                    >
                      <span className="cfg-toggle__bolinha" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {ativos.length === 0 && (
          <p className="mod-erro" role="alert">
            É necessário pelo menos um meio de pagamento ativo.
          </p>
        )}
      </div>

      {/* Maquininha (TEF) — quais métodos passam pela maquininha. Quem passa
          pela maquininha só cobra com internet; os demais podem fechar a
          comanda offline (a venda sobe sozinha quando voltar). */}
      <div className="cfg-card cfg-card--coluna">
        <div className="cfg-card__titulo">Maquininha (TEF)</div>
        <p className="cfg-card__ajuda">
          Marque quais formas de pagamento passam pela maquininha. Essas precisam de internet na
          hora de cobrar; as demais funcionam mesmo sem internet — a venda fica guardada e sobe
          sozinha quando a conexão voltar.
        </p>
        <div className="cfg-pagamentos__tefChips">
          {metodosTefElegiveis.map((m) => {
            const usaTef = listaTef.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleTef(m.id)}
                disabled={!isAdmin}
                className={`mod-chip${usaTef ? " mod-chip--ativo" : ""}`}
                aria-pressed={usaTef}
              >
                {m.label}{usaTef ? " · maquininha" : ""}
              </button>
            );
          })}
        </div>
        {!isAdmin && (
          <p className="cfg-nota">Somente o administrador pode alterar quais métodos usam a maquininha.</p>
        )}
      </div>

      {erro ? (
        <p className="mod-erro" role="alert">{erro}</p>
      ) : null}

      {okMsg ? (
        <p className="cfg-ok" role="status">
          <LuCircleCheck aria-hidden="true" />
          Configurações salvas.
        </p>
      ) : null}

      {isAdmin && (
        <>
          {/* Espaçador: o botão Salvar mora no rodapé fixo (.mod-rodape),
              fora do fluxo normal — sem isso o último cartão fica escondido
              atrás da barra. */}
          <div className="cfg-pagamentos__espacoRodape" aria-hidden="true" />
          <div className="mod-rodape">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || ativos.length === 0}
              className="mod-botao mod-botao--primario mod-botao--bloco"
            >
              {salvando ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
