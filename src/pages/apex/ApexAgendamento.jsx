import { useCallback, useEffect, useRef, useState } from "react";
import { registrarLeadApex, validarLead } from "@/lib/leads";
import "./ApexAgendamento.css";

/**
 * Aba de agendamento de demonstração — captura de lead do apex.
 *
 * Abre a partir do botão "Agendar demonstração" do construtor de plano.
 * Coleta Nome, WhatsApp e E-mail, valida na hora e grava o lead pela
 * RPC pública `registrar_lead_apex` (src/lib/leads.js).
 *
 * A confirmação diz o que REALMENTE aconteceu: recebemos o contato e
 * vamos chamar no WhatsApp para marcar a demonstração. Nada de "parabéns
 * pela compra" — ninguém comprou nada aqui, e prometer o que não houve
 * estraga a conversa comercial que vem depois.
 */

// Máscara de telefone BR: (##) #####-#### — só formata, sem validar aqui.
function mascararWhatsapp(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

// Tudo que recebe foco dentro do painel, na ordem do DOM.
const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export default function ApexAgendamento({ aberto, onFechar, plano }) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [erros, setErros] = useState({});
  const [erroEnvio, setErroEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const nomeRef = useRef(null);
  const painelRef = useRef(null);
  // Quem estava com o foco antes de abrir, para devolver ao fechar.
  const focoAnteriorRef = useRef(null);

  // Prende o Tab dentro do painel: sem isso o foco escapa para a página
  // atrás do modal e quem navega por teclado "perde" a janela aberta.
  const prenderFoco = useCallback((e) => {
    if (e.key !== "Tab" || !painelRef.current) return;
    const alvos = painelRef.current.querySelectorAll(FOCAVEIS);
    if (alvos.length === 0) return;
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }, []);

  // Foco no primeiro campo ao abrir, Esc fecha, Tab fica preso dentro,
  // e ao fechar o foco volta para o botão que abriu.
  useEffect(() => {
    if (!aberto) return;
    focoAnteriorRef.current = document.activeElement;
    const t = setTimeout(() => nomeRef.current?.focus(), 60);
    const aoTeclar = (e) => {
      if (e.key === "Escape") onFechar();
      else prenderFoco(e);
    };
    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
      focoAnteriorRef.current?.focus?.();
    };
  }, [aberto, onFechar, prenderFoco]);

  // Zera o estado ao fechar, para reabrir limpo.
  useEffect(() => {
    if (!aberto) {
      setNome("");
      setWhatsapp("");
      setEmail("");
      setErros({});
      setErroEnvio("");
      setEnviando(false);
      setEnviado(false);
    }
  }, [aberto]);

  if (!aberto) return null;

  const aoEnviar = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const { valido, erros: novos } = validarLead({ nome, whatsapp, email });
    setErros(novos);
    setErroEnvio("");
    if (!valido) return;

    setEnviando(true);
    const { ok, erro } = await registrarLeadApex({
      nome,
      whatsapp,
      email,
      total: plano?.total ?? null,
      itens: plano?.itens ?? null,
    });
    setEnviando(false);

    if (ok) setEnviado(true);
    else setErroEnvio(erro);
  };

  const aoClicarFundo = (e) => {
    if (e.target === e.currentTarget && !enviando) onFechar();
  };

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
                <span>Plano montado por você</span>
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
                  disabled={enviando}
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
                  disabled={enviando}
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
                  disabled={enviando}
                />
                {erros.email && (
                  <span className="apex-agendamento__erro">{erros.email}</span>
                )}
              </label>

              {/* Falha de envio é diferente de campo errado: aparece uma vez,
                  acima do botão, e o botão continua clicável para tentar de
                  novo sem redigitar nada. */}
              {erroEnvio && (
                <span className="apex-agendamento__erro-envio" role="alert">
                  {erroEnvio}
                </span>
              )}

              <button
                type="submit"
                className="apex-botao apex-botao--primario apex-agendamento__enviar"
                disabled={enviando}
                aria-busy={enviando}
              >
                {enviando ? "Enviando…" : "Agendar demonstração"}
              </button>

              <span className="apex-agendamento__aviso">
                Usamos seus dados só para falar com você sobre a demonstração.
                Nada de lista de disparo.
              </span>
            </form>
          </>
        ) : (
          <div className="apex-agendamento__sucesso">
            <div className="apex-agendamento__sucesso-icone" aria-hidden="true">
              ✅
            </div>
            <h3 id="apex-agendamento-titulo" className="apex-agendamento__titulo">
              Contato recebido, {nome.trim().split(" ")[0]}!
            </h3>
            <p className="apex-agendamento__subtitulo">
              Já anotamos o plano que você montou. Nossa equipe vai te chamar no
              WhatsApp para combinar o melhor horário da demonstração, são 30
              minutos, com o cardápio do seu negócio na tela.
            </p>

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
