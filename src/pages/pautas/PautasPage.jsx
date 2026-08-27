import { useMemo, useState, useEffect } from "react";
import { LuPlus, LuLogOut, LuSearch, LuTriangleAlert, LuListChecks, LuRefreshCw } from "react-icons/lu";
import { usePautas } from "@/context/PautasContext";
import { STATUS_EM_ORDEM, rotuloStatus, filtrarPautas, agruparPorStatus } from "@/lib/pautas";
import PautaCard from "@/components/pautas/PautaCard";
import PautaForm from "@/components/pautas/PautaForm";
import "./PautasPage.css";

/**
 * Pautas da Kora — o quadro.
 *
 * Três colunas (Pendente, Em progresso, Finalizado) com o que foi estipulado
 * para os sócios programarem, e o estado de cada pauta mudável em um toque.
 *
 * Por que é intuitiva (Princípio nº1): o quadro mostra a situação de tudo de
 * uma vez, sem ninguém precisar filtrar para descobrir o que está parado — a
 * coluna É a situação, então o antigo filtro de situação sumiu (era um
 * controle a menos para entender). Mover uma pauta é tocar no P/E/F do card e
 * vê-lo pular de coluna na hora. Sobrou um eixo de filtro só, por pessoa, e a
 * busca — os dois valem para as três colunas ao mesmo tempo, então o que você
 * vê é sempre o quadro inteiro daquele recorte. A ação principal ("Nova
 * pauta") fica grudada no topo e nunca sai da vista. Os quatro estados têm
 * tratamento humano: carregando, vazio (convite a criar a primeira), erro
 * (aviso + "Tentar de novo") e sucesso (a pauta nova já aparece na coluna
 * dela). Coluna sem nada diz "Nada por aqui" em vez de ficar em branco.
 */
