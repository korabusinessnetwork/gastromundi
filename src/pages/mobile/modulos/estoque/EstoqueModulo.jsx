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
  LuMinus,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { labelEstoque, fmtQtd } from "@/utils/conversaoUnidades";
import { normalizarTexto } from "@/lib/importacao/planilha";
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

/**
 * Produto sem linha na tabela `estoque` é produto que NÃO controla estoque — a
 * mesma leitura que o Jarvas faz (`src/lib/jarvasEngine.js`) e que a view
 * desktop faz (`controlaEstoque` em EstoqueView). Tratar a ausência como saldo 0
 * fazia o Palm marcar cada prato do cardápio como ruptura: o cabeçalho anunciava
 * dezenas de alertas, a lista abria vermelha de ponta a ponta e o insumo que
 * acabou de verdade ficava perdido no meio.
 */
export function controlaEstoque(estoque, produtoId) {
  return (estoque?.[produtoId] ?? null) !== null;
}

function situacaoDoItem(quantidade, minimo, controlado = true) {
  if (!controlado) return "nao_controla";
  if (quantidade === 0) return "ruptura";
  if (quantidade <= minimo) return "baixo";
  return "ok";
}

// Quem não controla estoque desce para o fim da lista: não é problema para
// resolver hoje, mas continua contável (contar cria a linha de estoque).
const PRIORIDADE = { ruptura: 0, baixo: 1, ok: 2, nao_controla: 3 };

/** Alerta primeiro; dentro do mesmo grupo, ordem alfabética. */
const compararItens = (a, b) => {
  const dif = PRIORIDADE[a.situacao] - PRIORIDADE[b.situacao];
  if (dif !== 0) return dif;
  return a.nome.localeCompare(b.nome, "pt-BR");
};

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
  /**
   * Foto do saldo do sistema no instante em que a contagem começou:
   * `{ [produtoId]: { quantidade, controlado } }`, ou null fora da contagem.
   *
   * Uma contagem física é uma foto — é o que a prateleira tinha na hora em que
   * o operador contou. Antes a diferença era calculada contra o saldo AO VIVO,
   * e um pedido lançado no meio da contagem chegava pelo realtime e mexia no
   * que o operador já tinha revisado: a diferença de "-2" virava "+1" sozinha e
   * a lista se reordenava debaixo do dedo dele. No pior caso a diferença batia
   * exatamente em 0, o item saía da lista de ajustes sem avisar e a tela dizia
   * "Contagem gravada" sem ter gravado aquele item.
   */
  const [fotoSaldo, setFotoSaldo] = useState(null);

  // Lista completa (sem filtro de busca) — base para os números do cabeçalho
  // e para a ordenação "alerta primeiro".
  const itensBase = useMemo(() => {
    return products
      .map((p) => {
        const controlado = controlaEstoque(estoque, p.id);
        const quantidade = estoque[p.id] ?? 0;
        const minimo = estoqueMinimos[p.id] ?? MINIMO_FALLBACK;
        return {
          id: p.id,
          nome: p.name,
          sku: p.codigo_barras || null,
          quantidade,
          controlado,
          minimo,
          unidade: labelEstoque(p),
          situacao: situacaoDoItem(quantidade, minimo, controlado),
        };
      })
      .sort(compararItens);
  }, [products, estoque, estoqueMinimos]);

  const totalItens = itensBase.length;
  // Só é alerta o que precisa de compra. "Não controla estoque" não entra:
  // antes cada prato do cardápio contava um alerta e o número no cabeçalho não
  // servia para nada.
  const alertasCount = itensBase.filter(
    (i) => i.situacao === "ruptura" || i.situacao === "baixo",
  ).length;

  // A lista que o operador tem na mão durante a contagem. Enquanto conta, ela é
  // a FOTO do saldo tirada no início — ver `fotoSaldo`. Fora da contagem é a
  // lista ao vivo.
  const itensContagem = useMemo(() => {
    if (!fotoSaldo) return itensBase;
    return itensBase
      .map((item) => {
        const foto = fotoSaldo[item.id];
        if (!foto) return item; // produto cadastrado depois que a contagem começou
        return {
          ...item,
          quantidade: foto.quantidade,
          controlado: foto.controlado,
          situacao: situacaoDoItem(foto.quantidade, item.minimo, foto.controlado),
        };
      })
      .sort(compararItens);
  }, [itensBase, fotoSaldo]);

  const itensFiltrados = useMemo(() => {
    // Busca sem acento: quem digita "acai" no teclado do celular tem de achar
    // "Açaí". Antes o filtro só baixava a caixa das letras e não achava nada.
    const termo = normalizarTexto(busca);
    if (!termo) return itensContagem;
    return itensContagem.filter(
      (i) =>
        normalizarTexto(i.nome).includes(termo) ||
        (i.sku && normalizarTexto(i.sku).includes(termo)),
    );
  }, [itensContagem, busca]);

  // ── Contagem ──────────────────────────────────────────────────
  const setValorContado = (id, valor) =>
    setContagemValores((prev) => ({ ...prev, [id]: valor }));

  const diffs = useMemo(() => {
    return itensContagem
      .map((item) => {
        const digitado = parseContagem(contagemValores[item.id]);
        if (digitado === null) return null;
        const novaQtd = Math.max(0, digitado);
        const diferenca = novaQtd - item.quantidade;
        if (diferenca === 0) return null;
        return { ...item, novaQtd, diferenca };
      })
      .filter(Boolean);
  }, [itensContagem, contagemValores]);

  const iniciarContagem = () => {
    setSucesso(null);
    setErroGravacao(null);
    setContagemValores({});
    const foto = {};
    for (const item of itensBase) {
      foto[item.id] = { quantidade: item.quantidade, controlado: item.controlado };
    }
    setFotoSaldo(foto);
    setModo("contagem");
  };

  const cancelarContagem = () => {
    setContagemValores({});
    setErroGravacao(null);
    setFotoSaldo(null);
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
      setFotoSaldo(null);
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
  if (situacao === "nao_controla") {
    return (
      <span className="mod-badge mod-badge--neutro">
        <LuMinus aria-hidden="true" /> Não controla
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
                {item.controlado ? `${fmtQtd(item.quantidade)} ${item.unidade}` : "—"}
              </div>
              <Badge situacao={item.situacao} />
            </>
          ) : (
            <>
              <div className="estoque-modulo__atual">
                atual: {item.controlado ? `${fmtQtd(item.quantidade)} ${item.unidade}` : "—"}
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
              {/* Sem saldo anterior não existe diferença para mostrar: o que
                  acontece é o produto passar a controlar estoque. */}
              {!item.controlado
                ? digitado !== null &&
                  digitado > 0 && (
                    <div className="estoque-modulo__diff">passa a controlar</div>
                  )
                : diferenca !== null &&
                  diferenca !== 0 && (
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
              {item.controlado ? `${fmtQtd(item.quantidade)} ${item.unidade}` : "—"}
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
            {item.controlado ? (
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
            ) : (
              <strong>passa a controlar estoque</strong>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
