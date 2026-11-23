import { useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuPencil, LuTrash2, LuTruck
} from "react-icons/lu";
import Field from "./Field";
import Inp from "./Inp";
import Txta from "./Txta";
import ModalBase from "./ModalBase";
import DeleteConfirm from "./DeleteConfirm";
import CardBtn from "./CardBtn";
import EmptyMsg from "./EmptyMsg";
import AddBtn from "./AddBtn";
import { uid, FORN_VAZIO } from "./apoio";

export default function FornecedoresTab({ fornecedores, onSave, onDelete }) {
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const abrirNovo   = () => setForm({ ...FORN_VAZIO, id: uid() });
  const abrirEditar = (f) => setForm({ ...f });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form?.nome?.trim()) return;
    setSaving(true);
    const nova = [...fornecedores.filter(f => f.id !== form.id), { ...form, nome: form.nome.trim() }];
    const { error } = await onSave("fornecedores", nova);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("fornecedores", fornecedores.filter(f => f.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">{fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""}</div>
        <AddBtn onClick={abrirNovo} label="Novo Fornecedor" />
      </div>

      {fornecedores.length === 0 ? (
        <EmptyMsg icon={LuTruck} msg="Nenhum fornecedor cadastrado" />
      ) : (
        <div className="admin__tabela-moldura">
          <table className="admin__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                {["Nome", "Categoria", "Contato", "Telefone", ""].map((h, i) => (
                  // TD015: cabeçalho literal da tabela de fichas, não vem de dado.
                  <th key={i} className="admin__th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} className="admin__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td className="admin__td admin__td--forte" style={{ fontWeight: 700 }}>{f.nome}</td>
                  <td className="admin__td">
                    {f.categoria
                      ? <span className="admin__tag">{f.categoria}</span>
                      : <span style={{ color: varColor(C.muted) }}>—</span>}
                  </td>
                  <td className="admin__td admin__td--simples" style={{ color: varColor(C.muted) }}>{f.contato || "—"}</td>
                  <td className="admin__td admin__td--simples" style={{ color: varColor(C.muted) }}>{f.telefone || "—"}</td>
                  <td className="admin__td" style={{ textAlign: "right" }}>
                    <div className="admin__acoes-linha">
                      <CardBtn onClick={() => abrirEditar(f)}><LuPencil size={12} /> Editar</CardBtn>
                      <CardBtn onClick={() => setDeleteId(f.id)}><LuTrash2 size={12} /></CardBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ModalBase title={fornecedores.find(f => f.id === form.id) ? "Editar Fornecedor" : "Novo Fornecedor"} onClose={fechar} onSave={salvar} saving={saving}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nome *"><Inp value={form.nome} onChange={v => setF("nome", v)} placeholder="Nome do fornecedor" /></Field>
            <Field label="Categoria"><Inp value={form.categoria} onChange={v => setF("categoria", v)} placeholder="Ex: Bebidas, Carnes..." /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="CNPJ"><Inp value={form.cnpj ?? ""} onChange={v => setF("cnpj", v)} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Contato"><Inp value={form.contato} onChange={v => setF("contato", v)} placeholder="Nome do responsável" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Telefone"><Inp value={form.telefone} onChange={v => setF("telefone", v)} placeholder="(00) 00000-0000" /></Field>
            <Field label="E-mail"><Inp type="email" value={form.email} onChange={v => setF("email", v)} placeholder="email@fornecedor.com" /></Field>
          </div>
          <Field label="Observações"><Txta value={form.observacoes} onChange={v => setF("observacoes", v)} placeholder="Prazo de entrega, condições de pagamento..." rows={3} /></Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm msg={<><strong>{fornecedores.find(f => f.id === deleteId)?.nome}</strong> será removido permanentemente.</>} onCancel={() => setDeleteId(null)} onConfirm={excluir} />
      )}
    </div>
  );
}

// ── Aba: Compras ──────────────────────────────────────────────────
