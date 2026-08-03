import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LuPlus, LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2,
  LuPalette, LuChartColumn, LuActivity, LuPuzzle,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import {
  listarEstabelecimentos, listarPlanos, listarAssinaturas,
  listarAddonsPorTenant, contarAddonsPorTenant, resumirPlataforma, ordenarPorUrgencia,
} from "@/lib/console";
import { LAYOUTS, layoutDoTema } from "@/layouts";
import NovoEstabelecimentoModal from "@/components/console/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/components/console/AlterarPlanoModal";
import AlterarLayoutModal from "@/components/console/AlterarLayoutModal";
import AddonsModal from "@/components/console/AddonsModal";
import PlanosDashboard from "@/components/console/PlanosDashboard";
import AnalyticsDashboard from "@/components/console/AnalyticsDashboard";
import SeloStatus from "@/components/console/SeloStatus";
import "./ConsolePage.css";

/**
 * Console da Plataforma (S1-2, ADR-008 §7).
 *
 * Painel do super-admin `plataforma` (dono do SaaS): lista os
 * estabelecimentos (tenants) e cria novos. É a tela que efetivamente
 * "liga" o multi-tenant comercial — o 2º cliente em diante nasce aqui.
 *
 * Por que é intuitiva (Princípio nº1): uma coisa só na tela — a lista de
 * estabelecimentos — e uma única ação principal, sempre visível no topo
 * ("Novo estabelecimento"). Cada um dos quatro estados tem tratamento
 * humano e explícito: carregando (esqueleto/spinner), vazio (convite a
 * criar o primeiro), erro (aviso + "Tentar de novo") e sucesso (faixa
 * verde confirmando o que foi criado). Nada de jargão: "estabelecimento",
 * "plano", "responsável".
 */
