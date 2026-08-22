import { useEffect, useRef, useState } from "react";
import {
  mascararWhatsapp,
  mensagemDeContatoDoLead,
  montarLinkWhatsapp,
  registrarLead,
  validarLead,
} from "@/lib/leads";
import "./ApexAgendamento.css";

/**
 * Aba de agendamento de demonstração — captura de lead do apex.
 *
 * Abre a partir de qualquer CTA da landing (nav, herói, banner de
 * funcionalidades, construtor de plano e fechamento) — quem controla é
 * ApexPage, que diz de onde veio o clique em `origem` e passa o `plano`
 * só quando a pessoa realmente montou um.
 * Coleta Nome, WhatsApp e E-mail, valida na hora e GRAVA o contato em
 * `leads` (RPC pública `registrar_lead`, migração 20260920_leads.sql).
 * O lead aparece no Console, aba "Leads".
 *
 * Três decisões que valem explicar:
 *
 * 1. A tela nunca afirma o que não aconteceu. Antes ela dizia "Parabéns
 *    por adquirir seu plano!" e "nossa equipe já vai te chamar" — nada
 *    disso tinha acontecido, e o contato nem era guardado. Agora ela diz
 *    o que de fato houve ("recebemos seu contato") e o prazo de retorno.
 *
 * 2. Se a gravação falhar, a pessoa NÃO sai de mãos vazias: aparece o
 *    botão do WhatsApp com a mensagem já escrita, incluindo o plano que
 *    ela montou. Falha de rede não pode custar um cliente.
 *
 * 3. O aceite (LGPD) é condição de envio, não letra miúda: sem marcar,
 *    o botão explica o que falta — e o banco recusa igual, porque a
 *    regra também está no CHECK da tabela.
 */

// Onde o foco pode parar dentro do painel — base do laço de Tab.
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

const CONTATO_URL = import.meta.env.VITE_CONTATO_URL || "";

