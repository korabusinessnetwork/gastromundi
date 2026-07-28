import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  DIAS_SEMANA,
  FAIXA_PADRAO,
  HORARIO_PADRAO,
  deliveryDeveEstarAberto,
  horarioValido,
  normalizarHorario,
  resumoHorario,
} from "@/lib/deliveryHorario";
import { carregarConfigDelivery, salvarConfigDelivery } from "@/lib/deliveryAdmin";
import { logAction } from "@/lib/logger";
import "./SecaoDelivery.css";

/**
 * SecaoDelivery — aba "Delivery" das Configurações, versão nativa do Palm.
 *
 * Porta o agendamento de abertura/fechamento automático que já existe no
 * desktop (DeliveryTab em ConfiguracoesView.jsx) para o celular. Nada de
 * regra nova aqui: toda a lógica de horário é pura e testada em
 * src/lib/deliveryHorario.js, e a persistência é a mesma de
 * src/lib/deliveryAdmin.js — esta tela só monta a apresentação mobile.
 *
 * Por que é intuitiva no celular:
 * - Um único liga/desliga no topo decide tudo: desligado = controle manual
 *   pelo botão do delivery, ligado = mostra só o que falta preencher.
 * - Dias da semana como botões grandes (--tap-min) em vez de checkboxes
 *   minúsculos — dá para tocar andando, sem mirar.
 * - A prévia ("Vai abrir Seg a Sex · 18:00 às 23:00") traduz a configuração
 *   técnica em uma frase que qualquer dono de restaurante entende, sem
 *   precisar interpretar dias+horas mentalmente.
 * - O botão Salvar mora na barra fixa do rodapé (.mod-rodape) — sempre ao
 *   alcance do polegar, nunca perdido no fim de um scroll longo.
 * - Erro de rede vira card de estado (não popup): sempre visível, sempre
 *   com uma próxima ação clara.
 */
