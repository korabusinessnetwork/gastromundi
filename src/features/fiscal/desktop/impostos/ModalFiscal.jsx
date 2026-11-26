import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState } from "react";
import { createPortal } from "react-dom";
import { salvarConfigFiscalDoItem } from "@/features/fiscal/dados/itensFiscal";
import { LuX, LuCheck, LuTriangleAlert, LuReceiptText } from "react-icons/lu";
import FLabel from "./FLabel";
import FInp from "./FInp";
import FSel from "./FSel";
import FPct from "./FPct";
import Grid2 from "./Grid2";
import Divider from "./Divider";
import { EMPTY_FISCAL, ORIGENS, REGIMES, CSOSN_OPTS, CST_ICMS_OPTS, CST_PIS_COFINS, ABAS_MODAL } from "./apoio";

export default function ModalFiscal({ item, dadosSalvos, onClose, onSaved }) {
  const [aba,      setAba]      = useState("identificacao");
  const [form,     setForm]     = useState({ ...EMPTY_FISCAL, ...dadosSalvos });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Alíquota em % — aceita vírgula; "" vira 0.
  const pct = (v) => (v === "" || v == null) ? 0 : parseFloat(String(v).replace(",", "."));

  const ALIQUOTAS = [
    ["aliquota_icms",     "ICMS",                     "icms"],
    ["reducao_base_icms", "redução de base do ICMS",  "icms"],
    ["aliquota_ipi",      "IPI",                      "pis_cofins"],
    ["aliquota_pis",      "PIS",                      "pis_cofins"],
    ["aliquota_cofins",   "COFINS",                   "pis_cofins"],
    ["aliquota_ibs",      "IBS",                      "reforma"],
    ["aliquota_cbs",      "CBS",                      "reforma"],
    ["aliquota_is",       "IS",                       "reforma"],
  ];

  const salvar = async () => {
    if (!form.ncm.trim()) { setErro("NCM é obrigatório."); setAba("identificacao"); return; }
    for (const [campo, nome, abaCampo] of ALIQUOTAS) {
      const v = pct(form[campo]);
      if (isNaN(v) || v < 0 || v > 100) {
        setErro(`Alíquota de ${nome} deve ser um número entre 0% e 100%.`);
        setAba(abaCampo);
        return;
      }
    }
    setSalvando(true);
    setErro("");
    try {
      const payload = {
        item_id:               Number(item.id),
        ncm:                   form.ncm.trim() || null,
        cest:                  form.cest.trim() || null,
        cfop:                  form.cfop.trim() || null,
        origem_mercadoria:     form.origem_mercadoria || null,
        csosn:                 form.csosn || null,
        cst_icms:              form.cst_icms || null,
        aliquota_icms:         pct(form.aliquota_icms),
        reducao_base_icms:     pct(form.reducao_base_icms),
        cst_ipi:               form.cst_ipi || null,
        aliquota_ipi:          pct(form.aliquota_ipi),
        cst_pis:               form.cst_pis || null,
        aliquota_pis:          pct(form.aliquota_pis),
        cst_cofins:            form.cst_cofins || null,
        aliquota_cofins:       pct(form.aliquota_cofins),
        aliquota_ibs:          pct(form.aliquota_ibs),
        aliquota_cbs:          pct(form.aliquota_cbs),
        aliquota_is:           pct(form.aliquota_is),
        regime_tributario:     form.regime_tributario || "simples",
        observacao_fiscal:     form.observacao_fiscal.trim() || null,
        updated_at:            new Date().toISOString(),
      };
      const { error } = await salvarConfigFiscalDoItem(payload);
      if (error) throw error;
      onSaved(item.id, payload);
      onClose();
    } catch (e) {
      setErro("Erro ao salvar configuração fiscal.");
    } finally {
      setSalvando(false);
    }
  };

  const isSimples = form.regime_tributario === "simples";

  return createPortal(
    <div
      {...fecharAoClicarFora(onClose, !salvando)}
      className="impostos-admin__modal-overlay"
    >
      <div className="impostos-admin__modal">
        {/* Header */}
        <div className="impostos-admin__modal-header">
          <div className="impostos-admin__modal-topo">
            <div>
              <div className="impostos-admin__modal-titulo">{item.name}</div>
              <div className="impostos-admin__modal-sub">
                {item.category} · Configuração Fiscal
              </div>
            </div>
            <button onClick={onClose} disabled={salvando} className="impostos-admin__modal-fechar">
              <LuX size={20} />
            </button>
          </div>
          {/* Sub-tabs */}
          <div className="impostos-admin__abas">
            {ABAS_MODAL.map(a => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`impostos-admin__aba${aba === a.id ? " impostos-admin__aba--ativa" : ""}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo da aba */}
        <div className="impostos-admin__modal-corpo">

          {/* ── Aba 1: Identificação ── */}
          {aba === "identificacao" && (
            <>
              <Grid2>
                <div>
                  <FLabel>Nome do item</FLabel>
                  <FInp value={item.name} onChange={() => {}} disabled />
                </div>
                <div>
                  <FLabel>Categoria</FLabel>
                  <FInp value={item.category} onChange={() => {}} disabled />
                </div>
              </Grid2>

              <Grid2>
                <div>
                  <FLabel>NCM *</FLabel>
                  <FInp value={form.ncm} onChange={v => set("ncm", v)} placeholder="0000.00.00" maxLength={10} />
                </div>
                <div>
                  <FLabel>CEST</FLabel>
                  <FInp value={form.cest} onChange={v => set("cest", v)} placeholder="00.000.00" maxLength={9} />
                </div>
              </Grid2>

              <Grid2>
                <div>
                  <FLabel>CFOP</FLabel>
                  <FInp value={form.cfop} onChange={v => set("cfop", v)} placeholder="Ex: 5.102" maxLength={6} />
                </div>
                <div>
                  <FLabel>Origem da mercadoria</FLabel>
                  <FSel value={form.origem_mercadoria} onChange={v => set("origem_mercadoria", v)} opts={ORIGENS} />
                </div>
              </Grid2>

              <div>
                <FLabel>Regime tributário</FLabel>
                <FSel value={form.regime_tributario} onChange={v => set("regime_tributario", v)} opts={REGIMES} />
              </div>

              <div>
                <FLabel>Observação fiscal</FLabel>
                <textarea
                  value={form.observacao_fiscal}
                  onChange={e => set("observacao_fiscal", e.target.value)}
                  placeholder="Observações adicionais para NF-e..."
                  rows={3}
                  className="impostos-admin__textarea"
                />
              </div>
            </>
          )}

          {/* ── Aba 2: ICMS ── */}
          {aba === "icms" && (
            <>
              {isSimples ? (
                <div>
                  <FLabel>CSOSN, Simples Nacional</FLabel>
                  <FSel value={form.csosn} onChange={v => set("csosn", v)} opts={CSOSN_OPTS} placeholder="Selecione o CSOSN..." />
                </div>
              ) : (
                <div>
                  <FLabel>CST ICMS, Regime Normal</FLabel>
                  <FSel value={form.cst_icms} onChange={v => set("cst_icms", v)} opts={CST_ICMS_OPTS} placeholder="Selecione o CST..." />
                </div>
              )}

              <Grid2>
                <div>
                  <FLabel>Alíquota ICMS</FLabel>
                  <FPct value={form.aliquota_icms} onChange={v => set("aliquota_icms", v)} />
                </div>
                <div>
                  <FLabel>Redução base de cálculo</FLabel>
                  <FPct value={form.reducao_base_icms} onChange={v => set("reducao_base_icms", v)} placeholder="0,00" />
                </div>
              </Grid2>

              <div className="impostos-admin__aviso impostos-admin__aviso--destaque">
                {isSimples
                  ? "Empresas do Simples Nacional utilizam CSOSN. ICMS é recolhido pelo DAS, preencha a alíquota se houver ST."
                  : "Empresas de Lucro Presumido/Real utilizam CST. Preencha alíquota conforme tabela do estado."}
              </div>
            </>
          )}

          {/* ── Aba 3: PIS / COFINS / IPI ── */}
          {aba === "pis_cofins" && (
            <>
              <Divider label="PIS" />
              <Grid2>
                <div>
                  <FLabel>CST PIS</FLabel>
                  <FSel value={form.cst_pis} onChange={v => set("cst_pis", v)} opts={CST_PIS_COFINS} placeholder="Selecione..." />
                </div>
                <div>
                  <FLabel>Alíquota PIS</FLabel>
                  <FPct value={form.aliquota_pis} onChange={v => set("aliquota_pis", v)} />
                </div>
              </Grid2>

              <Divider label="COFINS" />
              <Grid2>
                <div>
                  <FLabel>CST COFINS</FLabel>
                  <FSel value={form.cst_cofins} onChange={v => set("cst_cofins", v)} opts={CST_PIS_COFINS} placeholder="Selecione..." />
                </div>
                <div>
                  <FLabel>Alíquota COFINS</FLabel>
                  <FPct value={form.aliquota_cofins} onChange={v => set("aliquota_cofins", v)} />
                </div>
              </Grid2>

              <Divider label="IPI, obrigatório para bebidas e produtos industrializados" />
              <Grid2>
                <div>
                  <FLabel>CST IPI</FLabel>
                  <FInp value={form.cst_ipi} onChange={v => set("cst_ipi", v)} placeholder="Ex: 50" maxLength={4} />
                </div>
                <div>
                  <FLabel>Alíquota IPI</FLabel>
                  <FPct value={form.aliquota_ipi} onChange={v => set("aliquota_ipi", v)} />
                </div>
              </Grid2>
            </>
          )}

          {/* ── Aba 4: Reforma 2026 ── */}
          {aba === "reforma" && (
            <>
              <div className="impostos-admin__aviso impostos-admin__aviso--com-icone impostos-admin__aviso--info">
                <LuReceiptText size={15} className="impostos-admin__aviso-icone" />
                Campos obrigatórios desde jan/2026 no layout NFC-e conforme Reforma Tributária. IBS substitui ICMS, CBS substitui PIS/COFINS.
              </div>

              <div>
                <FLabel>Alíquota IBS, substitui ICMS</FLabel>
                <FPct value={form.aliquota_ibs} onChange={v => set("aliquota_ibs", v)} />
              </div>
              <div>
                <FLabel>Alíquota CBS, substitui PIS/COFINS</FLabel>
                <FPct value={form.aliquota_cbs} onChange={v => set("aliquota_cbs", v)} />
              </div>
              <div>
                <FLabel>Alíquota IS, Imposto Seletivo</FLabel>
                <FPct value={form.aliquota_is} onChange={v => set("aliquota_is", v)} />
                <div className="impostos-admin__aviso-ajuda">Aplicável a bebidas alcoólicas, cigarros e similares.</div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="impostos-admin__modal-footer">
          {erro && (
            <div className="impostos-admin__erro" role="alert">
              <LuTriangleAlert size={14} className="impostos-admin__erro-icone" /> {erro}
            </div>
          )}
          <div className="impostos-admin__modal-botoes">
            <button onClick={onClose} disabled={salvando} className="impostos-admin__btn-cancelar">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando} className="impostos-admin__btn-salvar">
              {salvando ? "Salvando..." : <><LuCheck size={15} /> Salvar configuração</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Componente principal ─────────────────────────────────────────────
