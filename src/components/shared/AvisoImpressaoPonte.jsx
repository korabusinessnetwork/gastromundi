import { LuPrinter } from "react-icons/lu";
import "./AvisoImpressaoPonte.css";

/**
 * Aviso de impressão que não saiu no papel.
 *
 * A Ponte KORA tenta imprimir sozinha várias vezes, mas se a impressora está
 * desligada, sem papel ou com o cabo solto ela desiste — e até então isso não
 * aparecia em lugar nenhum: a tela do caixa continuava verde enquanto a
 * cozinha ficava sem a comanda. Recebe tudo por props (é montado dentro do
 * AppProvider, não consome o contexto), no mesmo desenho do IndicadorRede.
 *
 * Conta IMPRESSÕES, não comandas, e é essa a palavra na tela: um lançamento
 * rende um papel por ponto de impressão configurado, e a mesma fila carrega
 * comprovante de pagamento e pré-nota. Dizer "3 comandas" quando é uma só,
 * fatiada em três pontos, é o tipo de número errado que faz o operador parar
 * de acreditar no aviso inteiro.
 *
 * Por que é intuitivo (princípio nº 1): só existe na tela quando há papel
 * faltando — se está tudo saindo, não há nada para ler. Diz em uma linha o que
 * aconteceu, há quanto tempo, e o que RESOLVE ("veja se a impressora está
 * ligada e com papel e reimprima o pedido pela tela da Cozinha"), sem pedir
 * que ninguém entenda de fila, tentativa ou código de erro. Quando a Ponte
 * para de responder, o aviso não finge que está tudo bem: ele muda de texto e
 * diz que não está conseguindo falar com a impressora deste computador — e aí
 * nem oferece a reimpressão, que também não sairia. O botão é um só, faz
 * exatamente o que o rótulo diz (vai reler a fila da impressora), mostra que
 * está trabalhando enquanto lê e admite quando não conseguiu conferir.
 *
 * O mesmo aviso serve o caminho irmão, o pedido que chega pelo realtime e é
 * impresso pelo computador do caixa (`useImpressaoLancamentos`). Ali sabemos
 * QUAL comanda não saiu, então `comandas` nomeia o papel que faltou em vez de
 * só contar, e o botão dispensa o aviso (não há fila da Ponte para reler) com
 * o rótulo que o chamador passar. Dois avisos ao mesmo tempo são possíveis no
 * mesmo PC, por isso `empilhado` sobe o segundo: um tapando o outro esconderia
 * justamente a comanda que ninguém sabe que está faltando.
 *
 * @param {object} props
 * @param {number} props.impressoes quantas impressões não saíram (0 = some).
 * @param {string[]} [props.comandas] quais comandas não saíram, quando se sabe.
 * @param {number} [props.esperaMs] há quanto tempo a primeira delas espera.
 * @param {boolean} [props.ponteSemResposta] a Ponte deste PC parou de responder.
 * @param {boolean} [props.conferindo] a leitura da fila está acontecendo agora.
 * @param {boolean} [props.falhaAoConferir] a última conferência não foi adiante.
 * @param {() => void} [props.onConferir] chamado pelo botão do aviso.
 * @param {string} [props.rotuloBotao] o que o botão diz.
 * @param {boolean} [props.empilhado] sobe o aviso, para não cobrir o outro.
 */
