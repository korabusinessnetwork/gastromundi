import { useRef, useState } from "react";
import "./ImportarExportarTab.css";
import { useApp } from "@/context/AppContext";
import {
  decodificarArquivo,
  validarPlanilhaProdutos,
  validarPlanilhaClientes,
  validarPlanilhaEstoque,
  montarCSVProdutos,
  montarCSVClientes,
  montarCSVEstoque,
  gerarModeloCSV,
  gerarModeloClientesCSV,
  gerarModeloEstoqueCSV,
} from "@/lib/importacao/planilha";
import {
  planejarImportacaoProdutos,
  aplicarImportacaoProdutos,
  buscarProdutosParaMigracao,
} from "@/lib/importacao/produtos";
import {
  planejarImportacaoClientes,
  aplicarImportacaoClientes,
  buscarClientesParaMigracao,
} from "@/lib/importacao/clientes";
import {
  planejarImportacaoEstoque,
  aplicarImportacaoEstoque,
  buscarEstoqueParaMigracao,
  paraLinhasExportEstoque,
} from "@/lib/importacao/estoque";
import { LuDownload, LuUpload, LuTriangleAlert, LuCircleCheck } from "react-icons/lu";

/**
 * Aba "Importar / Exportar" das Configurações — migração de dados
 * (docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md, Fases 1 e 2):
 * produtos, clientes e estoque inicial, no MESMO wizard.
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

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — planilha de migração é pequena

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
  const { recarregarProdutos, recarregarEstoque, currentUser } = useApp();
  const inputRef = useRef(null);
  const tipoRef = useRef(null); // tipo escolhido no clique, lido no onChange do input

  // Cada tipo pluga suas funções no MESMO fluxo do wizard. O plano é
  // normalizado pra { criar, atualizar, iguais, bruto } — o preview e a
  // confirmação não precisam saber qual tipo está rodando.
  const TIPOS = {
    produtos: {
      titulo: "Produtos (cardápio)",
      ajuda:
        "Veio de outro sistema? Baixe a planilha modelo, preencha (ou cole os dados " +
        "do export antigo) e envie aqui. Você confere tudo antes de gravar.",
      modeloArquivo: "modelo-produtos-kora.csv",
      gerarModelo: gerarModeloCSV,
      exportArquivo: "produtos-kora.csv",
      exportRotulo: "Exportar produtos",
      exportar: async () => {
        const { data, error } = await buscarProdutosParaMigracao();
        return error ? { error } : { csv: montarCSVProdutos(data || []) };
      },
      preparar: async (texto) => {
        const v = validarPlanilhaProdutos(texto);
        const { data, error } = await buscarProdutosParaMigracao();
        if (error) return { falha: "Não consegui ler os produtos atuais. Tente de novo." };
        const bruto = planejarImportacaoProdutos(v.produtos, data || []);
        return {
          validacao: { erros: v.erros, avisos: v.avisos },
          plano: { criar: bruto.criar, atualizar: bruto.atualizar, iguais: bruto.iguais, bruto },
        };
      },
      aplicar: (plano, onProg) => aplicarImportacaoProdutos(plano.bruto, onProg),
      aposGravar: recarregarProdutos,
      chip: (p) => `${p.emoji || "🍽️"} ${p.nome}`,
      pillAtualizar: (n) => `${n} atualização(ões)`,
      tituloGravando: "Gravando produtos…",
      resumo: (r) => `Importação concluída: ${r.criados} produto(s) criado(s), ${r.atualizados} atualizado(s).`,
      nota: (plano) =>
        plano.bruto.categoriasNovas?.length > 0
          ? `Categorias novas que serão criadas: ${plano.bruto.categoriasNovas.join(", ")}. ` +
            `Depois associe cada uma a um grupo na aba "Grupos de Categoria" pra tudo aparecer certo no PDV e no Palm.`
          : null,
    },

    clientes: {
      titulo: "Clientes",
      ajuda:
        "Traga sua lista de clientes de uma vez (nome e telefone; endereço e observações " +
        "se tiver). O telefone evita cadastro duplicado.",
      modeloArquivo: "modelo-clientes-kora.csv",
      gerarModelo: gerarModeloClientesCSV,
      exportArquivo: "clientes-kora.csv",
      exportRotulo: "Exportar clientes",
      exportar: async () => {
        const { data, error } = await buscarClientesParaMigracao();
        return error ? { error } : { csv: montarCSVClientes(data || []) };
      },
      preparar: async (texto) => {
        const v = validarPlanilhaClientes(texto);
        const { data, error } = await buscarClientesParaMigracao();
        if (error) return { falha: "Não consegui ler os clientes atuais. Tente de novo." };
        const bruto = planejarImportacaoClientes(v.clientes, data || []);
        return {
          validacao: { erros: v.erros, avisos: v.avisos },
          plano: { criar: bruto.criar, atualizar: bruto.atualizar, iguais: bruto.iguais, bruto },
        };
      },
      aplicar: (plano, onProg) => aplicarImportacaoClientes(plano.bruto, onProg, currentUser?.username),
      aposGravar: null,
      chip: (c) => `${c.nome} · ${c.telefone}`,
      pillAtualizar: (n) => `${n} atualização(ões)`,
      tituloGravando: "Gravando clientes…",
      resumo: (r) => `Importação concluída: ${r.criados} cliente(s) criado(s), ${r.atualizados} atualizado(s).`,
      nota: () => null,
    },

    estoque: {
      titulo: "Estoque inicial",
      ajuda:
        "Depois de importar os produtos, defina a contagem inicial (e o mínimo, se quiser) " +
        "de cada um. O arquivo usa o nome do produto como está no cardápio.",
      modeloArquivo: "modelo-estoque-kora.csv",
      gerarModelo: gerarModeloEstoqueCSV,
      exportArquivo: "estoque-kora.csv",
      exportRotulo: "Exportar estoque",
      exportar: async () => {
        const { data, error } = await buscarEstoqueParaMigracao();
        return error ? { error } : { csv: montarCSVEstoque(paraLinhasExportEstoque(data)) };
      },
      preparar: async (texto) => {
        const v = validarPlanilhaEstoque(texto);
        const [{ data: produtos, error: eProdutos }, { data: atual, error: eAtual }] =
          await Promise.all([buscarProdutosParaMigracao(), buscarEstoqueParaMigracao()]);
        if (eProdutos || eAtual) return { falha: "Não consegui ler o estoque atual. Tente de novo." };
        const bruto = planejarImportacaoEstoque(v.itens, produtos || [], atual || []);
        return {
          // Produto fora do cardápio entra como erro por linha — mesma UI
          validacao: { erros: [...v.erros, ...bruto.naoEncontrados], avisos: v.avisos },
          plano: { criar: [], atualizar: bruto.definir, iguais: bruto.iguais, bruto },
        };
      },
      aplicar: async (plano, onProg) => {
        const r = await aplicarImportacaoEstoque(plano.bruto, onProg);
        return { criados: 0, atualizados: r.definidos, error: r.error };
      },
      aposGravar: recarregarEstoque,
      chip: (e) => `${e.nome} — ${e.quantidade}`,
      pillAtualizar: (n) => `${n} produto(s) com estoque a definir`,
      tituloGravando: "Gravando estoque…",
      resumo: (r) => `Importação concluída: estoque definido para ${r.atualizados} produto(s).`,
      nota: () => null,
    },
  };

  // etapa: inicio | preview | gravando | concluido
  const [etapa, setEtapa] = useState("inicio");
  const [tipo, setTipo] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [validacao, setValidacao] = useState(null); // { erros, avisos }
  const [plano, setPlano] = useState(null); // { criar, atualizar, iguais, bruto }
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState(null); // { criados, atualizados }
  const [falha, setFalha] = useState("");
  const [exportando, setExportando] = useState("");

  const cfg = tipo ? TIPOS[tipo] : null;

  const voltarInicio = () => {
    setEtapa("inicio");
    setTipo(null);
    setValidacao(null);
    setPlano(null);
    setFalha("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const escolherArquivo = (novoTipo) => {
    tipoRef.current = novoTipo;
    inputRef.current?.click();
  };

  const aoEscolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    const cfgEscolhida = TIPOS[tipoRef.current];
    if (!arquivo || !cfgEscolhida) return;
    setFalha("");
    if (arquivo.size > MAX_BYTES) {
      setFalha("Arquivo maior que 2 MB — exporte só a lista, sem outras abas.");
      return;
    }
    try {
      const texto = decodificarArquivo(await arquivo.arrayBuffer());
      const prep = await cfgEscolhida.preparar(texto);
      if (prep.falha) { setFalha(prep.falha); return; }
      setTipo(tipoRef.current);
      setNomeArquivo(arquivo.name);
      setValidacao(prep.validacao);
      setPlano(prep.plano);
      setEtapa("preview");
    } catch {
      setFalha("Não consegui ler esse arquivo. Ele é um CSV? Baixe o modelo e compare.");
    }
  };

  const confirmar = async () => {
    setEtapa("gravando");
    setProgresso({ feitos: 0, total: plano.criar.length + plano.atualizar.length });
    const r = await cfg.aplicar(plano, (feitos, total) => setProgresso({ feitos, total }));
    if (r.error) {
      setFalha(`A gravação parou no meio: ${r.error.message || "erro no banco"}. ` +
        `${r.criados + r.atualizados} registro(s) já entraram — rode o mesmo arquivo de novo que o resto continua de onde parou.`);
      setEtapa("preview");
      return;
    }
    await cfg.aposGravar?.();
    setResultado(r);
    setEtapa("concluido");
  };

  const exportar = async (novoTipo) => {
    const cfgExport = TIPOS[novoTipo];
    setExportando(novoTipo);
    setFalha("");
    const { csv, error } = await cfgExport.exportar();
    setExportando("");
    if (error) { setFalha("Não consegui exportar agora. Tente de novo."); return; }
    baixarArquivo(cfgExport.exportArquivo, csv);
  };

  const temErros = validacao?.erros?.length > 0;
  const totalAImportar = plano ? plano.criar.length + plano.atualizar.length : 0;
  const nadaAFazer = plano && totalAImportar === 0;
  const nota = cfg && plano ? cfg.nota(plano) : null;

  return (
    <div className="imex">
      {falha && (
        <div className="imex__falha" role="alert">
          <LuTriangleAlert aria-hidden="true" /> {falha}
        </div>
      )}

      {etapa === "inicio" && (
        <>
          {Object.entries(TIPOS).map(([id, t]) => (
            <div key={id} className="imex__card">
              <div className="imex__card-info">
                <div className="imex__titulo">{t.titulo}</div>
                <div className="imex__ajuda">{t.ajuda}</div>
              </div>
              <div className="imex__acoes">
                <button type="button" className="imex__botao imex__botao--secundario"
                  onClick={() => baixarArquivo(t.modeloArquivo, t.gerarModelo())}>
                  <LuDownload aria-hidden="true" /> Baixar modelo
                </button>
                <button type="button" className="imex__botao imex__botao--secundario"
                  disabled={exportando === id} onClick={() => exportar(id)}>
                  <LuDownload aria-hidden="true" /> {exportando === id ? "Exportando…" : t.exportRotulo}
                </button>
                <button type="button" className="imex__botao imex__botao--primario"
                  onClick={() => escolherArquivo(id)}>
                  <LuUpload aria-hidden="true" /> Importar…
                </button>
              </div>
            </div>
          ))}
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={aoEscolherArquivo} />
          <div className="imex__nota">
            Seus dados são seus: o export sai no mesmo formato do modelo de import — serve de
            backup e entra em qualquer conta KORA (e o que sai de lá volta pra cá).
          </div>
        </>
      )}

      {etapa === "preview" && (
        <div className="imex__card imex__card--coluna">
          <div className="imex__titulo">
            {cfg.titulo} — conferência de "{nomeArquivo}" (nada foi gravado ainda)
          </div>

          <div className="imex__resumo">
            {(tipo !== "estoque" || plano.criar.length > 0) && (
              <span className="imex__pill imex__pill--criar">{plano.criar.length} novo(s)</span>
            )}
            <span className="imex__pill imex__pill--atualizar">{cfg.pillAtualizar(plano.atualizar.length)}</span>
            <span className="imex__pill">{plano.iguais.length} já igual(is)</span>
            {temErros && <span className="imex__pill imex__pill--erro">{validacao.erros.length} linha(s) com erro</span>}
          </div>

          {nota && <div className="imex__nota">{nota}</div>}

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

          {(plano.criar.length > 0 || plano.atualizar.length > 0) && (
            <div className="imex__lista">
              {[...plano.criar, ...plano.atualizar].slice(0, 8).map((item) => (
                <span key={item.nome} className="imex__item">{cfg.chip(item)}</span>
              ))}
              {totalAImportar > 8 && <span className="imex__item">+ {totalAImportar - 8}…</span>}
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
                disabled={nadaAFazer} onClick={confirmar}>
                Importar só as {totalAImportar} válida(s) e corrigir o resto depois
              </button>
            )}
          </div>
        </div>
      )}

      {etapa === "gravando" && (
        <div className="imex__card imex__card--coluna">
          <div className="imex__titulo">{cfg.tituloGravando}</div>
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
            {cfg.resumo(resultado)}
          </div>
          {nota && <div className="imex__nota">Lembrete: {nota}</div>}
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
