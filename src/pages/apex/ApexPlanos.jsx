import { useMemo, useState } from "react";
import ApexAgendamento from "./ApexAgendamento";
import "./ApexPlanos.css";

/**
 * Seção "#planos" — construtor de plano por módulo, em vez da grade de
 * 5 planos fechados. A pessoa parte do essencial (Cardápio + PDV +
 * Caixa, sempre incluído) e vai ligando os módulos que o negócio dela
 * precisa; o preço soma em tempo real.
 *
 * Os módulos e preços aqui são REFERENCIAIS — servem para dar uma
 * noção de investimento antes da demonstração, não são a tabela de
 * cobrança final (isso é fechado na demonstração/proposta comercial).
 * Os códigos de módulo espelham os mesmos nomes usados em
 * `planos_modulos` no banco (docs/08_DECISOES/adr-005.md), então
 * amanhã dá pra ligar isso a uma origem de preço real sem remexer
 * na estrutura.
 *
 * NF-e/NFC-e e TEF continuam como add-ons ortogonais (ADR-005): não
 * são "módulo do produto", são serviço extra que soma em cima de
 * qualquer combinação.
 */

const ESSENCIAL = {
  nome: "Essencial",
  preco: 149,
  itens: ["Cardápio e pedidos", "PDV (1 caixa)", "Controle de caixa"],
};

const MODULOS = [
  {
    codigo: "estoque",
    nome: "Estoque",
    descricao: "Controle de insumos com alerta de mínimo",
    preco: 40,
  },
  {
    codigo: "pedidos_avancado",
    nome: "Comandas",
    descricao: "Pedidos organizados por comanda, com transferência entre mesas",
    preco: 40,
  },
  {
    codigo: "mesas_comandas",
    nome: "Mesas & Salão",
    descricao: "Layout do salão com status das mesas em tempo real",
    preco: 50,
  },
  {
    codigo: "cozinha",
    nome: "Cozinha (KDS)",
    descricao: "Tela de preparo com impressão automática por categoria",
    preco: 40,
  },
  {
    codigo: "financeiro",
    nome: "Financeiro",
    descricao: "Contas a pagar/receber e fluxo de caixa do mês",
    preco: 60,
  },
  {
    codigo: "clientes",
    nome: "Clientes & Fiado",
    descricao: "Cadastro de clientes e conta corrente (fiado)",
    preco: 50,
  },
  {
    codigo: "relatorios",
    nome: "Relatórios avançados",
    descricao: "Faturamento, produtos mais vendidos e comparativos por período",
    preco: 38,
  },
  {
    codigo: "multiloja",
    nome: "Multi-loja",
    descricao: "Painel consolidado para mais de uma unidade",
    preco: 150,
  },
  {
    codigo: "jarvas",
    nome: "JARVAS, gerente virtual com IA",
    descricao: "Alertas de queda de venda, sugestões de compra e resumo diário",
    preco: 700,
    destaque: true,
  },
];

const ADDONS = [
  {
    codigo: "nfe",
    nome: "NF-e / NFC-e",
    descricao: "Emissão fiscal com contingência automática",
    preco: 80,
  },
  {
    codigo: "tef",
    nome: "TEF",
    descricao: "Maquininha integrada ao caixa",
    preco: 60,
  },
];

// Planos prontos (presets): combinações curadas para quem não quer montar
// módulo por módulo. Um clique preenche a seleção; a pessoa ainda pode
// ligar/desligar itens depois. O último ("Kora Total") é o topo de linha —
// tudo ligado, com JARVAS e emissão fiscal — e ganha destaque roxo→dourado.
const PLANOS_PRONTOS = [
  {
    codigo: "balcao",
    nome: "Balcão",
    resumo: "Vende no balcão e quer controle básico de estoque e vendas",
    modulos: ["estoque", "relatorios"],
    addons: [],
  },
  {
    codigo: "restaurante",
    nome: "Restaurante",
    resumo: "Salão, comandas e cozinha rodando juntos, com fiado e financeiro",
    modulos: [
      "estoque",
      "pedidos_avancado",
      "mesas_comandas",
      "cozinha",
      "financeiro",
      "clientes",
      "relatorios",
    ],
    addons: [],
  },
  {
    codigo: "kora_total",
    nome: "Kora Total",
    resumo: "Tudo ligado, com JARVAS (IA) e emissão fiscal, o topo de linha",
    modulos: MODULOS.map((m) => m.codigo),
    addons: ADDONS.map((a) => a.codigo),
    premium: true,
  },
];

const formatarPreco = (valor) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 0 });

// Soma dos preços de uma lista de códigos dentro de um catálogo (MODULOS/ADDONS).
const somarPrecos = (codigos, catalogo) =>
  catalogo
    .filter((item) => codigos.includes(item.codigo))
    .reduce((acc, item) => acc + item.preco, 0);

