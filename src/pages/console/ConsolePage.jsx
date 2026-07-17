import { useState, useEffect, useCallback } from "react";
import {
  LuPlus, LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { listarEstabelecimentos, listarPlanos } from "@/lib/console";
import NovoEstabelecimentoModal from "@/components/console/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/components/console/AlterarPlanoModal";
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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [sucesso, setSucesso] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const [{ data: listaTenants, error: eTenants }, { data: listaPlanos }] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
    ]);
    if (eTenants) {
      setErro("Não foi possível carregar os estabelecimentos. Verifique a conexão e tente de novo.");
      setCarregando(false);
      return;
    }
    setTenants(listaTenants);
    setPlanos(listaPlanos);
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
            disabled={carregando}
          >
            <LuPlus size={18} aria-hidden /> Novo estabelecimento
          </button>
        </div>

        {sucesso && (
          <div className="console__sucesso" role="status">
            <LuCircleCheck size={18} aria-hidden />
            <span>
              {sucesso.planoAlterado ? (
                <>Plano de <strong>{sucesso.nome}</strong> atualizado para <strong>{sucesso.planoAlterado}</strong>.</>
              ) : (
                <><strong>{sucesso.nome}</strong> criado. O responsável já pode entrar com o
                usuário <strong>{sucesso.admin?.username}</strong>.</>
              )}
            </span>
            <button className="console__sucesso-fechar" onClick={() => setSucesso(null)} aria-label="Dispensar">×</button>
          </div>
        )}

        {carregando ? (
          <div className="console__estado">
            <LuLoaderCircle size={26} className="console__spin" aria-hidden />
            <p>Carregando estabelecimentos…</p>
          </div>
        ) : erro ? (
          <div className="console__estado console__estado--erro">
            <LuTriangleAlert size={26} aria-hidden />
            <p>{erro}</p>
            <button className="console__novo" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : tenants.length === 0 ? (
          <div className="console__estado">
            <LuBuilding2 size={30} aria-hidden />
            <p className="console__vazio-titulo">Nenhum estabelecimento ainda</p>
            <p className="console__vazio-texto">Crie o primeiro para começar a vender o sistema.</p>
            <button className="console__novo" onClick={() => setModalAberto(true)}>
              <LuPlus size={18} aria-hidden /> Criar o primeiro
            </button>
          </div>
        ) : (
          <ul className="console__lista">
            {tenants.map((t) => (
              <li key={t.id}>
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
              </li>
            ))}
          </ul>
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
