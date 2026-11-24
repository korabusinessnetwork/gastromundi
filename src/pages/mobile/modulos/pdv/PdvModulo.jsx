/**
 * PdvModulo — tela "PDV rápido" do hub Mais no /palm (mobile).
 *
 * Venda de balcão em 2 passos: (1) escolher os itens, (2) cobrar.
 * É o mesmo caixa do desktop, só que na mão: NÃO existe regra de venda
 * própria aqui. Tudo que envolve dinheiro é reuso do que já roda em
 * produção no PDV do computador:
 *   - persistência da venda ...... `useFinalizarPagamento()` (PDVView)
 *   - arredondamento ............. `round2` (@/lib/vendas)
 *   - meios de pagamento ......... `meiosPagamento` + `metodosCustom` do tenant
 *   - rótulo do método ........... `rotuloMetodo` (@/utils/pagamentos)
 *   - guarda de TEF offline ...... `metodoUsaTef` (@/lib/tef)
 *   - comprovante ................ `montarComprovantePagamento` + `imprimirDocumento`
 *
 * A venda de balcão não tem comanda. Para reusar a regra real sem
 * duplicá-la, montamos uma "comanda sintética" (`Balcão`) e chamamos o
 * hook com `semComanda: true` — nesse modo ele pula a remoção em
 * `pending`, que no balcão não existe (nem o alarme de cobrança dupla,
 * que ali seria falso).
 *
 * Decisão 018: nenhum estilo mora no JSX (ver PdvModulo.css).
 */
import {
  LuCircleAlert, LuCircleCheck, LuLock, LuMinus, LuPlus, LuPrinter, LuSearch, LuSearchX, LuShoppingCart, LuTrash, LuWifiOff
} from "react-icons/lu";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import Cabecalho from "./Cabecalho";
import { precoDoItem } from "./apoio";
import { usePdvCelular } from "@/features/pdv/hooks/usePdvCelular";
import "../modulos.css";
import "./PdvModulo.css";

