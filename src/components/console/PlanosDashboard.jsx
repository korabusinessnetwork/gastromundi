import { useMemo } from "react";
import {
  LuTriangleAlert, LuCircleCheck, LuClock, LuBan, LuBuilding2, LuWallet,
  LuChartPie,
} from "react-icons/lu";
import { resumirPlataforma } from "@/lib/console";
import { formatarReais } from "@/lib/deliveryPedidos";
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
 * Só leitura (nenhuma escrita nova): a troca de plano continua no card de
 * estabelecimento; a renovação de assinatura tem RPC própria (Fase 4) e
 * entra numa fatia seguinte. Autorização é do banco — o super-admin lê
 * `assinaturas` de todos via `is_super_admin()` (20260726); a casca aqui
 * não decide acesso.
 *
 * Por que é intuitivo (Princípio nº1): o que exige ação vem primeiro e em
 * cor de alerta; os números-chave (clientes, base ativa, receita mensal)
 * ficam em cartões grandes e legíveis; a tabela detalha por estabelecimento
 * com um selo de status humano (Ativo / Vence em X dias / Em atraso /
 * Bloqueado). Sem jargão de billing solto na tela.
 */
export default function PlanosDashboard({ tenants, planos, assinaturas }) {
  const { kpis, precisamAtencao, distribuicaoPlano, linhas } = useMemo(
    () => resumirPlataforma(tenants ?? [], planos ?? [], assinaturas ?? []),
    [tenants, planos, assinaturas]
  );

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
                  <td className="pdash__col-num">{l.valorMensal > 0 ? formatarReais(l.valorMensal) : "—"}</td>
                  <td>{formatarData(l.dataVencimento)}</td>
                  <td><SeloStatus status={l.status} dias={l.diasParaVencer} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