export default function AvisoImpressaoPonte({
  impressoes = 0,
  comandas = [],
  esperaMs = 0,
  ponteSemResposta = false,
  conferindo = false,
  falhaAoConferir = false,
  onConferir,
  rotuloBotao = "Conferir de novo",
  empilhado = false,
}) {
  const paradas = impressoes > 0 || comandas.length > 0;
  if (!paradas && !ponteSemResposta) return null;

  const { titulo, detalhe } = ponteSemResposta
    ? textoPonteMuda(impressoes)
    : comandas.length > 0
      ? textoComandasQueNaoSairam(comandas)
      : textoImpressaoParada(impressoes, esperaMs);

  return (
    <div
      className={`aviso-impressao-ponte${empilhado ? " aviso-impressao-ponte--empilhado" : ""}`}
      role="status"
      aria-live="polite"
    >
      <LuPrinter className="aviso-impressao-ponte__icone" size={22} aria-hidden="true" />
      <div className="aviso-impressao-ponte__texto">
        <strong className="aviso-impressao-ponte__titulo">{titulo}</strong>
        <span className="aviso-impressao-ponte__detalhe">{detalhe}</span>
        {falhaAoConferir && (
          <span className="aviso-impressao-ponte__detalhe">
            Não consegui conferir agora. Tente daqui a pouco.
          </span>
        )}
      </div>
      {onConferir && (
        <button
          type="button"
          className="aviso-impressao-ponte__botao"
          onClick={onConferir}
          disabled={conferindo}
        >
          {conferindo ? "Conferindo…" : rotuloBotao}
        </button>
      )}
    </div>
  );
}

// O aviso avisava e abandonava: dizia para olhar a impressora e parava por
// aí, sem dizer como tirar o papel que faltou. A reimpressão de um clique
// existe na tela da Cozinha (botão de impressora em cada pedido) — é para lá
// que quem está no balcão precisa ser mandado.
function textoImpressaoParada(impressoes, esperaMs) {
  const titulo = impressoes === 1
    ? "1 impressão não saiu na impressora"
    : `${impressoes} impressões não saíram na impressora`;

  const espera = descreverEspera(esperaMs);
  const comeco = espera ? `A primeira está esperando ${espera}. ` : "";
  return {
    titulo,
    detalhe: `${comeco}Veja se a impressora está ligada e com papel e reimprima o pedido pela tela da Cozinha.`,
  };
}

// Pedido que chegou pelo realtime e não saiu no papel. Aqui, ao contrário da
// fila da Ponte, sabemos exatamente qual comanda ficou sem a via, e é isso que
// o aviso diz primeiro: com a cozinha atrasada, "uma impressão não saiu" manda
// o operador procurar no escuro. O que resolve é a reimpressão de um clique da
// tela da Cozinha, e é para lá que ele é mandado.
function textoComandasQueNaoSairam(comandas) {
  if (comandas.length === 1) {
    return {
      titulo: `${comandas[0]} não saiu na impressora`,
      detalhe: "Veja se a impressora está ligada e com papel e reimprima pela tela da Cozinha, no botão de impressora do pedido.",
    };
  }
  return {
    titulo: `${comandas.length} comandas não saíram na impressora`,
    detalhe: `Não saíram: ${comandas.join(", ")}. Veja se a impressora está ligada e com papel e reimprima pela tela da Cozinha, no botão de impressora do pedido.`,
  };
}

// A Ponte caiu no meio do serviço. Enquanto ela não responde, NADA sai no
// papel — inclusive a reimpressão da Cozinha —, então mandar reimprimir aqui
// seria mandar o operador apertar um botão que não resolve nada.
function textoPonteMuda(impressoes) {
  const havia = impressoes === 1
    ? "Havia 1 impressão esperando. "
    : impressoes > 1
      ? `Havia ${impressoes} impressões esperando. `
      : "Enquanto isso, nada é impresso neste computador. ";
  return {
    titulo: "Não estou conseguindo falar com a impressora deste computador",
    detalhe: `${havia}Veja se a Ponte KORA está aberta e se a impressora está ligada e com papel.`,
  };
}

// Tempo em linguagem de quem está no balcão. Abaixo de um minuto não vira
// texto: "há 0 minutos" não diz nada e o aviso já diz o essencial sozinho.
function descreverEspera(ms) {
  const minutos = Math.floor((Number(ms) || 0) / 60000);
  if (minutos < 1) return "";
  if (minutos < 60) return `há ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
}
