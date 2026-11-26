import {
  LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2, LuChartColumn, LuActivity, LuWifiOff, LuInbox, LuStethoscope
} from "react-icons/lu";
import NovoEstabelecimentoModal from "@/features/console/desktop/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/features/console/desktop/AlterarPlanoModal";
import AlterarLayoutModal from "@/features/console/desktop/AlterarLayoutModal";
import AddonsModal from "@/features/console/desktop/AddonsModal";
import PlanosDashboard from "@/features/console/desktop/PlanosDashboard";
import SolicitacoesFila from "@/features/console/desktop/SolicitacoesFila";
import AnalyticsDashboard from "@/features/console/desktop/AnalyticsDashboard";
import SaudeDashboard from "@/features/console/desktop/SaudeDashboard";
import ConfirmarRenovacaoModal from "@/features/console/desktop/ConfirmarRenovacaoModal";
import HistoricoPagamentosModal from "@/features/console/desktop/HistoricoPagamentosModal";
import DefinirMensalidadeModal from "@/features/console/desktop/DefinirMensalidadeModal";
import { formatarVencimento } from "./apoio";
import { useConsole } from "@/features/console/hooks/useConsole";
import AbaEstabelecimentos from "./AbaEstabelecimentos";
import "./ConsolePage.css";

export default function ConsolePage() {
  const tela = useConsole();
  const {
    tenants, planos, assinaturas, carregando, erro, erroAssinaturas, atualizacao, currentUser, logout, modalAberto, setModalAberto, solicitacoes, erroSolicitacoes, solicitacaoAprovando, setSolicitacaoAprovando, tenantSelecionado, setTenantSelecionado, tenantLayoutSelecionado, setTenantLayoutSelecionado, tenantAddonsSelecionado, linhaRenovacao, setLinhaRenovacao, linhaHistorico, setLinhaHistorico, linhaMensalidade, setLinhaMensalidade, aba, escolherAba, dias, escolherPeriodo, carregar, aoCriar, aoAprovarSolicitacao, aoRecusarSolicitacao, aoPlanoAlterado, aoLayoutAlterado, aoAddonAlterado, aoFecharAddons, aoPagamentoConfirmado, aoMensalidadeDefinida, pendentesDeConta, semPlanos, online, recarregarNaVolta,
  } = tela;

  return (
    <div className="console">
      {/* Barra superior e faixa de rede grudam juntas no topo: o aviso de
          sem conexão precisa continuar à vista com a lista rolada. */}
      <div className="console__topo-fixo">
        <header className="console__topo">
          <div className="console__marca">
            <LuStore size={22} aria-hidden />
            <div>
              {/* Console é da PLATAFORMA (multi-tenant) — marca Kora, não a de um cliente */}
              <div className="console__marca-titulo">KORA</div>
              <div className="console__marca-sub">Console da Plataforma</div>
            </div>
          </div>
          <div className="console__usuario">
            <span className="console__usuario-nome">{currentUser?.name ?? "Plataforma"}</span>
            <button className="console__sair" onClick={logout} aria-label="Sair">
              <LuLogOut size={16} aria-hidden /> Sair
            </button>
          </div>
        </header>

        {/* Faixa de sem conexão (CONSOLE-UX 26). Fica colada no topo, antes das
            abas, porque o dono precisa saber ANTES de tentar — e diz o que ainda
            dá para fazer, não só o que quebrou. `role="status"` para o leitor de
            tela anunciar sem interromper o que ele estava lendo. */}
        {/* Estar offline manda na faixa (CONSOLE-UX 27): se a conexão voltou e
            caiu de novo no meio da recarga, o que o dono precisa ler é que está
            sem internet — não um "atualizado" de uma busca que não terminou. */}
        {!online ? (
          <div className="console__offline" role="status">
            <LuWifiOff size={18} aria-hidden />
            <span>
              <strong>Sem conexão com a internet.</strong> Dá para ver o que já
              carregou, mas os números podem estar desatualizados; para criar ou
              alterar, reconecte.
            </span>
          </div>
        ) : atualizacao === "atualizando" ? (
          <div className="console__offline console__offline--voltou" role="status">
            <LuLoaderCircle size={18} className="console__spin" aria-hidden />
            <span>
              <strong>Conexão de volta.</strong> Atualizando os dados da tela…
            </span>
          </div>
        ) : atualizacao === "atualizado" ? (
          <div className="console__offline console__offline--voltou" role="status">
            <LuCircleCheck size={18} aria-hidden />
            <span>
              <strong>Dados atualizados.</strong> O que está na tela é o de agora.
            </span>
          </div>
        ) : atualizacao === "falhou" ? (
          <div className="console__offline console__offline--falhou" role="status">
            <LuTriangleAlert size={18} aria-hidden />
            <span>
              <strong>Não foi possível atualizar os dados.</strong> O que está na
              tela é de antes da queda da conexão.
            </span>
            <button
              type="button"
              className="console__offline-acao"
              onClick={recarregarNaVolta}
            >
              Tentar de novo
            </button>
          </div>
        ) : null}
      </div>

      <main className="console__conteudo">
        {/* Abas: gestão da base (estabelecimentos), quem paga (planos +
            assinaturas), quem usa (uso e faturamento) e para quem o sistema
            está quebrado (saúde da operação). Sempre visíveis — trocar de aba
            é a navegação principal do Console (Princípio nº1). */}
        {/* `aria-current="page"` na aba aberta: até aqui, qual seção estava
            no ar era dito só pela cor. Quem navega por leitor de tela ouvia
            cinco botões iguais, e quem enxerga pouco dependia do contraste do
            realce. Os outros grupos de escolha do Console (situação, plano,
            período) já anunciam o escolhido por `aria-pressed`; a navegação
            principal era a única muda. */}
        <nav className="console__abas" aria-label="Seções do console">
          <button
            type="button"
            className={`console__aba${aba === "estabelecimentos" ? " console__aba--ativa" : ""}`}
            aria-current={aba === "estabelecimentos" ? "page" : undefined}
            onClick={() => escolherAba("estabelecimentos")}
          >
            <LuBuilding2 size={16} aria-hidden /> Estabelecimentos
          </button>
          {/* O número de quem está esperando fica NO nome da aba: pedido de
              conta parado é cliente novo sem resposta, e isso não pode
              depender de o dono lembrar de abrir a aba (Princípio nº1 —
              estado sempre visível). */}
          <button
            type="button"
            className={`console__aba${aba === "solicitacoes" ? " console__aba--ativa" : ""}`}
            aria-current={aba === "solicitacoes" ? "page" : undefined}
            onClick={() => escolherAba("solicitacoes")}
          >
            <LuInbox size={16} aria-hidden /> Pedidos de conta
            {pendentesDeConta > 0 && (
              <span className="console__aba-selo">{pendentesDeConta}</span>
            )}
          </button>
          <button
            type="button"
            className={`console__aba${aba === "planos" ? " console__aba--ativa" : ""}`}
            aria-current={aba === "planos" ? "page" : undefined}
            onClick={() => escolherAba("planos")}
          >
            <LuChartColumn size={16} aria-hidden /> Planos e assinaturas
          </button>
          <button
            type="button"
            className={`console__aba${aba === "uso" ? " console__aba--ativa" : ""}`}
            aria-current={aba === "uso" ? "page" : undefined}
            onClick={() => escolherAba("uso")}
          >
            <LuActivity size={16} aria-hidden /> Uso e faturamento
          </button>
          <button
            type="button"
            className={`console__aba${aba === "saude" ? " console__aba--ativa" : ""}`}
            aria-current={aba === "saude" ? "page" : undefined}
            onClick={() => escolherAba("saude")}
          >
            <LuStethoscope size={16} aria-hidden /> Saúde da operação
          </button>
        </nav>

        {carregando ? (
          <div className="console__estado">
            <LuLoaderCircle size={26} className="console__spin" aria-hidden />
            <p>Carregando…</p>
          </div>
        ) : erro ? (
          <div className="console__estado console__estado--erro">
            <LuTriangleAlert size={26} aria-hidden />
            <p>{erro}</p>
            {/* `() => carregar()` e não `carregar`: o handler receberia o evento
                do clique como primeiro argumento, e o primeiro argumento agora é
                o modo silencioso (CONSOLE-UX 27) — o evento é objeto, logo
                verdadeiro, e a recarga pedida pelo dono não acenderia o
                "carregando…" que ele está esperando ver. */}
            <button className="console__novo" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        ) : (aba === "planos" || aba === "uso") && erroAssinaturas ? (
          // Preferimos não mostrar nada a mostrar número errado: sem a
          // leitura da cobrança, o dashboard diria "receita R$ 0" e
          // "ninguém precisa de atenção" para uma base que pode estar
          // toda em atraso. Vale igual para a aba de uso, que só sabe quem
          // "paga e não está vendendo" se souber quem paga.
          <div className="console__estado console__estado--erro">
            <LuTriangleAlert size={26} aria-hidden />
            <p>
              Não foi possível carregar a cobrança dos estabelecimentos. Isso não quer
              dizer que ninguém está pagando, os números só aparecem quando a leitura
              funcionar.
            </p>
            <button className="console__novo" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        ) : aba === "uso" ? (
          // A leitura do uso é da própria aba (RPC `analytics_plataforma`):
          // nada é pedido ao banco enquanto ninguém abrir "Uso e
          // faturamento", então uma base sem a 20260912 aplicada continua
          // com o resto do Console funcionando igual.
          <AnalyticsDashboard
            tenants={tenants}
            assinaturas={assinaturas}
            dias={dias}
            aoTrocarPeriodo={escolherPeriodo}
          />
        ) : aba === "saude" ? (
          // Mesma razão da aba de uso: a leitura é da própria aba (RPC
          // `saude_plataforma`), então uma base sem a 20260928 aplicada
          // continua com o resto do Console funcionando igual. Esta aba não
          // depende da cobrança — quem está com nota parada está com nota
          // parada pagando ou não, por isso ela fica fora do ramo de
          // `erroAssinaturas` acima.
          <SaudeDashboard
            tenants={tenants}
            dias={dias}
            aoTrocarPeriodo={escolherPeriodo}
          />
        ) : aba === "solicitacoes" ? (
          <SolicitacoesFila
            solicitacoes={solicitacoes}
            carregando={carregando}
            erro={erroSolicitacoes ? true : null}
            online={online && !semPlanos}
            onAprovar={aoAprovarSolicitacao}
            onRecusar={aoRecusarSolicitacao}
            onRecarregar={() => carregar()}
          />
        ) : aba === "planos" ? (
          <PlanosDashboard
            tenants={tenants}
            planos={planos}
            assinaturas={assinaturas}
            // Quem deu baixa no pagamento fica gravado em
            // `assinaturas_pagamentos.confirmado_por` — o histórico precisa
            // dizer quem confirmou, não só que alguém confirmou.
            confirmadoPor={currentUser?.name ?? null}
            onAtualizado={() => carregar()}
          />
        ) : (
          <AbaEstabelecimentos tela={tela} />
        )}
      </main>

      {modalAberto && (
        <NovoEstabelecimentoModal
          planos={planos}
          // Aprovação de pedido do site: o formulário abre com o que o
          // cliente já digitou, para o dono conferir em vez de redigitar.
          inicial={
            solicitacaoAprovando && {
              nome: solicitacaoAprovando.estabelecimento,
              slug: solicitacaoAprovando.slug_desejado,
              adminNome: solicitacaoAprovando.nome,
            }
          }
          // Os endereços já ocupados (CONSOLE-UX 19). Sem consulta nova: a
          // lista de estabelecimentos já traz o `slug` de cada um, e o modal
          // só precisa saber quais nomes não estão livres.
          slugsEmUso={tenants.map((t) => t.slug).filter(Boolean)}
          onFechar={() => { setModalAberto(false); setSolicitacaoAprovando(null); }}
          onCriado={aoCriar}
        />
      )}

      {linhaRenovacao && (
        <ConfirmarRenovacaoModal
          linha={linhaRenovacao}
          vencimentoAtual={formatarVencimento(linhaRenovacao.dataVencimento)}
          confirmadoPor={currentUser?.name ?? null}
          onFechar={() => setLinhaRenovacao(null)}
          onConfirmado={aoPagamentoConfirmado}
        />
      )}

      {linhaHistorico && (
        <HistoricoPagamentosModal
          linha={linhaHistorico}
          confirmadoPor={currentUser?.name ?? null}
          onFechar={() => setLinhaHistorico(null)}
          // Estornar mexe em `data_vencimento` e `status`: sem recarregar, o
          // card atrás do modal seguiria mostrando o vencimento antigo. O
          // modal fica aberto — a lista dele já se atualiza sozinha.
          onEstornado={() => carregar()}
        />
      )}

      {tenantSelecionado && (
        <AlterarPlanoModal
          tenant={tenantSelecionado}
          planos={planos}
          onFechar={() => setTenantSelecionado(null)}
          onAlterado={aoPlanoAlterado}
        />
      )}

      {tenantLayoutSelecionado && (
        <AlterarLayoutModal
          tenant={tenantLayoutSelecionado}
          onFechar={() => setTenantLayoutSelecionado(null)}
          onAlterado={aoLayoutAlterado}
        />
      )}

      {linhaMensalidade && (
        <DefinirMensalidadeModal
          linha={linhaMensalidade}
          onFechar={() => setLinhaMensalidade(null)}
          onDefinido={aoMensalidadeDefinida}
        />
      )}

      {tenantAddonsSelecionado && (
        <AddonsModal
          tenant={tenantAddonsSelecionado}
          onFechar={aoFecharAddons}
          onAlterado={aoAddonAlterado}
        />
      )}
    </div>
  );
}