export default function ConsolePage() {
  const { currentUser, logout } = useApp();

  const [tenants, setTenants] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [assinaturas, setAssinaturas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroPlanos, setErroPlanos] = useState(false);
  const [erroAssinaturas, setErroAssinaturas] = useState(false);
  const [erroAddons, setErroAddons] = useState(false);
  const [aba, setAba] = useState("estabelecimentos"); // 'estabelecimentos' | 'planos' | 'uso'
  const [modalAberto, setModalAberto] = useState(false);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [tenantLayoutSelecionado, setTenantLayoutSelecionado] = useState(null);
  const [tenantAddonsSelecionado, setTenantAddonsSelecionado] = useState(null);
  const [addonsPorTenant, setAddonsPorTenant] = useState({});
  const [addonsMudaram, setAddonsMudaram] = useState(false);
  const [sucesso, setSucesso] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const [
      { data: listaTenants, error: eTenants },
      { data: listaPlanos, error: ePlanos },
      { data: listaAssinaturas, error: eAssinaturas },
      { data: listaAddons, error: eAddons },
    ] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
      listarAssinaturas(),
      listarAddonsPorTenant(),
    ]);
    if (eTenants) {
      setErro("Não foi possível carregar os estabelecimentos. Verifique a conexão e tente de novo.");
      setCarregando(false);
      return;
    }
    setTenants(listaTenants);
    setPlanos(listaPlanos);
    setAssinaturas(listaAssinaturas ?? []);
    // Guardamos só a CONTAGEM por tenant: o card precisa de um número, e a
    // lista completa quem lê é o modal, que a busca de novo ao abrir.
    setAddonsPorTenant(contarAddonsPorTenant(listaAddons));
    // As duas leituras secundárias falham devolvendo lista vazia — e lista
    // vazia é indistinguível de "não tem nenhum". Guardamos a falha para a
    // tela dizer que não sabe, em vez de afirmar zero (R$ 0 de receita,
    // ninguém precisando de atenção) como se fosse a verdade.
    setErroPlanos(Boolean(ePlanos));
    setErroAssinaturas(Boolean(eAssinaturas));
    setErroAddons(Boolean(eAddons));
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aoCriar = (data) => {
    setModalAberto(false);
    setSucesso(data);
    carregar();
  };

  const aoAlterarPlano = (tenant) => {
    setSucesso(null);
    setTenantSelecionado(tenant);
  };

  const aoPlanoAlterado = (tenant) => {
    setTenantSelecionado(null);
    setSucesso({
      nome: tenant.nome,
      planoAlterado: rotularPlano(planos, tenant.plano_codigo),
    });
    carregar();
  };

  const aoAlterarLayout = (tenant) => {
    setSucesso(null);
    setTenantLayoutSelecionado(tenant);
  };

  const aoLayoutAlterado = (tenant) => {
    setTenantLayoutSelecionado(null);
    setSucesso({
      nome: tenant.nome,
      layoutAlterado: rotularLayout(tenant.tema),
    });
    carregar();
  };

  const aoAbrirAddons = (tenant) => {
    setSucesso(null);
    setTenantAddonsSelecionado(tenant);
  };

  // O modal de add-ons não fecha a cada troca (dá para ligar dois seguidos),
  // e a faixa de sucesso ficaria escondida atrás dele. Então o retorno da
  // ação aparece na própria linha do modal, e aqui só marcamos que houve
  // mudança para recontar a lista quando ele fechar.
  const aoAddonAlterado = () => {
    setAddonsMudaram(true);
  };

  const aoFecharAddons = () => {
    const tenant = tenantAddonsSelecionado;
    setTenantAddonsSelecionado(null);
    if (!addonsMudaram) return;
    setAddonsMudaram(false);
    setSucesso({ nome: tenant?.nome, addonsAtualizados: true });
    carregar();
  };

  // Sem catálogo de planos não há o que escolher no cadastro (o plano é
  // obrigatório): a ação principal fica desabilitada e a tela diz por quê,
  // em vez de abrir um formulário sem saída — prevenção de erro > mensagem
  // de erro (Princípio nº1).
  const semPlanos = planos.length === 0;

  // Situação da cobrança por tenant, para o card da lista. Vem da MESMA
  // função da aba "Planos e assinaturas" (`resumirPlataforma`, que recalcula
  // o status pela data em vez de confiar no campo em cache): duas contas
  // diferentes acabariam mostrando "Ativo" aqui e "Em atraso" ali para o
  // mesmo estabelecimento, e o dono não teria como saber qual acreditar.
  // Sem consulta nova — `carregar()` já traz as assinaturas.
  //
  // A mesma passada resolve a ORDEM da lista: quem precisa de ação sobe
  // para o topo (`ordenarPorUrgencia`, a régua do alerta de validade), para
  // o bloqueado não se esconder no meio da base conforme ela cresce. Com a
  // leitura das assinaturas quebrada não há dado para ordenar: mantém a
  // ordem do banco e não afirma nada — sem legenda.
  const { situacaoPorTenant, tenantsOrdenados, quantosPrecisamAtencao } = useMemo(() => {
    const { linhas, precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas);
    return {
      situacaoPorTenant: new Map(linhas.map((l) => [l.tenantId, l])),
      tenantsOrdenados: erroAssinaturas ? tenants : ordenarPorUrgencia(tenants, linhas),
      quantosPrecisamAtencao: erroAssinaturas ? 0 : precisamAtencao.length,
    };
  }, [tenants, planos, assinaturas, erroAssinaturas]);

  return (
    <div className="console">
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

      <main className="console__conteudo">
        {/* Abas: gestão da base (estabelecimentos), quem paga (planos +
            assinaturas) e quem usa (uso e faturamento). Sempre visíveis —
            trocar de aba é a navegação principal do Console (Princípio nº1). */}
        <nav className="console__abas" aria-label="Seções do console">
          <button
            type="button"
            className={`console__aba${aba === "estabelecimentos" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("estabelecimentos")}
          >
            <LuBuilding2 size={16} aria-hidden /> Estabelecimentos
          </button>
          <button
            type="button"
            className={`console__aba${aba === "planos" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("planos")}
          >
            <LuChartColumn size={16} aria-hidden /> Planos e assinaturas
          </button>
          <button
            type="button"
            className={`console__aba${aba === "uso" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("uso")}
          >
            <LuActivity size={16} aria-hidden /> Uso e faturamento
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
            <button className="console__novo" onClick={carregar}>Tentar de novo</button>
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
              dizer que ninguém está pagando — os números só aparecem quando a leitura
              funcionar.
            </p>
            <button className="console__novo" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : aba === "uso" ? (
          // A leitura do uso é da própria aba (RPC `analytics_plataforma`):
          // nada é pedido ao banco enquanto ninguém abrir "Uso e
          // faturamento", então uma base sem a 20260912 aplicada continua
          // com o resto do Console funcionando igual.
          <AnalyticsDashboard tenants={tenants} assinaturas={assinaturas} />
        ) : aba === "planos" ? (
          <PlanosDashboard
            tenants={tenants}
            planos={planos}
            assinaturas={assinaturas}
            // Quem deu baixa no pagamento fica gravado em
            // `assinaturas_pagamentos.confirmado_por` — o histórico precisa
            // dizer quem confirmou, não só que alguém confirmou.
            confirmadoPor={currentUser?.name ?? null}
            onAtualizado={carregar}
          />
        ) : (
          <>
            <div className="console__cabecalho">
              <div>
                <h1 className="console__h1">Estabelecimentos</h1>
                <p className="console__subtitulo">
                  Cada estabelecimento é um cliente com seus próprios dados, plano e usuários.
                </p>
              </div>
              <button
                className="console__novo"
                onClick={() => setModalAberto(true)}
                disabled={semPlanos}
                title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : undefined}
              >
                <LuPlus size={18} aria-hidden /> Novo estabelecimento
              </button>
            </div>

            {semPlanos && (
              <div className="console__aviso" role="status">
                <LuTriangleAlert size={18} aria-hidden />
                <span>
                  {erroPlanos
                    ? "Não foi possível carregar a lista de planos. Enquanto isso não é possível cadastrar um estabelecimento, e o plano de cada card aparece pelo código."
                    : "Nenhum plano disponível no catálogo. Ative um plano para poder cadastrar estabelecimentos."}
                </span>
                {erroPlanos && (
                  <button type="button" className="console__aviso-acao" onClick={carregar}>
                    Tentar de novo
                  </button>
                )}
              </div>
            )}

            {sucesso && (
              <div className="console__sucesso" role="status">
                <LuCircleCheck size={18} aria-hidden />
                <span>
                  {sucesso.planoAlterado ? (
                    <>Plano de <strong>{sucesso.nome}</strong> atualizado para <strong>{sucesso.planoAlterado}</strong>.</>
                  ) : sucesso.layoutAlterado ? (
                    <>Layout de <strong>{sucesso.nome}</strong> trocado para <strong>{sucesso.layoutAlterado}</strong>.</>
                  ) : sucesso.addonsAtualizados ? (
                    <>Add-ons de <strong>{sucesso.nome}</strong> atualizados.</>
                  ) : (
                    <><strong>{sucesso.nome}</strong> criado. O responsável já pode entrar com o
                    usuário <strong>{sucesso.admin?.username}</strong>.</>
                  )}
                </span>
                <button className="console__sucesso-fechar" onClick={() => setSucesso(null)} aria-label="Dispensar">×</button>
              </div>
            )}

            {tenants.length === 0 ? (
              <div className="console__estado">
                <LuBuilding2 size={30} aria-hidden />
                <p className="console__vazio-titulo">Nenhum estabelecimento ainda</p>
                <p className="console__vazio-texto">Crie o primeiro para começar a vender o sistema.</p>
                <button
                  className="console__novo"
                  onClick={() => setModalAberto(true)}
                  disabled={semPlanos}
                  title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : undefined}
                >
                  <LuPlus size={18} aria-hidden /> Criar o primeiro
                </button>
              </div>
            ) : (
              <>
                {/* A ordem da lista não pode ser mágica: se algo subiu para o
                    topo, a tela diz quantos são e por quê. */}
                {quantosPrecisamAtencao > 0 && (
                  <p className="console__ordem-aviso">
                    {quantosPrecisamAtencao === 1
                      ? "1 estabelecimento precisa de atenção e aparece primeiro."
                      : `${quantosPrecisamAtencao} estabelecimentos precisam de atenção e aparecem primeiro.`}
                  </p>
                )}
              <ul className="console__lista">
                {tenantsOrdenados.map((t) => {
                  const situacao = situacaoPorTenant.get(t.id);
                  return (
                  // Botões IRMÃOS (não aninhados — HTML inválido): o card troca
                  // o plano, o botão de paleta troca o layout e o de peça
                  // liga/desliga os add-ons pagos.
                  <li key={t.id} className="console__item">
                    <button
                      type="button"
                      className="console__card console__card--clicavel"
                      onClick={() => aoAlterarPlano(t)}
                      title="Trocar o plano deste estabelecimento"
                    >
                      <span className="console__card-icone" aria-hidden><LuBuilding2 size={20} /></span>
                      <span className="console__card-info">
                        <span className="console__card-nome">{t.nome}</span>
                        {/* Situação da cobrança na própria lista: é o que decide
                            a próxima ação do dono (renovar, cobrar, liberar) e
                            até aqui só existia na outra aba. Quando a leitura das
                            assinaturas falha, a tela diz que não sabe em vez de
                            mostrar "Ativo" para todo mundo. */}
                        <span className="console__card-situacao">
                          {erroAssinaturas ? (
                            <span className="console__card-sem-situacao">Situação indisponível</span>
                          ) : (
                            <>
                              <SeloStatus status={situacao?.status} dias={situacao?.diasParaVencer} />
                              {(situacao?.status === "ativo" || situacao?.status === "carencia") && situacao?.dataVencimento && (
                                <span className="console__card-vencimento">
                                  vence {formatarVencimento(situacao.dataVencimento)}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        <span className="console__card-data">
                          Criado em {formatarData(t.created_at)}
                        </span>
                      </span>
                      {t.plano_codigo && (
                        <span className="console__plano">{rotularPlano(planos, t.plano_codigo)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="console__layout"
                      onClick={() => aoAlterarLayout(t)}
                      title="Trocar o layout deste estabelecimento"
                    >
                      <LuPalette size={17} aria-hidden />
                      <span className="console__layout-nome">{rotularLayout(t.tema)}</span>
                    </button>
                    <button
                      type="button"
                      className="console__addons"
                      onClick={() => aoAbrirAddons(t)}
                      title="Ligar ou desligar os add-ons pagos deste estabelecimento"
                    >
                      <LuPuzzle size={17} aria-hidden />
                      <span className="console__addons-nome">
                        {rotularAddons(addonsPorTenant[t.id], erroAddons)}
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
              </>
            )}
          </>
        )}
      </main>

      {modalAberto && (
        <NovoEstabelecimentoModal
          planos={planos}
          onFechar={() => setModalAberto(false)}
          onCriado={aoCriar}
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

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

// `data_vencimento` é `date` puro (YYYY-MM-DD), sem hora. Passar por
// new Date() faria o navegador ler como UTC e recuar um dia no fuso do
// Brasil (-03) — "vence 04/08" para um vencimento em 05/08, justamente o
// número que o dono usa para decidir se cobra hoje. Formata pela string.
function formatarVencimento(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

// Mostra o nome amigável do plano (do catálogo), com o código como
// fallback caso o catálogo não tenha carregado.
function rotularPlano(planos, codigo) {
  return planos.find((p) => p.codigo === codigo)?.nome ?? codigo;
}

// Nome amigável do layout atual do tenant (catálogo src/layouts).
// layoutDoTema já degrada para "padrao" quando o tema não define layout.
function rotularLayout(tema) {
  const codigo = layoutDoTema(tema);
  return LAYOUTS[codigo]?.nome ?? codigo;
}

// O botão diz QUANTOS add-ons estão ligados, não "Add-ons": o dono precisa
// enxergar da lista quem já contratou algo, sem abrir estabelecimento por
// estabelecimento (Princípio nº1 — estado sempre visível).
// Quando a leitura falha a contagem vem vazia, e vazio é indistinguível de
// "não tem nenhum" — o dono leria "Sem add-ons" em todos os cards e poderia
// desligar cobrança de quem tem módulo ligado. A tela diz que não sabe.
function rotularAddons(quantos, erro) {
  if (erro) return "Add-ons indisponíveis";
  const n = Number(quantos) || 0;
  if (n === 0) return "Sem add-ons";
  if (n === 1) return "1 add-on";
  return `${n} add-ons`;
}
