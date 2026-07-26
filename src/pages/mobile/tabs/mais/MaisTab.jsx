import {
  LuChefHat,
  LuShoppingCart,
  LuPackage,
  LuBike,
  LuLandmark,
  LuChartBar,
  LuLayoutGrid,
  LuCircleDot,
  LuCircleOff,
  LuSettings,
  LuChevronRight,
  LuMonitor,
} from "react-icons/lu";
import "./MaisTab.css";

/**
 * Aba "Mais" do /palm — hub que lista os módulos do sistema (os mesmos do
 * desktop) como cartões de atalho.
 *
 * Puramente apresentacional: recebe `modulos` já resolvidos pelo shell
 * (rótulo, ícone, se está habilitado, se é melhor no computador) e apenas
 * dispara os callbacks recebidos via props. Nenhuma regra de negócio,
 * contexto ou acesso a dados mora aqui.
 */
const ICONES_MODULO = {
  cozinha: LuChefHat,
  pdv: LuShoppingCart,
  estoque: LuPackage,
  delivery: LuBike,
  financeiro: LuLandmark,
  relatorios: LuChartBar,
};

function iconeDoModulo(chaveIcone) {
  return ICONES_MODULO[chaveIcone] ?? LuLayoutGrid;
}

function CartaoModulo({ modulo }) {
  const {
    rotulo,
    descricao,
    icone,
    habilitado,
    melhorNoComputador,
    onClick,
  } = modulo;
  const Icone = iconeDoModulo(icone);
  const dimmed = habilitado === false || melhorNoComputador === true;

  return (
    <button
      type="button"
      className={`mais-tab__cartao${dimmed ? " mais-tab__cartao--dimmed" : ""}`}
      onClick={onClick}
    >
      <Icone aria-hidden="true" className="mais-tab__cartaoIcone" />
      <span className="mais-tab__cartaoRotulo">{rotulo}</span>
      {descricao ? (
        <span className="mais-tab__cartaoDescricao">{descricao}</span>
      ) : null}
      {melhorNoComputador ? (
        <span className="mais-tab__cartaoAviso">
          <LuMonitor aria-hidden="true" />
          melhor no computador
        </span>
      ) : null}
    </button>
  );
}

export default function MaisTab({
  tenantNome,
  usuarioNome,
  usuarioIniciais,
  caixa,
  modulos,
  onConfiguracoes,
}) {
  const caixaAberto = Boolean(caixa?.aberto);

  return (
    <div className="mais-tab">
      <header className="mais-tab__header">
        <div className="mais-tab__headerTextos">
          <h1 className="mais-tab__titulo">Módulos</h1>
          <p className="mais-tab__subtitulo">
            {tenantNome} · {usuarioNome}
          </p>
        </div>
        <div className="mais-tab__avatar" aria-hidden="true">
          {usuarioIniciais}
        </div>
      </header>

      <div
        className={`mais-tab__caixaPill${
          caixaAberto ? "" : " mais-tab__caixaPill--fechado"
        }`}
      >
        {caixaAberto ? (
          <LuCircleDot aria-hidden="true" />
        ) : (
          <LuCircleOff aria-hidden="true" />
        )}
        <span className="mais-tab__caixaTexto">
          {caixaAberto ? "Caixa aberto" : "Caixa fechado"}
          {caixaAberto && caixa?.desde ? ` · desde ${caixa.desde}` : ""}
          {caixaAberto && caixa?.operador
            ? ` · operador ${caixa.operador}`
            : ""}
        </span>
      </div>

      <div className="mais-tab__grade">
        {modulos.map((modulo) => (
          <CartaoModulo key={modulo.chave} modulo={modulo} />
        ))}
      </div>

      {/* Configurações só aparece para quem tem a permissão: o shell passa o
          handler apenas nesse caso (sem handler = sem botão). */}
      {onConfiguracoes ? (
        <button
          type="button"
          className="mais-tab__configuracoes"
          onClick={onConfiguracoes}
        >
          <LuSettings aria-hidden="true" />
          <span className="mais-tab__configuracoesTexto">Configurações</span>
          <LuChevronRight aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
