import { useEffect, useRef, useState } from "react";
import "./ApexAgendamento.css";

/**
 * Aba de agendamento de demonstração — captura de lead do apex.
 *
 * Abre a partir do botão "Agendar demonstração" do construtor de plano.
 * Coleta Nome, WhatsApp e E-mail, valida na hora e, ao enviar, mostra uma
 * mensagem de parabéns/boas-vindas.
 *
 * Bootstrap/gratuito: por enquanto só confirma no front — NÃO há
 * persistência ainda. Ligar isto a uma tabela `leads` no Supabase
 * (com RLS) é o próximo passo para capturar o lead de verdade.
 */

// Máscara de telefone BR: (##) #####-#### — só formata, sem validar aqui.
function mascararWhatsapp(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

// O domínio é lido em pedaços separados por ponto (`[^\s@.]+` entre pontos),
// e não como `[^\s@]+\.[^\s@]+`: naquela forma o ponto cabia dentro das duas
// partes e o motor tinha vários jeitos de dividir o mesmo texto, tentando
// todos antes de desistir — digitar um e-mail longo e ainda incompleto
// travava o campo. Aqui a divisão é única e o teste é linear.
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export default function ApexAgendamento({ aberto, onFechar, plano }) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [erros, setErros] = useState({});
  const [enviado, setEnviado] = useState(false);
  const nomeRef = useRef(null);

  // Foco no primeiro campo ao abrir + fechar no Esc.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => nomeRef.current?.focus(), 60);
    const aoTeclar = (e) => {
      if (e.key === "Escape") onFechar();
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
      setErros({});
      setEnviado(false);
    }
  }, [aberto]);

  if (!aberto) return null;

  const validar = () => {
    const novos = {};
    if (nome.trim().length < 2) novos.nome = "Diga como podemos te chamar.";
    const digitos = whatsapp.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11)
      novos.whatsapp = "Informe um WhatsApp com DDD.";
    if (!EMAIL_REGEX.test(email.trim()))
      novos.email = "Confira o e-mail digitado.";
    setErros(novos);
    return Object.keys(novos).length === 0;
  };

  const aoEnviar = (e) => {
    e.preventDefault();
    if (!validar()) return;
    // Bootstrap: apenas confirma no front. TODO: gravar lead em `leads` (Supabase + RLS).
    setEnviado(true);
  };

  const aoClicarFundo = (e) => {
    if (e.target === e.currentTarget) onFechar();
  };

  return (
    <div
      className="apex-agendamento__fundo"
      onClick={aoClicarFundo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apex-agendamento-titulo"
    >
      <div className="apex-agendamento__painel">
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

              <button
                type="submit"
                className="apex-botao apex-botao--primario apex-agendamento__enviar"
              >
                Agendar demonstração
              </button>
            </form>
          </>
        ) : (
          <div className="apex-agendamento__sucesso">
            <div className="apex-agendamento__sucesso-icone" aria-hidden="true">
              🎉
            </div>
            <h3 className="apex-agendamento__titulo">
              Parabéns por adquirir seu plano!
            </h3>
            <p className="apex-agendamento__subtitulo">
              Bem-vindo ao KORA, {nome.trim().split(" ")[0]}. A partir de agora é o
              seu negócio no comando — a gente cuida da tecnologia, você cuida de
              vender. Nossa equipe já vai te chamar no WhatsApp para deixar tudo
              com a sua cara.
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