export default function PdvModulo({ onVoltar }) {
  const tela = usePdvCelular({ onVoltar });
  const {
    passo, busca, setBusca, catAtiva, setCatAtiva, carrinho, metodo, setMetodo, recebido, setRecebido, salvando, erro, setErro, impressao, resumoVenda, caixaAberto, categorias, produtosFiltrados, qtdPorId, total, qtdTotal, adicionar, mudarQtd, metodos, bloqueadoOffline, ehFiado, metodoIndisponivel, ehDinheiro, troco, falta, podeConfirmar, vendaParaImpressao, irParaCobrar, voltarParaItens, novaVenda, confirmar, imprimir, rotuloImpressao,
  } = tela;

  // ── Guarda: caixa fechado ───────────────────────────────────────
  if (!caixaAberto) {
    return (
      <div className="mod-tela">
        <Cabecalho
          titulo="PDV rápido"
          subtitulo="Venda de balcão"
          onSair={onVoltar}
        />
        <div className="mod-vazio">
          <LuLock aria-hidden="true" />
          <p className="mod-vazio__titulo">Caixa fechado</p>
          <p className="mod-vazio__texto">
            Não dá para vender com o caixa fechado. Peça ao responsável para
            abrir o caixa no PDV do computador e volte aqui.
          </p>
        </div>
      </div>
    );
  }

  // ── Passo 3: venda concluída ────────────────────────────────────
  if (passo === "concluido" && resumoVenda) {
    return (
      <div className="mod-tela mod-tela--comRodape">
        <Cabecalho
          titulo="Venda concluída"
          subtitulo="PDV rápido · balcão"
          onSair={onVoltar}
        />

        <div className="pdv-modulo__sucesso">
          <LuCircleCheck className="pdv-modulo__sucessoIcone" aria-hidden="true" />
          <p className="pdv-modulo__sucessoTitulo">Pagamento registrado</p>
          <p className="pdv-modulo__sucessoValor">{fmtDinheiro(resumoVenda.total)}</p>
          <p className="pdv-modulo__sucessoSub">
            {resumoVenda.qtdTotal} {resumoVenda.qtdTotal === 1 ? "item" : "itens"} ·{" "}
            {resumoVenda.metodoLabel}
          </p>
        </div>

        {resumoVenda.troco > 0 ? (
          <div className="pdv-modulo__trocoDestaque">
            <span className="pdv-modulo__trocoDestaqueRotulo">Devolver de troco</span>
            <strong className="pdv-modulo__trocoDestaqueValor">
              {fmtDinheiro(resumoVenda.troco)}
            </strong>
          </div>
        ) : null}

        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={novaVenda}
          >
            <LuShoppingCart aria-hidden="true" />
            Nova venda
          </button>
          <button
            type="button"
            className="mod-botao mod-botao--fantasma mod-botao--bloco"
            onClick={() => imprimir(resumoVenda.venda ?? vendaParaImpressao())}
            disabled={impressao === "imprimindo"}
          >
            <LuPrinter aria-hidden="true" />
            {rotuloImpressao}
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 2: cobrar ─────────────────────────────────────────────
  if (passo === "cobrar") {
    return (
      <div className="mod-tela mod-tela--comRodape">
        <Cabecalho
          titulo="Cobrar"
          subtitulo="PDV rápido · balcão"
          onSair={voltarParaItens}
        />

        <div className="pdv-modulo__total">
          <span className="pdv-modulo__totalRotulo">Total a cobrar</span>
          <strong className="pdv-modulo__totalValor">{fmtDinheiro(total)}</strong>
          <span className="pdv-modulo__totalItens">
            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
          </span>
        </div>

        <section className="pdv-modulo__secao">
          <h2 className="pdv-modulo__secaoTitulo">Forma de pagamento</h2>
          <div className="pdv-modulo__metodos">
            {metodos.map(({ id, label, Icone }) => {
              const ativo = metodo === id;
              const indisponivel = metodoIndisponivel(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={
                    ativo
                      ? "pdv-modulo__metodo pdv-modulo__metodo--ativo"
                      : "pdv-modulo__metodo"
                  }
                  onClick={() => {
                    setMetodo(id);
                    setErro("");
                    if (id !== "dinheiro") setRecebido("");
                  }}
                  disabled={indisponivel}
                  aria-pressed={ativo}
                >
                  <Icone className="pdv-modulo__metodoIcone" aria-hidden="true" />
                  <span className="pdv-modulo__metodoLabel">{label}</span>
                  {bloqueadoOffline(id) ? (
                    <span className="pdv-modulo__metodoAviso">
                      <LuWifiOff aria-hidden="true" />
                      sem internet
                    </span>
                  ) : ehFiado(id) ? (
                    <span className="pdv-modulo__metodoAviso">
                      só no computador
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {ehDinheiro ? (
          <section className="pdv-modulo__secao">
            <div className="pdv-modulo__troco">
              <label className="pdv-modulo__trocoCampo">
                <span className="pdv-modulo__trocoRotulo">Recebido</span>
                <input
                  className="pdv-modulo__trocoInput"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={recebido}
                  onChange={(e) => setRecebido(e.target.value)}
                  aria-label="Valor recebido em dinheiro"
                />
              </label>
              <div className="pdv-modulo__trocoCampo pdv-modulo__trocoCampo--saida">
                <span className="pdv-modulo__trocoRotulo">Troco</span>
                <strong className="pdv-modulo__trocoValor">{fmtDinheiro(troco)}</strong>
              </div>
            </div>
            {falta > 0 ? (
              <p className="pdv-modulo__falta">
                <LuCircleAlert aria-hidden="true" />
                Faltam {fmtDinheiro(falta)} para fechar a conta.
              </p>
            ) : null}
          </section>
        ) : null}

        {erro ? <p className="mod-erro">{erro}</p> : null}
        {impressao === "erro" ? (
          <p className="mod-erro">
            Não deu para imprimir. Confira a impressora nas configurações.
          </p>
        ) : null}

        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={confirmar}
            disabled={!podeConfirmar}
          >
            {salvando ? "Registrando…" : "Confirmar pagamento"}
          </button>
          <button
            type="button"
            className="mod-botao mod-botao--fantasma mod-botao--bloco"
            onClick={() => imprimir(vendaParaImpressao())}
            disabled={!metodo || impressao === "imprimindo"}
          >
            <LuPrinter aria-hidden="true" />
            {rotuloImpressao}
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 1: itens ──────────────────────────────────────────────
  return (
    <div className={carrinho.length ? "mod-tela mod-tela--comRodape" : "mod-tela"}>
      <Cabecalho
        titulo="PDV rápido"
        subtitulo="Venda de balcão · sem comanda"
        onSair={onVoltar}
      />

      <div className="mod-busca">
        <LuSearch aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar produto…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar produto"
        />
      </div>

      <div className="mod-chips" role="tablist" aria-label="Categorias de produto">
        {categorias.map((cat) => {
          const ativa = cat === catAtiva;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={ativa ? "mod-chip mod-chip--ativo" : "mod-chip"}
              onClick={() => setCatAtiva(cat)}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {produtosFiltrados.length === 0 ? (
        <div className="mod-vazio">
          <LuSearchX aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhum produto encontrado</p>
          <p className="mod-vazio__texto">Tente outra busca ou categoria.</p>
        </div>
      ) : (
        <div className="pdv-modulo__grade">
          {produtosFiltrados.map((produto) => {
            const qtd = qtdPorId[produto.id] || 0;
            return (
              <button
                key={produto.id}
                type="button"
                className={
                  qtd > 0
                    ? "pdv-modulo__produto pdv-modulo__produto--ativo"
                    : "pdv-modulo__produto"
                }
                onClick={() => adicionar(produto)}
              >
                {qtd > 0 ? (
                  <span className="pdv-modulo__produtoBadge">{qtd}</span>
                ) : null}
                {produto.emoji ? (
                  <span className="pdv-modulo__produtoEmoji" aria-hidden="true">
                    {produto.emoji}
                  </span>
                ) : null}
                <span className="pdv-modulo__produtoNome">{produto.name}</span>
                <span className="pdv-modulo__produtoPreco">
                  {fmtDinheiro(produto.price)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {carrinho.length > 0 ? (
        <section className="pdv-modulo__secao">
          <h2 className="pdv-modulo__secaoTitulo">No carrinho</h2>
          <div className="mod-lista">
            {carrinho.map((item, index) => (
              <div key={item._key} className="pdv-modulo__item">
                <div className="pdv-modulo__itemTextos">
                  <span className="pdv-modulo__itemNome">{item.name}</span>
                  <span className="pdv-modulo__itemPreco">
                    {fmtDinheiro(precoDoItem(item))}
                  </span>
                </div>
                <div className="pdv-modulo__stepper">
                  <button
                    type="button"
                    className="pdv-modulo__stepperBotao"
                    onClick={() => mudarQtd(index, item.qty - 1)}
                    aria-label={
                      item.qty <= 1 ? `Remover ${item.name}` : `Menos ${item.name}`
                    }
                  >
                    {item.qty <= 1 ? (
                      <LuTrash aria-hidden="true" />
                    ) : (
                      <LuMinus aria-hidden="true" />
                    )}
                  </button>
                  <span className="pdv-modulo__stepperQtd">{item.qty}</span>
                  <button
                    type="button"
                    className="pdv-modulo__stepperBotao"
                    onClick={() => mudarQtd(index, item.qty + 1)}
                    aria-label={`Mais ${item.name}`}
                  >
                    <LuPlus aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {carrinho.length > 0 ? (
        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={irParaCobrar}
          >
            Cobrar {fmtDinheiro(total)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
