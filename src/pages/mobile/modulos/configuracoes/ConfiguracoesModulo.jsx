import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowLeft,
  LuBike,
  LuChevronRight,
  LuFileSpreadsheet,
  LuMonitor,
  LuPrinter,
  LuRuler,
  LuSlidersHorizontal,
  LuTarget,
  LuUsers,
  LuUtensils,
  LuWallet,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import "../modulos.css";
import "./ConfiguracoesModulo.css";

/**
 * ConfiguracoesModulo — Configurações dentro do Palm, sem sair para o desktop.
 *
 * Até aqui o botão de Configurações do hub "Mais" jogava o celular na tela de
 * computador (`/app/configuracoes`), com abas horizontais e modais — o único
 * caminho do Palm que ainda cuspia o usuário para fora. Esta tela fecha esse
 * buraco: uma LISTA de seções, cada uma abrindo a sua própria tela nativa.
 *
 * Por que é intuitiva: no celular, lista com seta é o padrão universal de
 * "isto abre outra tela" — nada de aba horizontal escondendo metade das
 * opções. Cada linha diz em português o que faz ali dentro, e o que
 * honestamente não cabe no celular (usuários e senhas, impressoras, planilhas)
 * fica visível com a etiqueta "melhor no computador" em vez de sumir — o dono
 * sabe que existe, e o toque leva para o lugar certo em vez de falhar.
 *
 * Cada seção é carregada sob demanda: quem abre "Mesas" não baixa o código de
 * Delivery. As seções renderizam SÓ o corpo; o cabeçalho (título + voltar) é
 * daqui, o que mantém a navegação idêntica em todas.
 */

const SecaoGeral = lazy(() => import("./SecaoGeral"));
const SecaoPagamentos = lazy(() => import("./SecaoPagamentos"));
const SecaoUnidades = lazy(() => import("./SecaoUnidades"));
const SecaoMesas = lazy(() => import("./SecaoMesas"));
const SecaoDelivery = lazy(() => import("./SecaoDelivery"));
const SecaoRadar = lazy(() => import("./SecaoRadar"));

/**
 * Seções na mesma ordem e com os mesmos limites de cargo do desktop
 * (ABAS_CONFIG em ConfiguracoesView.jsx) — quem vê o quê não pode divergir
 * entre as duas telas. `Tela: null` = ainda é trabalho de computador.
 */
const SECOES = [
  {
    chave: "geral",
    rotulo: "Geral",
    descricao: "Taxa de serviço e alerta de validade",
    Icone: LuSlidersHorizontal,
    Tela: SecaoGeral,
  },
  {
    chave: "pagamentos",
    rotulo: "Meios de pagamento",
    descricao: "Como o cliente pode pagar",
    Icone: LuWallet,
    Tela: SecaoPagamentos,
  },
  {
    chave: "unidades",
    rotulo: "Unidades de medida",
    descricao: "Kg, litro, caixa, porção…",
    Icone: LuRuler,
    Tela: SecaoUnidades,
  },
  {
    chave: "mesas",
    rotulo: "Mesas",
    descricao: "Mesas do salão e lugares",
    Icone: LuUtensils,
    gerente: true,
    Tela: SecaoMesas,
  },
  {
    chave: "delivery",
    rotulo: "Delivery",
    descricao: "Abrir e fechar por horário",
    Icone: LuBike,
    gerente: true,
    Tela: SecaoDelivery,
  },
  {
    chave: "radar",
    rotulo: "Radar de oportunidades",
    descricao: "O que é comida, bebida e sobremesa",
    Icone: LuTarget,
    gerente: true,
    Tela: SecaoRadar,
  },
  {
    chave: "usuarios",
    rotulo: "Usuários",
    descricao: "Equipe, cargos e senhas",
    Icone: LuUsers,
    Tela: null,
  },
  {
    chave: "impressao",
    rotulo: "Impressão",
    descricao: "Impressoras e estações de produção",
    Icone: LuPrinter,
    admin: true,
    Tela: null,
  },
  {
    chave: "importar",
    rotulo: "Importar e exportar",
    descricao: "Planilhas de cardápio e de dados",
    Icone: LuFileSpreadsheet,
    admin: true,
    Tela: null,
  },
];

export default function ConfiguracoesModulo({ onVoltar }) {
  const navigate = useNavigate();
  const { currentUser, tenant } = useApp();
  const [secaoAberta, setSecaoAberta] = useState(null);

  const ehAdmin = currentUser?.role === "admin";
  const ehGerente = ehAdmin || currentUser?.role === "gerente";
  const visiveis = SECOES.filter((s) => (!s.admin || ehAdmin) && (!s.gerente || ehGerente));

  const nativas = visiveis.filter((s) => s.Tela);
  const noComputador = visiveis.filter((s) => !s.Tela);

  const secao = secaoAberta ? SECOES.find((s) => s.chave === secaoAberta) : null;

  // Voltar é sempre um passo só: da seção volta para a lista, da lista volta
  // para o hub "Mais". Nunca pula etapa nem prende o usuário lá dentro.
  const voltar = () => (secao ? setSecaoAberta(null) : onVoltar?.());

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">{secao ? secao.rotulo : "Configurações"}</h1>
          <p className="mod-header__subtitulo">
            {secao ? secao.descricao : tenant?.nome || "Ajustes do estabelecimento"}
          </p>
        </div>
        <button
          type="button"
          className="mod-header__voltar"
          onClick={voltar}
          aria-label={secao ? "Voltar para Configurações" : "Voltar para Módulos"}
        >
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      {secao ? (
        <Suspense fallback={<p className="mod-carregando">Abrindo…</p>}>
          <secao.Tela />
        </Suspense>
      ) : (
        <>
          <div className="cfg-hub__grupo">
            {nativas.map((s) => (
              <button
                type="button"
                key={s.chave}
                className="cfg-hub__item"
                onClick={() => setSecaoAberta(s.chave)}
              >
                <span className="cfg-hub__icone">
                  <s.Icone aria-hidden="true" />
                </span>
                <span className="cfg-hub__textos">
                  <span className="cfg-hub__rotulo">{s.rotulo}</span>
                  <span className="cfg-hub__descricao">{s.descricao}</span>
                </span>
                <span className="cfg-hub__seta">
                  <LuChevronRight aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>

          {noComputador.length > 0 ? (
            <div className="cfg-hub__grupo">
              <h2 className="cfg-hub__grupoTitulo">Melhor no computador</h2>
              {noComputador.map((s) => (
                <button
                  type="button"
                  key={s.chave}
                  className="cfg-hub__item"
                  onClick={() => navigate("/app/configuracoes")}
                >
                  <span className="cfg-hub__icone">
                    <s.Icone aria-hidden="true" />
                  </span>
                  <span className="cfg-hub__textos">
                    <span className="cfg-hub__rotulo">{s.rotulo}</span>
                    <span className="cfg-hub__descricao">{s.descricao}</span>
                  </span>
                  <span className="mod-badge mod-badge--info">
                    <LuMonitor aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
