import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { hashPassword, passwordStrength, sanitizeInput } from "@/utils";
import { getPermissions } from "@/constants/roles";
import C from "@/constants/colors";
import { LuEye, LuEyeOff } from "react-icons/lu";

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
      fontSize: 11, fontWeight: 700, color: C.muted,
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
      <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      background: `${C.red}15`, border: `1px solid ${C.red}44`,
      color: C.red, fontSize: 13, fontWeight: 600,
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
      color: C.green, fontSize: 13, fontWeight: 600,
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
            fontSize: 11, fontWeight: 700, color: C.muted,
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

        {/* Permissões de acesso */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: sz.padSm,
          }}>
            Permissões de Acesso
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: sz.gap - 4 }}>
            {[
              { icon: "📟", label: "PDV",  color: C.green, desc: "Libera acesso à tela de Frente de Caixa no computador. Necessário para caixas e gerentes que operam as comandas." },
              { icon: "📱", label: "Palm", color: C.blue,  desc: "Libera acesso à interface mobile. Permite que garçons usem o celular para abrir mesas e registrar pedidos." },
            ].map(p => (
              <div key={p.label} style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                background: C.surface, borderRadius: 12,
                border: `1px solid ${p.color}33`,
                padding: `${sz.padSm}px ${sz.padSm + 4}px`,
              }}>
                <span style={{ fontSize: sz.fontXl - 4, flexShrink: 0 }}>{p.icon}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: sz.fontBase, color: p.color }}>{p.label}</span>
                    <span style={permChip(p.color)}>{p.label}</span>
                  </div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted, lineHeight: 1.5 }}>
                    {p.desc}
                  </div>
                </div>
              </div>
            ))}
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
                  fontSize: 11, fontWeight: 700, color: C.muted,
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
                      <span style={{ fontSize: 11, color: C.accent, marginLeft: 8, fontWeight: 600 }}>você</span>
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
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Apenas letras, números e _ (sem espaços)</div>
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
  fontSize: 11, fontWeight: 700,
  background: `${color}15`, border: `1px solid ${color}33`,
  color, padding: "2px 8px", borderRadius: 20,
});

const actionBtn = (color) => ({
  padding: "6px 14px", borderRadius: 8,
  border: `1px solid ${color ? `${color}44` : C.border}`,
  background: color ? `${color}0f` : "none",
  color: color ?? C.text,
  cursor: "pointer", fontWeight: 600, fontSize: 13,
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

// ── View principal ────────────────────────────────────────────────

export default function ConfiguracoesView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { currentUser } = useApp();

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
          Gerencie os usuários do sistema
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
        <UsuariosTab sz={sz} />
      </div>
    </div>
  );
}
