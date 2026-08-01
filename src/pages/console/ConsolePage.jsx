import { useState, useEffect, useCallback } from "react";
import {
  LuPlus, LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2,
  LuPalette, LuChartColumn,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { listarEstabelecimentos, listarPlanos, listarAssinaturas } from "@/lib/console";
import { LAYOUTS, layoutDoTema } from "@/layouts";
import NovoEstabelecimentoModal from "@/components/console/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/components/console/AlterarPlanoModal";
import AlterarLayoutModal from "@/components/console/AlterarLayoutModal";
import PlanosDashboard from "@/components/console/PlanosDashboard";
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
  const [aba, setAba] = useState("estabelecimentos"); // 'estabelecimentos' | 'planos'
  const [modalAberto, setModalAberto] = useState(false);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [tenantLayoutSelecionado, setTenantLayoutSelecionado] = useState(null);
  const [sucesso, setSucesso] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const [
      { data: listaTenants, error: eTenants },
      { data: listaPlanos, error: ePlanos },
      { data: listaAssinaturas, error: eAssinaturas },
    ] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
      listarAssinaturas(),
    ]);
    if (eTenants) {
      setErro("Não foi possível carregar os estabelecimentos. Verifique a conexão e tente de novo.");
      setCarregando(false);
      return;
    }
    setTenants(listaTenants);
    setPlanos(listaPlanos);
    setAssinaturas(listaAssinaturas ?? []);
    // As duas leituras secundárias falham devolvendo lista vazia — e lista
    // vazia é indistinguível de "não tem nenhum". Guardamos a falha para a
    // tela dizer que não sabe, em vez de afirmar zero (R$ 0 de receita,
    // ninguém precisando de atenção) como se fosse a verdade.
    setErroPlanos(Boolean(ePlanos));
    setErroAssinaturas(Boolean(eAssinaturas));
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

  // Sem catálogo de planos não há o que escolher no cadastro (o plano é
  // obrigatório): a ação principal fica desabilitada e a tela diz por quê,
  // em vez de abrir um formulário sem saída — prevenção de erro > mensagem
  // de erro (Princípio nº1).
  const semPlanos = planos.length === 0;

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
        {/* Abas: gestão da base (estabelecimentos) e visão de negócio
            (planos + assinaturas). Sempre visíveis — trocar de aba é a
            navegação principal do Console (Princípio nº1). */}
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
        ) : aba === "planos" ? (
          erroAssinaturas ? (
            // Preferimos não mostrar nada a mostrar número errado: sem a
            // leitura da cobrança, o dashboard diria "receita R$ 0" e
            // "ninguém precisa de atenção" para uma base que pode estar
            // toda em atraso.
            <div className="console__estado console__estado--erro">
              <LuTriangleAlert size={26} aria-hidden />
              <p>
                Não foi possível carregar a cobrança dos estabelecimentos. Isso não quer
                dizer que ninguém está pagando — os números só aparecem quando a leitura
                funcionar.
              </p>
              <button className="console__novo" onClick={carregar}>Tentar de novo</button>
            </div>
          ) : (
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
          )
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
              <ul className="console__lista">
                {tenants.map((t) => (
                  // Botões IRMÃOS (não aninhados — HTML inválido): o card troca
                  // o plano, o botão de paleta ao lado troca o layout.
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
                  </li>
                ))}
              </ul>
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