// Dois conjuntos de códigos são iguais? (ordem não importa)
const mesmoConjunto = (a, b) =>
  a.length === b.length && a.every((codigo) => b.includes(codigo));

export default function ApexPlanos() {
  const [modulosSelecionados, setModulosSelecionados] = useState([]);
  const [addonsSelecionados, setAddonsSelecionados] = useState([]);
  const [agendamentoAberto, setAgendamentoAberto] = useState(false);

  const alternarModulo = (codigo) => {
    setModulosSelecionados((atual) =>
      atual.includes(codigo)
        ? atual.filter((c) => c !== codigo)
        : [...atual, codigo]
    );
  };

  const alternarAddon = (codigo) => {
    setAddonsSelecionados((atual) =>
      atual.includes(codigo)
        ? atual.filter((c) => c !== codigo)
        : [...atual, codigo]
    );
  };

  const todosModulos = MODULOS.map((m) => m.codigo);
  const todosAddons = ADDONS.map((a) => a.codigo);
  const tudoSelecionado =
    modulosSelecionados.length === todosModulos.length &&
    addonsSelecionados.length === todosAddons.length;

  // Botão "Selecionar todos": liga tudo; se já estiver tudo ligado, limpa.
  const alternarTodos = () => {
    if (tudoSelecionado) {
      setModulosSelecionados([]);
      setAddonsSelecionados([]);
    } else {
      setModulosSelecionados(todosModulos);
      setAddonsSelecionados(todosAddons);
    }
  };

  // Aplica um plano pronto por cima da seleção atual (substitui).
  const aplicarPreset = (preset) => {
    setModulosSelecionados(preset.modulos);
    setAddonsSelecionados(preset.addons);
  };

  // Qual preset bate exatamente com a seleção atual (para destacar o ativo).
  const presetAtivo = PLANOS_PRONTOS.find(
    (p) =>
      mesmoConjunto(p.modulos, modulosSelecionados) &&
      mesmoConjunto(p.addons, addonsSelecionados)
  )?.codigo;

  const total = useMemo(() => {
    const modulos = MODULOS.filter((m) => modulosSelecionados.includes(m.codigo));
    const addons = ADDONS.filter((a) => addonsSelecionados.includes(a.codigo));
    const soma = [...modulos, ...addons].reduce((acc, item) => acc + item.preco, 0);
    return ESSENCIAL.preco + soma;
  }, [modulosSelecionados, addonsSelecionados]);

  const qtdSelecionados = modulosSelecionados.length + addonsSelecionados.length;

  // Nomes do que a pessoa ligou, para viajar junto com o lead: saber que
  // ela marcou "Cozinha (KDS)" e "Multi-loja" é o que faz a demonstração
  // já começar no assunto certo, em vez de repetir a descoberta.
  const itensSelecionados = useMemo(
    () => [
      ...MODULOS.filter((m) => modulosSelecionados.includes(m.codigo)).map((m) => m.nome),
      ...ADDONS.filter((a) => addonsSelecionados.includes(a.codigo)).map((a) => a.nome),
    ],
    [modulosSelecionados, addonsSelecionados]
  );

  return (
    <section id="planos" className="apex-planos">
      <div className="apex-container apex-planos__conteudo">
        <div className="apex-planos__cabecalho">
          <span className="apex-kicker">Monte seu plano</span>
          <h2 className="apex-planos__titulo">
            Você escolhe os módulos, o preço soma na hora
          </h2>
          <p className="apex-planos__subtitulo">
            Todo plano já sai com cardápio, PDV e caixa. A partir daí, você só
            liga o que o seu negócio realmente usa. Sem fidelidade, sem multa,
            valores de referência, fechados de verdade na demonstração.
          </p>
        </div>

        <div className="apex-construtor">
          <div className="apex-construtor__modulos">
            <div className="apex-construtor__essencial">
              <span className="apex-construtor__essencial-selo">Incluído em todo plano</span>
              <span className="apex-construtor__essencial-nome">{ESSENCIAL.nome}</span>
              <div className="apex-construtor__essencial-itens">
                {ESSENCIAL.itens.map((item) => (
                  <span key={item}>✓ {item}</span>
                ))}
              </div>
              <span className="apex-construtor__essencial-preco">
                R$ {formatarPreco(ESSENCIAL.preco)}<span>/mês</span>
              </span>
            </div>

            <div className="apex-construtor__planos-prontos">
              <div className="apex-construtor__planos-prontos-topo">
                <h3 className="apex-construtor__secao-titulo">
                  Comece por um plano pronto
                </h3>
                <button
                  type="button"
                  className="apex-construtor__selecionar-todos"
                  aria-pressed={tudoSelecionado}
                  onClick={alternarTodos}
                >
                  {tudoSelecionado ? "Limpar seleção" : "Selecionar todos"}
                </button>
              </div>
              <div className="apex-construtor__presets">
                {PLANOS_PRONTOS.map((preset) => {
                  const ativo = presetAtivo === preset.codigo;
                  const precoPreset =
                    ESSENCIAL.preco +
                    somarPrecos(preset.modulos, MODULOS) +
                    somarPrecos(preset.addons, ADDONS);
                  return (
                    <button
                      key={preset.codigo}
                      type="button"
                      className={
                        "apex-preset" +
                        (ativo ? " apex-preset--ativo" : "") +
                        (preset.premium ? " apex-preset--premium" : "")
                      }
                      aria-pressed={ativo}
                      onClick={() => aplicarPreset(preset)}
                    >
                      {preset.premium && (
                        <span className="apex-preset__selo">Topo de linha</span>
                      )}
                      <span className="apex-preset__nome">{preset.nome}</span>
                      <span className="apex-preset__resumo">{preset.resumo}</span>
                      <span className="apex-preset__preco">
                        R$ {formatarPreco(precoPreset)}<span>/mês</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <h3 className="apex-construtor__secao-titulo">Módulos</h3>
            <div className="apex-construtor__grade">
              {MODULOS.map((modulo) => {
                const ativo = modulosSelecionados.includes(modulo.codigo);
                return (
                  <button
                    key={modulo.codigo}
                    type="button"
                    className={
                      "apex-construtor__item" +
                      (ativo ? " apex-construtor__item--ativo" : "") +
                      (modulo.destaque ? " apex-construtor__item--destaque" : "")
                    }
                    aria-pressed={ativo}
                    onClick={() => alternarModulo(modulo.codigo)}
                  >
                    <span className="apex-construtor__item-check" aria-hidden="true" />
                    <span className="apex-construtor__item-texto">
                      <span className="apex-construtor__item-nome">{modulo.nome}</span>
                      <span className="apex-construtor__item-descricao">{modulo.descricao}</span>
                    </span>
                    <span className="apex-construtor__item-preco">
                      + R$ {formatarPreco(modulo.preco)}
                    </span>
                  </button>
                );
              })}
            </div>

            <h3 className="apex-construtor__secao-titulo">Complementos</h3>
            <div className="apex-construtor__grade">
              {ADDONS.map((addon) => {
                const ativo = addonsSelecionados.includes(addon.codigo);
                return (
                  <button
                    key={addon.codigo}
                    type="button"
                    className={
                      "apex-construtor__item" +
                      (ativo ? " apex-construtor__item--ativo" : "")
                    }
                    aria-pressed={ativo}
                    onClick={() => alternarAddon(addon.codigo)}
                  >
                    <span className="apex-construtor__item-check" aria-hidden="true" />
                    <span className="apex-construtor__item-texto">
                      <span className="apex-construtor__item-nome">{addon.nome}</span>
                      <span className="apex-construtor__item-descricao">{addon.descricao}</span>
                    </span>
                    <span className="apex-construtor__item-preco">
                      + R$ {formatarPreco(addon.preco)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="apex-construtor__resumo">
            <h3 className="apex-construtor__resumo-titulo">Seu plano</h3>

            <div className="apex-construtor__resumo-lista">
              <span className="apex-construtor__resumo-linha">
                <span>{ESSENCIAL.nome}</span>
                <span>R$ {formatarPreco(ESSENCIAL.preco)}</span>
              </span>
              {MODULOS.filter((m) => modulosSelecionados.includes(m.codigo)).map((m) => (
                <span key={m.codigo} className="apex-construtor__resumo-linha">
                  <span>{m.nome}</span>
                  <span>+ R$ {formatarPreco(m.preco)}</span>
                </span>
              ))}
              {ADDONS.filter((a) => addonsSelecionados.includes(a.codigo)).map((a) => (
                <span key={a.codigo} className="apex-construtor__resumo-linha">
                  <span>{a.nome}</span>
                  <span>+ R$ {formatarPreco(a.preco)}</span>
                </span>
              ))}
              {qtdSelecionados === 0 && (
                <span className="apex-construtor__resumo-vazio">
                  Toque nos módulos ao lado para adicionar ao seu plano.
                </span>
              )}
            </div>

            <div className="apex-construtor__resumo-total">
              <span>Total estimado</span>
              <span className="apex-construtor__resumo-total-valor">
                R$ {formatarPreco(total)}<span>/mês</span>
              </span>
            </div>

            <button
              type="button"
              className="apex-botao apex-botao--primario apex-construtor__cta"
              onClick={() => setAgendamentoAberto(true)}
            >
              Agendar demonstração
            </button>
            <span className="apex-construtor__resumo-nota">
              Valores de referência · confirmados na demonstração
            </span>
          </aside>
        </div>

        <span className="apex-planos__urgencia">
          Implantação personalizada incluída em todos os planos, por isso
          abrimos um número limitado de ativações por mês.
        </span>
      </div>

      <ApexAgendamento
        aberto={agendamentoAberto}
        onFechar={() => setAgendamentoAberto(false)}
        plano={{ total, itens: itensSelecionados }}
      />
    </section>
  );
}
