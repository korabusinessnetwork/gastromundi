import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LuArrowLeft, LuTriangleAlert } from "react-icons/lu";
import KoraMonograma from "@/pages/apex/KoraMonograma";
import ApexRodape from "@/pages/apex/chrome/ApexRodape";
import { EMPRESA, IDENTIFICACAO_COMPLETA, dataPorExtenso } from "@/lib/legal/versaoLegal";
import "@/pages/apex/ApexPage.css";
import "./DocumentoLegal.css";

/**
 * Casco compartilhado dos documentos legais (Termos de Uso e Política de
 * Privacidade). Recebe o conteúdo como dado e só o desenha — o texto mora em
 * `src/lib/legal/` (decisão 018).
 *
 * Reaproveita o casco do site institucional (`.apex`) de propósito: os tokens
 * --kora-* são escopados nessa classe, e a página precisa ficar de pé também
 * no subdomínio de um estabelecimento, onde o tema do tenant manda no resto
 * do app. Termos de Uso são da PLATAFORMA — não podem trocar de cor conforme
 * o cliente que os abriu.
 *
 * Intuitividade: sumário clicável logo abaixo do resumo (documento legal se lê
 * por pergunta, não do começo ao fim), um resumo em português comum antes das
 * cláusulas, seções numeradas com âncora própria (dá para mandar o link do
 * item exato), e uma saída só — "Voltar" — sempre no mesmo lugar.
 */
export default function DocumentoLegal({ documento }) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${documento.titulo} — ${EMPRESA.nome}`;
  }, [documento.titulo]);

  function voltar() {
    // Quem chegou pelo rodapé volta para onde estava; quem abriu o link
    // direto (colado num e-mail) não tem para onde voltar e vai para a raiz.
    if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
    else navigate("/");
  }

  return (
    <div className="apex legal">
      <header className="legal-topo">
        <div className="legal-topo__container">
          <a href="/" className="legal-topo__marca">
            <KoraMonograma className="legal-topo__monograma" />
            <span className="legal-topo__wordmark">{EMPRESA.nome}</span>
          </a>
          <button type="button" className="legal-topo__voltar" onClick={voltar}>
            <LuArrowLeft size={16} aria-hidden="true" /> Voltar
          </button>
        </div>
      </header>

      <main className="legal-conteudo">
        <h1 className="legal-titulo">{documento.titulo}</h1>
        <p className="legal-vigencia">
          Versão {documento.versao} · em vigor desde {dataPorExtenso(documento.vigenteDesde)}
        </p>

        {!IDENTIFICACAO_COMPLETA && (
          <div className="legal-pendencia" role="status">
            <LuTriangleAlert size={18} aria-hidden="true" />
            <span>
              A identificação da empresa que oferece o serviço (razão social, CNPJ e
              e-mail de contato) ainda não foi configurada. Enquanto isso, este
              documento está publicado de forma incompleta — configure as variáveis{" "}
              <code>VITE_EMPRESA_*</code> antes de contratar o primeiro cliente.
            </span>
          </div>
        )}

        <p className="legal-resumo">{documento.resumo}</p>

        <nav className="legal-sumario" aria-label="Índice do documento">
          <p className="legal-sumario__titulo">Neste documento</p>
          <ul className="legal-sumario__lista">
            {documento.secoes.map((secao) => (
              <li key={secao.id}>
                <a href={`#${secao.id}`}>{secao.titulo}</a>
              </li>
            ))}
          </ul>
        </nav>

        {documento.secoes.map((secao) => (
          <section key={secao.id} id={secao.id} className="legal-secao">
            <h2 className="legal-secao__titulo">{secao.titulo}</h2>
            {secao.paragrafos?.map((texto, i) => (
              <p key={i} className="legal-secao__paragrafo">{texto}</p>
            ))}
            {secao.itens?.length > 0 && (
              <ul className="legal-secao__lista">
                {secao.itens.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
            {secao.paragrafosFinais?.map((texto, i) => (
              <p key={i} className="legal-secao__paragrafo">{texto}</p>
            ))}
          </section>
        ))}
      </main>

      <ApexRodape />
    </div>
  );
}