export default function SecaoDelivery() {
  const { tenant, currentUser } = useApp();
  const [config, setConfig] = useState(null);
  const [horario, setHorario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
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
        setErroCarga("Não foi possível carregar a configuração do delivery.");
        setCarregando(false);
        return;
      }
      const base = data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] };
      setConfig(base);
      setHorario(normalizarHorario(base.horario));
      setErroCarga("");
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const setCampo = (patch) => {
    setHorario((h) => ({ ...h, ...patch }));
    setOkMsg("");
  };

  // Ligar o agendamento pela 1ª vez parte de um padrão amigável (todos os
  // dias, 18:00–23:00) para o dono ajustar — nunca liga vazio.
  const alternarAuto = () => {
    setOkMsg("");
    setHorario((h) => {
      if (h.auto) return { ...h, auto: false };
      const vazio = h.faixas.length === 0 && h.dias.length === 0;
      if (vazio) {
        return { auto: true, dias: [...HORARIO_PADRAO.dias], faixas: [{ ...FAIXA_PADRAO }] };
      }
      // Já tinha algo configurado: religa preservando, mas garante ao menos
      // uma faixa visível para o dono editar.
      return { ...h, auto: true, faixas: h.faixas.length ? h.faixas : [{ ...FAIXA_PADRAO }] };
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
  const addFaixa = () => setCampo({ faixas: [...horario.faixas, { ...FAIXA_PADRAO }] });
  const removeFaixa = (i) => setCampo({ faixas: horario.faixas.filter((_, idx) => idx !== i) });

  const valido = horario ? horarioValido(horario) : false;
  const alterado =
    config &&
    horario &&
    JSON.stringify(normalizarHorario(config.horario)) !== JSON.stringify(normalizarHorario(horario));
  const preview = horario ? resumoHorario(horario) : null;
  const podeSalvar = !salvando && valido && alterado;

  const salvar = async () => {
    if (!tenant?.id) {
      setErroSalvar("Estabelecimento não identificado.");
      return;
    }
    if (!podeSalvar) return;
    setSalvando(true);
    setErroSalvar("");
    // Ao salvar com o agendamento ligado, já casa o flag `aberto` com o
    // horário de agora (o operador vê o efeito na hora). Desligado/incompleto
    // (null) preserva o controle manual.
    const desejado = deliveryDeveEstarAberto(horario, new Date());
    const proximo = { ...config, horario, aberto: desejado === null ? !!config.aberto : desejado };
    const { data, error } = await salvarConfigDelivery(tenant.id, proximo);
    setSalvando(false);
    if (error) {
      setErroSalvar("Não foi possível salvar. Tente novamente.");
      return;
    }
    const salvo = data || proximo;
    setConfig(salvo);
    setHorario(normalizarHorario(salvo.horario));
    setOkMsg(horario.auto ? "Abertura automática salva." : "Abertura automática desligada.");
    logAction(currentUser?.username, "delivery:horario", {
      msg: horario.auto ? `Delivery automático: ${preview || "configurado"}` : "Delivery automático desligado",
      name: currentUser?.name,
      role: currentUser?.role,
    });
  };

  if (carregando || !horario) {
    return (
      <div className="mod-lista">
        <p className="mod-carregando">Carregando configuração do delivery…</p>
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="mod-lista">
        <p className="mod-erro" role="alert">
          {erroCarga}
        </p>
      </div>
    );
  }

  return (
    <div className="mod-lista">
      {/* Liga/desliga o agendamento */}
      <div className="cfg-card">
        <div className="cfg-delivery__linhaToggle">
          <div className="cfg-delivery__textoToggle">
            <div className="cfg-card__titulo">Abrir e fechar automaticamente</div>
            <p className="cfg-card__ajuda">
              O delivery abre e fecha sozinho nos dias e horários escolhidos. Deixe
              desligado para controlar na mão pelo botão do delivery.
            </p>
          </div>
          <button
            type="button"
            onClick={alternarAuto}
            className={`cfg-toggle${horario.auto ? " cfg-toggle--on" : ""}`}
            aria-pressed={horario.auto}
            aria-label="Abrir e fechar o delivery automaticamente"
          >
            <span className="cfg-toggle__bolinha" />
          </button>
        </div>
      </div>

      {horario.auto ? (
        <div className="cfg-card cfg-delivery__detalhes">
          {/* Dias de atendimento */}
          <div className="cfg-campo">
            <span className="cfg-delivery__rotulo">Dias de atendimento</span>
            <div className="cfg-delivery__dias">
              {DIAS_SEMANA.map((d) => {
                const on = horario.dias.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => alternarDia(d.id)}
                    className={`cfg-delivery__dia${on ? " cfg-delivery__dia--on" : ""}`}
                    aria-pressed={on}
                  >
                    {d.curto}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horários de abertura e fechamento (uma ou mais janelas por dia) */}
          <div className="cfg-campo">
            <span className="cfg-delivery__rotulo">Horários</span>
            <div className="cfg-delivery__faixas">
              {horario.faixas.map((f, i) => (
                <div className="cfg-delivery__faixa" key={i}>
                  <div className="cfg-delivery__horas">
                    <label className="cfg-delivery__hora">
                      <span>Abre</span>
                      <input
                        type="time"
                        value={f.abre || ""}
                        onChange={(e) => setFaixa(i, { abre: e.target.value })}
                        className="cfg-input cfg-delivery__time"
                      />
                    </label>
                    <span className="cfg-delivery__ate">às</span>
                    <label className="cfg-delivery__hora">
                      <span>Fecha</span>
                      <input
                        type="time"
                        value={f.fecha || ""}
                        onChange={(e) => setFaixa(i, { fecha: e.target.value })}
                        className="cfg-input cfg-delivery__time"
                      />
                    </label>
                  </div>
                  {horario.faixas.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeFaixa(i)}
                      className="cfg-delivery__faixaRemover"
                      aria-label={`Remover o horário ${i + 1}`}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" onClick={addFaixa} className="mod-botao mod-botao--fantasma cfg-delivery__addFaixa">
              + Adicionar horário
            </button>
            <p className="cfg-nota">
              Pode ter vários horários no mesmo dia (ex.: 08:00–10:00, 11:00–14:00 e
              18:00–00:00). Fecha depois da meia-noite? Basta pôr uma hora menor
              (ex.: abre 18:00, fecha 02:00).
            </p>
          </div>

          {/* Prévia amigável / o que falta preencher */}
          <p className={preview ? "cfg-ok" : "cfg-nota"}>
            {preview ? (
              <>
                Vai abrir <strong>{preview}</strong>.
              </>
            ) : (
              "Escolha pelo menos um dia e horários de abrir e fechar diferentes."
            )}
          </p>
        </div>
      ) : null}

      {erroSalvar ? (
        <p className="mod-erro" role="alert">
          {erroSalvar}
        </p>
      ) : null}
      {okMsg ? (
        <p className="cfg-ok" role="status">
          {okMsg}
        </p>
      ) : null}

      {/* Salvar fica ao alcance do polegar (rodapé fixo), não perdido no
          fim do scroll — princípio nº 1: a próxima ação sempre visível.
          O espaçador evita que a barra fixa cubra o último card. */}
      <div className="cfg-delivery__espacoRodape" aria-hidden="true" />
      <div className="mod-rodape">
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="mod-botao mod-botao--primario mod-botao--bloco"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
