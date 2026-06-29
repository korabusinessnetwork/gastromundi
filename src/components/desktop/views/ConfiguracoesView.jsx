import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { hashPassword, passwordStrength, sanitizeInput } from "@/utils";
import { getPermissions } from "@/constants/roles";
import C from "@/constants/colors";
import { LuEye, LuEyeOff, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPlus, LuTrash2, LuWallet, LuX } from "react-icons/lu";

const ROLES = [
  { id: "admin",   label: "Administrador", color: C.accent },
  { id: "gerente", label: "Gerente",       color: C.blue   },
  { id: "caixa",   label: "Caixa",         color: C.green  },
  { id: "garcom",  label: "Garçom",        color: "#f59e0b"},
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));


const EMPTY_USER_FORM = { name: "", username: "", role: "caixa", password: "", confirmPassword: "" };

// ── Helpers ───────────────────────────────────────────────────────

function RoleBadge({ role, sz }) {
  const r = ROLE_MAP[role] ?? { label: role, color: C.muted };
  return (
    <span style={{
      fontSize: (sz?.fontSm ?? 12), fontWeight: 700,
      background: `${r.color}18`, border: `1px solid ${r.color}44`,
      color: r.color, padding: "3px 10px", borderRadius: 20,
    }}>
      {r.label}
    </span>
  );
}

function Avatar({ name, size = 40 }) {
  const initials = (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: C.accent, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 14, fontWeight: 700, color: C.muted,
      textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", maxLength, disabled, sz, autoFocus }) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      style={{
        width: "100%", padding: "11px 14px", borderRadius: 10,
        border: `1px solid ${C.border}`, background: disabled ? C.bg : C.surface,
        color: disabled ? C.muted : C.text, fontSize: sz?.fontBase ?? 14,
        boxSizing: "border-box", fontFamily: "inherit", outline: "none",
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

function StrengthBar({ pwd }) {
  if (!pwd) return null;
  const s = passwordStrength(pwd);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= s.level ? s.color : C.border,
            transition: "background 0.2s",
          }} />
        ))}
      </div>
      <div style={{ fontSize: 14, color: s.color, fontWeight: 600 }}>{s.label}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      background: `${C.red}15`, border: `1px solid ${C.red}44`,
      color: C.red, fontSize: 16, fontWeight: 600,
    }}>
      ⚠️ {msg}
    </div>
  );
}

function OkBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      background: `${C.green}15`, border: `1px solid ${C.green}44`,
      color: C.green, fontSize: 16, fontWeight: 600,
    }}>
      ✓ {msg}
    </div>
  );
}

function traduzirErro(error) {
  const msg = error?.message ?? "";
  if (msg.includes("users_username_key") || msg.includes("duplicate key"))
    return "Esse nome de usuário já está em uso (pode ser um usuário desativado).";
  if (msg.includes("not-null") || msg.includes("null value"))
    return "Campo obrigatório não preenchido.";
  if (msg.includes("permission denied") || msg.includes("policy"))
    return "Sem permissão para realizar esta ação.";
  return "Erro ao salvar: " + msg;
}

// ── Aba Usuários ──────────────────────────────────────────────────

