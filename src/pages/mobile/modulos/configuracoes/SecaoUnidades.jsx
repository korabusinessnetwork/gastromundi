import { useCallback, useEffect, useMemo, useState } from "react";
import { LuPlus, LuRuler, LuX } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import "./SecaoUnidades.css";

/**
 * SecaoUnidades — aba "Unidades de Medida" das Configurações, versão Palm.
 *
 * Espelha `UnidadesMedidaTab` do desktop (src/components/desktop/views/
 * ConfiguracoesView.jsx, ~linha 948): mesmas 3 categorias de unidade
 * (estoque/compra/consumo), mesmo formulário de adição (abreviação + nome)
 * e mesma checagem de quantos produtos usam a unidade antes de excluir.
 *
 * Diferenças propositais para o celular (não são bug, são adaptação):
 * - Os 3 tipos viram chips de filtro (`.mod-chips`) em vez de 3 blocos
 *   empilhados: no desktop cabe ver estoque/compra/consumo ao mesmo tempo
 *   numa tela larga; no celular, empilhar os três com suas listas e
 *   formulários juntos vira rolagem enorme. Um chip por vez mantém a tela
 *   curta e o próximo toque óbvio (princípio nº 1 — fluxo mais visível).
 * - A confirmação de exclusão é INLINE dentro do próprio cartão (padrão
 *   `confirmandoCancelarId` do DeliveryModulo), não um modal em portal:
 *   no celular um overlay central compete com o teclado e a barra de
 *   navegação; a confirmação junto do item que está sendo excluído deixa
 *   claro o que vai sumir sem tirar o usuário do lugar onde tocou.
 * - Só existe um formulário de adição por vez (o do tipo selecionado no
 *   chip), não um por bloco — menos campos na tela, ação óbvia.
 *
 * Contrato: tela SEM header próprio (o hub de Configurações desenha título
 * e voltar) e SEM import de modulos.css/CSS do hub — já carregados por quem
 * monta esta seção.
 */

const TIPOS_UNIDADE = [
  { tipo: "estoque", label: "Estoque" },
  { tipo: "compra", label: "Compra" },
  { tipo: "consumo", label: "Consumo" },
];

const ROTULO_TIPO = { estoque: "unidade de estoque", compra: "unidade de compra", consumo: "unidade de consumo" };

const EMPTY_ADD = { abbr: "", nome: "" };

