import { TIPOS_BLOCO, MAX_TEXTO_BLOCO, DIGITOS_CNPJ, formatarCnpj, largurasVisiveis } from "@/lib/impressao/layoutComanda";
import {
  LuGripVertical, LuEye, LuEyeOff, LuChevronUp, LuChevronDown, LuTrash2,
  LuAlignLeft, LuAlignCenter, LuAlignRight, LuBold, LuCaseUpper, LuCircleAlert,
} from "react-icons/lu";
import LarguraColunas from "./LarguraColunas";
import "./BlocoComanda.css";

/**
 * Um bloco da comanda dentro do editor: a linha da lista (arrastar,
 * ligar/desligar, subir/descer, remover) e, quando selecionado, o
 * painel com o que dá para mudar nele.
 *
 * O painel mostra SÓ o que o tipo aceita (`TIPOS_BLOCO[tipo].props`) —
 * alinhar um "Subtotal" não faz sentido, ele é rótulo à esquerda e
 * valor à direita sempre. Controle que não faz nada é convite a errar
 * (princípio nº1).
 */

const ALINHAMENTOS = [
  { valor: "esquerda", rotulo: "À esquerda", Icone: LuAlignLeft },
  { valor: "centro", rotulo: "No meio", Icone: LuAlignCenter },
  { valor: "direita", rotulo: "À direita", Icone: LuAlignRight },
];

const TAMANHOS = [
  { valor: "pequeno", rotulo: "Pequena" },
  { valor: "normal", rotulo: "Média" },
  { valor: "grande", rotulo: "Grande" },
];

const OPCOES_ITENS = [
  { chave: "unitario", rotulo: "Preço de cada unidade", ajuda: "Só na impressão pelo navegador — na térmica sai só o total do item." },
  { chave: "observacoes", rotulo: "Observações do pedido", ajuda: "“sem cebola”, “ponto da carne”." },
  { chave: "emoji", rotulo: "Emoji do produto", ajuda: "Impressora térmica não imprime emoji; no navegador, sim." },
];

// Resumo do conteúdo na própria linha: quem bate o olho na lista já vê
// o que está escrito ali sem precisar abrir o bloco.
function resumoDoBloco(bloco, meta) {
  if (meta.props.includes("texto")) {
    const texto = String(bloco.texto ?? "").trim();
    return texto ? texto.replace(/\n/g, " · ") : "Em branco — não sai no papel";
  }
  if (bloco.tipo === "espaco") return bloco.opcoes?.linhas > 1 ? `${bloco.opcoes.linhas} linhas` : "1 linha";
  return "";
}

