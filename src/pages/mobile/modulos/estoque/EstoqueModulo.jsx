import { useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuSearch,
  LuPackageSearch,
  LuClipboardList,
  LuTriangleAlert,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleX,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { labelEstoque, fmtQtd } from "@/utils/conversaoUnidades";
import "../modulos.css";
import "./EstoqueModulo.css";

const MINIMO_FALLBACK = 10; // mesmo fallback usado em EstoqueView (src/lib/estoque.js)

/**
 * EstoqueModulo — tela "Estoque" do hub mobile (Palm).
 *
 * Dados: mesma fonte que a view desktop (src/components/desktop/views/EstoqueView.jsx) —
 * `products` (nome, categoria, unidade_estoque, codigo_barras) + `estoque`
 * (produto_id → quantidade) + `estoqueMinimos` (produto_id → minimo), todos
 * já carregados pelo AppContext (bootstrap com `select` de campos específicos,
 * nunca `select *`).
 *
 * Contagem: escreve o ajuste chamando `updateEstoque(productId, novaQtd)` do
 * AppContext — o MESMO caminho que a view desktop usa (handleDireto/
 * handleAdicionar em EstoqueView chamam essa função). Nenhuma RPC nova foi
 * inventada.
 */

function situacaoDoItem(quantidade, minimo) {
  if (quantidade === 0) return "ruptura";
  if (quantidade <= minimo) return "baixo";
  return "ok";
}

const PRIORIDADE = { ruptura: 0, baixo: 1, ok: 2 };

function parseContagem(valor) {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = parseFloat(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function EstoqueModulo({ onVoltar }) {
  const { products, estoque, estoqueMinimos, updateEstoque, loading } = useApp();

  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState("lista"); // "lista" | "contagem" | "revisao"
  const [contagemValores, setContagemValores] = useState({}); // { [produtoId]: string digitado }
  const [salvando, setSalvando] = useState(false);
  const [erroGravacao, setErroGravacao] = useState(null);
  const [sucesso, setSucesso] = useState(null); // { qtd: number } | null

  // Lista completa (sem filtro de busca) — base para os números do cabeçalho
  // e para a ordenação "alerta primeiro".
  const itensBase = useMemo(() => {
    return products
      .map((p) => {
        const quantidade = estoque[p.id] ?? 0;
        const minimo = estoqueMinimos[p.id] ?? MINIMO_FALLBACK;
        return {
          id: p.id,
          nome: p.name,
          sku: p.codigo_barras || null,
          quantidade,
          minimo,
          unidade: labelEstoque(p),
          situacao: situacaoDoItem(quantidade, minimo),
        };
      })
      .sort((a, b) => {
        const dif = PRIORIDADE[a.situacao] - PRIORIDADE[b.situacao];
        if (dif !== 0) return dif;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [products, estoque, estoqueMinimos]);

  const totalItens = itensBase.length;
  const alertasCount = itensBase.filter((i) => i.situacao !== "ok").length;

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return itensBase;
    return itensBase.filter(
      (i) =>
        i.nome.toLowerCase().includes(termo) ||
        (i.sku && i.sku.toLowerCase().includes(termo)),
    );
  }, [itensBase, busca]);

  // ── Contagem ──────────────────────────────────────────────────
  const setValorContado = (id, valor) =>
    setContagemValores((prev) => ({ ...prev, [id]: valor }));

  const diffs = useMemo(() => {
    return itensBase
      .map((item) => {
        const digitado = parseContagem(contagemValores[item.id]);
        if (digitado === null) return null;
        const novaQtd = Math.max(0, digitado);
        const diferenca = novaQtd - item.quantidade;
        if (diferenca === 0) return null;
        return { ...item, novaQtd, diferenca };
      })
      .filter(Boolean);
  }, [itensBase, contagemValores]);

  const iniciarContagem = () => {
    setSucesso(null);
    setErroGravacao(null);
    setContagemValores({});
    setModo("contagem");
  };

  const cancelarContagem = () => {
    setContagemValores({});
    setErroGravacao(null);
    setModo("lista");
  };

  const irParaRevisao = () => {
    if (diffs.length === 0) return;
    setModo("revisao");
  };

  const voltarParaContagem = () => setModo("contagem");

  const confirmarGravacao = async () => {
    if (salvando || diffs.length === 0) return;
    setSalvando(true);
    setErroGravacao(null);

    const falhas = [];
    for (const item of diffs) {
      const { error } = await updateEstoque(item.id, item.novaQtd);
      if (error) falhas.push(item);
    }

    setSalvando(false);

    if (falhas.length === 0) {
      setSucesso({ qtd: diffs.length });
      setContagemValores({});
      setModo("lista");
      return;
    }

    // Mantém na revisão só os itens que falharam, para tentar de novo.
    const idsFalha = new Set(falhas.map((f) => f.id));
    setContagemValores((prev) => {
      const proximo = {};
      for (const id of Object.keys(prev)) {
        if (idsFalha.has(Number(id)) || idsFalha.has(id)) proximo[id] = prev[id];
      }
      return proximo;
    });
    setErroGravacao(
      `Não foi possível gravar ${falhas.length} ${falhas.length === 1 ? "item" : "itens"}: ${falhas
        .map((f) => f.nome)
        .join(", ")}. Confira a conexão e tente de novo.`,
    );
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className={`mod-tela mod-tela--comRodape estoque-modulo`}>
      <div className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Estoque</h1>
          <p className="mod-header__subtitulo">
            {totalItens} {totalItens === 1 ? "item" : "itens"} · {alertasCount}{" "}
            {alertasCount === 1 ? "alerta" : "alertas"}
          </p>
        </div>
        <button
          type="button"
          className="mod-header__voltar"
          onClick={onVoltar}
          aria-label="Voltar"
        >
          <LuArrowLeft aria-hidden="true" />
        </button>
      </div>

      {modo !== "revisao" && (
        <label className="mod-busca">
          <LuSearch aria-hidden="true" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar item ou SKU…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      )}

      {sucesso && (
        <div className="estoque-modulo__sucesso">
          <LuCircleCheck aria-hidden="true" />
          <span>
            Contagem gravada: {sucesso.qtd}{" "}
            {sucesso.qtd === 1 ? "item ajustado" : "itens ajustados"}.
          </span>
        </div>
      )}

      {erroGravacao && (
        <div className="estoque-modulo__erro">
          <LuTriangleAlert aria-hidden="true" />
          <span>{erroGravacao}</span>
        </div>
      )}

      {loading ? (
        <div className="mod-carregando">Carregando estoque…</div>
      ) : modo === "revisao" ? (
        <RevisaoLista diffs={diffs} />
      ) : itensFiltrados.length === 0 ? (
        <div className="mod-vazio">
          <LuPackageSearch aria-hidden="true" />
          <div className="mod-vazio__titulo">Nenhum item encontrado</div>
          <div className="mod-vazio__texto">
            Tente buscar por outro nome ou pelo código do item.
          </div>
        </div>
      ) : (
        <div className="mod-lista">
          {itensFiltrados.map((item) => (
            <CartaoItem
              key={item.id}
              item={item}
              contagemAtiva={modo === "contagem"}
              valor={contagemValores[item.id] ?? ""}
              onValor={(v) => setValorContado(item.id, v)}
            />
          ))}
        </div>
      )}

      <div className="mod-rodape">
        {modo === "lista" && (
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={iniciarContagem}
          >
            <LuClipboardList aria-hidden="true" />
            Iniciar contagem
          </button>
        )}

        {modo === "contagem" && (
          <div className="estoque-modulo__botoes">
            <button
              type="button"
              className="mod-botao mod-botao--fantasma"
              onClick={cancelarContagem}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="mod-botao mod-botao--primario"
              onClick={irParaRevisao}
              disabled={diffs.length === 0}
            >
              Revisar ajustes {diffs.length > 0 ? `(${diffs.length})` : ""}
            </button>
          </div>
        )}

        {modo === "revisao" && (
          <div className="estoque-modulo__botoes">
            <button
              type="button"
              className="mod-botao mod-botao--fantasma"
              onClick={voltarParaContagem}
              disabled={salvando}
            >
              Voltar
            </button>
            <button
              type="button"
              className="mod-botao mod-botao--ok"
              onClick={confirmarGravacao}
              disabled={salvando || diffs.length === 0}
            >
              <LuCircleCheck aria-hidden="true" />
              {salvando ? "Gravando…" : `Confirmar e gravar (${diffs.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ situacao }) {
  if (situacao === "ruptura") {
    return (
      <span className="mod-badge mod-badge--erro">
        <LuCircleX aria-hidden="true" /> Ruptura
      </span>
    );
  }
  if (situacao === "baixo") {
    return (
      <span className="mod-badge mod-badge--warn">
        <LuCircleAlert aria-hidden="true" /> Baixo
      </span>
    );
  }
  return (
    <span className="mod-badge mod-badge--ok">
      <LuCircleCheck aria-hidden="true" /> Ok
    </span>
  );
}

function CartaoItem({ item, contagemAtiva, valor, onValor }) {
  const corClasse =
    item.situacao === "ruptura"
      ? "estoque-modulo__qtd--erro"
      : item.situacao === "baixo"
        ? "estoque-modulo__qtd--warn"
        : "";

  const cartaoClasse =
    item.situacao === "ruptura"
      ? "mod-cartao mod-cartao--red"
      : item.situacao === "baixo"
        ? "mod-cartao mod-cartao--warn"
        : "mod-cartao";

  const digitado = parseContagem(valor);
  const diferenca = digitado === null ? null : Math.max(0, digitado) - item.quantidade;

  return (
    <div className={cartaoClasse}>
      <div className="estoque-modulo__linha">
        <div className="estoque-modulo__col estoque-modulo__col--esq">
          <div className="mod-cartao__titulo">{item.nome}</div>
          {item.sku && <div className="estoque-modulo__sku">SKU {item.sku}</div>}
        </div>

        <div className="estoque-modulo__col estoque-modulo__col--dir">
          {!contagemAtiva ? (
            <>
              <div className={`estoque-modulo__qtd ${corClasse}`}>
                {fmtQtd(item.quantidade)} {item.unidade}
              </div>
              <Badge situacao={item.situacao} />
            </>
          ) : (
            <>
              <div className="estoque-modulo__atual">
                atual: {fmtQtd(item.quantidade)} {item.unidade}
              </div>
              <div className="estoque-modulo__input-wrap">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={fmtQtd(item.quantidade)}
                  value={valor}
                  onChange={(e) => onValor(e.target.value)}
                  className="estoque-modulo__input"
                  aria-label={`Quantidade contada de ${item.nome}`}
                />
                <span className="estoque-modulo__unidade">{item.unidade}</span>
              </div>
              {diferenca !== null && diferenca !== 0 && (
                <div
                  className={
                    diferenca > 0
                      ? "estoque-modulo__diff estoque-modulo__diff--pos"
                      : "estoque-modulo__diff estoque-modulo__diff--neg"
                  }
                >
                  {diferenca > 0 ? "+" : ""}
                  {fmtQtd(diferenca)} {item.unidade}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RevisaoLista({ diffs }) {
  if (diffs.length === 0) {
    return (
      <div className="mod-vazio">
        <LuClipboardList aria-hidden="true" />
        <div className="mod-vazio__titulo">Nenhum ajuste para gravar</div>
        <div className="mod-vazio__texto">
          Volte e digite a quantidade contada de pelo menos um item.
        </div>
      </div>
    );
  }

  return (
    <div className="mod-lista">
      <p className="estoque-modulo__revisaoAjuda">
        Confira antes de gravar — só os itens com diferença aparecem aqui.
      </p>
      {diffs.map((item) => (
        <div key={item.id} className="mod-cartao">
          <div className="mod-cartao__titulo">{item.nome}</div>
          <div className="mod-linha">
            <span>Estoque atual</span>
            <strong>
              {fmtQtd(item.quantidade)} {item.unidade}
            </strong>
          </div>
          <div className="mod-linha">
            <span>Contado</span>
            <strong>
              {fmtQtd(item.novaQtd)} {item.unidade}
            </strong>
          </div>
          <div className="mod-linha">
            <span>Diferença</span>
            <strong
              className={
                item.diferenca > 0
                  ? "estoque-modulo__diff--pos"
                  : "estoque-modulo__diff--neg"
              }
            >
              {item.diferenca > 0 ? "+" : ""}
              {fmtQtd(item.diferenca)} {item.unidade}
            </strong>
          </div>
        </div>
      ))}
    </div>
  );
}
