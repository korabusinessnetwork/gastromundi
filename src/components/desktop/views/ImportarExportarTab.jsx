import { useRef, useState } from "react";
import "./ImportarExportarTab.css";
import { useApp } from "@/context/AppContext";
import {
  decodificarArquivo,
  validarPlanilhaProdutos,
  montarCSVProdutos,
  gerarModeloCSV,
} from "@/lib/importacao/planilha";
import {
  planejarImportacaoProdutos,
  aplicarImportacaoProdutos,
  buscarProdutosParaMigracao,
} from "@/lib/importacao/produtos";
import { LuDownload, LuUpload, LuTriangleAlert, LuCircleCheck } from "react-icons/lu";

/**
 * Aba "Importar / Exportar" das Configurações — migração de dados de
 * produtos (docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md, Fase 1).
 *
 * Wizard com saída sempre visível: (1) baixar modelo → (2) escolher o
 * arquivo e VER o preview (nada gravado; erros linha a linha em
 * português) → (3) confirmar com progresso e resumo. Com erros no
 * arquivo, o caminho só segue por decisão explícita ("importar só as
 * válidas") — prevenção de erro antes de mensagem de erro.
 *
 * Segurança: usa o client autenticado do app — RLS isola o tenant e o
 * tenant_id nasce do JWT; a planilha nunca decide o tenant.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — planilha de cardápio é pequena

function baixarArquivo(nome, conteudo) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportarExportarTab() {
  const { recarregarProdutos } = useApp();
  const inputRef = useRef(null);

  // etapa: inicio | preview | gravando | concluido
  const [etapa, setEtapa] = useState("inicio");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [validacao, setValidacao] = useState(null); // { produtos, erros, avisos }
  const [plano, setPlano] = useState(null);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState(null); // { criados, atualizados }
  const [falha, setFalha] = useState("");
  const [exportando, setExportando] = useState(false);

  const voltarInicio = () => {
    setEtapa("inicio");
    setValidacao(null);
    setPlano(null);
    setFalha("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const aoEscolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setFalha("");
    if (arquivo.size > MAX_BYTES) {
      setFalha("Arquivo maior que 2 MB — exporte só o cardápio, sem outras abas.");
      return;
    }
    try {
      const texto = decodificarArquivo(await arquivo.arrayBuffer());
      const v = validarPlanilhaProdutos(texto);
      const { data: existentes, error } = await buscarProdutosParaMigracao();
      if (error) { setFalha("Não consegui ler os produtos atuais. Tente de novo."); return; }
      setNomeArquivo(arquivo.name);
      setValidacao(v);
      setPlano(planejarImportacaoProdutos(v.produtos, existentes || []));
      setEtapa("preview");
    } catch {
      setFalha("Não consegui ler esse arquivo. Ele é um CSV? Baixe o modelo e compare.");
    }
  };

  const confirmar = async () => {
    setEtapa("gravando");
    setProgresso({ feitos: 0, total: plano.criar.length + plano.atualizar.length });
    const r = await aplicarImportacaoProdutos(plano, (feitos, total) =>
      setProgresso({ feitos, total })
    );
    if (r.error) {
      setFalha(`A gravação parou no meio: ${r.error.message || "erro no banco"}. ` +
        `${r.criados + r.atualizados} produto(s) já entraram — rode o mesmo arquivo de novo que o resto continua de onde parou.`);
      setEtapa("preview");
      return;
    }
    await recarregarProdutos();
    setResultado(r);
    setEtapa("concluido");
  };

  const exportarProdutos = async () => {
    setExportando(true);
    setFalha("");
    const { data, error } = await buscarProdutosParaMigracao();
    setExportando(false);
    if (error) { setFalha("Não consegui exportar agora. Tente de novo."); return; }
    baixarArquivo("produtos-kora.csv", montarCSVProdutos(data || []));
  };

  const temErros = validacao?.erros?.length > 0;
  const temValidas = validacao?.produtos?.length > 0;
  const nadaAFazer = plano && plano.criar.length === 0 && plano.atualizar.length === 0;

  return (
    <div className="imex">
      {falha && (
        <div className="imex__falha" role="alert">
          <LuTriangleAlert aria-hidden="true" /> {falha}
        </div>
      )}

      {etapa === "inicio" && (
        <>
          <div className="imex__card">
            <div className="imex__card-info">
              <div className="imex__titulo">Importar produtos de uma planilha</div>
              <div className="imex__ajuda">
                Veio de outro sistema? Baixe a planilha modelo, preencha (ou cole os dados
                do export antigo) e envie aqui. Você confere tudo antes de gravar.
              </div>
            </div>
            <div className="imex__acoes">
              <button type="button" className="imex__botao imex__botao--secundario"
                onClick={() => baixarArquivo("modelo-produtos-kora.csv", gerarModeloCSV())}>
                <LuDownload aria-hidden="true" /> Baixar planilha modelo
              </button>
              <button type="button" className="imex__botao imex__botao--primario"
                onClick={() => inputRef.current?.click()}>
                <LuUpload aria-hidden="true" /> Escolher arquivo…
              </button>
              <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={aoEscolherArquivo} />
            </div>
          </div>

          <div className="imex__card">
            <div className="imex__card-info">
              <div className="imex__titulo">Exportar produtos</div>
              <div className="imex__ajuda">
                Baixa seu cardápio completo em CSV — o mesmo formato do modelo. Seus dados
                são seus: o arquivo serve de backup e importa em qualquer conta KORA.
              </div>
            </div>
            <div className="imex__acoes">
              <button type="button" className="imex__botao imex__botao--secundario"
                disabled={exportando} onClick={exportarProdutos}>
                <LuDownload aria-hidden="true" /> {exportando ? "Exportando…" : "Exportar produtos (CSV)"}
              </button>
            </div>
          </div>
        </>
      )}

      {etapa === "preview" && (
        <div className="imex__card imex__card--coluna">
          <div className="imex__titulo">Conferência de "{nomeArquivo}" — nada foi gravado ainda</div>

          <div className="imex__resumo">
            <span className="imex__pill imex__pill--criar">{plano.criar.length} novo(s)</span>
            <span className="imex__pill imex__pill--atualizar">{plano.atualizar.length} atualização(ões)</span>
            <span className="imex__pill">{plano.iguais.length} já igual(is)</span>
            {temErros && <span className="imex__pill imex__pill--erro">{validacao.erros.length} linha(s) com erro</span>}
          </div>

          {plano.categoriasNovas.length > 0 && (
            <div className="imex__nota">
              Categorias novas que serão criadas: <strong>{plano.categoriasNovas.join(", ")}</strong>.
              Depois associe cada uma a um grupo na aba "Grupos de Categoria".
            </div>
          )}

          {temErros && (
            <ul className="imex__erros">
              {validacao.erros.slice(0, 30).map((e) => (
                <li key={`${e.linha}-${e.mensagem}`}>Linha {e.linha}: {e.mensagem}</li>
              ))}
              {validacao.erros.length > 30 && <li>… e mais {validacao.erros.length - 30} erro(s).</li>}
            </ul>
          )}
          {validacao.avisos.length > 0 && (
            <ul className="imex__avisos">
              {validacao.avisos.slice(0, 10).map((a) => (
                <li key={`${a.linha}-${a.mensagem}`}>Linha {a.linha}: {a.mensagem}</li>
              ))}
            </ul>
          )}

          {plano.criar.length > 0 && (
            <div className="imex__lista">
              {plano.criar.slice(0, 8).map((p) => (
                <span key={p.nome} className="imex__item">{p.emoji || "🍽️"} {p.nome}</span>
              ))}
              {plano.criar.length > 8 && <span className="imex__item">+ {plano.criar.length - 8}…</span>}
            </div>
          )}

          <div className="imex__acoes">
            <button type="button" className="imex__botao imex__botao--secundario" onClick={voltarInicio}>
              Cancelar
            </button>
            {!temErros ? (
              <button type="button" className="imex__botao imex__botao--primario"
                disabled={nadaAFazer} onClick={confirmar}>
                {nadaAFazer ? "Nada pra importar — tudo já está igual" : "Confirmar importação"}
              </button>
            ) : (
              /* Com erro, gravar as boas é decisão EXPLÍCITA do usuário */
              <button type="button" className="imex__botao imex__botao--atencao"
                disabled={!temValidas || nadaAFazer} onClick={confirmar}>
                Importar só as {plano.criar.length + plano.atualizar.length} válida(s) e corrigir o resto depois
              </button>
            )}
          </div>
        </div>
      )}

      {etapa === "gravando" && (
        <div className="imex__card imex__card--coluna">
          <div className="imex__titulo">Gravando produtos…</div>
          <div className="imex__progresso-trilha">
            <div className="imex__progresso-barra"
              style={{ width: progresso.total ? `${Math.round((progresso.feitos / progresso.total) * 100)}%` : "0%" }} />
          </div>
          <div className="imex__ajuda">{progresso.feitos} de {progresso.total}</div>
        </div>
      )}

      {etapa === "concluido" && (
        <div className="imex__card imex__card--coluna">
          <div className="imex__sucesso">
            <LuCircleCheck aria-hidden="true" />
            Importação concluída: {resultado.criados} produto(s) criado(s), {resultado.atualizados} atualizado(s).
          </div>
          {plano.categoriasNovas.length > 0 && (
            <div className="imex__nota">
              Lembrete: associe as categorias novas ({plano.categoriasNovas.join(", ")}) a um
              grupo na aba "Grupos de Categoria" pra tudo aparecer certo no PDV e no Palm.
            </div>
          )}
          <div className="imex__acoes">
            <button type="button" className="imex__botao imex__botao--primario" onClick={voltarInicio}>
              Importar outro arquivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