export default function ApexAgendamento({
  aberto,
  onFechar,
  plano,
  // De onde o visitante clicou. Vai junto com o lead para o Console:
  // "veio do herói" e "montou R$ 389 em módulos" pedem conversas
  // diferentes. Sem valor, `registrarLead` usa a origem padrão.
  origem,
}) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const nomeRef = useRef(null);
  const painelRef = useRef(null);

  // Foco no primeiro campo ao abrir, Esc fecha e Tab não escapa do
  // painel: com o modal aberto, o resto da página não é alcançável —
  // quem navega por teclado ficava tabulando na landing atrás do modal.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => nomeRef.current?.focus(), 60);

    const aoTeclar = (e) => {
      if (e.key === "Escape") {
        onFechar();
        return;
      }
      if (e.key !== "Tab") return;

      const alvos = painelRef.current?.querySelectorAll(FOCAVEIS);
      if (!alvos?.length) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
    };
  }, [aberto, onFechar]);

  // Zera o estado ao fechar, para reabrir limpo.
  useEffect(() => {
    if (!aberto) {
      setNome("");
      setWhatsapp("");
      setEmail("");
      setConsentimento(false);
      setErros({});
      setEnviando(false);
      setFalhou(false);
      setEnviado(false);
    }
  }, [aberto]);

  if (!aberto) return null;

  // Conversa já escrita com o comercial, com o plano que a pessoa
  // montou. Vira `null` quando não há número configurado
  // (VITE_CONTATO_URL vazio) — aí a tela simplesmente não oferece.
  const linkWhatsapp = montarLinkWhatsapp(
    CONTATO_URL,
    mensagemDeContatoDoLead({ nome, plano })
  );

  const aoEnviar = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const { ok, erros: novos } = validarLead({
      nome,
      whatsapp,
      email,
      consentimento,
    });
    setErros(novos);
    if (!ok) return;

    setEnviando(true);
    setFalhou(false);
    const { error } = await registrarLead({
      nome,
      whatsapp,
      email,
      consentimento,
      ...(origem ? { origem } : {}),
      plano,
    });
    setEnviando(false);

    if (error) {
      setFalhou(true);
      return;
    }
    setEnviado(true);
  };

  const aoClicarFundo = (e) => {
    if (e.target === e.currentTarget) onFechar();
  };

  const primeiroNome = nome.trim().split(/\s+/)[0];
  const qtdItens =
    (plano?.modulos?.length ?? 0) + (plano?.addons?.length ?? 0);

  return (
    <div
      className="apex-agendamento__fundo"
      onClick={aoClicarFundo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apex-agendamento-titulo"
    >
      <div className="apex-agendamento__painel" ref={painelRef}>
        <button
          type="button"
          className="apex-agendamento__fechar"
          onClick={onFechar}
          aria-label="Fechar"
        >
          ✕
        </button>

        {!enviado ? (
          <>
            <div className="apex-agendamento__cabecalho">
              <span className="apex-kicker">Agendar demonstração</span>
              <h3 id="apex-agendamento-titulo" className="apex-agendamento__titulo">
                Deixe seu contato e a gente marca sua demonstração
              </h3>
              <p className="apex-agendamento__subtitulo">
                30 minutos ao vivo, com o seu cardápio. Sem compromisso.
              </p>
            </div>

            {plano?.total != null && (
              <div className="apex-agendamento__plano">
                <span>
                  Plano montado por você
                  {qtdItens > 0 && (
                    <small>
                      {" "}
                      · {qtdItens} {qtdItens === 1 ? "item" : "itens"}
                    </small>
                  )}
                </span>
                <strong>
                  R$ {plano.total.toLocaleString("pt-BR")}
                  <span>/mês</span>
                </strong>
              </div>
            )}

            <form className="apex-agendamento__form" onSubmit={aoEnviar} noValidate>
              <label className="apex-agendamento__campo">
                <span>Nome</span>
                <input
                  ref={nomeRef}
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  aria-invalid={!!erros.nome}
                  autoComplete="name"
                />
                {erros.nome && (
                  <span className="apex-agendamento__erro">{erros.nome}</span>
                )}
              </label>

              <label className="apex-agendamento__campo">
                <span>WhatsApp</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
                  placeholder="(11) 99999-9999"
                  aria-invalid={!!erros.whatsapp}
                  autoComplete="tel"
                />
                {erros.whatsapp && (
                  <span className="apex-agendamento__erro">{erros.whatsapp}</span>
                )}
              </label>

              <label className="apex-agendamento__campo">
                <span>E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@seunegocio.com.br"
                  aria-invalid={!!erros.email}
                  autoComplete="email"
                />
                {erros.email && (
                  <span className="apex-agendamento__erro">{erros.email}</span>
                )}
              </label>

              <label className="apex-agendamento__consentimento">
                <input
                  type="checkbox"
                  checked={consentimento}
                  onChange={(e) => setConsentimento(e.target.checked)}
                  aria-invalid={!!erros.consentimento}
                />
                <span>
                  Pode guardar meu nome, WhatsApp e e-mail para falar comigo
                  sobre a demonstração. Não usamos para mais nada e você pode
                  pedir a exclusão quando quiser.
                </span>
              </label>
              {erros.consentimento && (
                <span className="apex-agendamento__erro">
                  {erros.consentimento}
                </span>
              )}

              <button
                type="submit"
                className="apex-botao apex-botao--primario apex-agendamento__enviar"
                disabled={enviando}
              >
                {enviando ? "Enviando…" : "Agendar demonstração"}
              </button>

              {falhou && (
                <div className="apex-agendamento__falha" role="alert">
                  <strong>Não conseguimos guardar seu contato agora.</strong>
                  <p>
                    Pode ter sido a conexão. Tente de novo em instantes —
                    {linkWhatsapp
                      ? " ou fale com a gente agora mesmo, a mensagem já vai pronta."
                      : " seus dados continuam preenchidos aqui."}
                  </p>
                  {linkWhatsapp && (
                    <a
                      href={linkWhatsapp}
                      className="apex-botao apex-botao--outline apex-agendamento__whatsapp"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Falar no WhatsApp
                    </a>
                  )}
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="apex-agendamento__sucesso">
            <div className="apex-agendamento__sucesso-icone" aria-hidden="true">
              ✅
            </div>
            <h3 id="apex-agendamento-titulo" className="apex-agendamento__titulo">
              Recebemos seu contato{primeiroNome ? `, ${primeiroNome}` : ""}!
            </h3>
            <p className="apex-agendamento__subtitulo">
              Guardamos o plano que você montou e vamos te chamar no WhatsApp{" "}
              <strong>em até 1 dia útil</strong> para marcar a demonstração no
              horário que der pra você. Nenhum pagamento foi feito e nada foi
              contratado — a conversa vem primeiro.
            </p>

            {linkWhatsapp && (
              <a
                href={linkWhatsapp}
                className="apex-botao apex-botao--outline apex-agendamento__whatsapp"
                target="_blank"
                rel="noopener noreferrer"
              >
                Não quer esperar? Fale agora no WhatsApp
              </a>
            )}

            <button
              type="button"
              className="apex-botao apex-botao--primario apex-agendamento__enviar"
              onClick={onFechar}
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
