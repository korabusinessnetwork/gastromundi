import { useEffect, useMemo, useState } from "react";
import { LuArmchair, LuMonitor, LuPencil, LuPlus, LuSearch, LuTrash2, LuUsers } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import "./SecaoMesas.css";

/**
 * SecaoMesas — aba "Mesas" das Configurações, versão nativa do Palm.
 *
 * Porta o CRUD de mesas que já existe no desktop (MesasAdmin.jsx em
 * src/components/desktop/views/mesas/) para o celular: listar, criar, editar
 * lugares e remover — mesma tabela (`mesas`), mesmas mensagens de validação
 * (número/nome obrigatório, duplicidade), mesmo texto de confirmação de
 * remoção. O que NÃO foi portado, de propósito, é o editor de layout por
 * arrastar-e-soltar (posX/posY do mapa do salão): no toque, arrastar um card
 * numa grade é frustrante e impreciso — vira adivinhação, o oposto do
 * princípio nº1. Em vez disso, a mesa nasce numa posição livre do mapa
 * automaticamente (reaproveita a mesma lógica de `proximaPosicaoLivre` do
 * desktop) e um aviso honesto (`.cfg-nota`) explica que organizar o mapa é
 * tarefa do computador — nada quebra lá quando uma mesa nasce aqui.
 *
 * Por que é intuitiva no celular:
 * - Próxima ação óbvia: um botão grande "Nova mesa" no topo, sem menu ou
 *   modal — toca, o formulário abre ali mesmo, sem sair da tela.
 * - Edição e remoção acontecem dentro do próprio cartão da mesa (inline),
 *   nunca em modal sobre modal — o contexto (qual mesa) nunca se perde.
 * - Remover sempre pede confirmação inline, com o mesmo aviso do desktop
 *   ("pedidos e vendas anteriores não são afetados") — nunca some sozinho.
 * - Número é fixo depois de criado (mesma regra do desktop: é a chave da
 *   mesa) — o campo nem aparece editável, prevenindo erro em vez de avisar
 *   depois.
 * - Estados de carregando, erro, vazio (inclusive "nada encontrado" na
 *   busca) e sucesso sempre visíveis, com texto humano.
 */

const EMPTY_FORM = { numero: "", capacidade: "4" };

// Mesma lógica de src/components/mesas/MesasAdmin.jsx: a nova
// mesa entra numa coluna livre à direita da última, sempre na linha 1. Não é
// bonito, mas é uma posição SEMPRE válida — o mapa do desktop nunca quebra
// por causa de uma mesa criada no celular.
function proximaPosicaoLivre(mesas) {
  if (mesas.length === 0) return { posicao_x: 1, posicao_y: 1 };
  const maxX = Math.max(...mesas.map((m) => m.posicao_x ?? 1));
  return { posicao_x: maxX + 1, posicao_y: 1 };
}

