import { useMemo, useState } from "react";
import {
  LuTriangleAlert, LuCircleCheck, LuClock, LuBan, LuBuilding2, LuWallet,
  LuChartPie,
} from "react-icons/lu";
import { resumirPlataforma } from "@/lib/console";
import { formatarReais } from "@/lib/deliveryPedidos";
import DefinirMensalidadeModal from "./DefinirMensalidadeModal";
import "./PlanosDashboard.css";

/**
 * Dashboard de Planos e Assinaturas do Console da Plataforma
 * (S1-2, ADR-008 §7 · item 3 da fila de features).
 *
 * É a PRIMEIRA fatia do "console do dev": a visão de negócio da base de
 * clientes (planos F013 + billing). Aqui mora o "alerta de validade" que
 * o dono pediu para tirar do banner do tenant e trazer para a plataforma:
 * o bloco do topo lista quem está vencendo/atrasado/bloqueado, ordenado
 * por urgência — o que a plataforma precisa cobrar AGORA.
 *
 * A única escrita daqui é a MENSALIDADE (20260911): a troca de plano continua
 * no card de estabelecimento e a renovação de assinatura tem RPC própria
 * (20260909). Autorização é do banco — o super-admin lê `assinaturas` de todos
 * via `is_super_admin()` (20260726) e a RPC revalida o papel na escrita; a
 * casca aqui não decide acesso.
 *
 * Por que a mensalidade mora nesta tela: `valor_mensal` nasce em 0 e até a
 * 20260911 nenhum caminho do sistema o escrevia, então o cartão "Receita
 * mensal" era estruturalmente R$ 0,00 e nada dizia por quê. O preço é
 * definido no MESMO lugar onde ele é somado — a célula que mostra "—" é o
 * botão que resolve o "—".
 *
 * Por que é intuitivo (Princípio nº1): o que exige ação vem primeiro e em
 * cor de alerta; os números-chave (clientes, base ativa, receita mensal)
 * ficam em cartões grandes e legíveis; a nota embaixo dos cartões explica em
 * uma frase por que a receita pode estar menor do que a real; a tabela detalha
 * por estabelecimento com um selo de status humano (Ativo / Vence em X dias /
 * Em atraso / Bloqueado). Sem jargão de billing solto na tela.
 */
