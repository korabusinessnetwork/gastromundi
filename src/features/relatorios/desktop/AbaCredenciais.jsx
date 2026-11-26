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
          <div className="rel-aba-rolavel">
            <div className="relatorio-view__cred-topo">
              <div className="relatorio-view__aviso relatorio-view__aviso--perigo">
                <LuShieldAlert size={14} className="relatorio-view__aviso-icone" />
                Área restrita, estas informações são confidenciais. Não compartilhe com terceiros.
              </div>
              <button
                onClick={exportCredenciais}
                title="Exportar PDF"
                className="relatorio-view__export-btn relatorio-view__export-btn--grande"
              >
                <LuPrinter size={14} /> PDF
              </button>
            </div>

            <div className="relatorio-view__cred-moldura">
              <table className="rel-tabela rel-tabela--400">
                <thead>
                  <tr className="rel-linha">
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
                        className="rel-linha rel-linha--destaque"
                      >
                        <Td sz={sz}>
                          <div className="relatorio-view__cred-usuario">
                            <div className="relatorio-view__avatar">
                              {(u.name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span className="rel-forte">{u.name}</span>
                          </div>
                        </Td>
                        <Td sz={sz} muted>@{u.username}</Td>
                        <Td sz={sz}>
                          <span className="relatorio-view__role-badge">
                            {u.role}
                          </span>
                        </Td>
                        <Td sz={sz} right>
                          <span className="relatorio-view__cred-hint">
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
            <div className="relatorio-view__cred-nota">
              Senhas nunca são exibidas aqui, ficam criptografadas e não podem ser lidas por ninguém, nem pelo administrador. Para dar uma nova senha a um funcionário, use <strong>Configurações › Usuários › Redefinir senha</strong>.
            </div>
          </div>
  );
}
