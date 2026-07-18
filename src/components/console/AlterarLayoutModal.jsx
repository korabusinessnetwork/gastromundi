import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuPalette } from "react-icons/lu";
import { alterarLayout } from "@/lib/console";
import { listarLayouts, layoutDoTema } from "@/layouts";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

/**
 * Troca o LAYOUT (aparência) de um estabelecimento existente (Console).
 *
 * Por que é intuitivo (Princípio nº1): uma coisa só na tela — escolher o
 * layout do estabelecimento já identificado pelo card. O layout ATUAL vem
 * pré-selecionado, a descrição do modelo escolhido aparece embaixo do
 * seletor (o super-admin sabe o que vai acontecer ANTES de salvar), e o
 * botão "Salvar" fica desabilitado enquanto a escolha não mudar
 * (prevenção de erro > erro cru). "Salvando…" com spinner e botões
 * travados durante a operação — sem clique duplo.
 *
 * O front NÃO decide autorização: a RPC `alterar_layout_tenant` revalida
 * o papel `plataforma` no banco (SECURITY DEFINER + is_super_admin()) e
 * valida o código contra a lista fechada do catálogo.
 */
export default function AlterarLayoutModal({ tenant, onFechar, onAlterado }) {
  const layouts = listarLayouts();
  const [layoutCodigo, setLayoutCodigo] = useState(layoutDoTema(tenant?.tema));
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const semMudanca = layoutCodigo === layoutDoTema(tenant?.tema);
  const descricao = layouts.find((l) => l.codigo === layoutCodigo)?.descricao ?? "";

  const submeter = async () => {
    if (enviando || semMudanca) return;
    setErroServidor("");
    setEnviando(true);
    const { data, error } = await alterarLayout(tenant.id, layoutCodigo);
    setEnviando(false);

    if (error) {
      setErroServidor(error.message ?? "Não foi possível alterar o layout.");
      return;
    }
    onAlterado(data);
  };

  return createPortal(
    <div className="nem-overlay" role="dialog" aria-modal="true" aria-label="Trocar layout do estabelecimento">
      <div className="nem-modal">
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuPalette size={20} aria-hidden />
            <h2>Trocar layout</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{tenant?.nome}</p>
            <p className="nem-secao__ajuda">
              O novo visual passa a valer na hora para todos os usuários deste
              estabelecimento.
            </p>

            <label className="nem-campo">
              <span className="nem-label">Layout</span>
              <select
                className="nem-input"
                value={layoutCodigo}
                disabled={enviando}
                onChange={(e) => setLayoutCodigo(e.target.value)}
              >
                {layouts.map((l) => (
                  <option key={l.codigo} value={l.codigo}>{l.nome}</option>
                ))}
              </select>
            </label>

            {descricao && <p className="nem-secao__ajuda">{descricao}</p>}
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
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Salvando…</>) : "Salvar layout"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
