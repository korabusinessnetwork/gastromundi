// Métricas da refatoração (seção 4 de docs/09_BACKLOG/plano_refatoracao.md).
//
// Uso:
//   node scripts/metricas-refatoracao.mjs          tabela legível
//   node scripts/metricas-refatoracao.mjs --json   o mesmo em JSON
//
// Só lê arquivos, não roda teste nem build: esses números (quantidade de testes,
// tamanho do pacote) vêm de `npm test` e `npm run build` e são anotados à mão no
// _loop.md. Se existir `dist/`, o maior pacote JS dele é lido daqui também.
//
// Cada contagem é uma aproximação por texto, a mesma em todas as rodadas. O que
// importa é a tendência entre uma medição e outra, não o número absoluto.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const SRC = join(RAIZ, "src");

function listar(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...listar(caminho));
    else saida.push(caminho);
  }
  return saida;
}

const arquivos = listar(SRC)
  .filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f) && !f.includes("__fixtures__"))
  .map((f) => ({ caminho: relative(RAIZ, f), texto: readFileSync(f, "utf8") }));

const linhas = (t) => t.split("\n").length;
const contar = (t, re) => (t.match(re) ?? []).length;

// Onde uma chamada ao Supabase mora. `dados/` é a camada-alvo (fase 1).
function areaDoArquivo(caminho) {
  if (caminho.includes("/dados/")) return "dados";
  if (caminho.startsWith("src/context/")) return "contexto";
  if (/^src\/(components|pages|routes|layouts)\//.test(caminho)) return "telas";
  return "lib";
}

// `style={{ ... }}` que só atribui variável CSS é o padrão permitido (valor que
// vem de dado). Qualquer outra coisa é estilo inline a eliminar (fase 5).
function classificarEstilos(texto) {
  let soVariavel = 0;
  let outros = 0;
  for (const m of texto.matchAll(/style=\{\{([^{}]*)\}\}/g)) {
    const corpo = m[1].trim().replace(/,\s*$/, "");
    const pares = corpo ? corpo.split(/,(?![^(]*\))/) : [];
    if (pares.length && pares.every((p) => /^\s*["']--[\w-]+["']\s*:/.test(p))) soVariavel++;
    else outros++;
  }
  // Estilos com objeto aninhado não casam a regex acima; contam como "outros".
  outros += contar(texto, /style=\{\{/g) - soVariavel - outros;
  return { soVariavel, outros };
}

const supabasePorArea = { telas: 0, contexto: 0, lib: 0, dados: 0 };
const supabasePorArquivo = [];
let estilosOutros = 0;
let estilosSoVariavel = 0;
const estilosPorArquivo = [];
let hexNoJsx = 0;
const celularImportaDesktop = [];
const featuresImportaDesktop = [];
let maiorUseState = { caminho: "", total: 0 };

for (const { caminho, texto } of arquivos) {
  const chamadas = contar(texto, /supabase\s*\.\s*(from|rpc)\s*\(/g);
  if (chamadas) {
    supabasePorArea[areaDoArquivo(caminho)] += chamadas;
    supabasePorArquivo.push({ caminho, chamadas });
  }

  if (caminho.endsWith(".jsx")) {
    const { soVariavel, outros } = classificarEstilos(texto);
    estilosOutros += outros;
    estilosSoVariavel += soVariavel;
    if (outros) estilosPorArquivo.push({ caminho, total: outros });
    hexNoJsx += contar(texto, /#[0-9a-fA-F]{6}\b/g);
  }

  // A camada de funcionalidade (`src/features/`) também não depende das telas do
  // computador: um gancho que o celular usa e que importa de lá carrega a mesma
  // dependência, só que um passo adiante, e a contagem de cima não a veria.
  if (caminho.startsWith("src/features/") && /from\s+["'][^"']*components\/desktop\//.test(texto)) {
    featuresImportaDesktop.push(caminho);
  }

  if (caminho.startsWith("src/pages/mobile/") && /from\s+["'][^"']*components\/desktop\//.test(texto)) {
    celularImportaDesktop.push(caminho);
  }

  const useStates = contar(texto, /\buseState\s*\(/g);
  if (useStates > maiorUseState.total) maiorUseState = { caminho, total: useStates };
}

const appContext = arquivos.find((a) => a.caminho === "src/context/AppContext.jsx");
const grandes = arquivos
  .map((a) => ({ caminho: a.caminho, linhas: linhas(a.texto) }))
  .filter((a) => a.linhas > 600)
  .sort((a, b) => b.linhas - a.linhas);

let maiorPacote = null;
const assets = join(RAIZ, "dist", "assets");
if (existsSync(assets)) {
  for (const nome of readdirSync(assets).filter((n) => n.endsWith(".js"))) {
    const kb = statSync(join(assets, nome)).size / 1024;
    if (!maiorPacote || kb > maiorPacote.kb) maiorPacote = { nome, kb: Math.round(kb) };
  }
}

const metricas = {
  appContextLinhas: appContext ? linhas(appContext.texto) : 0,
  arquivosAcimaDe600: grandes.length,
  arquivosGrandes: grandes,
  maiorUseState,
  supabaseForaDeDados: supabasePorArea.telas + supabasePorArea.contexto + supabasePorArea.lib,
  supabasePorArea,
  supabaseEmTelas: supabasePorArquivo.filter((s) => areaDoArquivo(s.caminho) === "telas"),
  estiloInline: estilosOutros,
  estiloSoVariavel: estilosSoVariavel,
  estiloPorArquivo: estilosPorArquivo.sort((a, b) => b.total - a.total),
  hexNoJsx,
  celularImportaDesktop,
  featuresImportaDesktop,
  maiorPacoteJs: maiorPacote,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(metricas, null, 2));
} else {
  const linha = (rotulo, valor) => console.log(`${rotulo.padEnd(52, ".")} ${valor}`);
  console.log("Métricas da refatoração\n");
  linha("Linhas do AppContext.jsx", metricas.appContextLinhas);
  linha("Arquivos de código acima de 600 linhas", metricas.arquivosAcimaDe600);
  linha("Maior número de useState num arquivo", `${maiorUseState.total} (${maiorUseState.caminho})`);
  linha("Chamadas ao Supabase fora de dados/", metricas.supabaseForaDeDados);
  linha("  em telas", supabasePorArea.telas);
  linha("  no contexto", supabasePorArea.contexto);
  linha("  em lib, utils e hooks", supabasePorArea.lib);
  linha("  em dados/ (alvo)", supabasePorArea.dados);
  linha("style={{}} que não é só variável CSS", metricas.estiloInline);
  linha("style={{}} só com variável CSS (permitido)", metricas.estiloSoVariavel);
  linha("Cor hexadecimal em JSX", metricas.hexNoJsx);
  linha("Telas de celular importando components/desktop", celularImportaDesktop.length);
  linha("Arquivos de features/ importando components/desktop", featuresImportaDesktop.length);
  linha("Maior pacote JS em dist/", maiorPacote ? `${maiorPacote.kb} kB (${maiorPacote.nome})` : "sem dist/, rode npm run build");
  console.log("\nArquivos acima de 600 linhas:");
  for (const g of grandes) console.log(`  ${String(g.linhas).padStart(5)}  ${g.caminho}`);
  console.log("\nTelas que chamam o Supabase direto:");
  for (const s of metricas.supabaseEmTelas) console.log(`  ${String(s.chamadas).padStart(5)}  ${s.caminho}`);
  console.log("\nGravações em várias etapas pelo navegador: conferência manual, ver a fase 1 do plano.");
}
