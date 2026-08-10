import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuBuilding2, LuPlus } from "react-icons/lu";
import { mensagemDeErroDoConsole, alterarPlano, compararModulosDoPlano } from "@/lib/console/console";
import { buscarModulosDoPlano } from "@/lib/tenant/tenant";
import MODULOS from "@/constants/modulos";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";
import "./AlterarPlanoModal.css";

/**
 * Troca o plano de um estabelecimento existente (Console, S1-2).
 *
 * Por que é intuitivo (Princípio nº1): uma coisa só na tela — escolher o
 * novo plano de um estabelecimento que o super-admin já identificou pelo
 * card. O plano ATUAL vem pré-selecionado, e o botão "Salvar" fica
 * desabilitado enquanto a escolha não mudar (prevenção de erro > erro cru:
 * não deixa "salvar" um não-troca). Estado "Salvando…" com spinner e botões
 * travados durante a operação — sem clique duplo, sem dúvida se agiu.
 *
 * R7L3 — antes, a troca era um tiro no escuro: a tela dizia genericamente
 * que "muda os módulos" e salvava. Mas o efeito é imediato e invisível
 * daqui: o estabelecimento perde o módulo na hora e, desde 20260906, um
 * plano sem `delivery` DERRUBA o site público de pedidos do cliente. Agora
 * a tela NOMEIA o que ele perde antes do clique e exige uma confirmação
 * explícita quando há perda (CLAUDE.md: confirmar ações destrutivas). Se a
 * comparação não puder ser lida, a tela diz que não sabe — nunca finge que
 * nada será perdido.
 *
 * O front NÃO decide autorização: a RPC `alterar_plano_tenant` revalida o
 * papel `plataforma` no banco (SECURITY DEFINER + is_super_admin()). Aqui
 * só montamos a chamada e mostramos o resultado.
 */
export default function AlterarPlanoModal({ tenant, planos, onFechar, onAlterado }) {
  const planoAtual = tenant?.plano_codigo ?? "";
  const [planoCodigo, setPlanoCodigo] = useState(planoAtual);
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Comparação plano atual → plano escolhido.
  const [comparacao, setComparacao] = useState(null);
  const [comparando, setComparando] = useState(false);
  const [erroComparar, setErroComparar] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const semMudanca = planoCodigo === planoAtual;

  useEffect(() => {
    // Sem troca escolhida não há nada a comparar (e nada a confirmar).
    setConfirmado(false);
    setComparacao(null);
    setErroComparar(false);
    if (semMudanca || !planoCodigo) {
      setComparando(false);
      return undefined;
    }

    let cancelado = false;
    setComparando(true);
    (async () => {
      const [atual, novo] = await Promise.all([
        buscarModulosDoPlano(planoAtual),
        buscarModulosDoPlano(planoCodigo),
      ]);
      // O super-admin pode trocar a escolha antes desta leitura voltar:
      // mostrar o diff do plano anterior seria pior que não mostrar nada.
      if (cancelado) return;
      setComparando(false);
      if (atual.error || novo.error) {
        setErroComparar(true);
        return;
      }
      setComparacao(compararModulosDoPlano(atual.data, novo.data));
    })();
    return () => {
      cancelado = true;
    };
  }, [planoAtual, planoCodigo, semMudanca, tentativa]);

  const perdidos = comparacao?.perdidos ?? [];
  const ganhos = comparacao?.ganhos ?? [];
  // Duas situações pedem um "sim" explícito: perder módulo (destrutivo) e
  // não saber o que se perde (a leitura falhou). Nas duas, o botão principal
  // fica travado até a caixa ser marcada.
  const precisaConfirmar = perdidos.length > 0 || erroComparar;
  const podeSalvar = !enviando && !semMudanca && !comparando && (!precisaConfirmar || confirmado);
  const perdeDelivery = perdidos.some((m) => m.codigo === MODULOS.DELIVERY);

  const submeter = async () => {
    if (!podeSalvar) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await alterarPlano(tenant.id, planoCodigo);
    setEnviando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível alterar o plano."));
      return;
    }
    onAlterado(data);
  };

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, enviando);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Trocar plano do estabelecimento">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuBuilding2 size={20} aria-hidden />
            <h2>Trocar plano</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{tenant?.nome}</p>
            <p className="nem-secao__ajuda">
              O novo plano passa a valer na hora. Escolha o plano para ver o que
              este estabelecimento ganha e o que perde.
            </p>

            <label className="nem-campo">
              <span className="nem-label">Plano</span>
              <select
                className="nem-input"
                value={planoCodigo}
                disabled={enviando}
                onChange={(e) => setPlanoCodigo(e.target.value)}
              >
                {planos.length === 0 && <option value="">Carregando planos…</option>}
                {planos.map((p) => (
                  <option key={p.codigo} value={p.codigo}>{p.nome}</option>
                ))}
              </select>
            </label>
          </section>

          {comparando && (
            <p className="apm-comparando" role="status">
              <LuLoaderCircle size={15} className="nem-spin" aria-hidden /> Comparando os planos…
            </p>
          )}

          {perdidos.length > 0 && (
            <div className="apm-perda" role="alert">
              <p className="apm-perda__titulo">
                <LuTriangleAlert size={16} aria-hidden />
                Ao salvar, este estabelecimento perde na hora:
              </p>
              <ul className="apm-lista">
                {perdidos.map((m) => (
                  <li key={m.codigo}>{m.nome}</li>
                ))}
              </ul>
              {perdeDelivery && (
                <p className="apm-perda__consequencia">
                  Sem o módulo de delivery, o site de pedidos deste
                  estabelecimento sai do ar e os clientes dele param de
                  conseguir pedir.
                </p>
              )}
            </div>
          )}

          {ganhos.length > 0 && (
            <div className="apm-ganho" role="status">
              <p className="apm-ganho__titulo">
                <LuPlus size={16} aria-hidden />
                Passa a ter:
              </p>
              <ul className="apm-lista">
                {ganhos.map((m) => (
                  <li key={m.codigo}>{m.nome}</li>
                ))}
              </ul>
            </div>
          )}

          {comparacao && perdidos.length === 0 && ganhos.length === 0 && (
            <p className="apm-igual" role="status">
              Os dois planos liberam exatamente os mesmos módulos — muda só a
              cobrança.
            </p>
          )}

          {erroComparar && (
            <div className="apm-perda" role="alert">
              <p className="apm-perda__titulo">
                <LuTriangleAlert size={16} aria-hidden />
                Não foi possível comparar os planos.
              </p>
              <p className="apm-perda__consequencia">
                Não sabemos o que este estabelecimento perde na troca — pode
                perder o site de pedidos, o financeiro ou os relatórios sem
                aviso.
              </p>
              <button type="button" className="apm-relere" onClick={() => setTentativa((n) => n + 1)}>
                Tentar de novo
              </button>
            </div>
          )}

          {precisaConfirmar && (
            <label className="apm-confirmar">
              <input
                type="checkbox"
                checked={confirmado}
                disabled={enviando}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              <span>
                {erroComparar
                  ? "Quero trocar mesmo sem saber o que este estabelecimento perde."
                  : "Entendi que estes módulos saem do ar agora para este estabelecimento."}
              </span>
            </label>
          )}

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="nem-btn nem-btn--primario"
            onClick={submeter}
            disabled={!podeSalvar}
          >
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : "Salvar plano"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
