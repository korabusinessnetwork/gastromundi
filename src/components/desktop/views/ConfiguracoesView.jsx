import { useState, useMemo, useEffect } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { passwordStrength, sanitizeInput } from "@/utils";
import { criarAuthUsuario, atualizarSenhaAuth, deletarAuthUsuario } from "@/lib/adminAuth";
import { getPermissions } from "@/constants/roles";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { createPortal } from "react-dom";
import { LuEye, LuEyeOff, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPlus, LuTrash2, LuWallet, LuX, LuTriangleAlert, LuPrinter } from "react-icons/lu";
import { METODOS_TEF_PADRAO } from "@/lib/tef";
import ConfiguracaoImpressao from "./impressao/ConfiguracaoImpressao";
import MesasAdmin from "./mesas/MesasAdmin";
import ImportarExportarTab from "./ImportarExportarTab";
import "./ConfiguracoesView.css";

const ROLES = [
  { id: "admin",   label: "Administrador", color: varColor(C.accent) },
  { id: "gerente", label: "Gerente",       color: varColor(C.blue)   },
  { id: "caixa",   label: "Caixa",         color: varColor(C.green)  },
  { id: "garcom",  label: "Garçom",        color: "#f59e0b"},
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));


const EMPTY_USER_FORM = { name: "", username: "", role: "caixa", password: "", confirmPassword: "" };

// ── Helpers ───────────────────────────────────────────────────────

function RoleBadge({ role, sz }) {
  const r = ROLE_MAP[role] ?? { label: role, color: varColor(C.muted) };
  return (
    <span className="cfg__badge-role" style={{
      background: alfa(r.color, "18"), border: `1px solid ${alfa(r.color, "44")}`,
      color: r.color,
    }}>
      {r.label}
    </span>
  );
}

function Avatar({ name, size = 40 }) {
  const initials = (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="cfg__avatar" style={{ width: size, height: size, borderRadius: size / 2, fontSize: size * 0.4 }}>
      {initials}
    </div>
  );
}

function Label({ children }) {
  return <div className="cfg__label">{children}</div>;
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
      className={`cfg__input${disabled ? " cfg__input--disabled" : ""}`}
    />
  );
}

function StrengthBar({ pwd }) {
  if (!pwd) return null;
  const s = passwordStrength(pwd);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="usuarios-tab__strength-barras">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="usuarios-tab__strength-barra" style={{ background: i <= s.level ? s.color : varColor(C.border) }} />
        ))}
      </div>
      <div className="usuarios-tab__strength-label" style={{ color: s.color, fontWeight: 600 }}>{s.label}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="cfg__erro-box" style={{ background: alfa(C.red, "15"), border: `1px solid ${alfa(C.red, "44")}` }}>
      ⚠️ {msg}
    </div>
  );
}

function OkBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="cfg__ok-box" style={{ background: alfa(C.green, "15"), border: `1px solid ${alfa(C.green, "44")}` }}>
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
  if (error?.code === "no_rows_updated")
    return "Não foi possível salvar: só um administrador pode editar usuários.";
  if (msg.includes("permission denied") || msg.includes("policy"))
    return "Sem permissão para realizar esta ação.";
  return "Erro ao salvar: " + msg;
}

// ── Aba Usuários ──────────────────────────────────────────────────

