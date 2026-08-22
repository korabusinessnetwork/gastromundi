import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LuTriangleAlert, LuLoaderCircle, LuInbox, LuUserPlus, LuClock,
  LuCircleCheck, LuMessageCircle, LuUndo2,
} from "react-icons/lu";
import {
  linkDoLead, listarLeads, marcarLeadAtendido, mascararWhatsapp,
  resumirLeads, rotularItemDoPlano,
} from "@/lib/leads";
import { formatarReais } from "@/lib/deliveryPedidos";
import "./LeadsDashboard.css";

/**
 * Leads da landing (Console da Plataforma · ADR-008 §7).
 *
 * Quem pede demonstração em kora.codes cai aqui. Até esta aba existir, o
 * formulário do apex só dizia "obrigado" e jogava o contato fora — não
 * havia onde olhar, então não havia lead.
 *
 * De onde vem o dado: tabela `leads` (migração 20260920_leads.sql), lida
 * direto com colunas nomeadas. A escrita é da RPC pública
 * `registrar_lead`; a leitura só passa para quem é `is_super_admin()` —
 * quem não for recebe lista vazia pela RLS, não erro. Dado pessoal de
 * terceiro não anda em `select *` nem sai desta tela.
 *
 * A leitura acontece aqui, e não na página, pelo mesmo motivo do
 * AnalyticsDashboard: enquanto ninguém abrir "Leads", a tabela não é
 * consultada — e o Console continua abrindo normalmente em bases onde a
 * 20260920 ainda não foi aplicada.
 *
 * Por que é intuitivo (Princípio nº1): a aba abre no que exige ação —
 * quem ainda não recebeu resposta — com a contagem no próprio botão de
 * filtro. Cada lead é um cartão com o que se precisa para ligar agora:
 * nome, WhatsApp já formatado, e-mail, o plano que a pessoa montou e há
 * quanto tempo ela está esperando. A ação principal é um botão só,
 * "Falar no WhatsApp", que abre a conversa com a mensagem escrita; a
 * segunda é marcar que já falou, e ela pode ser desfeita. Nada de
 * jargão: "a atender", "já falamos", "há 2 dias".
 */