export default function SecaoUnidades() {
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);

  const [filtroTipo, setFiltroTipo] = useState("estoque");
  const [form, setForm] = useState(EMPTY_ADD);
  const [salvando, setSalvando] = useState(false);
  const [erroAdicionar, setErroAdicionar] = useState(null);

  // Confirmação de exclusão de UMA unidade por vez, inline no cartão dela:
  // { id, nome, abbr, calculando, afetados, erroContagem } | null
  const [confirmacao, setConfirmacao] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const [mensagem, setMensagem] = useState(null); // { tipo: "ok" | "erro", texto }

  const carregar = useCallback(async () => {
    setLoading(true);
    setErroCarga(null);
    const { data, error } = await supabase
      .from("unidades_medida")
      .select("id, abreviacao, nome, tipo, ordem")
      .order("ordem")
      .order("nome");
    if (error) {
      setErroCarga("Não foi possível carregar as unidades de medida.");
      setLoading(false);
      return;
    }
    setUnidades(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const contagemPorTipo = useMemo(() => {
    const mapa = { estoque: 0, compra: 0, consumo: 0 };
    for (const u of unidades) {
      if (mapa[u.tipo] !== undefined) mapa[u.tipo] += 1;
    }
    return mapa;
  }, [unidades]);

  const listaFiltrada = useMemo(
    () => unidades.filter((u) => u.tipo === filtroTipo),
    [unidades, filtroTipo],
  );

  const selecionarTipo = (tipo) => {
    setFiltroTipo(tipo);
    setForm(EMPTY_ADD);
    setErroAdicionar(null);
    if (!removendo) setConfirmacao(null);
  };

  // ── Adicionar ─────────────────────────────────────────────────────
  const adicionar = async () => {
    const abbr = form.abbr.trim();
    const nome = form.nome.trim();
    if (!abbr || !nome || salvando) return;
    setSalvando(true);
    setErroAdicionar(null);
    const { data, error } = await supabase
      .from("unidades_medida")
      .insert({ abreviacao: abbr, nome, tipo: filtroTipo, ordem: 99 })
      .select("id, abreviacao, nome, tipo, ordem")
      .single();
    setSalvando(false);
    if (error || !data) {
      setErroAdicionar("Não foi possível adicionar essa unidade. Confira a conexão e tente de novo.");
      return;
    }
    setUnidades((prev) => [...prev, data]);
    setForm(EMPTY_ADD);
    setMensagem({ tipo: "ok", texto: `"${nome}" adicionada.` });
  };

  // ── Remover (com checagem de uso antes de confirmar) ────────────────
  const iniciarRemover = async (unidade) => {
    setMensagem(null);
    setConfirmacao({
      id: unidade.id,
      nome: unidade.nome,
      abbr: unidade.abreviacao,
      calculando: true,
      afetados: null,
      erroContagem: false,
    });

    const { data: produtos, error } = await supabase
      .from("products")
      .select("id, unidade_estoque, unidade_consumo, unidades_compra");

    if (error) {
      setConfirmacao((prev) =>
        prev && prev.id === unidade.id ? { ...prev, calculando: false, erroContagem: true } : prev,
      );
      return;
    }

    const afetados = (produtos || []).filter(
      (p) =>
        p.unidade_estoque === unidade.abreviacao ||
        p.unidade_consumo === unidade.abreviacao ||
        (Array.isArray(p.unidades_compra) && p.unidades_compra.some((c) => c.unidade === unidade.abreviacao)),
    ).length;

    setConfirmacao((prev) => (prev && prev.id === unidade.id ? { ...prev, calculando: false, afetados } : prev));
  };

  const cancelarRemocao = () => {
    if (removendo) return;
    setConfirmacao(null);
  };

  const confirmarRemover = async () => {
    if (!confirmacao || confirmacao.calculando || removendo) return;
    const { id, abbr, nome } = confirmacao;
    setRemovendo(true);
    setMensagem(null);

    // Mesmos 4 passos do desktop: desvincula a unidade dos produtos que a
    // usam (estoque, consumo, compra) antes de excluir o cadastro dela.
    const { error: erroEstoque } = await supabase
      .from("products")
      .update({ unidade_estoque: "" })
      .eq("unidade_estoque", abbr);

    const { error: erroConsumo } = await supabase
      .from("products")
      .update({ unidade_consumo: null })
      .eq("unidade_consumo", abbr);

    const { data: comCompra, error: erroBusca } = await supabase
      .from("products")
      .select("id, unidades_compra")
      .not("unidades_compra", "eq", "[]");

    let erroCompra = null;
    if (!erroBusca) {
      const afetadosCompra = (comCompra || []).filter(
        (p) => Array.isArray(p.unidades_compra) && p.unidades_compra.some((c) => c.unidade === abbr),
      );
      for (const p of afetadosCompra) {
        const { error } = await supabase
          .from("products")
          .update({ unidades_compra: p.unidades_compra.filter((c) => c.unidade !== abbr) })
          .eq("id", p.id);
        if (error) erroCompra = error;
      }
    }

    const { error: erroExcluir } = await supabase.from("unidades_medida").delete().eq("id", id);

    setRemovendo(false);

    if (erroEstoque || erroConsumo || erroBusca || erroCompra || erroExcluir) {
      setMensagem({ tipo: "erro", texto: "Não foi possível concluir a exclusão. Confira a conexão e tente de novo." });
      return;
    }

    setUnidades((prev) => prev.filter((u) => u.id !== id));
    setConfirmacao(null);
    setMensagem({ tipo: "ok", texto: `"${nome}" removida.` });
  };

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mod-lista">
        <p className="mod-carregando">Carregando unidades de medida…</p>
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="mod-lista">
        <p className="mod-erro" role="alert">
          {erroCarga}
        </p>
        <button type="button" className="mod-botao mod-botao--fantasma" onClick={carregar}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="mod-lista">
      <div className="mod-chips" role="tablist" aria-label="Tipo de unidade">
        {TIPOS_UNIDADE.map((t) => (
          <button
            key={t.tipo}
            type="button"
            role="tab"
            aria-selected={filtroTipo === t.tipo}
            className={`mod-chip${filtroTipo === t.tipo ? " mod-chip--ativo" : ""}`}
            onClick={() => selecionarTipo(t.tipo)}
          >
            {t.label}
            <span className="mod-chip__contador">{contagemPorTipo[t.tipo] ?? 0}</span>
          </button>
        ))}
      </div>

      {mensagem && (
        <p
          className={mensagem.tipo === "erro" ? "mod-erro" : "cfg-ok"}
          role={mensagem.tipo === "erro" ? "alert" : "status"}
        >
          {mensagem.texto}
        </p>
      )}

      {!isAdmin && (
        <p className="cfg-nota">
          Você está em modo leitura: só administrador ou gerente podem adicionar ou remover unidades de medida.
        </p>
      )}

      {listaFiltrada.length === 0 ? (
        <div className="mod-vazio">
          <LuRuler aria-hidden="true" />
          <div className="mod-vazio__titulo">Nenhuma unidade cadastrada</div>
          <div className="mod-vazio__texto">
            {isAdmin
              ? "Use o formulário abaixo para cadastrar a primeira."
              : "Peça para um administrador ou gerente cadastrar."}
          </div>
        </div>
      ) : (
        listaFiltrada.map((u) => (
          <CartaoUnidade
            key={u.id}
            unidade={u}
            isAdmin={isAdmin}
            confirmacao={confirmacao?.id === u.id ? confirmacao : null}
            removendo={removendo}
            onRemover={() => iniciarRemover(u)}
            onCancelarRemover={cancelarRemocao}
            onConfirmarRemover={confirmarRemover}
          />
        ))
      )}

      {isAdmin && (
        <div className="mod-cartao">
          <div className="mod-cartao__titulo">Nova {ROTULO_TIPO[filtroTipo]}</div>
          <div className="cfg-unidades__addCampos">
            <input
              type="text"
              value={form.abbr}
              onChange={(e) => setForm((f) => ({ ...f, abbr: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Abrev. (ex: kg)"
              maxLength={10}
              aria-label="Abreviação da unidade"
              className="cfg-input cfg-unidades__inputAbbr"
            />
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Nome completo (ex: Quilograma)"
              maxLength={40}
              aria-label="Nome da unidade"
              className="cfg-input cfg-unidades__inputNome"
            />
          </div>
          {erroAdicionar && (
            <p className="mod-erro" role="alert">
              {erroAdicionar}
            </p>
          )}
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={adicionar}
            disabled={!form.abbr.trim() || !form.nome.trim() || salvando}
          >
            <LuPlus aria-hidden="true" />
            {salvando ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      )}
    </div>
  );
}

function CartaoUnidade({ unidade, isAdmin, confirmacao, removendo, onRemover, onCancelarRemover, onConfirmarRemover }) {
  if (confirmacao) {
    return (
      <div className="mod-cartao mod-cartao--warn">
        <div className="mod-cartao__titulo">
          Excluir "{confirmacao.nome}" ({confirmacao.abbr})?
        </div>
        {confirmacao.calculando ? (
          <p className="mod-cartao__sub">Verificando produtos que usam esta unidade…</p>
        ) : confirmacao.erroContagem ? (
          <p className="mod-erro" role="alert">
            Não foi possível verificar o uso desta unidade. Tente de novo.
          </p>
        ) : confirmacao.afetados > 0 ? (
          <p className="cfg-unidades__aviso">
            {confirmacao.afetados} {confirmacao.afetados === 1 ? "produto ficará" : "produtos ficarão"} sem essa
            unidade configurada depois da exclusão.
          </p>
        ) : (
          <p className="mod-cartao__sub">Nenhum produto utiliza essa unidade.</p>
        )}
        <div className="cfg-unidades__confirmBotoes">
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
            disabled={removendo || confirmacao.calculando || confirmacao.erroContagem}
          >
            {removendo ? "Excluindo…" : "Sim, excluir"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mod-cartao">
      <div className="mod-cartao__topo">
        <div className="cfg-unidades__info">
          <span className="cfg-unidades__abbr">{unidade.abreviacao}</span>
          <span className="mod-cartao__titulo">{unidade.nome}</span>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="cfg-unidades__btnRemover"
            onClick={onRemover}
            aria-label={`Remover unidade ${unidade.nome}`}
          >
            <LuX aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
