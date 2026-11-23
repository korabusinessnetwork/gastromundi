import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuShieldAlert, LuPrinter
} from "react-icons/lu";
import Th from "./Th";
import Td from "./Td";

// Aba Credenciais: os acessos da equipe.
export default function AbaCredenciais({ tela }) {
  const {
    users, sz, exportCredenciais,
  } = tela;
  return (
          <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: sz.pad }}>
              <div className="relatorio-view__aviso" style={{
                flex: 1, background: `${alfa(C.red, "10")}`, border: `1px solid ${alfa(C.red, "33")}`,
                borderRadius: 12, padding: "12px 16px",
                color: varColor(C.red), fontWeight: 600,
              }}>
                <LuShieldAlert size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Área restrita, estas informações são confidenciais. Não compartilhe com terceiros.
              </div>
              <button
                onClick={exportCredenciais}
                title="Exportar PDF"
                className="relatorio-view__export-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", borderRadius: 10, flexShrink: 0,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer",
                  fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <LuPrinter size={14} /> PDF
              </button>
            </div>

            <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                    <Th>Usuário</Th>
                    <Th>Login</Th>
                    <Th>Cargo</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    return (
                      <tr
                        key={u.id}
                        onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                      >
                        <Td sz={sz}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="relatorio-view__avatar" style={{
                              width: 32, height: 32, borderRadius: 16,
                              background: varColor(C.accent), color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, flexShrink: 0,
                            }}>
                              {(u.name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 700 }}>{u.name}</span>
                          </div>
                        </Td>
                        <Td sz={sz} muted>@{u.username}</Td>
                        <Td sz={sz}>
                          <span className="relatorio-view__role-badge" style={{
                            fontWeight: 700,
                            background: varColor(C.surface), padding: "3px 10px",
                            borderRadius: 20, color: varColor(C.muted),
                          }}>
                            {u.role}
                          </span>
                        </Td>
                        <Td sz={sz} right>
                          <span className="relatorio-view__cred-hint" style={{ color: varColor(C.muted), fontStyle: "italic" }}>
                            redefinir em Configurações
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/*
              A nota antiga ("redefina-as para que apareçam aqui") prometia
              mostrar senha na tela — o relatório de testes leu isso como
              senha guardada em texto puro. Não é, e nunca vai ser: a senha
              só existe como hash no Supabase Auth e é conferida no servidor
              (`verificar_senha_admin`). Esta aba lista QUEM tem acesso, não
              com o quê.
            */}
            <div className="relatorio-view__cred-nota" style={{ marginTop: 12, color: varColor(C.muted) }}>
              Senhas nunca são exibidas aqui, ficam criptografadas e não podem ser lidas por ninguém, nem pelo administrador. Para dar uma nova senha a um funcionário, use <strong>Configurações › Usuários › Redefinir senha</strong>.
            </div>
          </div>
  );
}
