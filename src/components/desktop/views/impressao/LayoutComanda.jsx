import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { buscarConfigImpressao, salvarConfigImpressao, montarCupomPreNota } from "@/lib/impressao";
import {
  TIPOS_BLOCO,
  LAYOUT_COMANDA_PADRAO,
  layoutComandaDeConfig,
  completarLayoutComanda,
  normalizarLayoutComanda,
  configLegadoDeLayout,
  blocoNovo,
} from "@/lib/impressao/layoutComanda";
import { gerarHtmlComPerfil } from "@/lib/impressao/drivers/browserRaster";
import { formatarComprovanteEscpos } from "@/lib/impressao/escposFormatador";
import { colunasEscpos } from "@/lib/impressao/largura";
import { logoUrlTenant } from "@/lib/tema";
import BlocoComanda from "./BlocoComanda";
import { LuCircleCheck, LuCircleAlert, LuRefreshCw, LuPlus, LuRotateCcw, LuType } from "react-icons/lu";
import "./LayoutComanda.css";

/**
 * Editor do layout da comanda — o papel que vai para a mão do cliente,
 * montado bloco a bloco pelo dono: o que aparece, em que ordem, como e
 * com que texto.
 *
 * Por que uma PILHA de blocos e não uma tela livre de arrastar em
 * qualquer posição: papel térmico é uma coluna de largura fixa (32 ou
 * 48 caracteres) e a impressora imprime linha a linha. Uma tela livre
 * mostraria um resultado que a impressora não sabe reproduzir — e a
 * pré-visualização passaria a mentir, que é o pior que uma tela dessas
 * pode fazer.
 *
 * A pré-visualização passa pelo MESMO caminho da impressão de verdade
 * (`montarCupomPreNota` → renderizador), nas duas saídas: o papel do
 * navegador e o texto puro da térmica. Ver `lib/impressao/layoutComanda.js`.
 *
 * Multi-tenant (decisão 017): nome e logo vêm do tenant, nunca do código.
 */

// Venda de exemplo da pré-visualização — nunca é uma venda real. Itens
// genéricos de propósito: é um exemplo mostrado a todo estabelecimento,
// não pode ser o cardápio de nenhum (decisão 017).
const VENDA_EXEMPLO = {
  comanda: "42",
  items: [
    { name: "Prato do dia", qty: 2, price: 32.5, emoji: "🍽️", obs: ["sem cebola"] },
    { name: "Refrigerante lata", qty: 1, price: 6, emoji: "🥤", obs: [] },
  ],
  valorTaxa: 7.1,
  total: 78.1,
  pagamentos: [{ metodo: "pix", valor: 78.1, troco: 0 }],
};

// Blocos que o dono acrescenta quantas vezes quiser. Os demais já
// nascem na lista (ligados ou não) — ver `completarLayoutComanda`.
const ADICIONAVEIS = [
  { tipo: "texto", rotulo: "Texto livre", Icone: LuType },
  { tipo: "separador", rotulo: "Linha divisória", Icone: LuPlus },
  { tipo: "espaco", rotulo: "Espaço em branco", Icone: LuPlus },
];

