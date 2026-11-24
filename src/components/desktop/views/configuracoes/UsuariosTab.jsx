import { useState } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useSessao } from "@/context/AppContext";
import { passwordStrength, sanitizeInput } from "@/utils";
import { criarAuthUsuario, atualizarSenhaAuth, deletarAuthUsuario } from "@/lib/adminAuth";
import { getPermissions, PERMISSION_KEYS, PERMISSION_LABELS, PERMISSION_DESCRICOES, mesclarPermissoes, calcularOverride, ehGerencia } from "@/constants/roles";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuEye, LuEyeOff } from "react-icons/lu";
import PermCheck from "./PermCheck";
import RoleBadge from "./RoleBadge";
import Avatar from "./Avatar";
import Field from "./Field";
import TextInput from "./TextInput";
import StrengthBar from "./StrengthBar";
import ErrBox from "./ErrBox";
import { ROLES, ROLE_MAP, CARGOS_MATRIZ, EMPTY_USER_FORM, traduzirErro } from "./apoio";

export default function UsuariosTab({ sz }) {
  const { users, currentUser, addUser, updateUser, removeUser, rolePermissions, salvarPermissoesCargo } = useSessao();

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

  const isAdmin = ehGerencia(currentUser);
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
              ? "Marque o que cada cargo acessa neste estabelecimento. Vale para todos os funcionários do cargo, exceções por pessoa ficam no cadastro do usuário."
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
                // TD015: cabeçalho literal da tabela de usuários, não vem de dado.
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

            {/* O navegador reconhecia este par login+senha como a tela de login
                e preenchia sozinho com o usuário logado: quem abria "Novo
                Usuário" via "matheus" já escrito no campo, editável e válido —
                a um clique de sobrescrever a própria conta de admin. Campo de
                cadastro novo nunca pode vir preenchido com uma identidade que
                já existe. */}
            <Field label="Usuário (login) *">
              <TextInput
                value={form.username}
                onChange={v => setF("username", v.toLowerCase())}
                placeholder="Ex: joao"
                maxLength={30}
                sz={sz}
                name="novo-usuario-login"
                autoComplete="off"
                ignorarGerenciadorDeSenha
              />
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
                      ? "Personalizado, difere do cargo em algumas permissões."
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
                      name="novo-usuario-senha"
                      autoComplete="new-password"
                      ignorarGerenciadorDeSenha
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
                      name="novo-usuario-senha-confirmacao"
                      autoComplete="new-password"
                      ignorarGerenciadorDeSenha
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
