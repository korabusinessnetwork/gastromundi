import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuBuilding2 } from "react-icons/lu";
import { alterarPlano } from "@/lib/console";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

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
 * O front NÃO decide autorização: a RPC `alterar_plano_tenant` revalida o
 * papel `plataforma` no banco (SECURITY DEFINER + is_super_admin()). Aqui
 * só montamos a chamada e mostramos o resultado.
 */
export default function AlterarPlanoModal({ tenant, planos, onFechar, onAlterado }) {
  const [planoCodigo, setPlanoCodigo] = useState(tenant?.plano_codigo ?? "");
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const semMudanca = planoCodigo === tenant?.plano_codigo;

  const submeter = async () => {
    if (enviando || semMudanca) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await alterarPlano(tenant.id, planoCodigo);
    setEnviando(false);

    if (error) {
      setErroServidor(error.message ?? "Não foi possível alterar o plano.");
      return;
    }
    onAlterado(data);
  };

  return createPortal(
    <div className="nem-overlay" role="dialog" aria-modal="true" aria-label="Trocar plano do estabelecimento">
      <div className="nem-modal">
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
              O novo plano passa a valer na hora — muda os módulos que este
              estabelecimento enxerga.
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
            disabled={enviando || semMudanca}
          >
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : "Salvar plano"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
