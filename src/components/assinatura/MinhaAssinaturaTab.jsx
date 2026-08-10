import { useCallback, useEffect, useState } from "react";
import {
  LuCircleCheck, LuTriangleAlert, LuLoaderCircle, LuReceipt, LuCheck, LuBan,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import {
  listarPagamentosAssinatura, resumirPagamentos, resumirPlanoDoTenant, rotuloCompetencia,
} from "@/lib/console/assinatura";
import { buscarPlanoDoTenant } from "@/lib/tenant/tenant";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";
import { ROTULOS_MODULO } from "@/constants/modulos";
import "./MinhaAssinaturaTab.css";

/** `date` do Postgres ("2026-08-01") → "agosto/2026", pela string. */
function mesPago(competencia) {
  return rotuloCompetencia(String(competencia ?? "").slice(0, 7)) || "—";
}

/**
 * `confirmado_em`/`estornado_em` são `timestamptz` — instantes, não dias de
 * calendário; aqui `new Date()` é o certo (o contrário de `competencia`).
 */
function dataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/**
 * Aba "Minha assinatura" (Configurações) — o estabelecimento vendo o próprio
 * plano, a situação da mensalidade e o histórico do que já pagou (S1-3).
 *
 * Por que existe: o banner do topo só aparece quando algo está para vencer, e
 * o Console é da plataforma. Quem paga a mensalidade não tinha, em lugar
 * nenhum do sistema, como responder "que plano eu tenho, o que ele inclui,
 * quando vence e o que eu já paguei".
 *
 * SOMENTE LEITURA, de propósito (decisão 027): registrar e cancelar pagamento
 * são RPCs `SECURITY DEFINER` guardadas por `is_super_admin()` — quem paga não
 * dá baixa na própria mensalidade. Botão que existisse aqui só levaria a um
 * 42501; melhor não existir (prevenção de erro > mensagem de erro).
 *
 * Por que é intuitiva (Princípio nº1): abre respondendo, em uma frase grande e
 * em português, a única pergunta que traz alguém aqui — "estou em dia?" — com
 * a data do próximo vencimento logo abaixo. Depois vem o que se está pagando
 * (plano e o que ele inclui, por nome, nunca por código) e por último o
 * comprovante do que já foi pago. Nada para preencher, nada que possa dar
 * errado: a tela informa e sai da frente.
 */
export default function MinhaAssinaturaTab() {
  const { tenant, assinatura } = useApp();
  const tenantId = tenant?.id ?? null;

  const [plano, setPlano] = useState(null);
  const [pagamentos, setPagamentos] = useState([]);
  const [estado, setEstado] = useState("carregando"); // carregando | ok | erro
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setEstado("carregando");
    setErro("");

    const [resPlano, resPagamentos] = await Promise.all([
      buscarPlanoDoTenant(tenant?.planoCodigo),
      listarPagamentosAssinatura(tenantId),
    ]);

    // Nome do plano é enfeite: se falhar, o bloco cai numa frase neutra e a
    // tela segue — não vale derrubar a situação da assinatura por causa disso.
    setPlano(resPlano.data ?? null);

    if (resPagamentos.error) {
      // Lista vazia por falha de leitura faria parecer que nunca se pagou
      // nada. A tela precisa dizer que não sabe.
      setErro(resPagamentos.error.message ?? "Não foi possível carregar os pagamentos.");
      setPagamentos([]);
      setEstado("erro");
      return;
    }
    setPagamentos(resPagamentos.data);
    setEstado("ok");
  }, [tenantId, tenant?.planoCodigo]);

  useEffect(() => { carregar(); }, [carregar]);

  // Bootstrap ainda em voo: sem tenant não dá para afirmar nada. Dizer
  // "não há assinatura" aqui seria mentir por um instante — e é justamente
  // a frase que assusta quem paga em dia.
  if (!tenantId) {
    return (
      <div className="massin">
        <p className="massin__estado" role="status">
          <LuLoaderCircle size={16} className="massin__girando" aria-hidden /> Carregando sua assinatura…
        </p>
      </div>
    );
  }

  const situacao = resumirPlanoDoTenant(assinatura);
  const { linhas, totalCentavos, quantidadeValidos, quantidadeEstornados } = resumirPagamentos(pagamentos);
  const modulos = Object.keys(ROTULOS_MODULO).filter((c) => (tenant?.modulosDisponiveis ?? []).includes(c));
  // Código de plano ("medio") é jargão técnico e não vai para a tela
  // (Princípio nº1): sem o nome do catálogo, a frase é neutra.
  const nomeDoPlano = plano?.nome || (tenant?.planoCodigo ? "Plano contratado" : "Plano não identificado");

  return (
    <div className="massin">
      {situacao ? (
        <section className={`massin__situacao massin__situacao--${situacao.tom}`} role="status">
          {situacao.tom === "ok" ? (
            <LuCircleCheck size={22} aria-hidden />
          ) : (
            <LuTriangleAlert size={22} aria-hidden />
          )}
          <div className="massin__situacao-texto">
            <p className="massin__situacao-titulo">{situacao.titulo}</p>
            <p className="massin__situacao-detalhe">{situacao.detalhe}</p>
          </div>
        </section>
      ) : (
        <section className="massin__situacao massin__situacao--neutro" role="status">
          <div className="massin__situacao-texto">
            <p className="massin__situacao-titulo">Ainda não há uma assinatura cadastrada</p>
            <p className="massin__situacao-detalhe">
              Assim que a mensalidade deste estabelecimento for configurada, a situação aparece aqui.
            </p>
          </div>
        </section>
      )}

      <section className="massin__card">
        <div className="massin__card-topo">
          <div>
            <p className="massin__rotulo">Seu plano</p>
            <p className="massin__plano">{nomeDoPlano}</p>
          </div>
          {situacao && (
            <p className="massin__mensalidade">
              {/* Cortesia vem antes do preço: mostrar "R$ 199 por mês" para quem
                  está isento faria o dono achar que tem boleto para pagar. */}
              {situacao.status === "isento"
                ? <>Cortesia{situacao.isentoAteBr ? <span>até {situacao.isentoAteBr}</span> : null}</>
                : situacao.semMensalidade
                  ? "Sem mensalidade"
                  : <>{formatarReais(situacao.mensalidadeCentavos / 100)} <span>por mês</span></>}
            </p>
          )}
        </div>

        {modulos.length > 0 && (
          <>
            <p className="massin__rotulo massin__rotulo--secao">O que está incluído</p>
            <ul className="massin__modulos">
              {modulos.map((codigo) => (
                <li key={codigo} className="massin__modulo">
                  <LuCheck size={14} aria-hidden /> {ROTULOS_MODULO[codigo]}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="massin__card">
        <p className="massin__rotulo">Pagamentos</p>

        {estado === "carregando" && (
          <p className="massin__estado" role="status">
            <LuLoaderCircle size={16} className="massin__girando" aria-hidden /> Carregando os pagamentos…
          </p>
        )}

        {estado === "erro" && (
          <div className="massin__estado massin__estado--erro" role="alert">
            <p className="massin__estado-texto">
              <LuTriangleAlert size={16} aria-hidden /> Não foi possível carregar os pagamentos.
            </p>
            <p className="massin__estado-detalhe">{erro}</p>
            <button type="button" className="massin__botao" onClick={carregar}>
              Tentar de novo
            </button>
          </div>
        )}

        {estado === "ok" && linhas.length === 0 && (
          <p className="massin__estado" role="status">
            Nenhum pagamento registrado ainda.
          </p>
        )}

        {estado === "ok" && linhas.length > 0 && (
          <>
            {quantidadeValidos === 0 ? (
              // Total zero com a lista cheia parece falha de carregamento —
              // o texto precisa dizer que o zero é de propósito.
              <p className="massin__total" role="status">
                Nenhum pagamento em vigor:{" "}
                {quantidadeEstornados === 1
                  ? "1 lançamento foi cancelado"
                  : `${quantidadeEstornados} lançamentos foram cancelados`}.
              </p>
            ) : (
              <p className="massin__total" role="status">
                <strong>{formatarReais(totalCentavos / 100)}</strong> pagos em{" "}
                {quantidadeValidos === 1 ? "1 mensalidade" : `${quantidadeValidos} mensalidades`}.
              </p>
            )}

            <ul className="massin__lista">
              {linhas.map((p) => (
                <li key={p.id} className={`massin__item${p.estornado ? " massin__item--cancelado" : ""}`}>
                  <div className="massin__item-topo">
                    <span className="massin__item-mes">{mesPago(p.competencia)}</span>
                    <span className="massin__item-valor">{formatarReais(p.valorCentavos / 100)}</span>
                  </div>
                  {p.estornado ? (
                    <p className="massin__item-cancelado">
                      <LuBan size={14} aria-hidden /> Cancelado
                      {dataHora(p.estornadoEm) ? ` em ${dataHora(p.estornadoEm)}` : ""}
                      {p.motivoEstorno ? `: ${p.motivoEstorno}` : ""}
                    </p>
                  ) : (
                    <p className="massin__item-meta">
                      <LuReceipt size={13} aria-hidden />
                      {p.metodo ? ` ${p.metodo}` : " Pagamento"}
                      {dataHora(p.confirmadoEm) ? ` · registrado em ${dataHora(p.confirmadoEm)}` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
