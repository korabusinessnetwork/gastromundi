import { useMemo, useState } from "react";
import {
  LuInbox, LuTriangleAlert, LuStore, LuPhone, LuMail, LuCircleCheck, LuBan,
} from "react-icons/lu";
import { pendentesPrimeiro, resumirPlanoSolicitado } from "@/lib/console";
import { formatarTelefone } from "@/lib/telefone";
import { formatarReais } from "@/lib/deliveryPedidos";
import "./SolicitacoesFila.css";

/**
 * Fila de solicitações de conta (20260926) — quem pediu um KORA pelo site.
 *
 * É a outra ponta do "Criar minha conta" do apex: o visitante preencheu
 * quem é, o nome do negócio, o endereço que quer e o plano; aqui o dono da
 * plataforma lê tudo isso e decide. Aprovar abre o formulário de criação
 * JÁ PREENCHIDO com o que a pessoa mandou — a aprovação e a criação são o
 * mesmo gesto, não dois trabalhos separados.
 *
 * Nada é provisionado por fora: quem cria continua sendo a Edge Function
 * `provisionar-estabelecimento` (decisão 027), e a decisão é carimbada pela
 * RPC `decidir_solicitacao_conta`, que exige super-admin no banco.
 *
 * Por que é intuitivo (Princípio nº1): quem espera há mais tempo aparece
 * primeiro; cada cartão traz numa olhada tudo o que decide a conversa
 * (negócio, endereço pedido, contato clicável, plano e valor de
 * referência); as duas ações possíveis são dois botões, e a destrutiva
 * (recusar) pede confirmação com motivo opcional antes de valer.
 */