export default function PlanosDashboard({ tenants, planos, assinaturas, onAtualizado }) {
  const { kpis, precisamAtencao, distribuicaoPlano, linhas } = useMemo(
    () => resumirPlataforma(tenants ?? [], planos ?? [], assinaturas ?? []),
    [tenants, planos, assinaturas]
  );
  const [linhaPreco, setLinhaPreco] = useState(null);

  return (
    <div className="pdash">
      {/* ── Alerta de validade — o que precisa de ação agora ─────────── */}
      {precisamAtencao.length > 0 && (
        <section className="pdash__alerta" role="status" aria-label="Assinaturas que precisam de atenção">
          <div className="pdash__alerta-topo">
            <LuTriangleAlert size={18} aria-hidden />
            <strong>
              {precisamAtencao.length === 1
                ? "1 estabelecimento precisa de atenção"
                : `${precisamAtencao.length} estabelecimentos precisam de atenção`}
            </strong>
          </div>
          <ul className="pdash__alerta-lista">
            {precisamAtencao.map((l) => (
              <li key={l.tenantId} className={`pdash__alerta-item pdash__alerta-item--${l.status}`}>
                <span className="pdash__alerta-nome">{l.nome}</span>
                <SeloStatus status={l.status} dias={l.diasParaVencer} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <section className="pdash__kpis">
        <CartaoKpi icone={<LuBuilding2 size={18} />} rotulo="Estabelecimentos" valor={kpis.totalTenants} />
        <CartaoKpi icone={<LuCircleCheck size={18} />} rotulo="Base ativa" valor={kpis.ativos} tom="verde" />
        <CartaoKpi icone={<LuClock size={18} />} rotulo="Em atraso" valor={kpis.emCarencia} tom={kpis.emCarencia > 0 ? "ambar" : undefined} />
        <CartaoKpi icone={<LuBan size={18} />} rotulo="Bloqueados" valor={kpis.bloqueados} tom={kpis.bloqueados > 0 ? "vermelho" : undefined} />
        <CartaoKpi icone={<LuWallet size={18} />} rotulo="Receita mensal" valor={formatarReais(kpis.mrr)} tom="accent" destaque />
      </section>

      {/* A receita mensal é a soma das mensalidades. Como todo
          estabelecimento nasce com mensalidade 0, sem esta nota o número
          acima passaria por fato consumado — e não há como distinguir "não
          fatura nada" de "ninguém preencheu o preço ainda". */}
      {kpis.semPreco > 0 && (
        <p className="pdash__nota" role="status">
          {kpis.semPreco === 1
            ? "1 estabelecimento ativo está sem mensalidade definida e não entra na receita mensal."
            : `${kpis.semPreco} estabelecimentos ativos estão sem mensalidade definida e não entram na receita mensal.`}
          {" "}Clique no “—” da coluna Mensalidade para definir.
        </p>
      )}

      {/* ── Distribuição por plano ───────────────────────────────────── */}
      {distribuicaoPlano.length > 0 && (
        <section className="pdash__bloco">
          <h2 className="pdash__bloco-titulo"><LuChartPie size={16} aria-hidden /> Clientes por plano</h2>
          <ul className="pdash__planos">
            {distribuicaoPlano.map((p) => {
              const pct = kpis.totalTenants > 0 ? Math.round((p.quantidade / kpis.totalTenants) * 100) : 0;
              return (
                <li key={p.codigo} className="pdash__plano">
                  <div className="pdash__plano-cab">
                    <span className="pdash__plano-nome">{p.nome}</span>
                    <span className="pdash__plano-qtd">{p.quantidade}</span>
                  </div>
                  <div className="pdash__barra" aria-hidden>
                    <div className="pdash__barra-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Tabela por estabelecimento ───────────────────────────────── */}
      <section className="pdash__bloco">
        <h2 className="pdash__bloco-titulo">Assinaturas por estabelecimento</h2>
        <div className="pdash__tabela-scroll">
          <table className="pdash__tabela">
            <thead>
              <tr>
                <th>Estabelecimento</th>
                <th>Plano</th>
                <th className="pdash__col-num">Mensalidade</th>
                <th>Vencimento</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.tenantId}>
                  <td className="pdash__td-nome">{l.nome}</td>
                  <td>{l.planoNome ?? "—"}</td>
                  <td className="pdash__col-num">
                    {/* Sem linha de assinatura não há mensalidade para definir
                        (a RPC recusaria com "não tem assinatura"), então a
                        célula não é clicável — a coluna Situação da mesma linha
                        já diz "Sem assinatura". Prevenção de erro > erro. */}
                    {l.status === "sem_assinatura" ? "—" : (
                      <button
                        type="button"
                        className={`pdash__preco${l.valorMensal > 0 ? "" : " pdash__preco--vazio"}`}
                        onClick={() => setLinhaPreco(l)}
                        aria-label={l.valorMensal > 0
                          ? `Alterar mensalidade de ${l.nome} (hoje ${formatarReais(l.valorMensal)})`
                          : `Definir mensalidade de ${l.nome}`}
                      >
                        {l.valorMensal > 0 ? formatarReais(l.valorMensal) : "—"}
                      </button>
                    )}
                  </td>
                  <td>{formatarData(l.dataVencimento)}</td>
                  <td><SeloStatus status={l.status} dias={l.diasParaVencer} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {linhaPreco && (
        <DefinirMensalidadeModal
          linha={linhaPreco}
          onFechar={() => setLinhaPreco(null)}
          onDefinido={() => {
            setLinhaPreco(null);
            onAtualizado?.();
          }}
        />
      )}
    </div>
  );
}

function CartaoKpi({ icone, rotulo, valor, tom, destaque }) {
  return (
    <div className={`pdash__kpi${tom ? ` pdash__kpi--${tom}` : ""}${destaque ? " pdash__kpi--destaque" : ""}`}>
      <span className="pdash__kpi-icone" aria-hidden>{icone}</span>
      <span className="pdash__kpi-valor">{valor}</span>
      <span className="pdash__kpi-rotulo">{rotulo}</span>
    </div>
  );
}

// Selo humano de situação da assinatura. Rótulo em português do dia a dia,
// sem jargão de billing (Princípio nº1).
function SeloStatus({ status, dias }) {
  const mapa = {
    ativo:
      dias != null && dias <= 5
        ? { classe: "vencendo", texto: dias === 0 ? "Vence hoje" : `Vence em ${dias} dia${dias === 1 ? "" : "s"}` }
        : { classe: "ativo", texto: "Ativo" },
    carencia: { classe: "carencia", texto: dias != null ? `Em atraso (${Math.abs(dias)}d)` : "Em atraso" },
    bloqueado: { classe: "bloqueado", texto: "Bloqueado" },
    cancelado: { classe: "cancelado", texto: "Cancelado" },
    sem_assinatura: { classe: "sem", texto: "Sem assinatura" },
  };
  const { classe, texto } = mapa[status] ?? mapa.sem_assinatura;
  return <span className={`pdash__selo pdash__selo--${classe}`}>{texto}</span>;
}

// data_vencimento é `date` puro (YYYY-MM-DD). Formata pela string, sem
// passar por new Date(), que interpretaria como UTC e deslocaria o dia no
// fuso do Brasil (-03) — mostrando "12/08" para um vencimento em "13/08".
function formatarData(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}