export default function SecaoMesas() {
  const { currentUser } = useApp();

  const [mesas, setMesas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [busca, setBusca] = useState("");

  // Formulário "nova mesa" — inline, expansível, no topo da lista.
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErro, setFormErro] = useState("");
  const [salvandoForm, setSalvandoForm] = useState(false);

  // Edição inline: só uma mesa por vez (evita cartões abertos demais).
  const [editandoNumero, setEditandoNumero] = useState(null);
  const [editCapacidade, setEditCapacidade] = useState("4");
  const [editErro, setEditErro] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // Confirmação de remoção — inline no cartão, sem modal (padrão do Palm:
  // ver src/pages/mobile/modulos/delivery/DeliveryModulo.jsx).
  const [confirmandoRemoverNumero, setConfirmandoRemoverNumero] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  useEffect(() => {
    fetchMesas();
  }, []);

  async function fetchMesas() {
    setCarregando(true);
    setErro("");
    const { data, error } = await supabase
      .from("mesas")
      .select("numero,capacidade,posicao_x,posicao_y")
      .order("numero");
    if (error) {
      setErro("Erro ao carregar mesas.");
    } else {
      setMesas(data ?? []);
    }
    setCarregando(false);
  }

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return mesas;
    return mesas.filter((m) => String(m.numero).toLowerCase().includes(termo));
  }, [mesas, busca]);

  // ── Formulário "nova mesa" ──────────────────────────────────────

  function abrirFormNovo() {
    setEditandoNumero(null);
    setConfirmandoRemoverNumero(null);
    setForm(EMPTY_FORM);
    setFormErro("");
    setOkMsg("");
    setFormAberto(true);
  }

  function fecharFormNovo() {
    if (salvandoForm) return;
    setFormAberto(false);
    setForm(EMPTY_FORM);
    setFormErro("");
  }

  async function salvarNovaMesa() {
    const numero = form.numero.trim();
    const capacidade = Math.max(1, parseInt(form.capacidade, 10) || 4);

    if (!numero) {
      setFormErro("Informe o número ou nome da mesa.");
      return;
    }
    if (salvandoForm) return;
    const existe = mesas.some((m) => m.numero === numero);
    if (existe) {
      setFormErro("Já existe uma mesa com este número/nome.");
      return;
    }

    setSalvandoForm(true);
    setFormErro("");
    const pos = proximaPosicaoLivre(mesas);
    try {
      const { error } = await supabase
        .from("mesas")
        .insert({ numero, capacidade, posicao_x: pos.posicao_x, posicao_y: pos.posicao_y });
      if (error) throw error;
      logAction(currentUser?.username, "mesas:criar", {
        msg: `Mesa ${numero} criada (${capacidade} lugares)`,
        name: currentUser?.name,
        role: currentUser?.role,
      });
      setFormAberto(false);
      setForm(EMPTY_FORM);
      setOkMsg(`Mesa ${numero} criada.`);
      await fetchMesas();
    } catch {
      setFormErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvandoForm(false);
    }
  }

  // ── Edição inline (só lugares — número é a chave, não muda) ────

  function abrirEdicao(mesa) {
    setFormAberto(false);
    setConfirmandoRemoverNumero(null);
    setEditandoNumero(mesa.numero);
    setEditCapacidade(String(mesa.capacidade ?? 4));
    setEditErro("");
    setOkMsg("");
  }

  function cancelarEdicao() {
    if (salvandoEdicao) return;
    setEditandoNumero(null);
    setEditErro("");
  }

  async function salvarEdicao(mesa) {
    if (salvandoEdicao) return;
    const capacidade = Math.max(1, parseInt(editCapacidade, 10) || 4);
    setSalvandoEdicao(true);
    setEditErro("");
    try {
      const { error } = await supabase.from("mesas").update({ capacidade }).eq("numero", mesa.numero);
      if (error) throw error;
      logAction(currentUser?.username, "mesas:editar", {
        msg: `Mesa ${mesa.numero}: lugares alterados para ${capacidade}`,
        name: currentUser?.name,
        role: currentUser?.role,
      });
      setEditandoNumero(null);
      setOkMsg(`Mesa ${mesa.numero} atualizada.`);
      await fetchMesas();
    } catch {
      setEditErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  // ── Remoção ──────────────────────────────────────────────────────

  function pedirRemover(mesa) {
    setFormAberto(false);
    setEditandoNumero(null);
    setConfirmandoRemoverNumero(mesa.numero);
    setOkMsg("");
  }

  function cancelarRemover() {
    if (removendo) return;
    setConfirmandoRemoverNumero(null);
  }

  async function confirmarRemover(mesa) {
    if (removendo) return;
    setRemovendo(true);
    setErro("");
    const { error } = await supabase.from("mesas").delete().eq("numero", mesa.numero);
    setRemovendo(false);
    if (error) {
      setErro("Erro ao remover mesa.");
      return;
    }
    setMesas((prev) => prev.filter((m) => m.numero !== mesa.numero));
    setConfirmandoRemoverNumero(null);
    setOkMsg(`Mesa ${mesa.numero} removida.`);
    logAction(currentUser?.username, "mesas:remover", {
      msg: `Mesa ${mesa.numero} removida`,
      name: currentUser?.name,
      role: currentUser?.role,
    });
  }

  return (
    <div className="mod-lista">
      {formAberto ? (
        <div className="mod-cartao cfg-mesas__form">
          <span className="mod-cartao__titulo">Nova mesa</span>

          <div className="cfg-campo">
            <span className="cfg-campo__rotulo">Número ou nome</span>
            <input
              autoFocus
              type="text"
              value={form.numero}
              onChange={(e) => {
                setForm((f) => ({ ...f, numero: e.target.value }));
                setFormErro("");
              }}
              onKeyDown={(e) => e.key === "Enter" && salvarNovaMesa()}
              placeholder="Ex: 1, 2, Varanda A…"
              maxLength={20}
              className={`cfg-input${formErro && !form.numero.trim() ? " cfg-input--invalido" : ""}`}
              aria-label="Número ou nome da mesa"
            />
          </div>

          <div className="cfg-campo">
            <span className="cfg-campo__rotulo">Lugares (pessoas)</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="50"
              value={form.capacidade}
              onChange={(e) => setForm((f) => ({ ...f, capacidade: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && salvarNovaMesa()}
              className="cfg-input"
              aria-label="Quantidade de lugares da mesa"
            />
          </div>

          {formErro ? (
            <p className="mod-erro" role="alert">
              {formErro}
            </p>
          ) : null}

          <div className="cfg-mesas__acoes">
            <button
              type="button"
              className="mod-botao mod-botao--fantasma"
              onClick={fecharFormNovo}
              disabled={salvandoForm}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="mod-botao mod-botao--primario"
              onClick={salvarNovaMesa}
              disabled={!form.numero.trim() || salvandoForm}
            >
              {salvandoForm ? "Criando…" : "Criar mesa"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="mod-botao mod-botao--primario mod-botao--bloco" onClick={abrirFormNovo}>
          <LuPlus aria-hidden="true" />
          Nova mesa
        </button>
      )}

      {/* Aviso honesto: o mapa/layout do salão só se organiza no computador.
          Mesas criadas aqui nascem numa posição livre — o mapa não quebra. */}
      <p className="cfg-nota">
        <LuMonitor aria-hidden="true" />
        Organizar a posição das mesas no mapa do salão é feito no computador.
        Mesas criadas aqui já entram numa posição livre do mapa, automaticamente.
      </p>

      {mesas.length > 0 ? (
        <label className="mod-busca">
          <LuSearch aria-hidden="true" />
          <input
            type="search"
            inputMode="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar mesa por número ou nome…"
            aria-label="Buscar mesa por número ou nome"
          />
        </label>
      ) : null}

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : null}
      {okMsg ? (
        <p className="cfg-ok" role="status">
          {okMsg}
        </p>
      ) : null}

      {carregando ? (
        <p className="mod-carregando">Carregando mesas…</p>
      ) : mesas.length === 0 ? (
        <div className="mod-vazio">
          <LuArmchair aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhuma mesa cadastrada</p>
          <p className="mod-vazio__texto">Toque em "Nova mesa" para cadastrar a primeira.</p>
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="mod-vazio">
          <LuSearch aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhuma mesa encontrada</p>
          <p className="mod-vazio__texto">Tente buscar por outro número ou nome.</p>
        </div>
      ) : (
        listaFiltrada.map((mesa) => (
          <CartaoMesa
            key={mesa.numero}
            mesa={mesa}
            editando={editandoNumero === mesa.numero}
            editCapacidade={editCapacidade}
            editErro={editErro}
            salvandoEdicao={salvandoEdicao}
            onEditar={() => abrirEdicao(mesa)}
            onEditCapacidadeChange={setEditCapacidade}
            onCancelarEdicao={cancelarEdicao}
            onSalvarEdicao={() => salvarEdicao(mesa)}
            confirmandoRemover={confirmandoRemoverNumero === mesa.numero}
            removendo={removendo}
            onPedirRemover={() => pedirRemover(mesa)}
            onCancelarRemover={cancelarRemover}
            onConfirmarRemover={() => confirmarRemover(mesa)}
          />
        ))
      )}
    </div>
  );
}

function CartaoMesa({
  mesa,
  editando,
  editCapacidade,
  editErro,
  salvandoEdicao,
  onEditar,
  onEditCapacidadeChange,
  onCancelarEdicao,
  onSalvarEdicao,
  confirmandoRemover,
  removendo,
  onPedirRemover,
  onCancelarRemover,
  onConfirmarRemover,
}) {
  return (
    <div className="mod-cartao">
      <div className="mod-cartao__topo">
        <span className="mod-cartao__titulo">Mesa {mesa.numero}</span>
        <span className="mod-badge mod-badge--info">
          <LuUsers aria-hidden="true" />
          {mesa.capacidade ?? 4} lugares
        </span>
      </div>

      {confirmandoRemover ? (
        <div className="cfg-mesas__confirmar">
          <p className="cfg-mesas__confirmarTexto">
            Remover a mesa {mesa.numero}? Esta ação não pode ser desfeita. Pedidos e vendas
            anteriores vinculados à mesa não serão afetados.
          </p>
          <div className="cfg-mesas__acoes">
            <button
              type="button"
              className="mod-botao mod-botao--fantasma"
              onClick={onCancelarRemover}
              disabled={removendo}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="mod-botao mod-botao--perigo"
              onClick={onConfirmarRemover}
              disabled={removendo}
            >
              {removendo ? "Removendo…" : "Sim, remover"}
            </button>
          </div>
        </div>
      ) : editando ? (
        <div className="cfg-mesas__edicao">
          <div className="cfg-campo">
            <span className="cfg-campo__rotulo">Lugares (pessoas)</span>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min="1"
              max="50"
              value={editCapacidade}
              onChange={(e) => onEditCapacidadeChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSalvarEdicao()}
              className="cfg-input"
              aria-label={`Lugares da mesa ${mesa.numero}`}
            />
          </div>
          <p className="cfg-mesas__ajuda">O número da mesa é fixo e não pode ser alterado.</p>
          {editErro ? (
            <p className="mod-erro" role="alert">
              {editErro}
            </p>
          ) : null}
          <div className="cfg-mesas__acoes">
            <button
              type="button"
              className="mod-botao mod-botao--fantasma"
              onClick={onCancelarEdicao}
              disabled={salvandoEdicao}
            >
              Cancelar
            </button>
            <button type="button" className="mod-botao mod-botao--primario" onClick={onSalvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="cfg-mesas__acoes">
          <button type="button" className="mod-botao mod-botao--fantasma" onClick={onEditar}>
            <LuPencil aria-hidden="true" />
            Editar
          </button>
          <button type="button" className="mod-botao mod-botao--fantasma" onClick={onPedirRemover}>
            <LuTrash2 aria-hidden="true" />
            Remover
          </button>
        </div>
      )}
    </div>
  );
}
