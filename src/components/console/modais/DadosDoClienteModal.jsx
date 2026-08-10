import { useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX,
  LuTriangleAlert,
  LuLoaderCircle,
  LuShieldCheck,
  LuDownload,
  LuCheck,
  LuTrash2,
} from "react-icons/lu";
import {
  mensagemDeErroDoConsole,
  exportarDadosEstabelecimento,
  apagarDadosEstabelecimento,
  confirmacaoDeApagamento,
} from "@/lib/console/console";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";
import "./DadosDoClienteModal.css";

/**
 * Salva um objeto como arquivo .json na máquina de quem clicou.
 *
 * Fica aqui, e não em `lib/`, porque é gesto de navegador (âncora + Blob) e
 * não regra de negócio. Devolve `false` quando o navegador não oferece
 * `createObjectURL` — nesse caso a tela mostra o caminho manual em vez de
 * fingir que baixou.
 */
function baixarJson(nomeArquivo, dados) {
  if (typeof URL?.createObjectURL !== "function") return false;

  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Dados do cliente (Console) — exportar e apagar tudo o que a plataforma
 * guarda de um estabelecimento. Pré-venda §1.5 · LGPD art. 18, V e VI.
 *
 * Por que existe: a partir da primeira venda a plataforma passa a guardar,
 * por conta de terceiros, o faturamento de um restaurante e o cadastro dos
 * clientes finais dele. A lei dá ao contratante o direito de pedir uma cópia
 * e o de pedir a eliminação, e não havia caminho nenhum para atender: a
 * única função que removia tenant (`remover_tenant_provisionado`, 20260910)
 * recusa, de propósito, estabelecimento com usuário ou pagamento — ou seja,
 * recusa exatamente o caso de um cliente real pedindo eliminação.
 *
 * Por que é intuitivo (Princípio nº1): a tela tem dois passos numerados, na
 * ordem em que se faz. O passo 2 nasce travado e só abre depois que a cópia
 * foi baixada — a ordem certa deixa de ser algo que a pessoa tem de lembrar
 * e passa a ser o único caminho possível. O apagamento pede o endereço do
 * estabelecimento digitado (sim/não erra com um clique torto; digitar o nome
 * do alvo obriga a olhar para quem se está apagando) e a frase acima do
 * campo diz, em português, o que some e que não há como voltar.
 *
 * O front NÃO decide autorização nem confia na própria confirmação: as RPCs
 * `exportar_dados_estabelecimento` e `apagar_dados_estabelecimento`
 * (20260922) são SECURITY DEFINER com guarda `is_super_admin()` e a segunda
 * reconfere o texto digitado no banco.
 */
export default function DadosDoClienteModal({ tenant, onFechar, onApagado }) {
  const [exportando, setExportando] = useState(false);
  const [exportado, setExportado] = useState(null);
  const [apagando, setApagando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erroServidor, setErroServidor] = useState("");
  const [copiaManual, setCopiaManual] = useState(null);

  const ocupado = exportando || apagando;
  const esperado = confirmacaoDeApagamento(tenant);
  const confere = texto.trim().toLowerCase() === esperado && esperado !== "";
  const podeApagar = Boolean(exportado) && confere;

  const exportar = async () => {
    if (ocupado) return;
    setErroServidor("");
    setCopiaManual(null);
    setExportando(true);
    const { data, error } = await exportarDadosEstabelecimento(tenant.id);
    setExportando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível gerar a cópia dos dados."));
      return;
    }

    const arquivo = `dados-${esperado || tenant.id}.json`;
    const baixou = baixarJson(arquivo, data);
    // Mesmo sem download, os dados JÁ vieram do servidor — segurá-los aqui
    // sem oferecer saída seria perder a exportação que o cliente pediu.
    if (!baixou) setCopiaManual(JSON.stringify(data, null, 2));
    setExportado({ arquivo, linhas: Number(data?.total_de_linhas ?? 0) });
  };

  const apagar = async () => {
    if (ocupado || !podeApagar) return;
    setErroServidor("");
    setApagando(true);
    const { data, error } = await apagarDadosEstabelecimento(tenant.id, texto.trim());
    setApagando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível apagar os dados."));
      return;
    }
    onApagado(data);
  };

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, ocupado);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Dados do cliente">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuShieldCheck size={20} aria-hidden />
            <h2>Dados de {tenant?.nome}</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={ocupado} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <p className="nem-secao__ajuda">
            Use esta tela quando o cliente pedir por escrito uma cópia dos dados dele ou pedir
            que sejam apagados. É o que a Lei Geral de Proteção de Dados garante a ele.
          </p>

          {/* ── Passo 1 — a cópia ───────────────────────────────────── */}
          <section className="nem-secao ddc-passo">
            <p className="nem-secao__titulo">1 · Baixar a cópia dos dados</p>
            <p className="nem-secao__ajuda">
              Gera um arquivo com tudo o que guardamos deste estabelecimento: vendas, caixa,
              cardápio, equipe e clientes. Senhas não vão no arquivo — nem nós conseguimos lê-las.
            </p>

            <button
              type="button"
              className="nem-btn nem-btn--secundario ddc-acao"
              onClick={exportar}
              disabled={ocupado}
            >
              {exportando ? (
                <><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Gerando…</>
              ) : (
                <><LuDownload size={16} aria-hidden /> {exportado ? "Baixar de novo" : "Baixar cópia"}</>
              )}
            </button>

            {exportado && (
              <p className="ddc-ok" role="status">
                <LuCheck size={15} aria-hidden /> Cópia salva em <strong>{exportado.arquivo}</strong> —{" "}
                {exportado.linhas} registros. Guarde o arquivo antes de apagar.
              </p>
            )}

            {copiaManual && (
              <div className="ddc-manual">
                <p className="nem-secao__ajuda">
                  Este navegador não deixou salvar o arquivo sozinho. Selecione o texto abaixo,
                  copie e salve como <strong>{exportado?.arquivo}</strong>:
                </p>
                <textarea
                  className="ddc-manual__texto"
                  readOnly
                  rows={6}
                  value={copiaManual}
                  aria-label="Dados exportados"
                />
              </div>
            )}
          </section>

          {/* ── Passo 2 — a eliminação ──────────────────────────────── */}
          <section className="nem-secao ddc-passo ddc-passo--perigo">
            <p className="nem-secao__titulo">2 · Apagar tudo</p>

            {!exportado ? (
              // Travar o passo 2 até a cópia existir é o que impede o
              // acidente que não tem conserto: apagar o cliente e descobrir
              // depois que ninguém guardou nada.
              <p className="nem-secao__ajuda">
                Disponível depois de baixar a cópia. Apagar sem ter o arquivo em mãos não tem volta.
              </p>
            ) : (
              <>
                <p className="ddc-aviso">
                  Some tudo: vendas, caixa, cardápio, clientes e os acessos da equipe. O
                  estabelecimento sai do Console e ninguém dele consegue mais entrar no sistema.
                  Não há como desfazer.
                </p>

                <label className="nem-campo">
                  <span className="nem-label">
                    Para confirmar, digite <strong>{esperado}</strong>
                  </span>
                  <input
                    className={`nem-input${texto && !confere ? " nem-input--erro" : ""}`}
                    type="text"
                    autoComplete="off"
                    placeholder={esperado}
                    value={texto}
                    disabled={ocupado}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                </label>

                {texto && !confere && (
                  <p className="nem-erro-campo" role="alert">
                    Não confere. Digite exatamente “{esperado}”.
                  </p>
                )}

                <button
                  type="button"
                  className="nem-btn ddc-apagar"
                  onClick={apagar}
                  disabled={ocupado || !podeApagar}
                >
                  {apagando ? (
                    <><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Apagando…</>
                  ) : (
                    <><LuTrash2 size={16} aria-hidden /> Apagar tudo deste estabelecimento</>
                  )}
                </button>
              </>
            )}
          </section>

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario ddc-fechar" onClick={onFechar} disabled={ocupado}>
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
