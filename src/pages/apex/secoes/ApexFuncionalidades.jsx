import "./ApexFuncionalidades.css";

/**
 * Seção "#funcionalidades" — grid de 8 cards mostrando o que a
 * operação usa no dia a dia, mais o banner de fechamento "sistema
 * com a sua cara". Números grandes e cor alternando por card ajudam
 * o olho a escanear os 8 itens sem esforço (intuitivo por repetição
 * de padrão visual, sem precisar ler número por número).
 */
const FUNCIONALIDADES = [
  {
    numero: "01",
    titulo: "Frente de caixa",
    descricao:
      "Venda rápida no balcão com atalhos, busca e teclado — o caixa novo aprende no primeiro turno.",
    cor: "roxo",
  },
  {
    numero: "02",
    titulo: "Mesas e comandas",
    descricao:
      "Mapa do salão em tempo real: abra, transfira e divida comandas sem papel nem confusão.",
    cor: "azul",
  },
  {
    numero: "03",
    titulo: "Pix e cartão integrados",
    descricao:
      "QR de Pix na tela e maquininha conectada: o valor vai certo, sem digitar de novo.",
    cor: "verde",
  },
  {
    numero: "04",
    titulo: "NFC-e sem dor de cabeça",
    descricao:
      "Nota fiscal emitida em um toque, com contingência automática quando a SEFAZ cai.",
    cor: "roxo",
  },
  {
    numero: "05",
    titulo: "Estoque e insumos",
    descricao:
      "Baixa automática por ficha técnica e alerta antes de acabar o que mais vende.",
    cor: "azul",
  },
  {
    numero: "06",
    titulo: "Cardápio digital",
    descricao:
      "QR code na mesa com cardápio sempre atualizado — mudou o preço no PDV, mudou pra todo mundo.",
    cor: "verde",
  },
  {
    numero: "07",
    titulo: "Relatórios que fazem sentido",
    descricao:
      "Vendas por hora, produto e funcionário num dashboard que você olha do celular.",
    cor: "roxo",
  },
  {
    numero: "08",
    titulo: "Multi-loja",
    descricao:
      "Do food truck à rede de padarias: todas as unidades num painel só, com preços por loja.",
    cor: "azul",
  },
];

export default function ApexFuncionalidades({ contatoUrl }) {
  return (
    <section id="funcionalidades" className="apex-func">
      <div className="apex-container apex-func__container">
        <div className="apex-func__intro">
          <span className="apex-kicker">Funcionalidades</span>
          <h2 className="apex-func__titulo">
            Tudo que a operação precisa, sem tela que ninguém entende
          </h2>
        </div>

        <div className="apex-func__grid">
          {FUNCIONALIDADES.map((item) => (
            <div className="apex-func__card" key={item.numero}>
              <span
                className={`apex-func__numero apex-func__numero--${item.cor}`}
              >
                {item.numero}
              </span>
              {/* Wrapper agrupando título+descrição: no desktop o card
                  continua empilhado (número em cima), mas em tablet/mobile
                  ele vira layout horizontal (número à esquerda, texto à
                  direita) — o wrapper é o que permite girar só o texto
                  junto, sem separar número de título/descrição. */}
              <div className="apex-func__cardTexto">
                <span className="apex-func__cardTitulo">{item.titulo}</span>
                <span className="apex-func__cardDescricao">
                  {item.descricao}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="apex-func__banner">
          <div className="apex-func__bannerTexto">
            <span className="apex-kicker apex-kicker--verde">
              Do nosso jeito? Não — do seu.
            </span>
            <span className="apex-func__bannerTitulo">
              A gente faz o sistema ficar com a sua cara
            </span>
            <span className="apex-func__bannerParagrafo">
              Telas, atalhos, impressões e fluxos personalizados para a sua
              operação — do balcão da padaria ao salão do restaurante. Você
              não se adapta ao KORA; o KORA se adapta a você.
            </span>
          </div>
          <a
            href={contatoUrl || "#demo"}
            className="apex-botao apex-botao--branco apex-func__bannerCta"
          >
            Quero do meu jeito
          </a>
        </div>
      </div>
    </section>
  );
}