function UsuariosTab({ sz }) {
  const { users, currentUser, addUser, updateUser, removeUser, saveCredential } = useApp();

  const [modal,    setModal]    = useState(null); // null | "novo" | "editar" | "resetpw"
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(EMPTY_USER_FORM);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deletando,setDeletando]= useState(false);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const abrirNovo = () => {
    setForm(EMPTY_USER_FORM);
    setErro("");
    setVerSenha(false);
    setEditId(null);
    setModal("novo");
  };

  const abrirEditar = (u) => {
    setForm({
      name: u.name, username: u.username, role: u.role,
      password: "", confirmPassword: "",
    });
    setErro("");
    setVerSenha(false);
    setEditId(u.id);
    setModal("editar");
  };

  const fechar = () => { setModal(null); setErro(""); };

  const salvar = async () => {
    setErro("");
    const name     = sanitizeInput(form.name, 40);
    const username = sanitizeInput(form.username, 30).toLowerCase();

    if (!name)     { setErro("Informe o nome.");     return; }
    if (!username) { setErro("Informe o usuário.");   return; }
    if (!/^[a-z0-9_]+$/.test(username)) { setErro("Usuário: apenas letras, números e _"); return; }

    const jaExiste = users.find(u => u.username === username && u.id !== editId);
    if (jaExiste) { setErro("Esse nome de usuário já está em uso."); return; }

    // permissões derivam automaticamente do cargo
    const permissions = getPermissions(form.role);

    setSalvando(true);
    try {
      if (modal === "novo") {
        if (!form.password) { setErro("Informe uma senha inicial."); setSalvando(false); return; }
        if (form.password !== form.confirmPassword) { setErro("As senhas não coincidem."); setSalvando(false); return; }
        if (passwordStrength(form.password).level < 2) { setErro("Senha muito fraca."); setSalvando(false); return; }

        const plainPwd = sanitizeInput(form.password, 100);
        const hashed   = await hashPassword(plainPwd);
        const { error } = await addUser({
          name, username, role: form.role,
          password: hashed, permissions, active: true,
        });
        if (error) { setErro(traduzirErro(error)); setSalvando(false); return; }
        await saveCredential(username, plainPwd);
      } else {
        const changes = { name, username, role: form.role, permissions };
        if (form.password) {
          if (form.password !== form.confirmPassword) { setErro("As senhas não coincidem."); setSalvando(false); return; }
          if (passwordStrength(form.password).level < 2) { setErro("Senha muito fraca."); setSalvando(false); return; }
          const plainPwd = sanitizeInput(form.password, 100);
          changes.password = await hashPassword(plainPwd);
          await saveCredential(username, plainPwd);
        }
        const { error } = await updateUser(editId, changes);
        if (error) { setErro(traduzirErro(error)); setSalvando(false); return; }
      }
    } catch (e) {
      setErro("Erro inesperado: " + (e?.message ?? "tente novamente."));
      setSalvando(false);
      return;
    }
    setSalvando(false);
    fechar();
  };

  const confirmarDelete = async () => {
    if (!deleteId || deletando) return;
    setDeletando(true);
    await removeUser(deleteId);
    setDeletando(false);
    setDeleteId(null);
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm }}>

      {/* Card de explicação de cargos e permissões */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: sz.pad,
        display: "flex", flexDirection: "column", gap: sz.pad - 4,
      }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>
          Guia de Cargos e Permissões
        </div>

        {/* Cargos */}
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: sz.padSm,
          }}>
            Cargos
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sz.gap }}>
            {[
              { role: "admin",   icon: "👑",    desc: "Acesso total ao sistema: vendas, relatórios, usuários, produtos, abertura e fechamento de caixa." },
              { role: "gerente", icon: "🧑‍💼", desc: "Gerencia usuários e produtos, visualiza relatórios completos e opera o caixa." },
              { role: "caixa",   icon: "🖥️",   desc: "Opera a Frente de Caixa: abre comandas, lança pedidos e processa pagamentos." },
              { role: "garcom",  icon: "🍽️",   desc: "Acessa o Palm pelo celular para abrir mesas e lançar pedidos diretamente da mesa." },
            ].map(item => {
              const r = ROLE_MAP[item.role];
              return (
                <div key={item.role} style={{
                  background: C.surface, borderRadius: 12,
                  border: `1px solid ${r.color}33`,
                  padding: `${sz.padSm}px ${sz.padSm + 4}px`,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: sz.fontLg }}>{item.icon}</span>
                    <RoleBadge role={item.role} sz={sz} />
                  </div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted, lineHeight: 1.5 }}>
                    {item.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>
          {users.length} usuário{users.length !== 1 ? "s" : ""} ativo{users.length !== 1 ? "s" : ""}
        </div>
        {isAdmin && (
          <button
            onClick={abrirNovo}
            style={{
              padding: "9px 20px", borderRadius: 10, border: "none",
              background: C.accent, color: "#fff",
              fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer",
            }}
          >
            + Novo Usuário
          </button>
        )}
      </div>

      {/* Tabela */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["", "Nome", "Usuário", "Cargo", "Acesso", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "12px 16px", textAlign: "left",
                  fontSize: 14, fontWeight: 700, color: C.muted,
                  textTransform: "uppercase", letterSpacing: 1,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr
                key={u.id}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
              >
                <td style={{ padding: "12px 16px", width: 48 }}>
                  <Avatar name={u.name} size={36} />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>
                    {u.name}
                    {u.id === currentUser?.id && (
                      <span style={{ fontSize: 14, color: C.accent, marginLeft: 8, fontWeight: 600 }}>você</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: C.muted, fontSize: sz.fontBase }}>
                  @{u.username}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <RoleBadge role={u.role} sz={sz} />
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {u.permissions?.pdv  && <span style={permChip(C.green)}>PDV</span>}
                    {u.permissions?.palm && <span style={permChip(C.blue)}>Palm</span>}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => abrirEditar(u)}
                        style={actionBtn()}
                      >
                        Editar
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => setDeleteId(u.id)}
                          style={actionBtn(C.red)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Novo / Editar */}
      {modal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) fechar(); }}
          style={overlayStyle}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: sz.pad + 4,
            width: 480, border: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column", gap: sz.padSm + 4,
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>
              {modal === "novo" ? "Novo Usuário" : "Editar Usuário"}
            </div>

            <Field label="Nome completo *">
              <TextInput value={form.name} onChange={v => setF("name", v)} placeholder="Ex: João Silva" maxLength={40} sz={sz} autoFocus />
            </Field>

            <Field label="Usuário (login) *">
              <TextInput value={form.username} onChange={v => setF("username", v.toLowerCase())} placeholder="Ex: joao" maxLength={30} sz={sz} />
              <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>Apenas letras, números e _ (sem espaços)</div>
            </Field>

            <Field label="Cargo *">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setF("role", r.id)}
                    style={{
                      padding: "7px 14px", borderRadius: 20,
                      border: `1.5px solid ${form.role === r.id ? r.color : C.border}`,
                      background: form.role === r.id ? `${r.color}18` : C.surface,
                      color: form.role === r.id ? r.color : C.muted,
                      cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: sz.padSm }}>
              <div style={{ fontWeight: 700, fontSize: sz.fontBase, marginBottom: sz.padSm }}>
                {modal === "novo" ? "Senha inicial *" : "Redefinir senha (deixe em branco para manter)"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm - 4 }}>
                <Field label="Senha">
                  <div style={{ position: "relative" }}>
                    <TextInput
                      type={verSenha ? "text" : "password"}
                      value={form.password}
                      onChange={v => setF("password", v)}
                      placeholder="••••••••"
                      sz={sz}
                    />
                    <button
                      type="button"
                      onClick={() => setVerSenha(v => !v)}
                      style={{
                        position: "absolute", right: 12, top: "50%",
                        transform: "translateY(-50%)",
                        background: "none", border: "none",
                        cursor: "pointer", fontSize: 16,
                        color: C.muted, padding: 4, lineHeight: 1,
                      }}
                    >
                      {verSenha ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                  <StrengthBar pwd={form.password} />
                </Field>
                <Field label="Confirmar Senha">
                  <div style={{ position: "relative" }}>
                    <TextInput
                      type={verSenha ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={v => setF("confirmPassword", v)}
                      placeholder="••••••••"
                      sz={sz}
                    />
                    <button
                      type="button"
                      onClick={() => setVerSenha(v => !v)}
                      style={{
                        position: "absolute", right: 12, top: "50%",
                        transform: "translateY(-50%)",
                        background: "none", border: "none",
                        cursor: "pointer", fontSize: 16,
                        color: C.muted, padding: 4, lineHeight: 1,
                      }}
                    >
                      {verSenha ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            <ErrBox msg={erro} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={fechar} style={cancelBtn(sz)}>Cancelar</button>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  flex: 2, padding: 13, borderRadius: 10, border: "none",
                  background: salvando ? C.faint : C.accent,
                  color: "#fff", cursor: salvando ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: sz.fontBase,
                }}
              >
                {salvando ? "Salvando..." : modal === "novo" ? "Criar Usuário" : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Desativação */}
      {deleteId && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}
          style={overlayStyle}
        >
          <div style={{
            background: C.card, borderRadius: 16, padding: sz.pad,
            width: 380, border: `1px solid ${C.border}`,
          }}>
            {(() => {
              const u = users.find(x => x.id === deleteId);
              return (
                <>
                  <div style={{ fontWeight: 800, fontSize: sz.fontLg, marginBottom: 8 }}>Excluir usuário?</div>
                  <div style={{ fontSize: sz.fontBase, marginBottom: 6 }}>
                    <strong>{u?.name}</strong> · @{u?.username}
                  </div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginBottom: 24 }}>
                    O usuário será removido permanentemente do banco de dados. Esta ação não pode ser desfeita.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteId(null)} style={cancelBtn(sz)}>Cancelar</button>
                    <button
                      onClick={confirmarDelete}
                      disabled={deletando}
                      style={{
                        flex: 1, padding: 12, borderRadius: 10, border: "none",
                        background: deletando ? C.faint : C.red,
                        color: "#fff", cursor: deletando ? "not-allowed" : "pointer",
                        fontWeight: 700, fontSize: sz.fontBase,
                      }}
                    >
                      {deletando ? "Excluindo..." : "Sim, excluir"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleChip({ active, onClick, color, children, sz }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px", borderRadius: 10,
        border: `1.5px solid ${active ? color : C.border}`,
        background: active ? `${color}18` : C.surface,
        color: active ? color : C.muted,
        cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase,
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Estilos utilitários ───────────────────────────────────────────

const permChip = (color) => ({
  fontSize: 14, fontWeight: 700,
  background: `${color}15`, border: `1px solid ${color}33`,
  color, padding: "2px 8px", borderRadius: 20,
});

const actionBtn = (color) => ({
  padding: "6px 14px", borderRadius: 8,
  border: `1px solid ${color ? `${color}44` : C.border}`,
  background: color ? `${color}0f` : "none",
  color: color ?? C.text,
  cursor: "pointer", fontWeight: 600, fontSize: 16,
});

const cancelBtn = (sz) => ({
  flex: 1, padding: 12, borderRadius: 10,
  border: `1px solid ${C.border}`, background: "none",
  color: C.muted, cursor: "pointer",
  fontWeight: 600, fontSize: sz?.fontBase ?? 14,
});

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 300,
};

// ── Catálogo de métodos de pagamento ────────────────────────────────

const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote,   desc: "Pagamento em espécie" },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard, desc: "Cartão de crédito" },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone, desc: "Cartão de débito" },
  { id: "pix",      label: "Pix",      Icon: LuZap,        desc: "Pagamento via Pix" },
];