export default function SolicitacoesFila({
  solicitacoes = [],
  carregando = false,
  erro = null,
  online = true,
  onAprovar,
  onRecusar,
  onRecarregar,
}) {
  // Qual cartão está com a confirmação de recusa aberta, e o motivo digitado.
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState("");
  // Recusa em andamento e o que deu errado nela. A falha fica no CARTÃO, não
  // numa faixa longe: é ali que o dono está olhando, e o pedido continua
  // pendente até dar certo.
  const [enviandoRecusa, setEnviandoRecusa] = useState(false);
  const [erroRecusa, setErroRecusa] = useState("");

  const pendentes = useMemo(() => pendentesPrimeiro(solicitacoes), [solicitacoes]);
  const decididas = useMemo(
    () => (solicitacoes ?? []).filter((s) => s?.status !== "pendente"),
    [solicitacoes]
  );

  const abrirRecusa = (s) => {
    setRecusando(s.id);
    setMotivo("");
    setErroRecusa("");
  };

  const confirmarRecusa = async (s) => {
    if (enviandoRecusa) return;
    setEnviandoRecusa(true);
    setErroRecusa("");
    const resposta = await onRecusar?.(s, motivo.trim());
    setEnviandoRecusa(false);
    // Sem resposta (chamador antigo) tratamos como sucesso: fechar o cartão
    // é o que já acontecia. Com resposta, só fecha quando de fato recusou.
    if (resposta && resposta.ok === false) {
      setErroRecusa(resposta.erro || "Não foi possível recusar agora. Tente de novo.");
      return;
    }
    setRecusando(null);
    setMotivo("");
  };

  if (erro) {
    return (
      <div className="sfila__aviso" role="alert">
        <LuTriangleAlert size={18} aria-hidden />
        <span>
          Não foi possível carregar os pedidos de conta feitos no site. Ninguém
          é perdido — eles continuam guardados; é só a leitura que falhou.
        </span>
        <button type="button" className="sfila__aviso-acao" onClick={onRecarregar}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (carregando && solicitacoes.length === 0) {
    return <p className="sfila__estado">Carregando os pedidos…</p>;
  }

  return (
    <div className="sfila">
      <div className="sfila__cabecalho">
        <div>
          <h1 className="console__h1">Pedidos de conta</h1>
          <p className="console__subtitulo">
            Quem preencheu “Criar minha conta” no site. Aprovar abre o cadastro
            já preenchido com o que a pessoa mandou.
          </p>
        </div>
      </div>

      {pendentes.length === 0 ? (
        <div className="sfila__vazio">
          <LuInbox size={26} aria-hidden />
          <p className="sfila__vazio-titulo">Nenhum pedido esperando</p>
          <p className="sfila__vazio-texto">
            Quando alguém criar uma conta pelo site, o pedido aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="sfila__lista">
          {pendentes.map((s) => (
            <li key={s.id} className="sfila__card">
              <div className="sfila__card-topo">
                <div className="sfila__negocio">
                  <LuStore size={18} aria-hidden />
                  <div>
                    <strong className="sfila__negocio-nome">{s.estabelecimento}</strong>
                    <span className="sfila__endereco">{s.slug_desejado}</span>
                  </div>
                </div>
                <span className="sfila__quando">{formatarQuando(s.criado_em)}</span>
              </div>

              <div className="sfila__contato">
                <span className="sfila__responsavel">{s.nome}</span>
                <a className="sfila__link" href={`https://wa.me/55${s.whatsapp}`} target="_blank" rel="noreferrer">
                  <LuPhone size={14} aria-hidden /> {formatarTelefone(s.whatsapp)}
                </a>
                <a className="sfila__link" href={`mailto:${s.email}`}>
                  <LuMail size={14} aria-hidden /> {s.email}
                </a>
              </div>

              <div className="sfila__plano">
                <span className="sfila__plano-nome">{resumirPlanoSolicitado(s)}</span>
                {s.plano_total != null && (
                  <span className="sfila__plano-valor">
                    {formatarReais(Number(s.plano_total))}/mês de referência
                  </span>
                )}
              </div>

              {recusando === s.id ? (
                <div className="sfila__recusa">
                  <label className="sfila__recusa-campo">
                    <span>Motivo (opcional — fica guardado com o pedido)</span>
                    <input
                      type="text"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: já é cliente por outro endereço"
                      maxLength={200}
                    />
                  </label>
                  {erroRecusa && (
                    <span className="sfila__erro" role="alert">
                      <LuTriangleAlert size={15} aria-hidden /> {erroRecusa}
                    </span>
                  )}
                  <div className="sfila__acoes">
                    <button
                      type="button"
                      className="sfila__botao sfila__botao--perigo"
                      onClick={() => confirmarRecusa(s)}
                      disabled={enviandoRecusa}
                      aria-busy={enviandoRecusa}
                    >
                      {enviandoRecusa ? "Recusando…" : "Confirmar recusa"}
                    </button>
                    <button
                      type="button"
                      className="sfila__botao"
                      onClick={() => setRecusando(null)}
                      disabled={enviandoRecusa}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sfila__acoes">
                  <button
                    type="button"
                    className="sfila__botao sfila__botao--primario"
                    onClick={() => onAprovar?.(s)}
                    disabled={!online}
                    title={online ? undefined : "Sem internet — reconecte para criar o estabelecimento"}
                  >
                    Aprovar e criar estabelecimento
                  </button>
                  <button
                    type="button"
                    className="sfila__botao"
                    onClick={() => abrirRecusa(s)}
                    disabled={!online}
                  >
                    Recusar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decididas.length > 0 && (
        <section className="sfila__historico">
          <h2 className="sfila__historico-titulo">Já decididos</h2>
          <ul className="sfila__historico-lista">
            {decididas.map((s) => (
              <li key={s.id} className="sfila__historico-item">
                {s.status === "aprovada" ? (
                  <LuCircleCheck size={15} aria-hidden className="sfila__icone--ok" />
                ) : (
                  <LuBan size={15} aria-hidden className="sfila__icone--recusado" />
                )}
                <span className="sfila__historico-nome">{s.estabelecimento}</span>
                <span className="sfila__historico-endereco">{s.slug_desejado}</span>
                <span className="sfila__historico-quando">
                  {s.status === "aprovada" ? "Aprovado" : "Recusado"} · {formatarQuando(s.decidido_em)}
                </span>
                {s.observacao && (
                  <span className="sfila__historico-obs">{s.observacao}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// "há 2 dias" diz mais do que a data crua quando o assunto é fila de espera:
// o que importa é há quanto tempo a pessoa está esperando resposta.
function formatarQuando(iso) {
  if (!iso) return "—";
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "—";
  const minutos = Math.floor((Date.now() - quando.getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
