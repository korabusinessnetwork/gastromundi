import { createContext, useContext, useMemo, useState } from "react";
import { ConfigContext } from "./ConfigContext";
import { gravarConfig } from "./gravarConfig";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { METODOS_TEF_PADRAO } from "@/lib/tef";
import { LIMITE_SANGRIA_PADRAO, limiteSangriaValido } from "@/lib/caixaMovimentos";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";

/**
 * Dono do estado da configuração do estabelecimento (tarefa 2.9 do plano de
 * refatoração): meios e métodos de pagamento, TEF, taxa de serviço, ponte
 * local, alerta de validade e limite de sangria.
 *
 * Quem lê ou ajusta usa `useConfig()`. Quem CARREGA (a abertura do app, que lê
 * tudo do banco numa leva só, ou da cópia offline quando não há rede) usa o
 * canal interno `useConfigCarga()`, que só o `AppProvider` deve chamar.
 */
const ConfigCargaContext = createContext(null);

export function useConfigCarga() {
  const ctx = useContext(ConfigCargaContext);
  if (!ctx) throw new Error("useConfigCarga deve ser usado dentro de <ConfigProvider>");
  return ctx;
}

export function ConfigProvider({ tenantIdRef, children }) {
  const [meiosPagamento,     setMeiosPagamentoLocal]     = useState(["dinheiro", "credito", "debito", "pix"]);
  const [metodosCustom,      setMetodosCustomLocal]      = useState([]);
  const [metodosTef,         setMetodosTefLocal]         = useState(METODOS_TEF_PADRAO); // quais métodos usam maquininha (TEF)
  const [taxaServico,        setTaxaServicoLocal]        = useState(false);
  const [diasAlertaValidade, setDiasAlertaValidadeLocal] = useState(7); // C1, janela de alerta de validade
  const [limiteSangria,      setLimiteSangriaLocal]      = useState(LIMITE_SANGRIA_PADRAO);
  // Leva 13: endereço da página do Palm servida pela Ponte KORA
  // (http://IP:porta/palm?t=token). Persistido em config para o Palm
  // saber para onde ir quando a internet cair.
  const [ponteEndereco,      setPonteEnderecoLocal]      = useState(null);
  // Liga/desliga a Ponte NESTE estabelecimento (config "ponte_local_ativa").
  // Nasce `null` de propósito: null é "ainda não sei", e não "desligado".
  // Enquanto a carga não responde, quem lê isto fica parado. Se o padrão
  // fosse `false`, a bridge ligaria meio segundo depois do login e o ciclo
  // piscaria; se fosse `true`, quem não tem a Ponte veria erro de conexão.
  const [ponteLocalAtiva,    setPonteLocalAtivaLocal]    = useState(null);

  // ── Ajustes (otimistas, desfeitos se o banco recusar) ──────────
  const setMeiosPagamento = async (val) => {
    const anterior = meiosPagamento;
    setMeiosPagamentoLocal(val);
    return gravarConfig("meios_pagamento", val, () => setMeiosPagamentoLocal(anterior));
  };

  const setMetodosCustom = async (val) => {
    const anterior = metodosCustom;
    setMetodosCustomLocal(val);
    return gravarConfig("metodos_custom", val, () => setMetodosCustomLocal(anterior));
  };

  const setMetodosTef = async (val) => {
    const anterior = metodosTef;
    setMetodosTefLocal(val);
    return gravarConfig("metodos_tef", val, () => setMetodosTefLocal(anterior));
  };

  const setTaxaServico = async (val) => {
    const anterior = taxaServico;
    setTaxaServicoLocal(!!val);
    return gravarConfig("taxa_servico", !!val, () => setTaxaServicoLocal(anterior));
  };

  // Leva 13: a bridge grava o endereço do Palm quando ele muda (IP novo
  // do roteador, token novo). Também vai para o snapshot no próximo boot.
  const setPonteEndereco = async (val) => {
    const anterior = ponteEndereco;
    setPonteEnderecoLocal(val);
    return gravarConfig("ponte_endereco", val, () => setPonteEnderecoLocal(anterior));
  };

  // Liga/desliga o recebimento dos pedidos do celular neste estabelecimento.
  // Ajuste do dono, gravado em `config` como qualquer outro, não é variável
  // de build: ligar para um cliente não pode obrigar a recompilar o site de
  // todos os outros (decisão 017).
  const setPonteLocalAtiva = async (val) => {
    const anterior = ponteLocalAtiva;
    setPonteLocalAtivaLocal(!!val);
    const resultado = await gravarConfig("ponte_local_ativa", !!val, () => setPonteLocalAtivaLocal(anterior));
    // O snapshot desta abertura já foi gravado com o valor ANTIGO, e ele é
    // quem manda quando o PC abre sem internet. Sem corrigi-lo aqui, o dono
    // ligava a chave hoje e amanhã, na queda de internet (exatamente para o
    // que a Ponte existe), ela voltava desligada e não dava nem para
    // religar (gravar config precisa de banco). Fire-and-forget: o snapshot é
    // conforto, e falhar aqui não pode desfazer um ajuste que o banco aceitou.
    if (!resultado?.error) {
      try {
        const snapshot = lerSnapshot(window.localStorage, tenantIdRef.current);
        if (snapshot) {
          salvarSnapshot(
            window.localStorage,
            { ...snapshot, config: { ...(snapshot.config ?? {}), ponteLocalAtiva: !!val } },
            tenantIdRef.current,
          );
        }
      } catch { /* storage cheio/bloqueado não pode derrubar o clique */ }
    }
    return resultado;
  };

  const setDiasAlertaValidade = async (val) => {
    const anterior = diasAlertaValidade;
    const n = Math.max(1, Math.min(365, Number(val) || 7));
    setDiasAlertaValidadeLocal(n);
    return gravarConfig("dias_alerta_validade", n, () => setDiasAlertaValidadeLocal(anterior));
  };

  // F005: teto da sangria sem autorização de gerente. Por estabelecimento
  // (decisão 017); a policy da 20260744 já impede o cargo `caixa` de gravar
  // esta chave, então quem opera não afrouxa o próprio limite.
  const setLimiteSangria = async (val) => {
    const anterior = limiteSangria;
    const n = limiteSangriaValido(val);
    setLimiteSangriaLocal(n);
    return gravarConfig("limite_sangria", n, () => setLimiteSangriaLocal(anterior));
  };

  // ── Carga (só o AppProvider chama) ──────────────────────────────
  /** Linhas `{ key, value }` de `config`, como vêm da abertura. */
  const hidratarDaCarga = (configData) => {
    const meios = configData.find(c => c.key === "meios_pagamento");
    if (meios?.value && Array.isArray(meios.value) && meios.value.length > 0) setMeiosPagamentoLocal(meios.value);
    const taxa = configData.find(c => c.key === "taxa_servico");
    if (taxa?.value !== undefined) setTaxaServicoLocal(!!taxa.value);
    const custom = configData.find(c => c.key === "metodos_custom");
    if (custom?.value && Array.isArray(custom.value)) setMetodosCustomLocal(custom.value);
    // Array (mesmo vazio) = escolha explícita do estabelecimento;
    // sem config vale METODOS_TEF_PADRAO (crédito/débito).
    const tef = configData.find(c => c.key === "metodos_tef");
    if (Array.isArray(tef?.value)) setMetodosTefLocal(tef.value);
    const diasValidade = configData.find(c => c.key === "dias_alerta_validade");
    if (diasValidade?.value != null && !isNaN(Number(diasValidade.value))) setDiasAlertaValidadeLocal(Number(diasValidade.value));
    // F005: teto da sangria sem autorização, por estabelecimento
    // (decisão 017). Valor torto cai no padrão dentro de limiteSangriaValido.
    const limite = configData.find(c => c.key === "limite_sangria");
    if (limite?.value != null) setLimiteSangriaLocal(limiteSangriaValido(limite.value));
    // Leva 13: endereço do Palm na ponte local (salvo pela bridge)
    const ponte = configData.find(c => c.key === "ponte_endereco");
    if (typeof ponte?.value === "string" && ponte.value) setPonteEnderecoLocal(ponte.value);
    // Chave por estabelecimento (decisão 017): é ela que liga o recebimento
    // dos pedidos do celular neste computador. Chave ausente É resposta:
    // quem nunca ligou está desligado, e a partir daqui já sabemos disso
    // (sai do "ainda não sei" para um `false` explícito).
    const ponteAtiva = configData.find(c => c.key === "ponte_local_ativa");
    setPonteLocalAtivaLocal(ponteAtiva?.value === true || ponteAtiva?.value === "true");
  };

  /** O bloco `config` da cópia offline (snapshot). */
  const hidratarDoSnapshot = (config) => {
    if (Array.isArray(config.meiosPagamento) && config.meiosPagamento.length) setMeiosPagamentoLocal(config.meiosPagamento);
    if (Array.isArray(config.metodosCustom)) setMetodosCustomLocal(config.metodosCustom);
    if (Array.isArray(config.metodosTef))    setMetodosTefLocal(config.metodosTef);
    if (config.taxaServico !== undefined) setTaxaServicoLocal(!!config.taxaServico);
    if (typeof config.ponteEndereco === "string" && config.ponteEndereco) setPonteEnderecoLocal(config.ponteEndereco);
    // Sem internet a Ponte é justamente o que segura o serviço, então a
    // chave de liga/desliga vem do snapshot como qualquer outro ajuste.
    // Só que snapshot SEM a chave não é "desligado": é snapshot que não
    // sabe. Forçar `false` aqui desligava a Ponte na primeira abertura
    // sem internet depois de o dono ligar a chave, e sem internet não
    // dá para religar. Continua "ainda não sei" até alguém dizer.
    if (config.ponteLocalAtiva !== undefined) setPonteLocalAtivaLocal(!!config.ponteLocalAtiva);
  };

  // ── Valores memorizados (ver a tarefa 2.2) ──────────────────────
  const setMeiosPagamentoEstavel     = useFuncaoEstavel(setMeiosPagamento);
  const setMetodosCustomEstavel      = useFuncaoEstavel(setMetodosCustom);
  const setMetodosTefEstavel         = useFuncaoEstavel(setMetodosTef);
  const setTaxaServicoEstavel        = useFuncaoEstavel(setTaxaServico);
  const setPonteEnderecoEstavel      = useFuncaoEstavel(setPonteEndereco);
  const setPonteLocalAtivaEstavel    = useFuncaoEstavel(setPonteLocalAtiva);
  const setDiasAlertaValidadeEstavel = useFuncaoEstavel(setDiasAlertaValidade);
  const setLimiteSangriaEstavel      = useFuncaoEstavel(setLimiteSangria);
  const hidratarDaCargaEstavel       = useFuncaoEstavel(hidratarDaCarga);
  const hidratarDoSnapshotEstavel    = useFuncaoEstavel(hidratarDoSnapshot);

  const valorConfig = useMemo(() => ({
    meiosPagamento, metodosCustom, metodosTef, taxaServico,
    ponteEndereco, ponteLocalAtiva, diasAlertaValidade, limiteSangria,
    setMeiosPagamento: setMeiosPagamentoEstavel,
    setMetodosCustom: setMetodosCustomEstavel,
    setMetodosTef: setMetodosTefEstavel,
    setTaxaServico: setTaxaServicoEstavel,
    setPonteEndereco: setPonteEnderecoEstavel,
    setPonteLocalAtiva: setPonteLocalAtivaEstavel,
    setDiasAlertaValidade: setDiasAlertaValidadeEstavel,
    setLimiteSangria: setLimiteSangriaEstavel,
  }), [meiosPagamento, metodosCustom, metodosTef, taxaServico, ponteEndereco, ponteLocalAtiva,
    diasAlertaValidade, limiteSangria, setMeiosPagamentoEstavel, setMetodosCustomEstavel,
    setMetodosTefEstavel, setTaxaServicoEstavel, setPonteEnderecoEstavel, setPonteLocalAtivaEstavel,
    setDiasAlertaValidadeEstavel, setLimiteSangriaEstavel]);

  const valorCarga = useMemo(() => ({
    hidratarDaCarga: hidratarDaCargaEstavel,
    hidratarDoSnapshot: hidratarDoSnapshotEstavel,
  }), [hidratarDaCargaEstavel, hidratarDoSnapshotEstavel]);

  return (
    <ConfigCargaContext.Provider value={valorCarga}>
      <ConfigContext.Provider value={valorConfig}>
        {children}
      </ConfigContext.Provider>
    </ConfigCargaContext.Provider>
  );
}