// ── Aba Meios de Pagamento ────────────────────────────────────────

function MeiosPagamentoTab({ sz }) {
  const { meiosPagamento, setMeiosPagamento, metodosCustom, setMetodosCustom, currentUser } = useApp();
  const [ativos,       setAtivos]      = useState(
    meiosPagamento?.length ? meiosPagamento : METODOS_CATALOG.map(m => m.id)
  );
  const [salvando,     setSalvando]    = useState(false);
  const [okMsg,        setOkMsg]       = useState(false);
  const [showForm,     setShowForm]    = useState(false);
  const [novoNome,     setNovoNome]    = useState("");
  const [adicionando,  setAdicionando] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const toggle = (id) => {
    if (!isAdmin) return;
    setAtivos(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    setOkMsg(false);
  };

  const salvar = async () => {
    if (ativos.length === 0 || salvando) return;
    setSalvando(true);
    await setMeiosPagamento(ativos);
    setSalvando(false);
    setOkMsg(true);
  };

  const adicionarCustom = async () => {
    const nome = novoNome.trim();
    if (!nome || adicionando) return;
    setAdicionando(true);
    const id = `custom_${nome.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const novo = { id, label: nome };
    const novosCustom = [...(metodosCustom ?? []), novo];
    const novosAtivos = [...ativos, id];
    await setMetodosCustom(novosCustom);
    await setMeiosPagamento(novosAtivos);
    setAtivos(novosAtivos);
    setNovoNome("");
    setShowForm(false);
    setAdicionando(false);
    setOkMsg(false);
  };

  const removerCustom = async (id) => {
    const novosCustom = (metodosCustom ?? []).filter(m => m.id !== id);
    const novosAtivos = ativos.filter(a => a !== id);
    await setMetodosCustom(novosCustom);
    await setMeiosPagamento(novosAtivos);
    setAtivos(novosAtivos);
    setOkMsg(false);
  };

  const todosMetodos = [
    ...METODOS_CATALOG,
    ...(metodosCustom ?? []).map(m => ({ ...m, Icon: LuWallet, desc: "Forma de pagamento personalizada", custom: true })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.pad }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: sz.pad }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>Meios de Pagamento</div>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(v => !v); setNovoNome(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.accent}`,
                background: showForm ? C.accent : "transparent",
                color: showForm ? "#fff" : C.accent,
                cursor: "pointer", fontWeight: 700, fontSize: sz.fontSm,
                fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
              }}
            >
              <LuPlus size={15} /> Adicionar
            </button>
          )}
        </div>
        <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginBottom: sz.pad }}>
          Ative ou desative as formas de pagamento disponíveis no checkout e no fechamento de caixa.
        </div>

        {/* Formulário inline para novo método */}
        {showForm && isAdmin && (
          <div style={{
            marginBottom: sz.pad, padding: sz.padSm,
            background: C.surface, borderRadius: 12, border: `1.5px solid ${C.accent}44`,
            display: "flex", gap: 10, alignItems: "center",
          }}>
            <input
              autoFocus
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarCustom(); if (e.key === "Escape") setShowForm(false); }}
              placeholder="Nome da forma de pagamento..."
              maxLength={40}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8,
                border: `1.5px solid ${C.border}`, background: C.card,
                color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none",
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />
            <button
              onClick={adicionarCustom}
              disabled={!novoNome.trim() || adicionando}
              style={{
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: novoNome.trim() ? C.accent : C.faint,
                color: "#fff", fontWeight: 700, fontSize: sz.fontSm,
                cursor: novoNome.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
              }}
            >
              {adicionando ? "..." : "Confirmar"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.muted,
                cursor: "pointer", fontFamily: "inherit", fontSize: sz.fontSm,
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: sz.gap }}>
          {todosMetodos.map(m => {
            const ativo = ativos.includes(m.id);
            return (
              <div key={m.id} style={{ position: "relative" }}>
                <button
                  onClick={() => toggle(m.id)}
                  disabled={!isAdmin}
                  style={{
                    width: "100%",
                    padding: `${sz.pad}px ${sz.padSm}px`,
                    borderRadius: 14,
                    border: `2px solid ${ativo ? C.accent : C.border}`,
                    background: ativo ? `${C.accent}10` : C.surface,
                    color: ativo ? C.accent : C.muted,
                    cursor: isAdmin ? "pointer" : "default",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    transition: "border-color 0.15s, background 0.15s, color 0.15s",
                    opacity: !isAdmin ? 0.7 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  <m.Icon size={26} />
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{m.label}</div>
                  <div style={{ fontSize: sz.fontSm, color: ativo ? `${C.accent}bb` : C.muted }}>{m.desc}</div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    background: ativo ? `${C.green}18` : `${C.faint}`,
                    color: ativo ? C.green : C.muted,
                    border: `1px solid ${ativo ? C.green : C.border}44`,
                    padding: "2px 10px", borderRadius: 20, marginTop: 2,
                  }}>
                    {ativo ? "Ativo" : "Desabilitado"}
                  </div>
                </button>
                {m.custom && isAdmin && (
                  <button
                    onClick={() => removerCustom(m.id)}
                    title="Remover"
                    style={{
                      position: "absolute", top: 8, right: 8,
                      background: `${C.red}20`, border: `1px solid ${C.red}44`,
                      borderRadius: 6, color: C.red, cursor: "pointer",
                      padding: "4px 6px", display: "flex", alignItems: "center",
                    }}
                  >
                    <LuTrash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {ativos.length === 0 && (
          <div style={{
            marginTop: sz.padSm, padding: "10px 14px", borderRadius: 8,
            background: `${C.red}15`, border: `1px solid ${C.red}44`,
            color: C.red, fontSize: 16, fontWeight: 600,
          }}>
            ⚠️ É necessário pelo menos um meio de pagamento ativo.
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
          {okMsg && (
            <span style={{ fontSize: 16, color: C.green, fontWeight: 600 }}>✓ Configurações salvas</span>
          )}
          <button
            onClick={salvar}
            disabled={salvando || ativos.length === 0}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: (salvando || ativos.length === 0) ? C.faint : C.accent,
              color: "#fff", fontWeight: 700, fontSize: sz.fontBase,
              cursor: (salvando || ativos.length === 0) ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {salvando ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Aba Unidades de Medida ────────────────────────────────────────

const TIPOS_UNIDADE = [
  { tipo: "estoque", label: "Unidade de estoque", color: C.blue   },
  { tipo: "compra",  label: "Unidade de compra",  color: C.green  },
  { tipo: "consumo", label: "Unidade de consumo", color: "#f59e0b" },
];

const EMPTY_ADD = { abbr: "", nome: "" };

function UnidadesMedidaTab({ sz }) {
  const { currentUser } = useApp();
  const [unidades,    setUnidades]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [addForms,    setAddForms]    = useState({ estoque: EMPTY_ADD, compra: EMPTY_ADD, consumo: EMPTY_ADD });
  const [salvando,    setSalvando]    = useState({ estoque: false, compra: false, consumo: false });

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  useEffect(() => {
    supabase.from("unidades_medida").select("*").order("ordem").order("nome")
      .then(({ data }) => { setUnidades(data ?? []); setLoading(false); });
  }, []);

  const setAddField = (tipo, field, value) =>
    setAddForms(f => ({ ...f, [tipo]: { ...f[tipo], [field]: value } }));

  const adicionar = async (tipo) => {
    const { abbr, nome } = addForms[tipo];
    if (!abbr.trim() || !nome.trim()) return;
    setSalvando(s => ({ ...s, [tipo]: true }));
    const { data, error } = await supabase
      .from("unidades_medida")
      .insert({ abreviacao: abbr.trim(), nome: nome.trim(), tipo, ordem: 99 })
      .select()
      .single();
    if (!error && data) {
      setUnidades(prev => [...prev, data]);
      setAddForms(f => ({ ...f, [tipo]: EMPTY_ADD }));
    }
    setSalvando(s => ({ ...s, [tipo]: false }));
  };

  const remover = async (id, nome) => {
    if (!window.confirm(`Remover "${nome}"?`)) return;
    await supabase.from("unidades_medida").delete().eq("id", id);
    setUnidades(prev => prev.filter(u => u.id !== id));
  };

  if (loading) {
    return <div style={{ color: C.muted, fontSize: sz.fontBase, padding: sz.pad }}>Carregando...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.pad }}>
      {TIPOS_UNIDADE.map(({ tipo, label, color }) => {
        const lista   = unidades.filter(u => u.tipo === tipo);
        const form    = addForms[tipo];
        const salvandoEste = salvando[tipo];
        return (
          <div key={tipo} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            {/* Cabeçalho */}
            <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: C.text }}>{label}</span>
              <span style={{ fontSize: sz.fontSm, color: C.muted, marginLeft: 4 }}>{lista.length} cadastrada{lista.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Lista */}
            <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: 6 }}>
              {lista.length === 0 && (
                <div style={{ fontSize: sz.fontSm + 1, color: C.muted, padding: "8px 0" }}>
                  Nenhuma unidade cadastrada.
                </div>
              )}
              {lista.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: sz.fontBase, color, minWidth: 44 }}>
                    {u.abreviacao}
                  </span>
                  <span style={{ flex: 1, fontSize: sz.fontBase, color: C.text }}>{u.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => remover(u.id, u.nome)}
                      title="Remover"
                      style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, cursor: "pointer", padding: "4px 7px", display: "flex", alignItems: "center", lineHeight: 0, transition: "border-color 0.12s, color 0.12s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.red + "66"; e.currentTarget.style.color = C.red; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
                    >
                      <LuX size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Formulário inline de adição */}
            {isAdmin && (
              <div style={{ padding: `0 ${sz.pad}px ${sz.padSm}px`, display: "flex", gap: 8 }}>
                <input
                  value={form.abbr}
                  onChange={e => setAddField(tipo, "abbr", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="abrev."
                  maxLength={10}
                  style={{ width: 80, padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${form.abbr ? color + "88" : C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }}
                />
                <input
                  value={form.nome}
                  onChange={e => setAddField(tipo, "nome", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="Nome completo"
                  maxLength={40}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${form.nome ? color + "88" : C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
                <button
                  onClick={() => adicionar(tipo)}
                  disabled={!form.abbr.trim() || !form.nome.trim() || salvandoEste}
                  style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: form.abbr.trim() && form.nome.trim() ? color : C.faint, color: "#fff", fontWeight: 700, fontSize: sz.fontBase, cursor: form.abbr.trim() && form.nome.trim() ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                >
                  <LuPlus size={14} />
                  {salvandoEste ? "..." : "Adicionar"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────

const ABAS_CONFIG = [
  { id: "geral",            label: "Geral" },
  { id: "usuarios",         label: "Usuários" },
  { id: "meios_pagamento",  label: "Meios de Pagamento" },
  { id: "unidades_medida",  label: "Unidades de Medida" },
];

function GeralTab({ sz }) {
  const { taxaServico, setTaxaServico } = useApp();
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    await setTaxaServico(!taxaServico);
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: sz.pad, display: "flex", flexDirection: "row",
        alignItems: "center", gap: sz.pad,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase, lineHeight: 1.3 }}>Taxa de Serviço</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 4, lineHeight: 1.4 }}>
            Cobra automaticamente 10% de taxa de serviço no fechamento
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            width: 56, height: 30, borderRadius: 15, border: "none", padding: 0,
            background: taxaServico ? C.green : C.faint,
            cursor: saving ? "not-allowed" : "pointer",
            position: "relative", transition: "background 0.2s", flexShrink: 0,
            opacity: saving ? 0.7 : 1, outline: "none",
          }}
        >
          <span style={{
            position: "absolute",
            top: "50%", transform: "translateY(-50%)",
            left: taxaServico ? 29 : 3,
            width: 24, height: 24, borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            display: "block",
            boxShadow: "0 1px 4px #0006",
          }} />
        </button>
      </div>
    </div>
  );
}

export default function ConfiguracoesView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { currentUser } = useApp();
  const [aba, setAba] = useState("geral");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Configurações</div>
        <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>
          Gerencie os usuários e configurações do sistema
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: sz.padSm }}>
          {ABAS_CONFIG.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "none",
                background: aba === a.id ? C.accent : "transparent",
                color: aba === a.id ? "#fff" : C.muted,
                cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
                transition: "background 0.15s, color 0.15s",
                fontFamily: "inherit",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
        {aba === "geral"           && <GeralTab sz={sz} />}
        {aba === "usuarios"        && <UsuariosTab sz={sz} />}
        {aba === "meios_pagamento" && <MeiosPagamentoTab sz={sz} />}
        {aba === "unidades_medida" && <UnidadesMedidaTab sz={sz} />}
      </div>
    </div>
  );
}
