import { useState, useEffect } from "react";
import { useSessao } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { carregarConfigDelivery, salvarConfigDelivery } from "@/features/delivery/deliveryAdmin";
import {
  DIAS_SEMANA, HORARIO_PADRAO, normalizarHorario, horarioValido, resumoHorario, deliveryDeveEstarAberto
} from "@/features/delivery/regras/deliveryHorario";
import { faixaNova, horarioParaEdicao } from "@/features/delivery/regras/edicaoHorario";

export default function DeliveryTab({ sz }) {
  const { tenant, currentUser } = useSessao();
  const [config, setConfig] = useState(null);
  const [horario, setHorario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState("");

  // Carga inicial: lê a config do tenant e semeia o rascunho do horário.
  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      const { data, error } = await carregarConfigDelivery();
      if (!ativo) return;
      if (error) {
        setErro("Não foi possível carregar a configuração do delivery.");
        setCarregando(false);
        return;
      }
      const base = data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] };
      setConfig(base);
      setHorario(horarioParaEdicao(base.horario));
      setErro("");
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  const setCampo = (patch) => { setHorario((h) => ({ ...h, ...patch })); setOkMsg(""); };

  // Ligar o agendamento pela 1ª vez parte de um padrão amigável (todos os
  // dias, 18:00–23:00) para o dono ajustar — nunca liga vazio.
  const alternarAuto = () => {
    setOkMsg("");
    setHorario((h) => {
      if (h.auto) return { ...h, auto: false };
      const vazio = h.faixas.length === 0 && h.dias.length === 0;
      if (vazio) {
        return { auto: true, dias: [...HORARIO_PADRAO.dias], faixas: [faixaNova()] };
      }
      // Já tinha algo configurado: religa preservando, mas garante ao menos
      // uma faixa visível para o dono editar.
      return { ...h, auto: true, faixas: h.faixas.length ? h.faixas : [faixaNova()] };
    });
  };

  const alternarDia = (id) =>
    setCampo({
      dias: horario.dias.includes(id)
        ? horario.dias.filter((d) => d !== id)
        : [...horario.dias, id].sort((a, b) => a - b),
    });

  // Faixas de horário: cada uma é uma janela abre/fecha; valem para todos os
  // dias marcados. O dono pode ter várias no mesmo dia (ex.: almoço e jantar).
  const setFaixa = (i, patch) =>
    setCampo({ faixas: horario.faixas.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const addFaixa = () => setCampo({ faixas: [...horario.faixas, faixaNova()] });
  const removeFaixa = (i) => setCampo({ faixas: horario.faixas.filter((_, idx) => idx !== i) });

  const valido = horario ? horarioValido(horario) : false;
  const alterado =
    config && horario &&
    JSON.stringify(normalizarHorario(config.horario)) !== JSON.stringify(normalizarHorario(horario));
  const preview = horario ? resumoHorario(horario) : null;
  const podeSalvar = !salvando && valido && alterado;

  const salvar = async () => {
    if (!tenant?.id) { setErro("Estabelecimento não identificado."); return; }
    if (!podeSalvar) return;
    setSalvando(true);
    setErro("");
    // Ao salvar com o agendamento ligado, já casa o flag `aberto` com o
    // horário de agora (o operador vê o efeito na hora). Desligado/incompleto
    // (null) preserva o controle manual.
    const desejado = deliveryDeveEstarAberto(horario, new Date());
    const proximo = { ...config, horario, aberto: desejado === null ? !!config.aberto : desejado };
    const { data, error } = await salvarConfigDelivery(tenant.id, proximo);
    setSalvando(false);
    if (error) { setErro("Não foi possível salvar. Tente novamente."); return; }
    const salvo = data || proximo;
    setConfig(salvo);
    setHorario(horarioParaEdicao(salvo.horario));
    setOkMsg(horario.auto ? "Abertura automática salva." : "Abertura automática desligada.");
    logAction(currentUser?.username, "delivery:horario", {
      msg: horario.auto ? `Delivery automático: ${preview || "configurado"}` : "Delivery automático desligado",
      name: currentUser?.name,
      role: currentUser?.role,
    });
  };

  if (carregando || !horario) {
    return <div className="delivery-tab__estado delivery-tab__estado--carregando" style={{ "--geral-pad": `${sz.pad}px` }}>Carregando…</div>;
  }

  return (
    <div className="geral-tab" style={{ "--geral-pad": `${sz.pad}px` }}>
      {/* Liga/desliga o agendamento */}
      <div className="geral-tab__card">
        <div className="geral-tab__texto">
          <div className="geral-tab__titulo">Abrir e fechar automaticamente</div>
          <div className="geral-tab__ajuda">
            O delivery abre e fecha sozinho nos dias e horários escolhidos.
            Deixe desligado para controlar na mão pelo botão do delivery.
          </div>
        </div>
        <button
          type="button"
          onClick={alternarAuto}
          className={`geral-tab__toggle${horario.auto ? " geral-tab__toggle--ligada" : ""}`}
          aria-pressed={horario.auto}
          aria-label="Abrir e fechar o delivery automaticamente"
        >
          <span className="geral-tab__toggle-bolinha" />
        </button>
      </div>

      {horario.auto && (
        <div className="geral-tab__card delivery-tab__detalhes">
          {/* Dias de atendimento */}
          <div className="delivery-tab__bloco">
            <div className="delivery-tab__rotulo">Dias de atendimento</div>
            <div className="delivery-tab__dias">
              {DIAS_SEMANA.map((d) => {
                const on = horario.dias.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => alternarDia(d.id)}
                    className={`delivery-tab__dia${on ? " delivery-tab__dia--on" : ""}`}
                    title={d.label}
                    aria-pressed={on}
                  >
                    {d.curto}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horários de abertura e fechamento (uma ou mais janelas por dia) */}
          <div className="delivery-tab__bloco">
            <div className="delivery-tab__rotulo">Horários</div>
            <div className="delivery-tab__faixas">
              {horario.faixas.map((f, i) => (
                <div className="delivery-tab__faixa" key={f.uid}>
                  <div className="delivery-tab__horas">
                    <label className="delivery-tab__hora">
                      <span>Abre</span>
                      <input
                        type="time"
                        value={f.abre || ""}
                        onChange={(e) => setFaixa(i, { abre: e.target.value })}
                        className="delivery-tab__time"
                      />
                    </label>
                    <span className="delivery-tab__ate">às</span>
                    <label className="delivery-tab__hora">
                      <span>Fecha</span>
                      <input
                        type="time"
                        value={f.fecha || ""}
                        onChange={(e) => setFaixa(i, { fecha: e.target.value })}
                        className="delivery-tab__time"
                      />
                    </label>
                  </div>
                  {horario.faixas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFaixa(i)}
                      className="delivery-tab__faixa-remover"
                      aria-label={`Remover o horário ${i + 1}`}
                      title="Remover este horário"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addFaixa} className="delivery-tab__add-faixa">
              + Adicionar horário
            </button>
            <div className="delivery-tab__dica">
              Pode ter vários horários no mesmo dia (ex.: 08:00–10:00, 11:00–14:00
              e 18:00–00:00). Fecha depois da meia-noite? Basta pôr uma hora menor
              (ex.: abre 18:00, fecha 02:00).
            </div>
          </div>

          {/* Prévia amigável / o que falta preencher */}
          <div className={`delivery-tab__preview${preview ? "" : " delivery-tab__preview--pendente"}`}>
            {preview
              ? <>Vai abrir <strong>{preview}</strong>.</>
              : "Escolha pelo menos um dia e horários de abrir e fechar diferentes."}
          </div>
        </div>
      )}

      {erro && <div className="delivery-tab__estado delivery-tab__estado--erro">{erro}</div>}
      {okMsg && <div className="delivery-tab__estado delivery-tab__estado--ok">{okMsg}</div>}

      <div className="delivery-tab__acoes">
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="delivery-tab__salvar"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