export default function LeadsDashboard({ operador = null }) {
  const [leads, setLeads] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState("pendentes");
  const [salvando, setSalvando] = useState(null);
  const [erroSalvar, setErroSalvar] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    const { data, error } = await listarLeads();
    // Lista vazia e falha de leitura parecem a mesma coisa na tela. A
    // diferença fica guardada aqui para a tela dizer "não consegui ler"
    // em vez de "ninguém pediu demonstração" — o segundo faria o dono
    // parar de olhar a aba.
    if (error) setErro(true);
    setLeads(error ? [] : data);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const resumo = useMemo(() => resumirLeads(leads), [leads]);

  const visiveis = useMemo(
    () => (filtro === "pendentes" ? leads.filter((l) => !l.atendido_em) : leads),
    [leads, filtro]
  );

  const alternarAtendido = async (lead) => {
    const marcar = !lead.atendido_em;
    setSalvando(lead.id);
    setErroSalvar(false);
    const { error } = await marcarLeadAtendido(lead.id, marcar, operador);
    setSalvando(null);
    if (error) {
      setErroSalvar(true);
      return;
    }
    // Atualiza só a linha mexida: recarregar a lista inteira faria o
    // cartão sumir debaixo do cursor quando o filtro é "a atender".
    setLeads((atuais) =>
      atuais.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              atendido_em: marcar ? new Date().toISOString() : null,
              atendido_por: marcar ? operador : null,
            }
          : l
      )
    );
  };

  return (
    <div className="leads">
      {carregando ? (
        <div className="leads__estado">
          <LuLoaderCircle size={26} className="leads__spin" aria-hidden />
          <p>Carregando os contatos que chegaram pelo site…</p>
        </div>
      ) : erro ? (
        <div className="leads__estado leads__estado--erro">
          <LuTriangleAlert size={26} aria-hidden />
          <p>
            Não foi possível ler os contatos. Isso não quer dizer que ninguém
            pediu demonstração — a lista só aparece quando a leitura funcionar.
          </p>
          <button type="button" className="leads__tentar" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <div className="leads__kpis">
            <Kpi
              icone={<LuUserPlus size={18} aria-hidden />}
              rotulo="Contatos recebidos"
              valor={String(resumo.total)}
            />
            <Kpi
              icone={<LuClock size={18} aria-hidden />}
              rotulo="A atender"
              valor={String(resumo.pendentes)}
              alerta={resumo.pendentes > 0}
            />
            <Kpi
              icone={<LuInbox size={18} aria-hidden />}
              rotulo="Últimos 7 dias"
              valor={String(resumo.recentes)}
            />
          </div>

          {resumo.total === 0 ? (
            <div className="leads__estado">
              <LuInbox size={30} aria-hidden />
              <p className="leads__vazio-titulo">Nenhum contato ainda</p>
              <p className="leads__vazio-texto">
                Quem preencher o formulário de demonstração em kora.codes
                aparece aqui, com o plano que montou.
              </p>
            </div>
          ) : (
            <>
              <div className="leads__filtros" role="group" aria-label="Filtrar contatos">
                <button
                  type="button"
                  className={`leads__filtro${filtro === "pendentes" ? " leads__filtro--ativo" : ""}`}
                  aria-pressed={filtro === "pendentes"}
                  onClick={() => setFiltro("pendentes")}
                >
                  A atender ({resumo.pendentes})
                </button>
                <button
                  type="button"
                  className={`leads__filtro${filtro === "todos" ? " leads__filtro--ativo" : ""}`}
                  aria-pressed={filtro === "todos"}
                  onClick={() => setFiltro("todos")}
                >
                  Todos ({resumo.total})
                </button>
              </div>

              {erroSalvar && (
                <p className="leads__erro-salvar" role="alert">
                  Não conseguimos gravar essa marcação. Tente de novo — o
                  contato continua na lista.
                </p>
              )}

              {visiveis.length === 0 ? (
                <div className="leads__estado">
                  <LuCircleCheck size={30} aria-hidden />
                  <p className="leads__vazio-titulo">Tudo respondido</p>
                  <p className="leads__vazio-texto">
                    Ninguém está esperando resposta agora.
                  </p>
                  <button
                    type="button"
                    className="leads__tentar"
                    onClick={() => setFiltro("todos")}
                  >
                    Ver todos os contatos
                  </button>
                </div>
              ) : (
                <ul className="leads__lista">
                  {visiveis.map((lead) => (
                    <CartaoLead
                      key={lead.id}
                      lead={lead}
                      salvando={salvando === lead.id}
                      aoAlternar={() => alternarAtendido(lead)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function CartaoLead({ lead, salvando, aoAlternar }) {
  const atendido = !!lead.atendido_em;
  const link = linkDoLead(lead);
  const itens = [
    ...(lead.plano_modulos ?? []),
    ...(lead.plano_addons ?? []),
  ].map(rotularItemDoPlano);

  return (
    <li className={`leads__card${atendido ? " leads__card--atendido" : ""}`}>
      <div className="leads__card-topo">
        <h3 className="leads__nome">{lead.nome}</h3>
        <span className="leads__quando">{rotularQuando(lead.created_at)}</span>
      </div>

      <dl className="leads__contato">
        <div>
          <dt>WhatsApp</dt>
          <dd>{mascararWhatsapp(lead.whatsapp)}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd className="leads__email">{lead.email}</dd>
        </div>
      </dl>

      {(lead.plano_total_centavos != null || itens.length > 0) && (
        <p className="leads__plano">
          <span className="leads__plano-rotulo">Plano que montou no site</span>
          {lead.plano_total_centavos != null && (
            <strong>{formatarReais(lead.plano_total_centavos / 100)}/mês</strong>
          )}
          {itens.length > 0 && (
            <span className="leads__plano-itens">{itens.join(" · ")}</span>
          )}
        </p>
      )}

      <div className="leads__acoes">
        {link ? (
          <a
            className="leads__falar"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            <LuMessageCircle size={16} aria-hidden />
            Falar no WhatsApp
          </a>
        ) : (
          <span className="leads__sem-numero">Número incompleto</span>
        )}

        <button
          type="button"
          className={`leads__marcar${atendido ? " leads__marcar--desfazer" : ""}`}
          onClick={aoAlternar}
          disabled={salvando}
        >
          {salvando ? (
            <LuLoaderCircle size={16} className="leads__spin" aria-hidden />
          ) : atendido ? (
            <LuUndo2 size={16} aria-hidden />
          ) : (
            <LuCircleCheck size={16} aria-hidden />
          )}
          {salvando ? "Salvando…" : atendido ? "Reabrir" : "Já falei com essa pessoa"}
        </button>
      </div>

      {atendido && (
        <p className="leads__atendido-nota">
          Já falamos {lead.atendido_por ? `· ${lead.atendido_por}` : ""}{" "}
          {rotularQuando(lead.atendido_em)}
        </p>
      )}
    </li>
  );
}

function Kpi({ icone, rotulo, valor, alerta = false }) {
  return (
    <div className={`leads__kpi${alerta ? " leads__kpi--alerta" : ""}`}>
      <span className="leads__kpi-icone" aria-hidden>{icone}</span>
      <span className="leads__kpi-rotulo">{rotulo}</span>
      <strong className="leads__kpi-valor">{valor}</strong>
    </div>
  );
}

/** "Hoje", "Ontem", "Há 3 dias", "12/08/2026" — quem está esperando há
 *  quanto tempo é a informação; a data exata só interessa depois de uma
 *  semana, quando "há 12 dias" já não ajuda a agir. */
function rotularQuando(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const dias = Math.floor((Date.now() - t) / 86400000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 7) return `Há ${dias} dias`;
  return new Date(t).toLocaleDateString("pt-BR");
}
