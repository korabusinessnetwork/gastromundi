import { useEffect } from "react";
import { LuSparkles, LuWrench, LuTrendingUp, LuLayers } from "react-icons/lu";
import KoraMonograma from "./KoraMonograma";
import ApexRodape from "./ApexRodape";
import { NOTAS_DE_ATUALIZACAO, TIPOS_DE_NOTA, dataPorExtenso } from "@/features/apex/regras/notasDeAtualizacao";
import "./ApexPage.css";
import "./ApexPorta.css";
import "./ApexNotasPage.css";

const ICONE_DO_TIPO = { novo: LuSparkles, melhoria: LuTrendingUp, corrigido: LuWrench, interno: LuLayers };

/**
 * `/patchnotes` — o que mudou no sistema, da atualização mais nova para a
 * mais antiga. Os textos moram em `features/apex/regras/notasDeAtualizacao.js`.
 *
 * Por que é intuitivo (Princípio nº1): uma coluna só, lida de cima para
 * baixo, com a data por extenso em cada bloco. Cada mudança leva uma
 * etiqueta curta (Novo, Melhoria, Corrigido) com ícone e cor próprios, então
 * dá para achar o que interessa passando o olho. O texto fala do que mudou
 * para quem usa, sem termo técnico. A saída de volta ao site fica no mesmo
 * lugar das outras portas.
 */
export default function ApexNotasPage() {
  useEffect(() => {
    document.title = "Novidades · Kora";
  }, []);

  return (
    <div className="apex apex-porta apex-notas">
      <header className="apex-porta__topo">
        <a href="/" className="apex-porta__marca" aria-label="KORA, voltar ao site">
          <KoraMonograma className="apex-porta__monograma" />
          <span className="apex-porta__wordmark">KORA</span>
        </a>
        <a href="/" className="apex-porta__voltar">← Voltar ao site</a>
      </header>

      <main className="apex-notas__conteudo">
        <h1 className="apex-notas__titulo">Novidades do sistema</h1>
        <p className="apex-notas__subtitulo">Tudo o que mudou, da atualização mais recente para a mais antiga.</p>

        {NOTAS_DE_ATUALIZACAO.length === 0 ? (
          <p className="apex-notas__vazio">Ainda não há atualizações publicadas.</p>
        ) : (
          <ol className="apex-notas__lista">
            {NOTAS_DE_ATUALIZACAO.map((nota) => (
              <li key={nota.data} className="apex-notas__bloco">
                <time className="apex-notas__data" dateTime={nota.data}>{dataPorExtenso(nota.data)}</time>
                <h2 className="apex-notas__bloco-titulo">{nota.titulo}</h2>
                <ul className="apex-notas__itens">
                  {nota.itens.map((item) => {
                    const Icone = ICONE_DO_TIPO[item.tipo];
                    return (
                      <li key={item.texto} className="apex-notas__item">
                        <span className={`apex-notas__tipo apex-notas__tipo--${item.tipo}`}>
                          <Icone size={14} aria-hidden="true" /> {TIPOS_DE_NOTA[item.tipo]}
                        </span>
                        <span className="apex-notas__texto">{item.texto}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </main>

      <ApexRodape />
    </div>
  );
}
