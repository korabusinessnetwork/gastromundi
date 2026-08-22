import { useEffect } from "react";
import "./ApexPage.css";
import "./ApexPrivacidade.css";
import KoraMonograma from "./KoraMonograma";
import ApexRodape from "./ApexRodape";
import { dadosDaEmpresa, temCanalDeContato } from "@/lib/empresa";

/**
 * Política de privacidade da vitrine.
 *
 * Existe porque o formulário passou a GUARDAR dado pessoal de terceiro
 * (nome, WhatsApp, e-mail). A partir daí o aceite no formulário só vale
 * se a pessoa puder ler, antes de marcar, o que vai acontecer com o que
 * ela digitou — é isso que esta página é.
 *
 * Escrita para ser lida, não para se proteger: frases curtas, sem
 * "titular dos dados", sem "outrossim". Cada linha descreve o que o
 * código realmente faz — a lista de campos é a da tabela `leads`, e o
 * que não é coletado (IP, rastreador, cookie de anúncio) está dito com
 * todas as letras porque de fato não é.
 *
 * Identificação da empresa vem de `VITE_EMPRESA_*` (src/lib/empresa.js):
 * CNPJ e endereço não moram no código. O que não estiver configurado
 * some da tela em vez de aparecer vazio.
 */

// Data da última revisão do TEXTO. Fixa de propósito: "atualizado em"
// que muda sozinho todo dia é o contrário de um documento datado.
const ATUALIZADA_EM = "22 de agosto de 2026";

export default function ApexPrivacidade() {
  const empresa = dadosDaEmpresa();
  const temContato = temCanalDeContato(empresa);

  useEffect(() => {
    document.title = "Política de privacidade — KORA";
  }, []);

  return (
    <div className="apex">
      <header className="apex-doc__topo">
        <a href="/" className="apex-doc__marca">
          <KoraMonograma className="apex-doc__monograma" haste="#473CA8" />
          <span className="apex-doc__wordmark">KORA</span>
        </a>
        <a href="/" className="apex-doc__voltar">
          Voltar para o site
        </a>
      </header>

      <main className="apex-doc">
        <span className="apex-kicker">Privacidade</span>
        <h1 className="apex-doc__titulo">O que fazemos com os seus dados</h1>
        <p className="apex-doc__resumo">
          Em uma frase: se você pedir uma demonstração, guardamos seu nome,
          WhatsApp e e-mail só para falar com você sobre isso. Não vendemos, não
          repassamos e apagamos assim que você pedir.
        </p>
        <span className="apex-doc__data">Atualizada em {ATUALIZADA_EM}</span>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">O que a gente guarda</h2>
          <p>
            Só o que você digita no formulário de agendamento, mais o contexto
            do próprio pedido:
          </p>
          <ul className="apex-doc__lista">
            <li>seu nome;</li>
            <li>seu WhatsApp;</li>
            <li>seu e-mail;</li>
            <li>
              o plano que você montou no site, quando montou (quais módulos
              marcou e o total que apareceu na tela);
            </li>
            <li>de qual parte do site você abriu o formulário e a data.</li>
          </ul>
          <p>
            Não guardamos seu IP, não instalamos rastreador e não temos
            formulário escondido. Navegar pelo site sem preencher nada não
            deixa nenhum registro seu com a gente.
          </p>
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Por que a gente guarda</h2>
          <p>
            Para entrar em contato e marcar a demonstração — e para chegar na
            conversa já sabendo do que você precisa, em vez de perguntar tudo de
            novo. É só isso.
          </p>
          <p>
            A base legal é o seu consentimento (art. 7º, I da LGPD): sem a
            caixinha marcada no formulário, o sistema não grava nada. Essa regra
            está no banco de dados, não só na tela.
          </p>
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Quem vê</h2>
          <p>
            Só a equipe da KORA, por um painel interno de acesso restrito.
            Nenhum estabelecimento cliente enxerga esses contatos.
          </p>
          <p>
            Não vendemos, não trocamos e não enviamos sua lista para
            anunciante, rede social ou ferramenta de marketing. A lista fica em
            um banco de dados hospedado pela Supabase, provedor de
            infraestrutura da plataforma.
          </p>
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Por quanto tempo</h2>
          <p>
            Enquanto a conversa comercial fizer sentido. Se você pedir a
            exclusão, apagamos — mesmo que a gente ainda não tenha conseguido
            falar com você. Não existe "período mínimo" aqui.
          </p>
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Seus direitos</h2>
          <p>A LGPD (art. 18) te dá, e a gente cumpre:</p>
          <ul className="apex-doc__lista">
            <li>saber se temos algum dado seu;</li>
            <li>ver exatamente o que temos;</li>
            <li>corrigir o que estiver errado;</li>
            <li>pedir que a gente apague tudo;</li>
            <li>voltar atrás no aceite, a qualquer momento, sem justificar.</li>
          </ul>
          {temContato ? (
            <p>
              Para qualquer um deles, é só falar com a gente
              {empresa.email ? (
                <>
                  {" "}
                  por e-mail em{" "}
                  <a className="apex-doc__link" href={`mailto:${empresa.email}`}>
                    {empresa.email}
                  </a>
                </>
              ) : null}
              {empresa.contatoUrl ? (
                <>
                  {empresa.email ? " ou" : ""} pelo{" "}
                  <a
                    className="apex-doc__link"
                    href={empresa.contatoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                    {empresa.telefone ? ` ${empresa.telefone}` : ""}
                  </a>
                </>
              ) : null}
              . Respondemos no mesmo canal.
            </p>
          ) : (
            <p>
              Para exercer qualquer um deles, responda a última mensagem que a
              gente te mandou — o pedido chega na mesma pessoa que falou com
              você.
            </p>
          )}
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Cookies e falhas do site</h2>
          <p>
            Este site não usa cookie de publicidade nem rastreamento de
            terceiros. O navegador guarda arquivos do próprio site para ele
            abrir mais rápido na próxima visita — nada disso identifica você.
          </p>
          <p>
            Se uma página quebrar, um relatório técnico do erro (endereço da
            página, tipo de navegador e a mensagem da falha) é enviado para o
            serviço que monitora a plataforma. Esse relatório não leva nome,
            WhatsApp nem e-mail.
          </p>
        </section>

        <section className="apex-doc__secao">
          <h2 className="apex-doc__subtitulo">Quem é responsável</h2>
          <p>
            {empresa.razaoSocial || "KORA Sistemas"}
            {empresa.cnpj ? ` — CNPJ ${empresa.cnpj}` : ""}
            {empresa.endereco ? `. ${empresa.endereco}` : ""}
            {empresa.email ? (
              <>
                . Contato:{" "}
                <a className="apex-doc__link" href={`mailto:${empresa.email}`}>
                  {empresa.email}
                </a>
              </>
            ) : (
              "."
            )}
          </p>
          <p>
            Se este texto mudar, a data lá em cima muda junto. Mudança que
            aumente o uso dos seus dados não vale para quem já deixou o contato
            — nesse caso pedimos um aceite novo.
          </p>
        </section>
      </main>

      <ApexRodape />
    </div>
  );
}