function Segmentado({ legenda, opcoes, valor, onEscolher }) {
  return (
    <div className="bloco-comanda__campo">
      <span className="bloco-comanda__rotulo">{legenda}</span>
      <div className="bloco-comanda__segmentado" role="group" aria-label={legenda}>
        {opcoes.map(({ valor: v, rotulo, Icone }) => (
          <button
            key={v}
            type="button"
            aria-pressed={valor === v}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => onEscolher(v)}
            className={`bloco-comanda__opcao${valor === v ? " bloco-comanda__opcao--ativa" : ""}`}
          >
            {Icone ? <Icone size={15} /> : rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BlocoComanda({
  bloco, selecionado, primeiro, ultimo, removivel, arrastavel, alvo, arrastado,
  onSelecionar, onAlterar, onMover, onRemover,
  onArrastarInicio, onArrastarFim, onArrastarSobre, onSoltarAqui, onPegar, onLargar,
}) {
  const meta = TIPOS_BLOCO[bloco.tipo];
  if (!meta) return null;

  const aceita = (prop) => meta.props.includes(prop);
  const visivel = bloco.visivel !== false;
  const idCampo = `bloco-${bloco.id}-texto`;
  const digitosCnpj = bloco.tipo === "cnpj" ? String(bloco.texto ?? "").replace(/\D/g, "").length : 0;
  const opcoesItens = bloco.opcoes ?? {};
  const mostrarUnitario = opcoesItens.unitario !== false;
  const largurasDoBloco = aceita("opcoesItens") ? largurasVisiveis(opcoesItens.larguras, mostrarUnitario) : null;

  // Metade de cima da linha = cai ANTES dela, metade de baixo = DEPOIS.
  // É a leitura natural do gesto, e é o que a marca de destino desenha.
  const posicaoNaLinha = (e) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    return e.clientY - caixa.top < caixa.height / 2 ? "antes" : "depois";
  };

  const classes = [
    "bloco-comanda",
    selecionado ? "bloco-comanda--selecionado" : "",
    visivel ? "" : "bloco-comanda--desligado",
    arrastado ? "bloco-comanda--arrastado" : "",
    alvo ? `bloco-comanda--alvo-${alvo}` : "",
  ].filter(Boolean).join(" ");

  return (
    <li
      className={classes}
      // Só a alça arrasta: com a linha inteira arrastável, começar o
      // gesto em cima do olho ou da lixeira virava arrasto em vez de
      // clique. `arrastavel` só fica ligado enquanto o dedo está na alça.
      draggable={arrastavel}
      onDragStart={onArrastarInicio}
      onDragEnd={onArrastarFim}
      onDragOver={(e) => { e.preventDefault(); onArrastarSobre(posicaoNaLinha(e)); }}
      onDrop={(e) => { e.preventDefault(); onSoltarAqui(posicaoNaLinha(e)); }}
    >
      <div className="bloco-comanda__linha">
        <span
          className="bloco-comanda__pegador"
          aria-hidden="true"
          onPointerDown={onPegar}
          onPointerUp={onLargar}
        >
          <LuGripVertical size={16} />
        </span>

        <button type="button" onClick={onSelecionar} aria-expanded={selecionado} className="bloco-comanda__titulo">
          <span className="bloco-comanda__nome">{meta.rotulo}</span>
          {resumoDoBloco(bloco, meta) && (
            <span className="bloco-comanda__resumo">{resumoDoBloco(bloco, meta)}</span>
          )}
        </button>

        <div className="bloco-comanda__acoes">
          <button
            type="button"
            role="switch"
            aria-checked={visivel}
            aria-label={`Imprimir ${meta.rotulo}`}
            title={visivel ? "Sai impresso — clique para esconder" : "Não sai impresso — clique para mostrar"}
            onClick={() => onAlterar({ visivel: !visivel })}
            className="bloco-comanda__botao"
          >
            {visivel ? <LuEye size={16} /> : <LuEyeOff size={16} />}
          </button>
          <button type="button" disabled={primeiro} aria-label={`Subir ${meta.rotulo}`} title="Subir"
                  onClick={() => onMover(-1)} className="bloco-comanda__botao">
            <LuChevronUp size={16} />
          </button>
          <button type="button" disabled={ultimo} aria-label={`Descer ${meta.rotulo}`} title="Descer"
                  onClick={() => onMover(1)} className="bloco-comanda__botao">
            <LuChevronDown size={16} />
          </button>
          {removivel && (
            <button type="button" aria-label={`Remover ${meta.rotulo}`} title="Remover"
                    onClick={onRemover} className="bloco-comanda__botao bloco-comanda__botao--perigo">
              <LuTrash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {selecionado && (
        <div className="bloco-comanda__props">
          <p className="bloco-comanda__ajuda">{meta.ajuda}</p>

          {aceita("texto") && (
            <div className="bloco-comanda__campo">
              <label className="bloco-comanda__rotulo" htmlFor={idCampo}>
                {bloco.tipo === "texto" ? "O que escrever" : "Texto"}
              </label>
              {bloco.tipo === "texto" ? (
                <textarea
                  id={idCampo}
                  rows={2}
                  value={bloco.texto ?? ""}
                  maxLength={MAX_TEXTO_BLOCO}
                  placeholder={meta.placeholder}
                  onChange={(e) => onAlterar({ texto: e.target.value })}
                  className="bloco-comanda__entrada"
                />
              ) : (
                <input
                  id={idCampo}
                  type="text"
                  inputMode={bloco.tipo === "cnpj" ? "numeric" : undefined}
                  value={bloco.texto ?? ""}
                  maxLength={MAX_TEXTO_BLOCO}
                  placeholder={meta.placeholder}
                  onChange={(e) => onAlterar({
                    texto: bloco.tipo === "cnpj" ? formatarCnpj(e.target.value) : e.target.value,
                  })}
                  className="bloco-comanda__entrada"
                />
              )}
              {bloco.tipo === "cnpj" && digitosCnpj > 0 && digitosCnpj < DIGITOS_CNPJ && (
                <span className="bloco-comanda__aviso">
                  <LuCircleAlert size={13} /> Faltam {DIGITOS_CNPJ - digitosCnpj} números para o CNPJ ficar completo.
                </span>
              )}
            </div>
          )}

          {aceita("alinhamento") && (
            <Segmentado legenda="Posição na linha" opcoes={ALINHAMENTOS}
                        valor={bloco.alinhamento} onEscolher={(v) => onAlterar({ alinhamento: v })} />
          )}

          {aceita("tamanho") && (
            <Segmentado legenda="Tamanho da letra" opcoes={TAMANHOS}
                        valor={bloco.tamanho} onEscolher={(v) => onAlterar({ tamanho: v })} />
          )}

          {(aceita("negrito") || aceita("maiuscula")) && (
            <div className="bloco-comanda__campo">
              <span className="bloco-comanda__rotulo">Destaque</span>
              <div className="bloco-comanda__segmentado" role="group" aria-label="Destaque">
                {aceita("negrito") && (
                  <button type="button" aria-pressed={bloco.negrito === true} aria-label="Negrito" title="Negrito"
                          onClick={() => onAlterar({ negrito: !bloco.negrito })}
                          className={`bloco-comanda__opcao${bloco.negrito ? " bloco-comanda__opcao--ativa" : ""}`}>
                    <LuBold size={15} />
                  </button>
                )}
                {aceita("maiuscula") && (
                  <button type="button" aria-pressed={bloco.maiuscula === true} aria-label="Tudo em maiúsculas" title="Tudo em maiúsculas"
                          onClick={() => onAlterar({ maiuscula: !bloco.maiuscula })}
                          className={`bloco-comanda__opcao${bloco.maiuscula ? " bloco-comanda__opcao--ativa" : ""}`}>
                    <LuCaseUpper size={15} />
                  </button>
                )}
              </div>
            </div>
          )}

          {aceita("opcoesItens") && (
            <>
              <div className="bloco-comanda__campo">
                <span className="bloco-comanda__rotulo">O que mostrar em cada item</span>
                {OPCOES_ITENS.map(({ chave, rotulo, ajuda }) => (
                  <label key={chave} className="bloco-comanda__caixa">
                    <input
                      type="checkbox"
                      checked={bloco.opcoes?.[chave] !== false}
                      onChange={(e) => onAlterar({ opcoes: { ...bloco.opcoes, [chave]: e.target.checked } })}
                    />
                    <span>
                      {rotulo}
                      <span className="bloco-comanda__ajuda">{ajuda}</span>
                    </span>
                  </label>
                ))}
              </div>

              <LarguraColunas
                larguras={largurasDoBloco}
                mostrarUnitario={bloco.opcoes?.unitario !== false}
                onAlterar={(larguras) => onAlterar({ opcoes: { ...bloco.opcoes, larguras } })}
              />
            </>
          )}

          {aceita("linhasEmBranco") && (
            <Segmentado
              legenda="Altura do espaço"
              opcoes={[{ valor: 1, rotulo: "1 linha" }, { valor: 2, rotulo: "2 linhas" }, { valor: 3, rotulo: "3 linhas" }]}
              valor={bloco.opcoes?.linhas ?? 1}
              onEscolher={(v) => onAlterar({ opcoes: { linhas: v } })}
            />
          )}
        </div>
      )}
    </li>
  );
}
