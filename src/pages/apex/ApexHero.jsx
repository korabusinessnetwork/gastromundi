import "./ApexHero.css";

/**
 * Hero do site institucional (bg tinta). H1 único da página com o
 * resultado concreto (não "potencial"), CTAs de conversão e — abaixo
 * — o mock do produto de verdade, usando os tokens --gm-* do PRODUTO
 * (tema.css) em vez dos --kora-* do site: é a vitrine real do KORA,
 * não uma peça de marketing genérica. Decorativo (aria-hidden), sem
 * elementos interativos reais.
 *
 * `onAgendar` abre o formulário de contato que mora em ApexPage — o
 * herói não guarda estado, só avisa que alguém clicou.
 */
export default function ApexHero({ onAgendar }) {
  return (
    <header className="apex-hero">
      {/* Um badge só, igual em qualquer tela. Antes havia duas versões
          — a longa no desktop e uma curta no celular que cortava padaria
          e mercado da lista. Quem abria pelo celular concluía que o KORA
          não era para o negócio dele. No singular cabe em todo mundo e
          fica curto o bastante para o pill. */}
      <span className="apex-hero__badge">
        PDV para restaurante, bar, café, padaria e mercado
      </span>
      <h1 className="apex-hero__titulo">Seu negócio vendendo no mesmo dia</h1>
      <p className="apex-hero__paragrafo">
        Caixa, comanda, Pix e nota fiscal rodando desde o primeiro turno — sem
        semanas de implantação e sem manual grosso. A gente monta seu cardápio
        na demonstração e o sistema já fica com a cara da sua operação.
      </p>
      <div className="apex-hero__ctas">
        {/* O CTA mais visível da página é o que PEDE CONTATO. Antes os dois
            botões daqui levavam para o protótipo e para a tabela de preços:
            dava para ler o site inteiro, gostar, e ir embora sem que a gente
            soubesse que a pessoa existiu. Ver o produto rodando continua a um
            clique, agora como segunda opção. */}
        <button
          type="button"
          className="apex-botao apex-botao--primario-claro"
          onClick={onAgendar}
        >
          Agendar demonstração
        </button>
        <a href="/demo" className="apex-botao apex-botao--outline-escuro">
          Ver o KORA rodando
        </a>
      </div>
      <span className="apex-hero__microcopy">
        Demonstração ao vivo de 30 min · Sem fidelidade · 30 dias de garantia
      </span>

      <span className="apex-hero__mock-label">
        Ilustração da tela de comanda ·{" "}
        <a className="apex-hero__mock-link" href="/demo">
          ver o sistema de verdade no protótipo
        </a>
      </span>
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