export default function PautasPage() {
  const {
    pessoaAtual, pessoas, pautas, carregandoLista, erro,
    sair, recarregar, criarPauta, atualizarPauta, mudarStatus,
  } = usePautas();

  const [filtroPessoa, setFiltroPessoa] = useState(null);
  const [busca,        setBusca]        = useState("");
  const [formAberto,   setFormAberto]   = useState(false);
  const [emEdicao,     setEmEdicao]     = useState(null);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Pautas da Kora";
  }, []);

  const visiveis = useMemo(
    () => filtrarPautas(pautas, { pessoa: filtroPessoa, busca }),
    [pautas, filtroPessoa, busca],
  );
  const colunas = useMemo(() => agruparPorStatus(visiveis), [visiveis]);

  const temFiltro = !!filtroPessoa || !!busca.trim();
  const limparFiltros = () => { setFiltroPessoa(null); setBusca(""); };

  const abrirNova    = () => { setEmEdicao(null); setFormAberto(true); };
  const abrirEdicao  = (pauta) => { setEmEdicao(pauta); setFormAberto(true); };
  const salvar = (dados) => (emEdicao ? atualizarPauta(emEdicao.id, dados) : criarPauta(dados));

  const mostrarQuadro = !erro && pautas.length > 0 && visiveis.length > 0;

  return (
    <div className="pautas">
      <header className="pautas__topo">
        <div className="pautas__topo-interno">
          <div className="pautas__marca">
            <span className="pautas__marca-icone" aria-hidden>K</span>
            <div className="pautas__marca-texto">
              <div className="pautas__marca-titulo">Pautas da Kora</div>
              <div className="pautas__marca-sub">
                {pessoaAtual ? `Olá, ${pessoaAtual.nome}` : "Acesso dos sócios"}
              </div>
            </div>
          </div>
          <div className="pautas__acoes-topo">
            <button type="button" className="pautas__nova" onClick={abrirNova}>
              <LuPlus size={17} aria-hidden /> Nova pauta
            </button>
            <button type="button" className="pautas__sair" onClick={sair} aria-label="Sair">
              <LuLogOut size={17} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="pautas__filtros">
        {pessoas.length > 0 && (
          <div className="pautas__chips" role="group" aria-label="Filtrar por pessoa">
            <button
              type="button"
              className={`pautas__chip${filtroPessoa === null ? " pautas__chip--ativo" : ""}`}
              aria-pressed={filtroPessoa === null}
              onClick={() => setFiltroPessoa(null)}
            >
              Todo mundo
            </button>
            {pessoas.map((p) => (
              <button
                key={p.slug}
                type="button"
                className={`pautas__chip${filtroPessoa === p.slug ? " pautas__chip--ativo" : ""}`}
                aria-pressed={filtroPessoa === p.slug}
                onClick={() => setFiltroPessoa(p.slug)}
              >
                {p.nome}
              </button>
            ))}
          </div>
        )}

        <div className="pautas__busca">
          <LuSearch size={16} aria-hidden className="pautas__busca-icone" />
          <input
            className="pautas__busca-input"
            type="search"
            value={busca}
            placeholder="Procurar na pauta"
            aria-label="Procurar por palavra na pauta"
            maxLength={80}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {erro && (
        <div className="pautas__erro" role="alert">
          <LuTriangleAlert size={16} aria-hidden />
          <span>{erro}</span>
          <button type="button" className="pautas__tentar" onClick={recarregar}>
            <LuRefreshCw size={14} aria-hidden /> Tentar de novo
          </button>
        </div>
      )}

      {carregandoLista && pautas.length === 0 && !erro && (
        <p className="pautas__aviso">Carregando as pautas…</p>
      )}

      {!carregandoLista && !erro && pautas.length === 0 && (
        <div className="pautas__vazio">
          <span className="pautas__vazio-icone" aria-hidden><LuListChecks size={26} /></span>
          <p className="pautas__vazio-titulo">Nenhuma pauta ainda</p>
          <p className="pautas__vazio-texto">
            Crie a primeira: diga o que é, para que serve e quem entra nessa.
          </p>
          <button type="button" className="pautas__nova" onClick={abrirNova}>
            <LuPlus size={17} aria-hidden /> Nova pauta
          </button>
        </div>
      )}

      {!erro && pautas.length > 0 && visiveis.length === 0 && (
        <div className="pautas__vazio">
          <span className="pautas__vazio-icone" aria-hidden><LuSearch size={26} /></span>
          <p className="pautas__vazio-titulo">Nada com esse filtro</p>
          <p className="pautas__vazio-texto">
            Nenhuma pauta combina com a pessoa ou a palavra que você escolheu.
          </p>
          {temFiltro && (
            <button type="button" className="pautas__limpar" onClick={limparFiltros}>
              Mostrar todas
            </button>
          )}
        </div>
      )}

      {mostrarQuadro && (
        <div className="pautas__quadro">
          {STATUS_EM_ORDEM.map((status) => {
            const daColuna = colunas[status];
            return (
              <section
                key={status}
                className={`pautas__coluna pautas__coluna--${status}`}
                aria-label={`${rotuloStatus(status)} (${daColuna.length})`}
              >
                <header className="pautas__coluna-topo">
                  <span className="pautas__coluna-ponto" aria-hidden />
                  <h2 className="pautas__coluna-titulo">{rotuloStatus(status)}</h2>
                  <span className="pautas__coluna-num">{daColuna.length}</span>
                </header>

                {daColuna.length === 0 ? (
                  <p className="pautas__coluna-vazia">Nada por aqui</p>
                ) : (
                  <div className="pautas__coluna-cards">
                    {daColuna.map((pauta) => (
                      <PautaCard
                        key={pauta.id}
                        pauta={pauta}
                        pessoas={pessoas}
                        onMudarStatus={mudarStatus}
                        onEditar={abrirEdicao}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {formAberto && (
        <PautaForm
          pauta={emEdicao}
          pessoas={pessoas}
          onSalvar={salvar}
          onFechar={() => { setFormAberto(false); setEmEdicao(null); }}
        />
      )}
    </div>
  );
}
