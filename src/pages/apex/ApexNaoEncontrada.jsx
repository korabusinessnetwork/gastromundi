import { useEffect } from "react";
import "./ApexPage.css";
import "./ApexNaoEncontrada.css";
import KoraMonograma from "./KoraMonograma";
import { aplicarSeoDaRota, definirNoindex } from "@/lib/seo";

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

/**
 * Endereço que não existe no site da KORA (kora.codes/qualquer-coisa).
 *
 * Antes, qualquer caminho errado caía calado no login do estabelecimento
 * — quem clicou num link quebrado do nosso próprio site era despejado
 * numa tela de senha, sem entender o que aconteceu. Aqui a pessoa lê o
 * que houve e tem os dois caminhos de volta: a vitrine e a demonstração.
 *
 * A terceira linha existe porque este é um produto multi-estabelecimento:
 * boa parte de quem digita um endereço errado no domínio da plataforma é
 * cliente procurando o próprio login, que mora no subdomínio dele.
 *
 * Um aviso honesto sobre o status HTTP: a resposta continua 200. O site é
 * uma SPA servida por um rewrite que manda todo caminho para o mesmo
 * index.html, e não existe jeito de devolver 404 de verdade sem servidor
 * próprio. Por isso a página se marca como "não indexe" enquanto está
 * aberta — é o que impede o buscador de guardar caminho inventado.
 */
export default function ApexNaoEncontrada() {
  useEffect(() => {
    document.title = "Página não encontrada — KORA";
    definirNoindex(true);
    // Ao sair daqui por navegação interna, devolve as tags para a rota
    // que assumiu (a essa altura a URL já mudou) — sem isso o "não
    // indexe" ficaria grudado na vitrine.
    return () => aplicarSeoDaRota();
  }, []);

  return (
    <div className="apex">
      <main className="apex-404">
        <a href="/" className="apex-404__marca">
          <KoraMonograma className="apex-404__monograma" haste="#B8B0F0" />
          <span className="apex-404__wordmark">KORA</span>
        </a>

        <span className="apex-404__codigo">Erro 404</span>
        <h1 className="apex-404__titulo">Essa página não existe</h1>
        <p className="apex-404__texto">
          O endereço pode estar incompleto, ou a página pode ter mudado de lugar.
          Nada de errado com você — vamos te colocar de volta no caminho.
        </p>

        <div className="apex-404__ctas">
          <a href="/" className="apex-botao apex-botao--primario-claro">
            Ir para a página inicial
          </a>
          <a href="/demo" className="apex-botao apex-botao--outline-escuro">
            Ver o KORA rodando
          </a>
        </div>

        <p className="apex-404__ajuda">
          Já é cliente? O seu KORA fica no endereço do seu estabelecimento
          {ROOT_DOMAIN ? ` — seunegocio.${ROOT_DOMAIN}` : ""}.
        </p>
      </main>
    </div>
  );
}
