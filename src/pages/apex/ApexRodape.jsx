import "./ApexRodape.css";
import KoraMonograma from "./KoraMonograma";
import { dadosDaEmpresa } from "@/lib/empresa";

/**
 * Rodapé do site — marca discreta, quem é a empresa, como falar com ela
 * e o link da política de privacidade.
 *
 * Antes tinha só o copyright. Num site que agora PEDE nome, WhatsApp e
 * e-mail, rodapé sem identificação e sem política é o tipo de detalhe
 * que faz o visitante desistir sem saber explicar por quê: não dá para
 * conferir com quem se está falando. Aqui ele confere.
 *
 * Razão social, CNPJ, endereço e e-mail vêm de `VITE_EMPRESA_*`
 * (src/lib/empresa.js) — dado de empresa real não fica escrito no
 * código, e o que não estiver configurado simplesmente não aparece, em
 * vez de virar rótulo vazio.
 */
export default function ApexRodape() {
  const ano = new Date().getFullYear();
  const empresa = dadosDaEmpresa();

  // Uma linha só com o que existir: "Razão Social — CNPJ 00.000.000/0001-00".
  const identificacao = [
    empresa.razaoSocial,
    empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="apex-rodape">
      <div className="apex-rodape__conteudo">
        <div className="apex-rodape__coluna">
          <div className="apex-rodape__marca">
            <KoraMonograma className="apex-rodape__monograma" haste="#77768A" />
            <span className="apex-rodape__wordmark">KORA</span>
          </div>
          {identificacao && (
            <span className="apex-rodape__dado">{identificacao}</span>
          )}
          {empresa.endereco && (
            <span className="apex-rodape__dado">{empresa.endereco}</span>
          )}
        </div>

        <nav className="apex-rodape__links" aria-label="Links do rodapé">
          <a className="apex-rodape__link" href="/privacidade">
            Política de privacidade
          </a>
          {empresa.email && (
            <a className="apex-rodape__link" href={`mailto:${empresa.email}`}>
              {empresa.email}
            </a>
          )}
          {empresa.contatoUrl && (
            <a
              className="apex-rodape__link"
              href={empresa.contatoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp{empresa.telefone ? ` ${empresa.telefone}` : ""}
            </a>
          )}
        </nav>
      </div>

      <span className="apex-rodape__copyright">
        © {ano} KORA Sistemas · O PDV que se adapta a você
      </span>
    </footer>
  );
}