const mesmoLayout = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function LayoutComanda() {
  const { tenant } = useApp();

  const [blocos, setBlocos] = useState([]);
  // Última versão gravada (já normalizada) — é contra ela que "Salvar"
  // decide se há algo a salvar, para o botão não convidar a gravar o
  // que já está no banco.
  const [blocosSalvos, setBlocosSalvos] = useState(null);
  const [configCompleta, setConfigCompleta] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"
  const [confirmandoPadrao, setConfirmandoPadrao] = useState(false);
  const [visao, setVisao] = useState("papel"); // papel | termica
  const arrastando = useRef(null);

  // Falha na LEITURA não pode virar tela normal com o layout de
  // fábrica: o dono veria um papel que não é o dele e, ao salvar por
  // cima, apagaria o layout real que só não foi lido.
  const carregar = useCallback(() => {
    setCarregando(true);
    setErroCarga(null);
    buscarConfigImpressao()
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error("Não deu para ler a configuração de impressão.");
        const lista = completarLayoutComanda(layoutComandaDeConfig(data));
        setConfigCompleta(data);
        setBlocos(lista);
        setBlocosSalvos(normalizarLayoutComanda(lista));
        // Quem imprime na térmica vê primeiro a saída da térmica: é a
        // dele que vale, e é a que não tem letra grande nem negrito.
        setVisao(data?.perfilImpressora?.driver === "escpos-ponte" ? "termica" : "papel");
        setCarregando(false);
      })
      .catch((e) => {
        setErroCarga(e?.message || "Não deu para ler a configuração de impressão.");
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mexer = (proximos) => {
    setBlocos(proximos);
    setStatus(null);
    setConfirmandoPadrao(false);
  };

  const alterarBloco = (id, patch) =>
    mexer(blocos.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const moverBloco = (indice, delta) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= blocos.length) return;
    const proximos = [...blocos];
    [proximos[indice], proximos[destino]] = [proximos[destino], proximos[indice]];
    mexer(proximos);
  };

  const soltarEm = (destino) => {
    const origem = arrastando.current;
    arrastando.current = null;
    if (origem == null || origem === destino) return;
    const proximos = [...blocos];
    const [movido] = proximos.splice(origem, 1);
    proximos.splice(destino, 0, movido);
    mexer(proximos);
  };

  const removerBloco = (id) => {
    mexer(blocos.filter((b) => b.id !== id));
    setSelecionado((atual) => (atual === id ? null : atual));
  };

  // Bloco novo entra logo abaixo do que está selecionado (é ali que o
  // dono está olhando) e já abre aberto para ser preenchido.
  const adicionarBloco = (tipo) => {
    const novo = blocoNovo(tipo, blocos);
    if (!novo) return;
    const indice = blocos.findIndex((b) => b.id === selecionado);
    const proximos = [...blocos];
    proximos.splice(indice >= 0 ? indice + 1 : proximos.length, 0, novo);
    mexer(proximos);
    setSelecionado(novo.id);
  };

  // Volta à ARRUMAÇÃO de fábrica (ordem, alinhamento, tamanho) sem mexer
  // no CONTEÚDO: o que o dono escreveu e o que ele escolheu imprimir
  // continuam. Apagar o endereço do papel num clique seria perda
  // silenciosa — quem clica aqui quer desentortar o layout, não parar de
  // imprimir os próprios dados. Bloco escondido por engano volta com um
  // clique no olho, à vista de todos na pré-visualização.
  const restaurarPadrao = () => {
    mexer(LAYOUT_COMANDA_PADRAO.map((padrao) => {
      const atual = blocos.find((b) => b.tipo === padrao.tipo);
      const restaurado = { ...padrao };
      if (atual) {
        restaurado.visivel = atual.visivel !== false;
        if (Object.prototype.hasOwnProperty.call(padrao, "texto")) restaurado.texto = atual.texto ?? padrao.texto;
      }
      return restaurado;
    }));
    setSelecionado(null);
  };

  // O que vai para o banco é o mesmo que alimenta a pré-visualização:
  // o dono salva exatamente o papel que está vendo.
  const paraSalvar = useMemo(() => normalizarLayoutComanda(blocos), [blocos]);
  const alterado = blocosSalvos != null && !mesmoLayout(paraSalvar, blocosSalvos);

  // Grava o layout E o espelho dos campos antigos (endereço, CNPJ,
  // rodapé, mostrar logo), que a identidade resolvida ainda lê. Só a
  // fatia do layout é tocada: salvar aqui nunca descarta a impressora
  // escolhida na aba "Impressora e papel".
  const salvar = async () => {
    if (salvando || !alterado) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), ...configLegadoDeLayout(paraSalvar), layoutComanda: paraSalvar };
      const { error } = await salvarConfigImpressao(config);
      if (error) {
        setStatus("erro");
        return;
      }
      setConfigCompleta(config);
      setBlocosSalvos(paraSalvar);
      setStatus("sucesso");
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  const documento = useMemo(() => {
    const configPreview = {
      ...(configCompleta ?? {}),
      ...configLegadoDeLayout(paraSalvar),
      layoutComanda: paraSalvar,
    };
    return montarCupomPreNota({ venda: VENDA_EXEMPLO, tenant, configImpressao: configPreview });
  }, [paraSalvar, tenant, configCompleta]);

  const htmlPreview = useMemo(
    () => gerarHtmlComPerfil(documento, configCompleta?.perfilImpressora),
    [documento, configCompleta],
  );

  const textoTermica = useMemo(
    () => formatarComprovanteEscpos(documento, colunasEscpos(configCompleta?.perfilImpressora?.larguraMm)).join("\n"),
    [documento, configCompleta],
  );

  // Ligar o bloco do logo sem logo cadastrada não dá erro nenhum — ele
  // só não sai. Sem este aviso o dono ficaria procurando na tela a
  // imagem que nunca existiu.
  const logoLigadoSemImagem =
    blocos.some((b) => b.tipo === "logo" && b.visivel !== false) && !logoUrlTenant(tenant?.tema);

  if (erroCarga) {
    return (
      <div className="layout-comanda__erro-carga">
        <LuCircleAlert size={20} />
        <div>
          <strong>Não deu para carregar o layout da comanda.</strong>
          <p>{erroCarga}</p>
          <p>Nada foi alterado. Verifique a internet e tente de novo.</p>
        </div>
        <button type="button" className="layout-comanda__botao-recarregar" onClick={carregar}>
          <LuRefreshCw size={16} /> Tentar de novo
        </button>
      </div>
    );
  }

  if (carregando) {
    return <div className="layout-comanda__carregando">Carregando…</div>;
  }

  return (
    <div className="layout-comanda">
      <p className="layout-comanda__intro">
        Monte a comanda do cliente do jeito que você quiser: arraste para mudar a ordem, clique
        num bloco para editar e use o olho para escolher o que sai impresso. O papel ao lado
        muda junto. A via da cozinha não muda aqui — ela sai só com os itens, para o cozinheiro
        ler rápido.
      </p>

      <div className="layout-comanda__colunas">
        <div className="layout-comanda__editor">
          <h3 className="layout-comanda__titulo-secao">Blocos da comanda, de cima para baixo</h3>

          <ul className="layout-comanda__lista">
            {blocos.map((bloco, i) => (
              <BlocoComanda
                key={bloco.id}
                bloco={bloco}
                selecionado={selecionado === bloco.id}
                primeiro={i === 0}
                ultimo={i === blocos.length - 1}
                removivel={TIPOS_BLOCO[bloco.tipo]?.repetivel === true}
                onSelecionar={() => setSelecionado((atual) => (atual === bloco.id ? null : bloco.id))}
                onAlterar={(patch) => alterarBloco(bloco.id, patch)}
                onMover={(delta) => moverBloco(i, delta)}
                onRemover={() => removerBloco(bloco.id)}
                onArrastarInicio={() => { arrastando.current = i; }}
                onSoltarAqui={() => soltarEm(i)}
              />
            ))}
          </ul>

          <div className="layout-comanda__adicionar">
            <span className="layout-comanda__rotulo-adicionar">Acrescentar:</span>
            {ADICIONAVEIS.map(({ tipo, rotulo, Icone }) => (
              <button key={tipo} type="button" onClick={() => adicionarBloco(tipo)} className="layout-comanda__btn-adicionar">
                <Icone size={14} /> {rotulo}
              </button>
            ))}
          </div>

          <div className="layout-comanda__acoes">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !alterado}
              title={!alterado && !salvando ? "Nada mudou desde a última vez que você salvou" : undefined}
              className="layout-comanda__btn-salvar"
            >
              {salvando ? "Salvando…" : "Salvar layout"}
            </button>

            {confirmandoPadrao ? (
              <span className="layout-comanda__confirmar">
                Voltar à ordem e ao visual de fábrica? O que você escreveu e o que está
                imprimindo continuam; os blocos que você acrescentou serão removidos.
                <button type="button" onClick={restaurarPadrao} className="layout-comanda__btn-confirmar">
                  Sim, voltar ao padrão
                </button>
                <button type="button" onClick={() => setConfirmandoPadrao(false)} className="layout-comanda__btn-cancelar">
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmandoPadrao(true)} className="layout-comanda__btn-padrao">
                <LuRotateCcw size={14} /> Voltar ao padrão
              </button>
            )}

            {status === "sucesso" && (
              <span className="layout-comanda__status layout-comanda__status--sucesso">
                <LuCircleCheck size={13} /> Salvo — a próxima comanda já sai assim
              </span>
            )}
            {status === "erro" && (
              <span className="layout-comanda__status layout-comanda__status--erro">
                <LuCircleAlert size={13} /> Falha ao salvar — nada mudou
              </span>
            )}
            {!alterado && !salvando && status == null && (
              <span className="layout-comanda__ajuda">Tudo salvo.</span>
            )}
          </div>
        </div>

        {/* Pré-visualização — o mesmo caminho da impressão de verdade, nas
            duas saídas possíveis. Quem imprime na térmica precisa ver a
            térmica: lá não existe logo, letra grande nem negrito. */}
        <div className="layout-comanda__preview-coluna">
          <div className="layout-comanda__abas-preview" role="group" aria-label="Como vai sair">
            <button type="button" aria-pressed={visao === "papel"} onClick={() => setVisao("papel")}
                    className={`layout-comanda__aba${visao === "papel" ? " layout-comanda__aba--ativa" : ""}`}>
              No papel
            </button>
            <button type="button" aria-pressed={visao === "termica"} onClick={() => setVisao("termica")}
                    className={`layout-comanda__aba${visao === "termica" ? " layout-comanda__aba--ativa" : ""}`}>
              Na térmica
            </button>
          </div>

          <div className="layout-comanda__preview-moldura">
            {visao === "papel" ? (
              <iframe title="Pré-visualização da comanda" srcDoc={htmlPreview} className="layout-comanda__preview-iframe" />
            ) : (
              <pre className="layout-comanda__preview-termica">{textoTermica}</pre>
            )}
          </div>

          <div className="layout-comanda__ajuda">
            {visao === "papel"
              ? "Exemplo com uma venda de mentira. A largura e o tamanho da letra vêm da aba “Impressora e papel”."
              : "Como a impressora térmica imprime: só texto, na largura real do papel. Logo, tamanho de letra e negrito não existem nela."}
          </div>

          {logoLigadoSemImagem && (
            <div className="layout-comanda__status layout-comanda__status--atencao">
              <LuCircleAlert size={13} />
              Este estabelecimento ainda não tem logo cadastrada, então o bloco “Logo” não sai no
              papel. Cadastre em Configurações → Identidade.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
