import { useMemo, useState, useEffect } from "react";
import { LuPlus, LuLogOut, LuSearch, LuTriangleAlert, LuListChecks, LuRefreshCw } from "react-icons/lu";
import { usePautas } from "@/context/PautasContext";
import { STATUS_EM_ORDEM, rotuloStatus, filtrarPautas, contarPorStatus } from "@/lib/pautas";
import PautaCard from "@/components/pautas/PautaCard";
import PautaForm from "@/components/pautas/PautaForm";
import "./PautasPage.css";

/**
 * Pautas da Kora — a tela.
 *
 * Lista o que foi estipulado para os sócios programarem, com o estado de
 * cada pauta sempre à vista e mudável em um toque.
 *
 * Por que é intuitiva (Princípio nº1): uma coisa só na tela — a lista — e
 * uma única ação principal, sempre visível no topo ("Nova pauta"). Os
 * filtros são botões com o número do que existe atrás deles, então dá para
 * ver o que tem antes de clicar. Os quatro estados têm tratamento humano:
 * carregando ("Carregando as pautas…"), vazio (convite a criar a primeira),
 * erro (aviso + "Tentar de novo") e sucesso (a pauta nova já aparece no
 * topo da lista). Nada de jargão — "Para quê", "Quem entra nessa".
 */
export default function PautasPage() {
  const {
    pessoaAtual, pessoas, pautas, carregandoLista, erro,
    sair, recarregar, criarPauta, atualizarPauta, mudarStatus,
  } = usePautas();

  const [filtroStatus, setFiltroStatus] = useState(null);
  const [filtroPessoa, setFiltroPessoa] = useState(null);
  const [busca,        setBusca]        = useState("");
  const [formAberto,   setFormAberto]   = useState(false);
  const [emEdicao,     setEmEdicao]     = useState(null);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Pautas da Kora";
  }, []);

  const contagem = useMemo(() => contarPorStatus(pautas), [pautas]);
  const visiveis = useMemo(
    () => filtrarPautas(pautas, { status: filtroStatus, pessoa: filtroPessoa, busca }),
    [pautas, filtroStatus, filtroPessoa, busca],
  );

  const temFiltro = !!filtroStatus || !!filtroPessoa || !!busca.trim();
  const limparFiltros = () => { setFiltroStatus(null); setFiltroPessoa(null); setBusca(""); };

  const abrirNova    = () => { setEmEdicao(null); setFormAberto(true); };
  const abrirEdicao  = (pauta) => { setEmEdicao(pauta); setFormAberto(true); };
  const salvar = (dados) => (emEdicao ? atualizarPauta(emEdicao.id, dados) : criarPauta(dados));

  return (
    <div className="pautas">
      <header className="pautas__topo">
        <div className="pautas__marca">
          <span className="pautas__marca-icone" aria-hidden><LuListChecks size={20} /></span>
          <div>
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
      </header>

      <div className="pautas__filtros">
        <div className="pautas__chips" role="group" aria-label="Filtrar por situação">
          <button
            type="button"
            className={`pautas__chip${filtroStatus === null ? " pautas__chip--ativo" : ""}`}
            aria-pressed={filtroStatus === null}
            onClick={() => setFiltroStatus(null)}
          >
            Todas <span className="pautas__chip-num">{contagem.total}</span>
          </button>
          {STATUS_EM_ORDEM.map((status) => (
            <button
              key={status}
              type="button"
              className={`pautas__chip pautas__chip--${status}${filtroStatus === status ? " pautas__chip--ativo" : ""}`}
              aria-pressed={filtroStatus === status}
              onClick={() => setFiltroStatus(status)}
            >
              {rotuloStatus(status)} <span className="pautas__chip-num">{contagem[status]}</span>
            </button>
          ))}
        </div>

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
            placeholder="Procurar por palavra na pauta"
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
          <p className="pautas__vazio-titulo">Nada com esse filtro</p>
          {temFiltro && (
            <button type="button" className="pautas__limpar" onClick={limparFiltros}>
              Mostrar todas
            </button>
          )}
        </div>
      )}

      <div className="pautas__lista">
        {visiveis.map((pauta) => (
          <PautaCard
            key={pauta.id}
            pauta={pauta}
            pessoas={pessoas}
            onMudarStatus={mudarStatus}
            onEditar={abrirEdicao}
          />
        ))}
      </div>

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
