import { useState } from "react";
import { hojeLocalISO } from "@/utils/datas";
import {
  LuPlus, LuPencil, LuTrash2, LuX, LuShoppingCart, LuCalendar
} from "react-icons/lu";
import { novoUid, comUid, listaSemUid } from "@/lib/uidLista";
import Field from "./Field";
import Inp from "./Inp";
import Txta from "./Txta";
import ModalBase from "./ModalBase";
import DeleteConfirm from "./DeleteConfirm";
import CardBtn from "./CardBtn";
import EmptyMsg from "./EmptyMsg";
import AddBtn from "./AddBtn";
import { uid, fmtR, fmtDt, STATUS_COMPRA, COMPRA_VAZIA, ITEM_VAZIO } from "./apoio";

export default function ComprasTab({ compras, fornecedores, onSave, onDelete }) {
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const abrirNova   = () => setForm({ ...COMPRA_VAZIA, id: uid(), data: hojeLocalISO() });
  const abrirEditar = (c) => setForm({ ...c, itens: comUid(c.itens ?? []) });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addItem    = () => setForm(f => ({ ...f, itens: [...f.itens, { ...ITEM_VAZIO, uid: novoUid() }] }));
  const setItem    = (i, k, v) => setForm(f => ({ ...f, itens: f.itens.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const removeItem = (i) => setForm(f => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }));

  const totalForm = form ? form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0) : 0;

  const salvar = async () => {
    if (!form?.fornecedor?.trim()) return;
    setSaving(true);
    const forn = form.fornecedor === "__outro" ? (form._fornecedorCustom?.trim() || "") : form.fornecedor;
    const total = form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0);
    const { _fornecedorCustom, ...rest } = form;
    // Mesmo motivo da ficha: `config` é jsonb livre e guardaria o `uid` sem reclamar.
    const atualizada = [...compras.filter(c => c.id !== form.id), { ...rest, fornecedor: forn, total, itens: listaSemUid(rest.itens ?? []) }]
      .sort((a, b) => new Date(b.data) - new Date(a.data));
    const { error } = await onSave("compras", atualizada);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("compras", compras.filter(c => c.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  const fns = fornecedores.map(f => f.nome);

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">{compras.length} compra{compras.length !== 1 ? "s" : ""} registrada{compras.length !== 1 ? "s" : ""}</div>
        <AddBtn onClick={abrirNova} label="Registrar Compra" />
      </div>

      {compras.length === 0 ? (
        <EmptyMsg icon={LuShoppingCart} msg="Nenhuma compra registrada" />
      ) : (
        <div className="admin__tabela-moldura">
          <table className="admin__tabela">
            <thead>
              <tr className="admin__thead-tr">
                {["Data", "Fornecedor", "Itens", "Total", "Status", ""].map((h, i) => (
                  // TD015: cabeçalho literal da tabela de compras, não vem de dado.
                  <th key={i} className={`admin__th${i >= 2 ? " admin__th--direita" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map(c => {
                const status = STATUS_COMPRA[c.status] ? c.status : "pendente";
                const st = STATUS_COMPRA[status];
                return (
                  <tr key={c.id} className="admin__tr">
                    <td className="admin__td admin__td--simples admin__td--apagado compras-tab__td-data">
                      <div className="compras-tab__data"><LuCalendar size={13} /> {fmtDt(c.data)}</div>
                    </td>
                    <td className="admin__td admin__td--forte">{c.fornecedor}</td>
                    <td className="admin__td admin__td--simples admin__td--apagado admin__td--direita">{c.itens?.length ?? 0} {(c.itens?.length ?? 0) === 1 ? "item" : "itens"}</td>
                    <td className="admin__td admin__td--dinheiro admin__td--direita">{fmtR(c.total)}</td>
                    <td className="admin__td admin__td--direita">
                      <span className={`admin__tag compras-tab__status compras-tab__status--${status}`}>{st.label}</span>
                    </td>
                    <td className="admin__td admin__td--direita">
                      <div className="admin__acoes-linha">
                        <CardBtn onClick={() => abrirEditar(c)}><LuPencil size={12} /> Editar</CardBtn>
                        <CardBtn onClick={() => setDeleteId(c.id)}><LuTrash2 size={12} /></CardBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ModalBase title={compras.find(c => c.id === form.id) ? "Editar Compra" : "Registrar Compra"} onClose={fechar} onSave={salvar} saving={saving} width={620}>
          <div className="admin__form-duas-colunas">
            <Field label="Fornecedor *">
              {fns.length > 0 ? (
                <select value={form.fornecedor} onChange={e => setF("fornecedor", e.target.value)} className={`compras-tab__select-fornecedor${form.fornecedor ? "" : " compras-tab__select-fornecedor--vazio"}`}>
                  <option value="">Selecionar...</option>
                  {fns.map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="__outro">Outro (digitar)</option>
                </select>
              ) : (
                <Inp value={form.fornecedor} onChange={v => setF("fornecedor", v)} placeholder="Nome do fornecedor" />
              )}
            </Field>
            {fns.length > 0 && form.fornecedor === "__outro" && (
              <Field label="Nome do fornecedor">
                <Inp value={form._fornecedorCustom ?? ""} onChange={v => setF("_fornecedorCustom", v)} placeholder="Digite o nome" />
              </Field>
            )}
            <Field label="Data"><Inp type="date" value={form.data} onChange={v => setF("data", v)} /></Field>
          </div>

          <div>
            <div className="compras-tab__itens-topo">
              <div className="admin__secao-label">Itens</div>
              <button onClick={addItem} className="compras-tab__btn-add-item">
                <LuPlus size={12} /> Adicionar item
              </button>
            </div>
            <div className="compras-tab__itens">
              {form.itens.map((it, i) => (
                <div key={it.uid} className="compras-tab__item-linha">
                  <Inp value={it.nome} onChange={v => setItem(i, "nome", v)} placeholder="Produto / insumo" />
                  <Inp type="number" value={it.qtd} onChange={v => setItem(i, "qtd", v)} placeholder="Qtd" />
                  <Inp value={it.unidade} onChange={v => setItem(i, "unidade", v)} placeholder="Un" />
                  <Inp type="number" value={it.valorUnit} onChange={v => setItem(i, "valorUnit", v)} placeholder="R$/un" />
                  <button onClick={() => removeItem(i)} className="compras-tab__btn-remover-item" aria-label="Remover item">
                    <LuX size={13} />
                  </button>
                </div>
              ))}
              {form.itens.length === 0 && <div className="compras-tab__itens-vazio">Nenhum item adicionado</div>}
            </div>
            {form.itens.length > 0 && (
              <div className="compras-tab__total-label">
                Total: <strong className="compras-tab__total-valor">{fmtR(totalForm)}</strong>
              </div>
            )}
          </div>

          <Field label="Status">
            <div className="compras-tab__status-chips">
              {Object.entries(STATUS_COMPRA).map(([id, s]) => (
                <button key={id} onClick={() => setF("status", id)} className={`compras-tab__status-chip compras-tab__status--${id}${form.status === id ? " compras-tab__status-chip--ativo" : ""}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Observações">
            <Txta value={form.observacoes} onChange={v => setF("observacoes", v)} placeholder="Condições, prazos, notas..." rows={2} />
          </Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm msg="Esta compra será removida permanentemente." onCancel={() => setDeleteId(null)} onConfirm={excluir} />
      )}
    </div>
  );
}

// ── Grade inicial ─────────────────────────────────────────────────
