import { useState, useMemo, useEffect } from "react";
import { fecharAoClicarFora } from "@/lib/comum/overlayFechar";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { passwordStrength, sanitizeInput } from "@/utils";
import { criarAuthUsuario, atualizarSenhaAuth, deletarAuthUsuario } from "@/lib/console/adminAuth";
import {
  getPermissions,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_DESCRICOES,
  mesclarPermissoes,
  calcularOverride,
} from "@/constants/roles";
import C from "@/constants/colors";
import { varColor } from "@/lib/tenant/tema";
import { alfa } from "@/constants/colorAlfa";
import { createPortal } from "react-dom";
import { LuEye, LuEyeOff, LuBanknote, LuCreditCard, LuSmartphone, LuZap, LuPlus, LuTrash2, LuWallet, LuX, LuTriangleAlert, LuPrinter, LuBike, LuReceipt, LuPalette } from "react-icons/lu";
import { METODOS_TEF_PADRAO, podeUsarTef } from "@/lib/vendas/tef";
import { LIMITE_SANGRIA_PADRAO } from "@/lib/caixa/caixaMovimentos";
import { logAction } from "@/lib/logger";
import { carregarConfigDelivery, salvarConfigDelivery } from "@/lib/delivery/deliveryAdmin";
import {
  DIAS_SEMANA,
  HORARIO_PADRAO,
  FAIXA_PADRAO,
  normalizarHorario,
  horarioValido,
  resumoHorario,
  deliveryDeveEstarAberto,
} from "@/lib/delivery/deliveryHorario";
import ConfiguracaoImpressao from "../impressao/ConfiguracaoImpressao";
import MesasAdmin from "../mesas/MesasAdmin";
import ImportarExportarTab from "./ImportarExportarTab";
import MinhaAssinaturaTab from "../assinatura/MinhaAssinaturaTab";
import IdentidadeTab from "./IdentidadeTab";
import "./ConfiguracoesView.css";

const ROLES = [
  { id: "admin",   label: "Administrador", color: varColor(C.accent) },
  { id: "gerente", label: "Gerente",       color: varColor(C.blue)   },
  { id: "caixa",   label: "Caixa",         color: varColor(C.green)  },
  { id: "garcom",  label: "Garçom",        color: "#f59e0b"},
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));

// Ordem dos cargos na matriz de permissões (do menor para o maior acesso).
const CARGOS_MATRIZ = ["garcom", "caixa", "gerente", "admin"].map(id => ROLE_MAP[id]);

// Célula-toggle da matriz de permissões (marcado/desmarcado). Alvo grande
// para toque (PDV) e feedback de cor imediato (Princípio nº 1).
function PermCheck({ on, color, disabled, locked, onClick, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-pressed={on}
      className={`perm-check${on ? " perm-check--on" : ""}${disabled ? " perm-check--disabled" : ""}${locked ? " perm-check--locked" : ""}`}
      style={on && !locked ? { borderColor: color, background: alfa(color, "1f"), color } : undefined}
    >
      {on ? "✓" : ""}
    </button>
  );
}


// `permissions` = OVERRIDE do funcionário (parcial ou null). null = segue o cargo.
const EMPTY_USER_FORM = { name: "", username: "", role: "caixa", password: "", confirmPassword: "", permissions: null };

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

// A senha que vai para o Auth passa por `sanitizeInput`, que remove < > " ' `
// e apara espaços das pontas. A barra tem que medir ESSA senha, não a que
// está no campo: medindo a crua ela mostrava "Forte" para `Ab1<<<<`, que na
// prática é `Ab1`. E o aviso existe para o admin não descobrir isso depois.
function StrengthBar({ pwd }) {
  if (!pwd) return null;
  const efetiva = sanitizeInput(pwd, 100);
  const s = passwordStrength(efetiva);
  return (
    <div style={{ marginTop: 8 }}>
      <div className="usuarios-tab__strength-barras">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="usuarios-tab__strength-barra" style={{ background: i <= s.level ? s.color : varColor(C.border) }} />
        ))}
      </div>
      <div className="usuarios-tab__strength-label" style={{ color: s.color, fontWeight: 600 }}>{s.label}</div>
      {efetiva !== pwd && (
        <div className="usuarios-tab__strength-aviso">
          Os caracteres <code>&lt; &gt; " ' `</code> e os espaços das pontas não entram na senha.
          {efetiva ? ` A senha será: ${efetiva.length} caractere${efetiva.length > 1 ? "s" : ""}.` : " Assim ela ficaria vazia."}
        </div>
      )}
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
  if (error?.code === "no_rows_deleted")
    return "Não foi possível excluir: só um administrador pode remover usuários.";
  if (msg.includes("permission denied") || msg.includes("policy"))
    return "Sem permissão para realizar esta ação.";
  return "Erro ao salvar: " + msg;
}