function UsuariosTab({ sz }) {
  const { users, currentUser, addUser, updateUser, removeUser } = useApp();

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

        // Cria na tabela users primeiro
        const { error } = await addUser({
          name, username, role: form.role, permissions, active: true,
        });
        if (error) { setErro(traduzirErro(error)); setSalvando(false); return; }

        // Cria conta no Supabase Auth via Edge Function
        const { error: authErr } = await criarAuthUsuario({ username, password: plainPwd, name, role: form.role });
        if (authErr) { setErro("Usuário criado, mas falha no Auth: " + authErr); setSalvando(false); return; }
      } else {
        const changes = { name, username, role: form.role, permissions };
        if (form.password) {
          if (form.password !== form.confirmPassword) { setErro("As senhas não coincidem."); setSalvando(false); return; }
          if (passwordStrength(form.password).level < 2) { setErro("Senha muito fraca."); setSalvando(false); return; }
          const plainPwd = sanitizeInput(form.password, 100);
          // Atualiza senha no Supabase Auth
          const editUser = users.find(u => u.id === editId);
          if (editUser?.auth_id) {
            const { error: authErr } = await atualizarSenhaAuth(editUser.auth_id, plainPwd);
            if (authErr) { setErro("Falha ao atualizar senha no Auth: " + authErr); setSalvando(false); return; }
          }
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
    const userDel = users.find(u => u.id === deleteId);
    await removeUser(deleteId);
    if (userDel?.auth_id) {
      await deletarAuthUsuario(userDel.auth_id);
    }
    setDeletando(false);
    setDeleteId(null);
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm }}>

      {/* Card de explicação de cargos e permissões */}
      <div className="usuarios-tab__guia" style={{ padding: sz.pad, gap: sz.pad - 4 }}>
        <div className="usuarios-tab__guia-titulo">
          Guia de Cargos e Permissões
        </div>

        {/* Cargos */}
        <div>
          <div className="usuarios-tab__cargos-label" style={{ marginBottom: sz.padSm }}>
            Cargos
          </div>
          <div className="usuarios-tab__cargos-grid" style={{ gap: sz.gap }}>
            {[
              { role: "admin",   icon: "👑",    desc: "Acesso total ao sistema: vendas, relatórios, usuários, produtos, abertura e fechamento de caixa." },
              { role: "gerente", icon: "🧑‍💼", desc: "Gerencia usuários e produtos, visualiza relatórios completos e opera o caixa." },
              { role: "caixa",   icon: "🖥️",   desc: "Opera a Frente de Caixa: abre comandas, lança pedidos e processa pagamentos." },
              { role: "garcom",  icon: "🍽️",   desc: "Acessa o Palm pelo celular para abrir mesas e lançar pedidos diretamente da mesa." },
            ].map(item => {
              const r = ROLE_MAP[item.role];
              return (
                <div key={item.role} className="usuarios-tab__cargo-card" style={{
                  border: `1px solid ${alfa(r.color, "33")}`,
                  padding: `${sz.padSm}px ${sz.padSm + 4}px`,
                }}>
                  <div className="usuarios-tab__cargo-topo">
                    <span className="usuarios-tab__cargo-icone">{item.icon}</span>
                    <RoleBadge role={item.role} sz={sz} />
                  </div>
                  <div className="usuarios-tab__cargo-desc">
                    {item.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Header */}
      <div className="usuarios-tab__header">
        <div className="usuarios-tab__contagem">
          {users.length} usuário{users.length !== 1 ? "s" : ""} ativo{users.length !== 1 ? "s" : ""}
        </div>
        {isAdmin && (
          <button
            onClick={abrirNovo}
            className="usuarios-tab__btn-novo"
          >
            + Novo Usuário
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="usuarios-tab__tabela-moldura">
        <table className="usuarios-tab__tabela">
          <thead>
            <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
              {["", "Nome", "Usuário", "Cargo", "Acesso", ""].map((h, i) => (
                <th key={i} className="usuarios-tab__th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr
                key={u.id}
                className="usuarios-tab__tr"
                onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <td className="usuarios-tab__td" style={{ width: 48 }}>
                  <Avatar name={u.name} size={36} />
                </td>
                <td className="usuarios-tab__td">
                  <div className="usuarios-tab__nome">
                    {u.name}
                    {u.id === currentUser?.id && (
                      <span className="usuarios-tab__voce">você</span>
                    )}
                  </div>
                </td>
                <td className="usuarios-tab__td usuarios-tab__username" style={{ color: varColor(C.muted) }}>
                  @{u.username}
                </td>
                <td className="usuarios-tab__td">
                  <RoleBadge role={u.role} sz={sz} />
                </td>
                <td className="usuarios-tab__td">
                  <div className="usuarios-tab__perm-chips">
                    {u.permissions?.pdv  && <span className="usuarios-tab__perm-chip" style={{ background: alfa(C.green, "15"), border: `1px solid ${alfa(C.green, "33")}`, color: varColor(C.green) }}>PDV</span>}
                    {u.permissions?.palm && <span className="usuarios-tab__perm-chip" style={{ background: alfa(C.blue, "15"), border: `1px solid ${alfa(C.blue, "33")}`, color: varColor(C.blue) }}>Palm</span>}
                  </div>
                </td>
                <td className="usuarios-tab__td" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {isAdmin && (
                    <div className="usuarios-tab__acoes">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="usuarios-tab__action-btn"
                        style={{ border: `1px solid var(${C.border})`, background: "none", color: varColor(C.text) }}
                      >
                        Editar
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => setDeleteId(u.id)}
                          className="usuarios-tab__action-btn"
                          style={{ border: `1px solid ${alfa(C.red, "44")}`, background: alfa(C.red, "0f"), color: varColor(C.red) }}
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
          {...fecharAoClicarFora(fechar)}
          className="cfg__overlay"
        >
          <div className="usuarios-tab__modal" style={{ padding: sz.pad + 4, gap: sz.padSm + 4 }}>
            <div className="usuarios-tab__modal-titulo">
              {modal === "novo" ? "Novo Usuário" : "Editar Usuário"}
            </div>

            <Field label="Nome completo *">
              <TextInput value={form.name} onChange={v => setF("name", v)} placeholder="Ex: João Silva" maxLength={40} sz={sz} autoFocus />
            </Field>

            <Field label="Usuário (login) *">
              <TextInput value={form.username} onChange={v => setF("username", v.toLowerCase())} placeholder="Ex: joao" maxLength={30} sz={sz} />
              <div className="usuarios-tab__ajuda">Apenas letras, números e _ (sem espaços)</div>
            </Field>

            <Field label="Cargo *">
              <div className="usuarios-tab__cargo-chips">
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setF("role", r.id)}
                    className="usuarios-tab__cargo-chip"
                    style={{
                      borderColor: form.role === r.id ? r.color : varColor(C.border),
                      background: form.role === r.id ? alfa(r.color, "18") : varColor(C.surface),
                      color: form.role === r.id ? r.color : varColor(C.muted),
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="usuarios-tab__senha-secao" style={{ paddingTop: sz.padSm }}>
              <div className="usuarios-tab__senha-titulo" style={{ marginBottom: sz.padSm }}>
                {modal === "novo" ? "Senha inicial *" : "Redefinir senha (deixe em branco para manter)"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm - 4 }}>
                <Field label="Senha">
                  <div className="usuarios-tab__senha-wrap">
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
                      className="usuarios-tab__senha-olho"
                    >
                      {verSenha ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                  <StrengthBar pwd={form.password} />
                </Field>
                <Field label="Confirmar Senha">
                  <div className="usuarios-tab__senha-wrap">
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
                      className="usuarios-tab__senha-olho"
                    >
                      {verSenha ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            <ErrBox msg={erro} />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={fechar} className="cfg__cancel-btn">Cancelar</button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="usuarios-tab__btn-salvar"
                style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}
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
          {...fecharAoClicarFora(() => setDeleteId(null))}
          className="cfg__overlay"
        >
          <div className="usuarios-tab__confirm-modal" style={{ padding: sz.pad }}>
            {(() => {
              const u = users.find(x => x.id === deleteId);
              return (
                <>
                  <div className="usuarios-tab__confirm-titulo">Excluir usuário?</div>
                  <div className="usuarios-tab__confirm-sub">
                    <strong>{u?.name}</strong> · @{u?.username}
                  </div>
                  <div className="usuarios-tab__confirm-ajuda">
                    O usuário será removido permanentemente do banco de dados. Esta ação não pode ser desfeita.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteId(null)} className="cfg__cancel-btn">Cancelar</button>
                    <button
                      onClick={confirmarDelete}
                      disabled={deletando}
                      className="usuarios-tab__btn-excluir"
                      style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}
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
      className="meios-pagamento-tab__toggle-chip"
      style={{
        padding: "8px 16px", borderRadius: 10,
        border: `1.5px solid ${active ? color : varColor(C.border)}`,
        background: active ? `${color}18` : varColor(C.surface),
        color: active ? color : varColor(C.muted),
        cursor: "pointer", fontWeight: 600,
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Catálogo de métodos de pagamento ────────────────────────────────

const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote,   desc: "Pagamento em espécie" },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard, desc: "Cartão de crédito" },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone, desc: "Cartão de débito" },
  { id: "pix",      label: "Pix",      Icon: LuZap,        desc: "Pagamento via Pix" },
];

// ── Aba Meios de Pagamento ────────────────────────────────────────

function MeiosPagamentoTab({ sz }) {
  const { meiosPagamento, setMeiosPagamento, metodosCustom, setMetodosCustom, metodosTef, setMetodosTef, currentUser } = useApp();
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
      <div className="meios-pagamento-tab__card" style={{ padding: sz.pad }}>
        <div className="meios-pagamento-tab__topo">
          <div className="meios-pagamento-tab__titulo">Meios de Pagamento</div>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(v => !v); setNovoNome(""); }}
              className="meios-pagamento-tab__btn-adicionar"
              style={{
                borderColor: varColor(C.accent),
                background: showForm ? varColor(C.accent) : "transparent",
                color: showForm ? "#fff" : varColor(C.accent),
              }}
            >
              <LuPlus size={15} /> Adicionar
            </button>
          )}
        </div>
        <div className="meios-pagamento-tab__ajuda" style={{ marginBottom: sz.pad }}>
          Ative ou desative as formas de pagamento disponíveis no checkout e no fechamento de caixa.
        </div>

        {/* Formulário inline para novo método */}
        {showForm && isAdmin && (
          <div className="meios-pagamento-tab__form-novo" style={{ marginBottom: sz.pad, padding: sz.padSm, borderColor: alfa(C.accent, "44") }}>
            <input
              autoFocus
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") adicionarCustom(); if (e.key === "Escape") setShowForm(false); }}
              placeholder="Nome da forma de pagamento..."
              maxLength={40}
              className="meios-pagamento-tab__input-novo"
              onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
              onBlur={e => e.currentTarget.style.borderColor = varColor(C.border)}
            />
            <button
              onClick={adicionarCustom}
              disabled={!novoNome.trim() || adicionando}
              className="meios-pagamento-tab__btn-confirmar"
              style={{ background: novoNome.trim() ? varColor(C.accent) : varColor(C.faint), cursor: novoNome.trim() ? "pointer" : "not-allowed" }}
            >
              {adicionando ? "..." : "Confirmar"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="meios-pagamento-tab__btn-cancelar-form"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="meios-pagamento-tab__grid" style={{ gap: sz.gap }}>
          {todosMetodos.map(m => {
            const ativo = ativos.includes(m.id);
            return (
              <div key={m.id} style={{ position: "relative" }}>
                <button
                  onClick={() => toggle(m.id)}
                  disabled={!isAdmin}
                  className="meios-pagamento-tab__metodo-card"
                  style={{
                    padding: `${sz.pad}px ${sz.padSm}px`,
                    borderColor: ativo ? varColor(C.accent) : varColor(C.border),
                    background: ativo ? alfa(C.accent, "10") : varColor(C.surface),
                    color: ativo ? varColor(C.accent) : varColor(C.muted),
                    cursor: isAdmin ? "pointer" : "default",
                    opacity: !isAdmin ? 0.7 : 1,
                  }}
                >
                  <m.Icon size={26} />
                  <div className="meios-pagamento-tab__metodo-nome">{m.label}</div>
                  <div className="meios-pagamento-tab__metodo-desc" style={{ color: ativo ? alfa(C.accent, "bb") : varColor(C.muted) }}>{m.desc}</div>
                  <div className="meios-pagamento-tab__status-tag" style={{
                    background: ativo ? alfa(C.green, "18") : varColor(C.faint),
                    color: ativo ? varColor(C.green) : varColor(C.muted),
                    border: `1px solid ${alfa(ativo ? varColor(C.green) : varColor(C.border), "44")}`,
                  }}>
                    {ativo ? "Ativo" : "Desabilitado"}
                  </div>
                </button>
                {m.custom && isAdmin && (
                  <button
                    onClick={() => removerCustom(m.id)}
                    title="Remover"
                    className="meios-pagamento-tab__btn-remover-custom"
                    style={{ background: alfa(C.red, "20"), border: `1px solid ${alfa(C.red, "44")}`, color: varColor(C.red) }}
                  >
                    <LuTrash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {ativos.length === 0 && (
          <div className="meios-pagamento-tab__aviso-vazio" style={{ marginTop: sz.padSm, background: alfa(C.red, "15"), border: `1px solid ${alfa(C.red, "44")}` }}>
            ⚠️ É necessário pelo menos um meio de pagamento ativo.
          </div>
        )}
      </div>

      {/* Maquininha (TEF) — quais métodos passam pela maquininha. Quem
          passa pela maquininha só cobra com internet; os demais podem
          fechar a comanda offline (a venda sobe sozinha quando voltar). */}
      <div className="meios-pagamento-tab__card" style={{ padding: sz.pad }}>
        <div className="meios-pagamento-tab__titulo" style={{ marginBottom: 4 }}>
          Maquininha (TEF)
        </div>
        <div className="meios-pagamento-tab__ajuda" style={{ marginBottom: sz.pad }}>
          Marque quais formas de pagamento passam pela maquininha. Essas precisam de internet
          na hora de cobrar; as demais funcionam mesmo sem internet — a venda fica guardada e
          sobe sozinha quando a conexão voltar.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: sz.gap }}>
          {todosMetodos.map((m) => {
            const listaTef = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
            const usaTef = listaTef.includes(m.id);
            return (
              <ToggleChip
                key={m.id}
                active={usaTef}
                color={varColor(C.accent)}
                sz={sz}
                onClick={() => {
                  if (!isAdmin) return;
                  const lista = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
                  setMetodosTef(usaTef ? lista.filter((id) => id !== m.id) : [...lista, m.id]);
                }}
              >
                {m.label}{usaTef ? " · maquininha" : ""}
              </ToggleChip>
            );
          })}
        </div>
        {!isAdmin && (
          <div className="meios-pagamento-tab__ajuda" style={{ marginTop: sz.padSm }}>
            Somente o administrador pode alterar quais métodos usam a maquininha.
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="meios-pagamento-tab__rodape">
          {okMsg && (
            <span className="meios-pagamento-tab__ok-msg">✓ Configurações salvas</span>
          )}
          <button
            onClick={salvar}
            disabled={salvando || ativos.length === 0}
            className="meios-pagamento-tab__btn-salvar"
            style={{
              background: (salvando || ativos.length === 0) ? varColor(C.faint) : varColor(C.accent),
              cursor: (salvando || ativos.length === 0) ? "not-allowed" : "pointer",
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
  { tipo: "estoque", label: "Unidade de estoque", color: varColor(C.blue)   },
  { tipo: "compra",  label: "Unidade de compra",  color: varColor(C.green)  },
  { tipo: "consumo", label: "Unidade de consumo", color: "#f59e0b" },
];

const EMPTY_ADD = { abbr: "", nome: "" };

function UnidadesMedidaTab({ sz }) {
  const { currentUser } = useApp();
  const [unidades,    setUnidades]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [addForms,    setAddForms]    = useState({ estoque: EMPTY_ADD, compra: EMPTY_ADD, consumo: EMPTY_ADD });
  const [salvando,    setSalvando]    = useState({ estoque: false, compra: false, consumo: false });
  const [deleteInfo,  setDeleteInfo]  = useState(null); // { id, nome, abbr, afetados }
  const [deletando,   setDeletando]   = useState(false);

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

  const iniciarRemover = async (unidade) => {
    const abbr = unidade.abreviacao;
    const { data: produtos } = await supabase
      .from("products")
      .select("id, unidade_estoque, unidade_consumo, unidades_compra");
    const afetados = (produtos || []).filter(p =>
      p.unidade_estoque === abbr ||
      p.unidade_consumo === abbr ||
      (Array.isArray(p.unidades_compra) && p.unidades_compra.some(c => c.unidade === abbr))
    ).length;
    setDeleteInfo({ id: unidade.id, nome: unidade.nome, abbr, afetados });
  };

  const confirmarRemover = async () => {
    if (!deleteInfo || deletando) return;
    setDeletando(true);
    const { abbr } = deleteInfo;

    // 1. Desvincula unidade_estoque → volta para string vazia (field not null, mas produtos sem unidade ficam sem config)
    await supabase.from("products").update({ unidade_estoque: "" }).eq("unidade_estoque", abbr);

    // 2. Limpa unidade_consumo
    await supabase.from("products").update({ unidade_consumo: null }).eq("unidade_consumo", abbr);

    // 3. Remove entradas de unidades_compra que usam essa abreviação
    const { data: comCompra } = await supabase
      .from("products")
      .select("id, unidades_compra")
      .not("unidades_compra", "eq", "[]");
    const afetadosCompra = (comCompra || []).filter(p =>
      Array.isArray(p.unidades_compra) && p.unidades_compra.some(c => c.unidade === abbr)
    );
    for (const p of afetadosCompra) {
      await supabase
        .from("products")
        .update({ unidades_compra: p.unidades_compra.filter(c => c.unidade !== abbr) })
        .eq("id", p.id);
    }

    // 4. Exclui a unidade
    await supabase.from("unidades_medida").delete().eq("id", deleteInfo.id);
    setUnidades(prev => prev.filter(u => u.id !== deleteInfo.id));
    setDeleteInfo(null);
    setDeletando(false);
  };

  if (loading) {
    return <div className="unidades-medida-tab__carregando" style={{ color: varColor(C.muted), padding: sz.pad }}>Carregando...</div>;
  }

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: sz.pad }}>
      {TIPOS_UNIDADE.map(({ tipo, label, color }) => {
        const lista   = unidades.filter(u => u.tipo === tipo);
        const form    = addForms[tipo];
        const salvandoEste = salvando[tipo];
        return (
          <div key={tipo} className="unidades-medida-tab__grupo">
            {/* Cabeçalho */}
            <div className="unidades-medida-tab__grupo-header" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
              <div className="unidades-medida-tab__bolinha" style={{ background: color }} />
              <span className="unidades-medida-tab__grupo-titulo">{label}</span>
              <span className="unidades-medida-tab__grupo-contagem">{lista.length} cadastrada{lista.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Lista */}
            <div className="unidades-medida-tab__lista" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
              {lista.length === 0 && (
                <div className="unidades-medida-tab__vazio">
                  Nenhuma unidade cadastrada.
                </div>
              )}
              {lista.map(u => (
                <div key={u.id} className="unidades-medida-tab__item">
                  <span className="unidades-medida-tab__item-abbr" style={{ color }}>
                    {u.abreviacao}
                  </span>
                  <span className="unidades-medida-tab__item-nome">{u.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => iniciarRemover(u)}
                      title="Remover"
                      className="unidades-medida-tab__btn-remover"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(C.red, "66"); e.currentTarget.style.color = varColor(C.red); }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.muted); }}
                    >
                      <LuX size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Formulário inline de adição */}
            {isAdmin && (
              <div className="unidades-medida-tab__form-add" style={{ padding: `0 ${sz.pad}px ${sz.padSm}px` }}>
                <input
                  value={form.abbr}
                  onChange={e => setAddField(tipo, "abbr", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="abrev."
                  maxLength={10}
                  className="unidades-medida-tab__input-abbr"
                  style={{ borderColor: form.abbr ? alfa(color, "88") : varColor(C.border) }}
                />
                <input
                  value={form.nome}
                  onChange={e => setAddField(tipo, "nome", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="Nome completo"
                  maxLength={40}
                  className="unidades-medida-tab__input-nome"
                  style={{ borderColor: form.nome ? alfa(color, "88") : varColor(C.border) }}
                />
                <button
                  onClick={() => adicionar(tipo)}
                  disabled={!form.abbr.trim() || !form.nome.trim() || salvandoEste}
                  className="unidades-medida-tab__btn-add"
                  style={{ background: form.abbr.trim() && form.nome.trim() ? color : varColor(C.faint), cursor: form.abbr.trim() && form.nome.trim() ? "pointer" : "not-allowed" }}
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

    {deleteInfo && createPortal(
      <div className="unidades-medida-tab__delete-overlay">
        <div className="unidades-medida-tab__delete-modal">
          <div className="unidades-medida-tab__delete-topo">
            <div className="unidades-medida-tab__delete-icone" style={{ background: alfa(C.red, "15") }}>
              <LuTriangleAlert size={22} color={varColor(C.red)} />
            </div>
            <div>
              <div className="unidades-medida-tab__delete-titulo">Excluir unidade</div>
              <div className="unidades-medida-tab__delete-ajuda">Esta ação não pode ser desfeita.</div>
            </div>
          </div>

          <div className="unidades-medida-tab__delete-info">
            <div className="unidades-medida-tab__delete-nome">
              "{deleteInfo.nome}" ({deleteInfo.abbr})
            </div>
            {deleteInfo.afetados > 0 ? (
              <div className="unidades-medida-tab__delete-aviso">
                ⚠ {deleteInfo.afetados} {deleteInfo.afetados === 1 ? "produto ficará" : "produtos ficarão"} sem essa unidade configurada após a exclusão.
              </div>
            ) : (
              <div className="unidades-medida-tab__delete-sem-uso">
                Nenhum produto utiliza essa unidade.
              </div>
            )}
          </div>

          <div className="unidades-medida-tab__delete-botoes">
            <button
              onClick={() => setDeleteInfo(null)}
              disabled={deletando}
              className="unidades-medida-tab__delete-cancelar"
              style={{ borderColor: varColor(C.border), cursor: deletando ? "not-allowed" : "pointer", opacity: deletando ? 0.5 : 1 }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmarRemover}
              disabled={deletando}
              className="unidades-medida-tab__delete-confirmar"
              style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}
            >
              {deletando ? "Excluindo..." : "Sim, excluir"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

// ── View principal ────────────────────────────────────────────────

const ABAS_CONFIG = [
  { id: "geral",            label: "Geral",               adminOnly: false },
  { id: "usuarios",         label: "Usuários",            adminOnly: false },
  { id: "meios_pagamento",  label: "Meios de Pagamento",  adminOnly: false },
  { id: "unidades_medida",  label: "Unidades de Medida",  adminOnly: false },
  { id: "mesas",            label: "Mesas",               gerenteOnly: true },
  { id: "categorias",       label: "Grupos de Categoria", gerenteOnly: true },
  { id: "impressao",        label: "Impressão",           adminOnly: true  },
  { id: "importar",         label: "Importar / Exportar", adminOnly: true  },
];

function GeralTab({ sz }) {
  const { taxaServico, setTaxaServico, diasAlertaValidade, setDiasAlertaValidade } = useApp();
  const [saving, setSaving] = useState(false);
  const [dias, setDias] = useState(String(diasAlertaValidade ?? 7));
  const [savingDias, setSavingDias] = useState(false);

  useEffect(() => { setDias(String(diasAlertaValidade ?? 7)); }, [diasAlertaValidade]);

  const handleToggle = async () => {
    setSaving(true);
    await setTaxaServico(!taxaServico);
    setSaving(false);
  };

  const handleSalvarDias = async () => {
    setSavingDias(true);
    await setDiasAlertaValidade(dias);
    setSavingDias(false);
  };

  const diasNum = Number(dias);
  const diasValido = Number.isFinite(diasNum) && diasNum >= 1 && diasNum <= 365;
  const diasAlterado = String(diasAlertaValidade ?? 7) !== String(dias).trim();

  return (
    <div className="geral-tab">
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Taxa de Serviço</div>
          <div className="geral-tab__ajuda">
            Cobra automaticamente 10% de taxa de serviço no fechamento
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className="geral-tab__toggle"
          style={{
            background: taxaServico ? varColor(C.green) : varColor(C.faint),
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          <span className="geral-tab__toggle-bolinha" style={{ left: taxaServico ? 29 : 3 }} />
        </button>
      </div>

      {/* C1 — janela de alerta de validade */}
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Alerta de Validade</div>
          <div className="geral-tab__ajuda">
            Avisa no PDV quando um produto está a até esta quantidade de dias de vencer
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            min="1"
            max="365"
            value={dias}
            onChange={e => setDias(e.target.value)}
            className="geral-tab__input-dias"
            style={{
              width: 72, padding: "9px 12px", borderRadius: 10,
              border: `1.5px solid ${diasValido ? varColor(C.border) : varColor(C.red)}`,
              background: varColor(C.surface), color: varColor(C.text),
              fontFamily: "inherit", outline: "none", textAlign: "center",
            }}
          />
          <span className="geral-tab__label-dias" style={{ color: varColor(C.muted) }}>dias</span>
          <button
            onClick={handleSalvarDias}
            disabled={savingDias || !diasValido || !diasAlterado}
            className="geral-tab__btn-salvar-dias"
            style={{
              padding: "9px 16px", borderRadius: 10, border: "none",
              background: (diasValido && diasAlterado && !savingDias) ? varColor(C.accent) : varColor(C.faint),
              color: (diasValido && diasAlterado && !savingDias) ? "#fff" : varColor(C.muted),
              cursor: (diasValido && diasAlterado && !savingDias) ? "pointer" : "not-allowed",
              fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {savingDias ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aba Grupos de Categoria (C3) ──────────────────────────────────
// Mapeia cada categoria de produto (texto livre) a um grupo (comida/bebida/
// cafe…). O Palm usa isso no Radar de Oportunidades. Padrão das outras tabs.
function CategoriasGrupoTab({ sz }) {
  const { products, gruposCategoria, categoriaGrupos, setCategoriaGrupo } = useApp();
  const [salvandoCat, setSalvandoCat] = useState(null);

  // categorias existentes nos produtos (texto livre), únicas e ordenadas
  const categorias = useMemo(
    () => [...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [products],
  );
  const grupoPorCategoria = useMemo(() => {
    const m = {};
    for (const r of categoriaGrupos) m[r.category] = r.grupo_id;
    return m;
  }, [categoriaGrupos]);

  const handleChange = async (category, grupoId) => {
    setSalvandoCat(category);
    await setCategoriaGrupo(category, grupoId === "" ? null : Number(grupoId));
    setSalvandoCat(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm }}>
      <div className="geral-tab__card" style={{ padding: sz.pad, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <div className="geral-tab__titulo">Grupos de Categoria</div>
        <div className="geral-tab__ajuda">
          Associe cada categoria a um grupo. O Palm usa esses grupos para sugerir vendas
          (ex.: comanda com comida e sem bebida).
        </div>
      </div>

      {categorias.length === 0 ? (
        <div className="categorias-grupo-tab__vazio" style={{ padding: sz.pad, color: varColor(C.muted) }}>
          Nenhuma categoria de produto cadastrada ainda.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categorias.map(cat => (
            <div key={cat} className="geral-tab__card" style={{ padding: sz.padSm + 4, gap: sz.padSm }}>
              <div className="categorias-grupo-tab__cat-nome" style={{ flex: 1, fontWeight: 700 }}>{cat}</div>
              <select
                value={grupoPorCategoria[cat] ?? ""}
                onChange={e => handleChange(cat, e.target.value)}
                disabled={salvandoCat === cat}
                className="categorias-grupo-tab__select-grupo"
                style={{
                  padding: "9px 12px", borderRadius: 10,
                  border: `1.5px solid ${grupoPorCategoria[cat] ? varColor(C.accent) : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text),
                  fontFamily: "inherit", outline: "none", cursor: "pointer",
                }}
              >
                <option value="">— sem grupo —</option>
                {gruposCategoria.map(g => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConfiguracoesView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === "admin";
  const isGerente = isAdmin || currentUser?.role === "gerente";
  const [aba, setAba] = useState("geral");

  const abasVisiveis = ABAS_CONFIG.filter(a => (!a.adminOnly || isAdmin) && (!a.gerenteOnly || isGerente));

  return (
    <div className="configuracoes-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="configuracoes-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div className="configuracoes-view__titulo" style={{ fontWeight: 800 }}>Configurações</div>
        <div className="configuracoes-view__subtitulo">
          Gerencie os usuários e configurações do sistema
        </div>

        {/* Tabs */}
        <div className="configuracoes-view__abas" style={{ marginTop: sz.padSm }}>
          {abasVisiveis.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className="configuracoes-view__aba"
              style={{
                background: aba === a.id ? varColor(C.accent) : "transparent",
                color: aba === a.id ? "#fff" : varColor(C.muted),
              }}
            >
              {a.id === "impressao" && <LuPrinter size={13} />}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="configuracoes-view__conteudo" style={{ padding: sz.pad }}>
        {aba === "geral"           && <GeralTab sz={sz} />}
        {aba === "usuarios"        && <UsuariosTab sz={sz} />}
        {aba === "meios_pagamento" && <MeiosPagamentoTab sz={sz} />}
        {aba === "unidades_medida" && <UnidadesMedidaTab sz={sz} />}
        {aba === "mesas"     && isGerente && <MesasAdmin sz={sz} />}
        {aba === "categorias" && isGerente && <CategoriasGrupoTab sz={sz} />}
        {aba === "impressao" && isAdmin && <ConfiguracaoImpressao sz={sz} />}
        {aba === "importar"  && isAdmin && <ImportarExportarTab />}
      </div>
    </div>
  );
}
