import "./ApexHero.css";

/**
 * Hero do site institucional (bg tinta). H1 único da página com o
 * resultado concreto (não "potencial"), CTAs de conversão e — abaixo
 * — o mock do produto de verdade, usando os tokens --gm-* do PRODUTO
 * (tema.css) em vez dos --kora-* do site: é a vitrine real do KORA,
 * não uma peça de marketing genérica. Decorativo (aria-hidden), sem
 * elementos interativos reais.
 */
export default function ApexHero({ contatoUrl }) {
  return (
    <header className="apex-hero">
      {/* Badge com duas variantes de copy: no mobile o artboard pede a
          curta (cabe numa linha do pill); o CSS mostra uma por vez. */}
      <span className="apex-hero__badge">
        <span className="apex-hero__badge-longo">
          PDV para restaurantes, bares, cafés, padarias e mercados
        </span>
        <span className="apex-hero__badge-curto">
          PDV para restaurantes, bares e cafés
        </span>
      </span>
      <h1 className="apex-hero__titulo">
        Seu negócio vendendo pelo KORA no mesmo dia — caixa, comanda, Pix e nota fiscal
      </h1>
      <p className="apex-hero__paragrafo">
        Sem semanas de implantação, sem treinamento de manual grosso. A gente monta
        seu cardápio na demonstração, sua equipe aprende no primeiro turno e o
        sistema fica com a cara da sua operação.
      </p>
      <div className="apex-hero__ctas">
        <a href={contatoUrl || "#demo"} className="apex-botao apex-botao--primario-claro">
          Ver o KORA rodando com meu cardápio
        </a>
        <a href="#planos" className="apex-botao apex-botao--outline-escuro">
          Ver planos
        </a>
      </div>
      <span className="apex-hero__microcopy">
        Demonstração ao vivo de 30 min · Sem fidelidade · 30 dias de garantia
      </span>

      <span className="apex-hero__mock-label">O KORA do jeito que ele é de verdade</span>
      <div className="apex-hero__mock" aria-hidden="true">
        <div className="apex-hero__mock-comanda">
          <div className="apex-hero__mock-comanda-topo">
            <span className="apex-hero__mock-mesa">Mesa 12 · Comanda aberta</span>
            <span className="apex-hero__mock-pessoas">2 pessoas</span>
          </div>
          <div className="apex-hero__mock-grid">
            <div className="apex-hero__mock-item">
              <span className="apex-hero__mock-item-nome">Burger da casa</span>
              <span className="apex-hero__mock-item-preco">R$ 34,90</span>
            </div>
            <div className="apex-hero__mock-item">
              <span className="apex-hero__mock-item-nome">Chopp artesanal</span>
              <span className="apex-hero__mock-item-preco">R$ 14,00</span>
            </div>
            <div className="apex-hero__mock-item">
              <span className="apex-hero__mock-item-nome">Batata rústica</span>
              <span className="apex-hero__mock-item-preco">R$ 22,00</span>
            </div>
            <div className="apex-hero__mock-item">
              <span className="apex-hero__mock-item-nome">Suco natural</span>
              <span className="apex-hero__mock-item-preco">R$ 9,50</span>
            </div>
            <div className="apex-hero__mock-item">
              <span className="apex-hero__mock-item-nome">Espresso duplo</span>
              <span className="apex-hero__mock-item-preco">R$ 8,00</span>
            </div>
            <div className="apex-hero__mock-item apex-hero__mock-item--add">
              <span className="apex-hero__mock-item-add">+ item</span>
            </div>
          </div>
        </div>
        <div className="apex-hero__mock-fechamento">
          <span className="apex-hero__mock-fechamento-titulo">Fechamento</span>
          <div className="apex-hero__mock-linha">
            <span>Subtotal</span>
            <span className="apex-hero__mock-valor">R$ 88,40</span>
          </div>
          <div className="apex-hero__mock-linha">
            <span>Serviço (10%)</span>
            <span className="apex-hero__mock-valor">R$ 8,84</span>
          </div>
          <div className="apex-hero__mock-linha apex-hero__mock-linha--total">
            <span>Total</span>
            <span className="apex-hero__mock-valor-total">R$ 97,24</span>
          </div>
          <span className="apex-hero__mock-botao apex-hero__mock-botao--pix">Cobrar com Pix</span>
          <span className="apex-hero__mock-botao apex-hero__mock-botao--cartao">Cartão · NFC-e</span>
        </div>
      </div>
    </header>
  );
}