// ── Aba Usuários ──────────────────────────────────────────────────

export function UsuariosTab({ sz }) {
  const { users, currentUser, addUser, updateUser, removeUser, rolePermissions, salvarPermissoesCargo } = useApp();

  const [modal,    setModal]    = useState(null); // null | "novo" | "editar" | "resetpw"
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(EMPTY_USER_FORM);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deletando,setDeletando]= useState(false);
  const [deleteErro, setDeleteErro] = useState("");
  const [salvandoCargo, setSalvandoCargo] = useState(null); // `${role}:${key}` em voo
  const [erroCargo, setErroCargo] = useState("");

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
      permissions: u.permissoesOverride ?? null,
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

    // Base = permissões do cargo; o funcionário grava só o OVERRIDE (diferença
    // do cargo) ou null quando segue o cargo. O app mescla cargo ⊕ override.
    const permissions = form.permissions ?? null;

    setSalvando(true);
    try {
      if (modal === "novo") {
        // Sanitiza ANTES de validar: quem vai para o Auth é `plainPwd`, então é
        // ele que precisa passar pela força mínima e pela confirmação. Validando
        // a senha crua, `Ab1<<<<` passava como "Forte" e o Auth recebia `Ab1` —
        // o insert em `users` ia, a conta de Auth era recusada por senha curta e
        // sobrava um funcionário que nunca conseguia entrar.
        const plainPwd = sanitizeInput(form.password, 100);
        if (!plainPwd) { setErro("Informe uma senha inicial."); setSalvando(false); return; }
        if (plainPwd !== sanitizeInput(form.confirmPassword, 100)) { setErro("As senhas não coincidem."); setSalvando(false); return; }
        if (passwordStrength(plainPwd).level < 2) { setErro("Senha muito fraca."); setSalvando(false); return; }

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
          // Mesma regra do cadastro: valida a senha que realmente vai ao Auth.
          const plainPwd = sanitizeInput(form.password, 100);
          if (plainPwd !== sanitizeInput(form.confirmPassword, 100)) { setErro("As senhas não coincidem."); setSalvando(false); return; }
          if (passwordStrength(plainPwd).level < 2) { setErro("Senha muito fraca."); setSalvando(false); return; }
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
    setDeleteErro("");
    try {
      const userDel = users.find(u => u.id === deleteId);
      // A RLS só deixa admin remover usuário, e o gerente também vê este botão.
      // Os dois retornos eram jogados fora: o modal fechava, o funcionário
      // continuava na lista e ninguém dizia que nada tinha acontecido.
      const { error } = await removeUser(deleteId);
      if (error) { setDeleteErro(traduzirErro(error)); return; }
      // A linha já foi. Se o acesso no Auth não cair junto, sobra um órfão: esse
      // mesmo usuário não pode ser recriado depois (o Auth recusa o e-mail já
      // cadastrado), então isso tem que aparecer em vez de sumir.
      if (userDel?.auth_id) {
        const { error: authErr } = await deletarAuthUsuario(userDel.auth_id);
        if (authErr) {
          setDeleteErro(
            `${userDel.name} saiu da lista, mas o acesso ao sistema não pôde ser apagado (${authErr}) ` +
            "Anote este aviso: para cadastrar esse mesmo usuário de novo, o acesso antigo precisa ser removido primeiro."
          );
        }
      }
    } catch (e) {
      // Nenhuma das duas chamadas deveria rejeitar. Se rejeitar, o `finally`
      // abaixo fecha o modal — e sem esta mensagem a pessoa não veria nada:
      // nem sucesso, nem erro, com o funcionário talvez já removido.
      setDeleteErro(
        `Não foi possível concluir a exclusão: ${e?.message || "erro inesperado"}. ` +
        "Confira a lista antes de tentar de novo."
      );
    } finally {
      // Solta o botão sempre — com o `finally` no lugar, uma falha no meio não
      // deixa mais o "Excluindo..." travado para sempre.
      setDeletando(false);
      setDeleteId(null);
    }
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";
  // Só o admin de verdade grava permissões: a RLS de role_permissions e de
  // users (override) exige gastro_role='admin'. Gerente vê, mas não edita
  // (prevenção de erro — Princípio nº 1: não oferecer o que vai falhar).
  const isAdminReal = currentUser?.role === "admin";

  // Mapa EFETIVO de um cargo neste estabelecimento (matriz do tenant ⊕ default
  // do roles.js). Base para o editor de cargo e para o override do funcionário.
  const mapaDoCargo = (role) => rolePermissions?.[role] || getPermissions(role);

  // Base do cargo escolhido no form + acesso efetivo do funcionário (cargo ⊕
  // override). Usados no editor de override dentro do modal.
  const baseCargoForm = mapaDoCargo(form.role);
  const efetivoForm   = mesclarPermissoes(baseCargoForm, form.permissions);

  // Liga/desliga uma permissão de um CARGO (persiste na matriz do tenant).
  // Admin fica travado (acesso total); só o admin de verdade edita.
  const toggleCargoPerm = async (role, key) => {
    if (!isAdminReal || role === "admin") return;
    const atual = mapaDoCargo(role);
    const desejado = { ...atual, [key]: !atual[key] };
    const marca = `${role}:${key}`;
    setSalvandoCargo(marca);
    setErroCargo("");
    const { error } = await salvarPermissoesCargo(role, desejado);
    setSalvandoCargo(null);
    if (error) setErroCargo(traduzirErro(error));
  };

  // Liga/desliga uma permissão do FUNCIONÁRIO no form. Guarda só o override
  // mínimo (diferença do cargo); volta a null quando iguala o cargo.
  const toggleOverridePerm = (key) => {
    if (!isAdminReal) return;
    const desejado = { ...efetivoForm, [key]: !efetivoForm[key] };
    setF("permissions", calcularOverride(desejado, baseCargoForm));
  };

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

      {/* Editor: Permissões por cargo (matriz do estabelecimento) */}
      <div className="perm-matriz" style={{ padding: sz.pad, gap: sz.padSm }}>
        <div className="perm-matriz__head">
          <div className="perm-matriz__titulo">Permissões por cargo</div>
          <div className="perm-matriz__nota">
            {isAdminReal
              ? "Marque o que cada cargo acessa neste estabelecimento. Vale para todos os funcionários do cargo — exceções por pessoa ficam no cadastro do usuário."
              : "Só o administrador altera as permissões dos cargos. Aqui você confere o que cada um acessa."}
          </div>
        </div>
        <ErrBox msg={erroCargo} />
        <div className="perm-matriz__scroll">
          <table className="perm-matriz__tabela">
            <thead>
              <tr>
                <th className="perm-matriz__th-perm">Permissão</th>
                {CARGOS_MATRIZ.map(r => (
                  <th key={r.id} className="perm-matriz__th-cargo">
                    <span className="perm-matriz__th-cargo-label" style={{ color: r.color }}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_KEYS.map(key => (
                <tr key={key} className="perm-matriz__row">
                  <td className="perm-matriz__perm">
                    <div className="perm-matriz__perm-label">{PERMISSION_LABELS[key]}</div>
                    <div className="perm-matriz__perm-desc">{PERMISSION_DESCRICOES[key]}</div>
                  </td>
                  {CARGOS_MATRIZ.map(r => {
                    const efetivo = mapaDoCargo(r.id);
                    const on = !!efetivo[key];
                    const travado = r.id === "admin"; // admin sempre acesso total
                    const editavel = isAdminReal && !travado;
                    const emVoo = salvandoCargo === `${r.id}:${key}`;
                    return (
                      <td key={r.id} className="perm-matriz__cell">
                        <PermCheck
                          on={on}
                          color={r.color}
                          disabled={!editavel || emVoo}
                          locked={travado}
                          onClick={() => toggleCargoPerm(r.id, key)}
                          titulo={travado ? "O administrador tem acesso total (não editável)" : `${on ? "Remover" : "Dar"} acesso: ${PERMISSION_LABELS[key]}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Aviso da última exclusão que não deu certo — fica em cima da lista,
          que é onde a pessoa olha para saber se o funcionário saiu ou não. */}
      {deleteErro && (
        <div role="alert">
          <ErrBox msg={deleteErro} />
        </div>
      )}

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
                          onClick={() => { setDeleteErro(""); setDeleteId(u.id); }}
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

            {/* Permissões específicas deste funcionário (override sobre o cargo) */}
            <div className="perm-override">
              <div className="perm-override__head">
                <div>
                  <div className="perm-override__titulo">Acesso deste funcionário</div>
                  <div className="perm-override__sub">
                    {form.permissions
                      ? "Personalizado — difere do cargo em algumas permissões."
                      : `Segue o cargo ${ROLE_MAP[form.role]?.label ?? form.role}. Ajuste abaixo só se precisar de exceções.`}
                  </div>
                </div>
                {form.permissions && isAdminReal && (
                  <button type="button" className="perm-override__reset" onClick={() => setF("permissions", null)}>
                    Seguir o cargo
                  </button>
                )}
              </div>
              <div className="perm-override__grid">
                {PERMISSION_KEYS.map(key => {
                  const on = !!efetivoForm[key];
                  const custom = !!form.permissions && Object.prototype.hasOwnProperty.call(form.permissions, key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!isAdminReal}
                      onClick={() => toggleOverridePerm(key)}
                      title={PERMISSION_DESCRICOES[key]}
                      aria-pressed={on}
                      className={`perm-override__item${on ? " perm-override__item--on" : ""}${custom ? " perm-override__item--custom" : ""}`}
                    >
                      <span className="perm-override__check">{on ? "✓" : "—"}</span>
                      <span className="perm-override__label">{PERMISSION_LABELS[key]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
        background: active ? alfa(color, "18") : varColor(C.surface),
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
              onBlur={e => e.currentTarget.style.borderColor = "var(--gm-input-border)"}
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
          {/* dinheiro fica de fora: espécie nunca passa por terminal (podeUsarTef) */}
          {todosMetodos.filter((m) => podeUsarTef(m.id)).map((m) => {
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

// Exportada para teste: a exclusão em cascata é destrutiva e precisa ser
// exercitada sozinha, sem arrastar as outras abas de Configurações.
export function UnidadesMedidaTab({ sz }) {
  const { currentUser } = useApp();
  const [unidades,    setUnidades]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [addForms,    setAddForms]    = useState({ estoque: EMPTY_ADD, compra: EMPTY_ADD, consumo: EMPTY_ADD });
  const [salvando,    setSalvando]    = useState({ estoque: false, compra: false, consumo: false });
  const [deleteInfo,  setDeleteInfo]  = useState(null); // { id, nome, abbr, afetados }
  const [deletando,   setDeletando]   = useState(false);
  const [erro,        setErro]        = useState("");

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  useEffect(() => {
    supabase.from("unidades_medida").select("*").order("ordem").order("nome")
      .then(({ data, error }) => {
        // Sem checar o erro, a aba dizia "Nenhuma unidade cadastrada" para uma
        // base cheia — e o usuário recadastrava tudo em cima do que já existe.
        if (error) setErro("Não deu para carregar as unidades. Recarregue a página.");
        else setUnidades(data ?? []);
        setLoading(false);
      });
  }, []);

  const setAddField = (tipo, field, value) =>
    setAddForms(f => ({ ...f, [tipo]: { ...f[tipo], [field]: value } }));

  const adicionar = async (tipo) => {
    const { abbr, nome } = addForms[tipo];
    if (!abbr.trim() || !nome.trim()) return;
    setSalvando(s => ({ ...s, [tipo]: true }));
    setErro("");
    const { data, error } = await supabase
      .from("unidades_medida")
      .insert({ abreviacao: abbr.trim(), nome: nome.trim(), tipo, ordem: 99 })
      .select()
      .single();
    if (error || !data) {
      setErro("Não deu para adicionar a unidade. Tente de novo.");
    } else {
      setUnidades(prev => [...prev, data]);
      setAddForms(f => ({ ...f, [tipo]: EMPTY_ADD }));
    }
    setSalvando(s => ({ ...s, [tipo]: false }));
  };

  /**
   * Abre a confirmação já com a contagem de produtos afetados. Se a contagem
   * falha, NÃO abrimos: o diálogo diria "Nenhum produto utiliza essa unidade"
   * para uma unidade usada no cardápio inteiro, e o usuário confirmaria uma
   * exclusão em cascata achando que não mexia em nada.
   */
  const iniciarRemover = async (unidade) => {
    const abbr = unidade.abreviacao;
    setErro("");
    const { data: produtos, error } = await supabase
      .from("products")
      .select("id, unidade_estoque, unidade_consumo, unidades_compra");
    if (error) {
      setErro("Não deu para verificar quais produtos usam esta unidade. Tente de novo antes de excluir.");
      return;
    }
    const afetados = (produtos || []).filter(p =>
      p.unidade_estoque === abbr ||
      p.unidade_consumo === abbr ||
      (Array.isArray(p.unidades_compra) && p.unidades_compra.some(c => c.unidade === abbr))
    ).length;
    setDeleteInfo({ id: unidade.id, nome: unidade.nome, abbr, afetados });
  };

  /**
   * Exclusão em cascata: desvincula a unidade dos produtos e só então apaga a
   * própria unidade. Cada passo é conferido e o primeiro erro interrompe a
   * cascata — antes, nenhum dos quatro comandos era checado, então uma falha
   * de permissão deixava produtos apontando para uma unidade que a tela
   * dizia ter excluído (a linha sumia da lista mesmo sem ter sumido do banco).
   */
  const confirmarRemover = async () => {
    if (!deleteInfo || deletando) return;
    setDeletando(true);
    setErro("");
    const { abbr } = deleteInfo;
    const falhar = (mensagem) => {
      setErro(mensagem);
      setDeletando(false);
      return false;
    };

    // 1. Desvincula unidade_estoque → volta para string vazia (field not null, mas produtos sem unidade ficam sem config)
    const r1 = await supabase.from("products").update({ unidade_estoque: "" }).eq("unidade_estoque", abbr);
    if (r1.error) return falhar("Não deu para desvincular a unidade de estoque dos produtos. Nada foi excluído.");

    // 2. Limpa unidade_consumo
    const r2 = await supabase.from("products").update({ unidade_consumo: null }).eq("unidade_consumo", abbr);
    if (r2.error) return falhar("Não deu para limpar a unidade de consumo dos produtos. A exclusão foi interrompida.");

    // 3. Remove entradas de unidades_compra que usam essa abreviação
    const { data: comCompra, error: erroCompra } = await supabase
      .from("products")
      .select("id, unidades_compra")
      .not("unidades_compra", "eq", "[]");
    if (erroCompra) return falhar("Não deu para ler as unidades de compra dos produtos. A exclusão foi interrompida.");
    const afetadosCompra = (comCompra || []).filter(p =>
      Array.isArray(p.unidades_compra) && p.unidades_compra.some(c => c.unidade === abbr)
    );
    for (const p of afetadosCompra) {
      const { error } = await supabase
        .from("products")
        .update({ unidades_compra: p.unidades_compra.filter(c => c.unidade !== abbr) })
        .eq("id", p.id);
      if (error) return falhar("Não deu para atualizar as unidades de compra de todos os produtos. A exclusão foi interrompida.");
    }

    // 4. Exclui a unidade
    const { error: erroDelete } = await supabase.from("unidades_medida").delete().eq("id", deleteInfo.id);
    if (erroDelete) return falhar("Os produtos foram desvinculados, mas a unidade não pôde ser excluída. Tente de novo.");

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
      {/* Fora do diálogo: falhas de carga, de adição e da checagem pré-exclusão. */}
      {erro && !deleteInfo && (
        <div className="unidades-medida-tab__erro" role="alert">{erro}</div>
      )}
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
                  style={{ borderColor: form.abbr ? alfa(color, "88") : "var(--gm-input-border)" }}
                />
                <input
                  value={form.nome}
                  onChange={e => setAddField(tipo, "nome", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="Nome completo"
                  maxLength={40}
                  className="unidades-medida-tab__input-nome"
                  style={{ borderColor: form.nome ? alfa(color, "88") : "var(--gm-input-border)" }}
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

          {erro && (
            <div className="unidades-medida-tab__erro" role="alert">{erro}</div>
          )}

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
  // Marca do estabelecimento (nome e logo) — quem responde pela marca é o
  // dono, e a escrita é por RPC de admin (20260914), então a aba acompanha.
  { id: "identidade",       label: "Identidade",          adminOnly: true  },
  { id: "usuarios",         label: "Usuários",            adminOnly: false },
  { id: "meios_pagamento",  label: "Meios de Pagamento",  adminOnly: false },
  { id: "unidades_medida",  label: "Unidades de Medida",  adminOnly: false },
  { id: "mesas",            label: "Mesas",               gerenteOnly: true },
  { id: "delivery",         label: "Delivery",            gerenteOnly: true },
  { id: "categorias",       label: "Radar de Oportunidades", gerenteOnly: true },
  { id: "impressao",        label: "Impressão",           adminOnly: true  },
  { id: "importar",         label: "Importar / Exportar", adminOnly: true  },
  // Assinatura é assunto de quem responde pelo estabelecimento — caixa e
  // garçom não veem (mesmo recorte do banner do topo).
  { id: "assinatura",       label: "Minha assinatura",    gerenteOnly: true },
];

function GeralTab({ sz }) {
  const { taxaServico, setTaxaServico, diasAlertaValidade, setDiasAlertaValidade,
          limiteSangria, setLimiteSangria } = useApp();
  const [saving, setSaving] = useState(false);
  const [dias, setDias] = useState(String(diasAlertaValidade ?? 7));
  const [savingDias, setSavingDias] = useState(false);
  // F005 — o valor é por estabelecimento (decisão 017), nunca cravado na tela.
  const [limite, setLimite] = useState(String(limiteSangria ?? LIMITE_SANGRIA_PADRAO));
  const [savingLimite, setSavingLimite] = useState(false);

  useEffect(() => { setDias(String(diasAlertaValidade ?? 7)); }, [diasAlertaValidade]);
  useEffect(() => { setLimite(String(limiteSangria ?? LIMITE_SANGRIA_PADRAO)); }, [limiteSangria]);

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

  const handleSalvarLimite = async () => {
    setSavingLimite(true);
    await setLimiteSangria(limite);
    setSavingLimite(false);
  };

  const diasNum = Number(dias);
  const diasValido = Number.isFinite(diasNum) && diasNum >= 1 && diasNum <= 365;
  const diasAlterado = String(diasAlertaValidade ?? 7) !== String(dias).trim();

  const limiteNum = Number(limite);
  const limiteValido = Number.isFinite(limiteNum) && limiteNum > 0;
  const limiteAlterado = String(limiteSangria ?? LIMITE_SANGRIA_PADRAO) !== String(limite).trim();
  const podeSalvarLimite = limiteValido && limiteAlterado && !savingLimite;

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
              border: `1.5px solid ${diasValido ? "var(--gm-input-border)" : varColor(C.red)}`,
              background: "var(--gm-input-bg)", color: varColor(C.text),
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

      {/* F005 — limite de retirada sem autorização de gerente */}
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Retirada sem autorização</div>
          <div className="geral-tab__ajuda">
            Acima deste valor, tirar dinheiro do caixa exige a senha de um gerente
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="geral-tab__label-dias" style={{ color: varColor(C.muted) }}>R$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={limite}
            onChange={e => setLimite(e.target.value)}
            aria-label="Limite de retirada sem autorização"
            className="geral-tab__input-limite"
            style={{
              width: 96, padding: "9px 12px", borderRadius: 10,
              border: `1.5px solid ${limiteValido ? "var(--gm-input-border)" : varColor(C.red)}`,
              background: "var(--gm-input-bg)", color: varColor(C.text),
              fontFamily: "inherit", outline: "none", textAlign: "center",
            }}
          />
          <button
            onClick={handleSalvarLimite}
            disabled={!podeSalvarLimite}
            className="geral-tab__btn-salvar-dias"
            style={{
              padding: "9px 16px", borderRadius: 10, border: "none",
              background: podeSalvarLimite ? varColor(C.accent) : varColor(C.faint),
              color: podeSalvarLimite ? "#fff" : varColor(C.muted),
              cursor: podeSalvarLimite ? "pointer" : "not-allowed",
              fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {savingLimite ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Aba Delivery (abertura automática por horário) ────────────────
// Centraliza a configuração do delivery nas Configurações. Por ora: o
// AGENDAMENTO de abertura/fechamento automático (dias da semana + horário).
// Mora em config_delivery.horario; quem reconcilia o flag `aberto` com o
// horário é o app do operador aberto (ver DeliveryView) — sem cron no
// servidor (fase de custo zero). Toda a lógica de horário é pura e testada
// em src/lib/delivery/deliveryHorario.js.
function DeliveryTab({ sz }) {
  const { tenant, currentUser } = useApp();
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
      setHorario(normalizarHorario(base.horario));
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
    setHorario(normalizarHorario(salvo.horario));
    setOkMsg(horario.auto ? "Abertura automática salva." : "Abertura automática desligada.");
    logAction(currentUser?.username, "delivery:horario", {
      msg: horario.auto ? `Delivery automático: ${preview || "configurado"}` : "Delivery automático desligado",
      name: currentUser?.name,
      role: currentUser?.role,
    });
  };

  if (carregando || !horario) {
    return <div className="delivery-tab__estado" style={{ padding: sz.pad }}>Carregando…</div>;
  }

  return (
    <div className="geral-tab">
      {/* Liga/desliga o agendamento */}
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Abrir e fechar automaticamente</div>
          <div className="geral-tab__ajuda">
            O delivery abre e fecha sozinho nos dias e horários escolhidos.
            Deixe desligado para controlar na mão pelo botão do delivery.
          </div>
        </div>
        <button
          type="button"
          onClick={alternarAuto}
          className="geral-tab__toggle"
          style={{ background: horario.auto ? varColor(C.green) : varColor(C.faint), cursor: "pointer" }}
          aria-pressed={horario.auto}
          aria-label="Abrir e fechar o delivery automaticamente"
        >
          <span className="geral-tab__toggle-bolinha" style={{ left: horario.auto ? 29 : 3 }} />
        </button>
      </div>

      {horario.auto && (
        <div className="geral-tab__card delivery-tab__detalhes" style={{ padding: sz.pad }}>
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
                <div className="delivery-tab__faixa" key={i}>
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
          style={{
            background: podeSalvar ? varColor(C.accent) : varColor(C.faint),
            color: podeSalvar ? "#fff" : varColor(C.muted),
            cursor: podeSalvar ? "pointer" : "not-allowed",
          }}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ── Aba Grupos de Categoria (C3) ──────────────────────────────────
// Mapeia cada categoria de produto (texto livre) a um grupo (comida/bebida/
// sobremesa/cafe…). O Palm usa isso no Radar de Oportunidades para sugerir a
// venda que falta (comida sem bebida, comida sem sobremesa). Padrão das outras
// tabs. Os grupos disponíveis vêm de grupos_categoria (semeados por tenant).
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
        <div className="geral-tab__titulo">Radar de Oportunidades</div>
        <div className="geral-tab__ajuda">
          Defina o que é comida, bebida e sobremesa: associe cada categoria a um grupo.
          O Palm usa isso no Painel do garçom para avisar a venda que falta (ex.:
          "pediu comida e não pediu bebida e sobremesa"). Categoria sem grupo é
          ignorada pelo radar.
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
                  border: `1.5px solid ${grupoPorCategoria[cat] ? varColor(C.accent) : "var(--gm-input-border)"}`,
                  background: "var(--gm-input-bg)", color: varColor(C.text),
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
              {a.id === "identidade" && <LuPalette size={13} />}
              {a.id === "impressao" && <LuPrinter size={13} />}
              {a.id === "delivery" && <LuBike size={13} />}
              {a.id === "assinatura" && <LuReceipt size={13} />}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="configuracoes-view__conteudo" style={{ padding: sz.pad }}>
        {aba === "geral"           && <GeralTab sz={sz} />}
        {aba === "identidade" && isAdmin && <IdentidadeTab />}
        {aba === "usuarios"        && <UsuariosTab sz={sz} />}
        {aba === "meios_pagamento" && <MeiosPagamentoTab sz={sz} />}
        {aba === "unidades_medida" && <UnidadesMedidaTab sz={sz} />}
        {aba === "mesas"     && isGerente && <MesasAdmin sz={sz} />}
        {aba === "delivery"  && isGerente && <DeliveryTab sz={sz} />}
        {aba === "categorias" && isGerente && <CategoriasGrupoTab sz={sz} />}
        {aba === "impressao" && isAdmin && <ConfiguracaoImpressao sz={sz} />}
        {aba === "importar"  && isAdmin && <ImportarExportarTab />}
        {aba === "assinatura" && isGerente && <MinhaAssinaturaTab />}
      </div>
    </div>
  );
}
