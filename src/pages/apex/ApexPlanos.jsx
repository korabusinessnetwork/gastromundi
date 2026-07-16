import "./ApexPlanos.css";

/**
 * Seção "#planos" — grade de assinaturas mensais sem fidelidade. Cada
 * card lista só o que o plano acrescenta ao anterior ("tudo do X..."),
 * pra não repetir a lista inteira e ficar imediatamente comparável.
 * Casa Cheia é o plano mais escolhido (destaque visual: borda, badge,
 * sombra e preço em roxo) — intuitivo por hierarquia, não por texto.
 * NF-e/NFC-e e TEF ficam FORA dos cards, na faixa de add-ons: são
 * ortogonais ao plano (ADR-005), nunca item de um plano específico.
 */
const PLANOS = [
  {
    nome: "Faísca",
    tier: "Básico",
    descricao: "Para quem está começando: food trucks e cafés",
    preco: "R$ 149",
    features: [
      "1 caixa (PDV)",
      "Cardápio e pedidos",
      "Controle de caixa",
      "Relatórios básicos",
      "Suporte por chat",
    ],
    cta: "Agendar demonstração",
  },
  {
    nome: "Ritmo",
    tier: "Simples",
    descricao: "Para lanchonetes e padarias de balcão",
    preco: "R$ 249",
    features: [
      "Tudo do Faísca",
      "2 caixas",
      "Estoque com alerta de mínimo",
      "Tela da cozinha (KDS)",
      "Impressão na cozinha",
    ],
    cta: "Agendar demonstração",
  },
  {
    nome: "Casa Cheia",
    tier: "Médio",
    descricao: "Para restaurantes e bares com salão",
    preco: "R$ 349",
    destaque: "mais-escolhido",
    features: [
      "Tudo do Ritmo",
      "Caixas ilimitados",
      "Mesas, comandas e garçom no celular",
      "Financeiro e clientes",
      "Suporte prioritário (WhatsApp)",
    ],
    cta: "Agendar demonstração",
  },
  {
    nome: "Expansão",
    tier: "Alto",
    descricao: "Para grupos e mercados com várias unidades",
    preco: "R$ 497",
    features: [
      "Tudo do Casa Cheia",
      "Multi-loja com painel consolidado",
      "Preços e estoque por loja",
      "Permissões por equipe",
      "Gerente de conta dedicado",
    ],
    cta: "Agendar demonstração",
  },
  {
    nome: "Piloto",
    tier: "Avançado",
    descricao: "Com JARVAS: o gerente virtual com IA do KORA",
    preco: "R$ 1.397",
    destaque: "em-breve",
    features: [
      "Tudo do Expansão",
      "JARVAS — gerente virtual com IA",
      "Alertas de queda de venda e desperdício",
      "Sugestões de compra e precificação",
      "Resumo diário no seu WhatsApp",
    ],
    cta: "Entrar na lista de espera",
  },
];

export default function ApexPlanos({ contatoUrl }) {
  const href = contatoUrl || "#demo";

  return (
    <section id="planos" className="apex-planos">
      <div className="apex-container apex-planos__conteudo">
        <div className="apex-planos__cabecalho">
          <span className="apex-kicker">Planos e preços</span>
          <h2 className="apex-planos__titulo">
            Assinatura mensal, sem fidelidade, sem multa
          </h2>
          <p className="apex-planos__subtitulo">
            Sem taxa de instalação. 30 dias de garantia em qualquer plano —
            quem se compromete somos nós.
          </p>
        </div>

        <div className="apex-planos__grade">
          {PLANOS.map((plano) => (
            <article
              key={plano.nome}
              className={
                "apex-planos__card" +
                (plano.destaque === "mais-escolhido"
                  ? " apex-planos__card--destaque"
                  : "") +
                (plano.destaque === "em-breve"
                  ? " apex-planos__card--em-breve"
                  : "")
              }
            >
              {plano.destaque === "mais-escolhido" && (
                <span className="apex-planos__badge apex-planos__badge--destaque">
                  Mais escolhido
                </span>
              )}
              {plano.destaque === "em-breve" && (
                <span className="apex-planos__badge apex-planos__badge--em-breve">
                  Em breve
                </span>
              )}

              <div className="apex-planos__identidade">
                <span className="apex-planos__nome">
                  {plano.nome}{" "}
                  <span className="apex-planos__tier">({plano.tier})</span>
                </span>
                <span className="apex-planos__descricao">
                  {plano.descricao}
                </span>
              </div>

              <div className="apex-planos__preco-linha">
                <span className="apex-planos__preco">{plano.preco}</span>
                <span className="apex-planos__periodo">/mês</span>
              </div>

              <div className="apex-planos__features">
                {plano.features.map((feature) => (
                  <span key={feature}>✓ {feature}</span>
                ))}
              </div>

              <a
                href={href}
                className={
                  plano.destaque === "mais-escolhido"
                    ? "apex-botao apex-botao--primario apex-planos__cta"
                    : "apex-botao apex-botao--outline apex-planos__cta"
                }
              >
                {plano.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="apex-planos__addons">
          <span className="apex-planos__addons-titulo">
            Add-ons — em qualquer plano:
          </span>
          <span className="apex-planos__addon">
            <strong>NF-e / NFC-e</strong>
            <br />
            Emissão fiscal com contingência automática
          </span>
          <span className="apex-planos__addon">
            <strong>TEF</strong>
            <br />
            Maquininha integrada ao caixa
          </span>
        </div>

        <span className="apex-planos__urgencia">
          Implantação personalizada incluída em todos os planos — por isso
          abrimos um número limitado de ativações por mês.
        </span>
      </div>
    </section>
  );
}
