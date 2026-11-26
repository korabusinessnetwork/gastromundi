import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SessaoContext } from "./SessaoContext";
import { getPermissions, mesclarPermissoes, ROLES } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { obterSessaoAuth, entrarComSenha, sairDoAuth, aoMudarSessaoAuth } from "@/features/sessao/dados/auth";
import {
  buscarUsuarioAtivoPorAuth, criarUsuario, atualizarUsuario, excluirUsuario, salvarPermissoesDoCargo
} from "@/features/sessao/dados/usuarios";
import { moduloHabilitado, addonHabilitado } from "@/features/tenant/dados/tenant";
import { emailDoLogin } from "@/lib/tenantSlug";
import { consultarBloqueio, registrarFalha, registrarSucesso } from "@/features/sessao/dados/loginTentativas";
import { ehConsoleHost } from "@/features/console/regras/consoleHost";
import { gerarVariaveisTema, aplicarVariaveisTema, limparVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant, logoUrlTenant } from "@/lib/tema";
import { layoutDoTema, varianteDoHorario, temTrocaAutomatica, variaveisDoLayout, msAteProximaTroca } from "@/layouts";
import { salvarBrandingCache } from "@/lib/brandingCache";
import { logAction } from "@/features/auditoria/dados/logger";
import { sanitizeInput } from "@/utils/crypto";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarInconsistencia } from "@/lib/observabilidade";
import { separarCampos, COLUNAS_ESCRITA_USERS } from "@/lib/camposPermitidos";
import AvisoSessao from "@/components/shared/AvisoSessao";
import {
  saveSession, loadSession, clearSession, lerSessao, atualizarUsuarioSessao, msRestantesDaSessao, esquecerTokenAuthLocal, perfilInativoConfirmado, getAttempts, setAttempts, clearAttempts, IDLE_MS, MAX_ATTEMPTS, LOCKOUT_MS, AVISO_INATIVIDADE_MS
} from "@/utils/session";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";

/**
 * Dono da sessão (tarefa 2.9 do plano de refatoração): quem está logado, a
 * equipe, o estabelecimento (tenant, plano, assinatura, tema), as permissões
 * por cargo, o login, o logout, a inatividade e o teto de 8 horas, e o
 * cadastro de usuários.
 *
 * Fica por fora de todos os outros provedores: catálogo, comandas e caixa
 * leem o usuário logado por `useSessao()`. A CARGA dos dados do
 * estabelecimento não mora aqui, mora na coordenação do `AppProvider`; o
 * login e a restauração da sessão a disparam por `carregarRef`, e ela devolve
 * equipe, estabelecimento e permissões pelo canal interno `useSessaoCarga()`.
 */

/** Colunas de `users` que o app lê. A carga e as escritas de usuário usam as mesmas. */
export const COLUNAS_USERS = "id,name,username,role,auth_id,active";

const SessaoCargaContext = createContext(null);

export function useSessaoCarga() {
  const ctx = useContext(SessaoCargaContext);
  if (!ctx) throw new Error("useSessaoCarga deve ser usado dentro de <SessaoProvider>");
  return ctx;
}

export function SessaoProvider({ tenantIdRef, carregarRef, permsColunaIndisponivelRef, children }) {
  const [users,       setUsersLocal]       = useState([]);
  const [tenant,          setTenantLocal]         = useState(null); // Fase 1 — camada de comercialização (ADR-005)
  const [rolePermissions, setRolePermissionsLocal] = useState({});
  const [loading,       setLoading]          = useState(true);

  // ── Auth ─────────────────────────────────────────────────────
  // `lerSessao` em vez de `loadSession` porque um inicializador de estado não
  // deve ter efeito colateral: quem apaga a sessão vencida é o efeito de
  // restauração abaixo, que também precisa SABER que ela venceu para derrubar
  // a sessão do Supabase Auth junto.
  const [currentUser,  setCurrentUser]  = useState(() => lerSessao().user);
  // tenant_id do JWT da sessão atual — fonte confiável e disponível offline
  // (o `currentUser` de `users` NÃO traz tenant_id). Usado para carimbar e
  // validar os caches locais (snapshot/fila), isolando estabelecimentos que
  // porventura dividam a mesma origem de navegador (preview/IP/apex).

  const isMobile = useIsMobile();

  // Os dois cronômetros de segurança abaixo precisam de um callback com
  // identidade ESTÁVEL: quando ela troca, o efeito remonta e a contagem volta
  // ao zero. O callback antigo dependia de `currentUser`, que troca de
  // identidade a cada refresh da lista de usuários (efeito [users]) — então num
  // turno movimentado os 30 minutos de inatividade nunca chegavam ao fim.
  // O ref sempre aponta para o `logout` da última renderização.
  const logoutRef = useRef(null);
  const logoutCallback = useCallback(() => { logoutRef.current?.(); }, []);
  // Aviso 2 minutos antes de a inatividade derrubar a sessão. O callback é
  // estável pela mesma razão do `logoutCallback`: se mudar de identidade, o
  // cronômetro reinicia e ninguém nunca chega aos 30 minutos.
  const [avisoSessaoVisivel, setAvisoSessaoVisivel] = useState(false);
  const aoAvisarSessao = useCallback((visivel) => setAvisoSessaoVisivel(visivel), []);
  useIdleTimer(logoutCallback, IDLE_MS, !!currentUser, aoAvisarSessao, AVISO_INATIVIDADE_MS);

  // Teto absoluto da sessão: 8 horas contadas do login. O `lerSessao` só é
  // consultado ao carregar a página, então numa aba aberta o turno inteiro — o
  // caso normal do PDV — o teto nunca chegava a valer. Aqui ele corre em
  // memória e desloga na hora. Depende do `id`, não do objeto, para que o
  // refresh da lista de usuários não reagende nada.
  useEffect(() => {
    if (!currentUser) return;
    const restante = msRestantesDaSessao();
    if (restante === null) return;
    if (restante === 0) { logoutRef.current?.(); return; }
    const t = setTimeout(() => logoutRef.current?.(), restante);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- o prazo da sessão recomeça só quando muda quem está logado, não a cada atualização dos dados do mesmo usuário
  }, [currentUser?.id]);

  // ── Restaura sessão do Supabase Auth ao carregar ─────────────
  useEffect(() => {
    obterSessaoAuth().then(async ({ data: { session } }) => {
      if (session && lerSessao().estado === "expirada") {
        // Teto de 8 horas vencido. O refresh token do Supabase vive muito mais
        // que isso, então sem este ramo bastava dar F5 para o `saveSession`
        // logo abaixo carimbar um `at` novo e o teto nunca valer nada. Derruba
        // a sessão do Auth também, senão o próximo carregamento reabre tudo.
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
        await sairDoAuth();
        setLoading(false);
        return;
      }
      if (session) {
        tenantIdRef.current = session.user?.app_metadata?.tenant_id ?? null;
        const { usuario: userData, erro: erroPerfil } = await buscarDadosUsuario(session.user.id);
        if (userData) {
          setCurrentUser(userData);
          // Preserva o relógio quando esta aba já tem sessão; só carimba um
          // `at` novo quando é aba nova (aí é começo de sessão de verdade).
          if (!atualizarUsuarioSessao(userData)) saveSession(userData);
          await carregarRef.current();
        } else if (loadSession() && (isErroDeRede(erroPerfil) || (typeof navigator !== "undefined" && navigator.onLine === false))) {
          // Sem internet a busca do usuário falha mesmo com sessão válida.
          // A sessão local basta para operar: o bootstrap hidrata do
          // snapshot e o app segue offline em vez de travar no login.
          //
          // São dois sinais porque só o do navegador não pega o caso mais
          // comum do restaurante: roteador de pé e link do provedor caído. Aí
          // `navigator.onLine` continua `true` e quem denuncia a queda é o
          // próprio erro desta leitura, que saiu pelo mesmo caminho de rede
          // que todas as outras. Sem isso o app parava aqui, o bootstrap nunca
          // rodava e nada carimbava "abriu sem internet".
          //
          // Erro que NÃO é de rede (o banco respondeu, só não achou usuário
          // ativo) segue caindo nos ramos de baixo: este ramo nunca decide
          // conta desativada, e falha de rede nunca vira logout.
          await carregarRef.current();
        } else if (perfilInativoConfirmado(erroPerfil)) {
          // O JWT ainda vale, mas o banco respondeu com CERTEZA que não há
          // usuário ativo para ele: a conta foi desativada (ou apagada) desde
          // o login. Antes este ramo só fazia `setLoading(false)` — e como o
          // `currentUser` é semeado do sessionStorage lá em cima, a pessoa
          // desativada seguia com a tela montada e as permissões antigas até
          // fechar a aba (o PrivateRoute só olha `currentUser`). Derrubar o
          // token junto é o que impede o F5 de reabrir tudo.
          tenantIdRef.current = null;
          setCurrentUser(null);
          clearSession();
          await sairDoAuth();
          setLoading(false);
        } else {
          // Não deu para ler o perfil (rede/servidor). Não dá para afirmar que
          // a conta caiu, então a sessão fica de pé — derrubar aqui viraria
          // logout aleatório no meio do turno.
          setLoading(false);
        }
      } else if (loadSession() && typeof navigator !== "undefined" && navigator.onLine === false) {
        // Offline: o getSession pode devolver null só porque não conseguiu
        // renovar o token. A sessão local é justamente o que mantém o PDV
        // operando do snapshot, então ela fica e o bootstrap hidrata do cache.
        await carregarRef.current();
      } else {
        // Sem sessão no Supabase Auth e com rede: o `currentUser` semeado do
        // sessionStorage (linha 119, para a tela abrir sem piscar) está morto.
        // Sem JWT nenhuma leitura passa pela RLS, então o app renderizava
        // "logado" com tudo vazio — e ninguém limpava esse estado, porque num
        // carregamento sem sessão o supabase-js emite `INITIAL_SESSION`, e o
        // onAuthStateChange abaixo só reage a `SIGNED_OUT`. Limpar aqui joga
        // a pessoa de volta ao login, que é o estado verdadeiro.
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
        setLoading(false);
      }
    }).catch((err) => {
      // Restaurar a sessão pode rejeitar (refresh de token expirado, falha de
      // rede no getSession, throw dentro do bootstrap). Sem este catch a
      // rejeição escapa como `unhandledrejection` global (Sentry KORA-2) na
      // porta de entrada. Degrada para deslogado: a tela de login segue
      // funcionando e a autenticação real continua protegida por Auth + RLS.
      console.error("[auth] falha ao restaurar sessão:", err?.message ?? err);
      setLoading(false);
    });

    const { data: { subscription } } = aoMudarSessaoAuth(async (event) => {
      if (event === "SIGNED_OUT") {
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a escuta da autenticação é montada uma vez; ela lê o estado atual pelas referências (`carregarRef`, `tenantIdRef`)
  }, []);

  // Busca nome, role e permissions do usuário pelo auth_id.
  // No login a matriz do tenant ainda não carregou, então a base é o default
  // do roles.js; o override do funcionário (users.permissions) é mesclado por
  // cima. O efeito [users] refina para a matriz do tenant assim que o
  // bootstrap termina. Resiliente à coluna ausente (migration 20260828 não
  // aplicada, erro 42703): repete o select sem ela e desliga o override.
  // Devolve `{ usuario, erro }` em vez de só o usuário: sem o erro, quem chama
  // não consegue separar "não existe usuário ativo com este auth_id" (conta
  // desativada → derrubar a sessão) de "a leitura falhou" (rede instável →
  // manter). Ver `perfilInativoConfirmado`.
  async function buscarDadosUsuario(authId) {
    const selecionar = (cols) =>
      buscarUsuarioAtivoPorAuth(authId, cols);
    let { data, error } = await selecionar("id,name,username,role,auth_id,permissions");
    if (error?.code === "42703") {
      permsColunaIndisponivelRef.current = true;
      ({ data, error } = await selecionar("id,name,username,role,auth_id"));
    }
    if (!data) return { usuario: null, erro: error ?? null };
    const override = data.permissions ?? null;
    return {
      usuario: {
        ...data,
        permissoesOverride: override,
        permissions: mesclarPermissoes(getPermissions(data.role), override),
      },
      erro: null,
    };
  }

  // Mapa de permissões de um cargo, ciente do tenant. Fallback total no
  // roles.js quando a matriz ainda não carregou (login) ou o cargo não foi
  // customizado neste estabelecimento.
  const mapaDoCargo = (role) => rolePermissions[role] || getPermissions(role);

  // Colunas de retorno das ESCRITAS em `users`. `.select()` sem argumento é
  // `select *`, que o CLAUDE.md proíbe em tabela sensível: trazia de volta
  // tudo que a linha tiver, incluindo o que a tela nem usa (hoje `tenant_id`,
  // amanhã o que a próxima migration acrescentar). `permissions` entra só
  // quando a migration 20260828 já rodou, mesmo critério de `buscarUsers`.
  const colunasRetornoUsers = () =>
    permsColunaIndisponivelRef.current ? COLUNAS_USERS : `${COLUNAS_USERS},permissions`;

  // ── Atualiza currentUser quando a lista de usuários muda ──────
  // A linha em `users` já traz o mapa EFETIVO (cargo do tenant ⊕ override do
  // funcionário), calculado ao montar a lista. Preserva esse `permissions` —
  // recomputar pelo roles.js aqui apagaria a matriz do tenant e o override.
  useEffect(() => {
    if (!currentUser) return;
    const updated = users.find(u => u.id === currentUser.id);
    if (updated) {
      setCurrentUser(updated);
      // Atualiza os dados SEM tocar no relógio: com `saveSession` aqui, todo
      // refresh da lista de usuários renovava a sessão e o teto de 8 horas
      // nunca vencia numa aba aberta o dia inteiro.
      atualizarUsuarioSessao(updated);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reflete a lista de usuários recarregada no usuário logado; depender de `currentUser` faria o efeito rodar de novo a cada troca que ele mesmo faz
  }, [users]);

  // ── Fase 6 — camada de comercialização (ADR-007): aplica o tema do
  //    tenant (--gm-*) assim que `tenant.tema` é conhecido, em camadas:
  //    defaults do tema.css → variante do layout (`tema.layout`,
  //    src/layouts) → overrides finos do tenant por cima. Sem layout e
  //    sem tema custom, nada é sobrescrito — aparência atual intacta.
  const [varianteLayout, setVarianteLayout] = useState(() => varianteDoHorario(new Date().getHours()));

  useEffect(() => {
    // Antes do tenant carregar, quem manda é a pintura anti-flash (cache do
    // index.html / LoginPage) — limpar aqui apagaria essa pintura e faria a
    // tela piscar o visual default até o bootstrap responder.
    if (!tenant) return;
    // No host do Console (plataforma), a marca é SEMPRE neutra da KORA: nunca
    // aplicar tema/título/cache de tenant aqui — senão a marca de um
    // estabelecimento (ex.: "GASTROMUNDI by Kora") vaza na aba/visual do
    // console. Limpa qualquer token --gm-* órfão e fixa o título neutro.
    if (ehConsoleHost()) {
      limparVariaveisTema();
      if (typeof document !== "undefined") document.title = "KORA · Console";
      return;
    }
    const codigoLayout = layoutDoTema(tenant.tema);
    const variaveis = {
      ...variaveisDoLayout(codigoLayout, varianteLayout),
      ...gerarVariaveisTema(tenant.tema),
    };
    // Limpa o que a aplicação anterior setou (troca de layout/variante
    // não pode herdar tokens órfãos) e aplica o merge da vez.
    limparVariaveisTema();
    aplicarVariaveisTema(variaveis);
    // Aba do navegador com a marca do tenant (white-label).
    const nome = nomeExibicaoTenant(tenant.tema, tenant.nome);
    aplicarTituloDocumento(nome);
    // Cache por origem (anti-flash): a próxima abertura deste endereço
    // já pinta com esta marca antes do bootstrap (script do index.html).
    salvarBrandingCache({ nome, logo: logoUrlTenant(tenant.tema), variaveis });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só o tema e o layout mudam a marca na tela; o resto do estabelecimento não pede repintar
  }, [tenant?.tema, varianteLayout]);

  // ── Timer dia/noite dos layouts adaptativos (marca, casa): arma um
  //    despertar para a próxima fronteira (06:00/19:00). Ao disparar, a
  //    variante muda, o efeito acima repinta e este efeito re-arma a
  //    fronteira seguinte. Layout fixo não arma nada.
  useEffect(() => {
    if (!temTrocaAutomatica(layoutDoTema(tenant?.tema))) return;
    const timer = setTimeout(() => {
      setVarianteLayout(varianteDoHorario(new Date().getHours()));
    }, msAteProximaTroca(new Date()));
    return () => clearTimeout(timer);
  }, [tenant?.tema, varianteLayout]);

  // ── Actions: Auth ─────────────────────────────────────────────
  const login = async (username, password) => {
    const clean = sanitizeInput(username);
    const att   = getAttempts(clean);

    // O contador local responde na hora e não custa viagem, então ele continua
    // sendo a primeira parada. Ele não é mais a barreira, é o eco da última
    // resposta do servidor: quem limpar o storage passa daqui e esbarra na
    // consulta abaixo, que é a que decide de verdade (TD008).
    if (att.lockedUntil && att.lockedUntil > Date.now()) {
      const secs = Math.ceil((att.lockedUntil - Date.now()) / 1000);
      return { error: `Conta bloqueada. Aguarde ${secs}s.` };
    }

    // Supabase Auth valida a senha no servidor — sem hash no cliente.
    // E-mail com namespace por tenant (slug do subdomínio) para permitir o
    // mesmo username em tenants diferentes. Fallback 'gastromundi' quando
    // não há subdomínio (dev/preview/domínio nu) — inerte por design.
    const email = emailDoLogin(clean);
    // Endereço de acesso que não forma um namespace válido (subdomínio com
    // caractere estranho, fallback mal configurado): não é erro de senha, então
    // não consome tentativa nem vai à rede — e a mensagem fala do endereço, não
    // da credencial.
    if (!email) return { error: "Endereço de acesso inválido. Confira o link do estabelecimento." };

    // A barreira de verdade: o contador do banco, que o navegador não alcança.
    // Vem antes do `signInWithPassword` para bloqueio não gastar viagem à rede
    // de auth. Se a RPC não responder, `disponivel` vem false e o login segue
    // pelo contador local, como era antes (falha aberta, decisão do spec).
    const bloqueio = await consultarBloqueio(email);
    if (bloqueio.disponivel && bloqueio.bloqueado) {
      setAttempts(clean, { count: MAX_ATTEMPTS, lockedUntil: Date.now() + bloqueio.segundos * 1000 });
      return { error: `Conta bloqueada. Aguarde ${bloqueio.segundos}s.` };
    }

    const { data: authData, error: authError } = await entrarComSenha(email, sanitizeInput(password, 100));

    if (authError) {
      // Quem conta é o servidor; o local só guarda o que ele respondeu, para os
      // pips da tela terem o número certo antes da próxima ida ao banco.
      const servidor = await registrarFalha(email);
      const count = servidor.disponivel && servidor.restantes !== null
        ? MAX_ATTEMPTS - servidor.restantes
        : (att.count || 0) + 1;
      const lockedUntil = servidor.disponivel
        ? (servidor.bloqueado ? Date.now() + servidor.segundos * 1000 : null)
        : (count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null);

      setAttempts(clean, { count, lockedUntil });
      if (lockedUntil) return { error: "Muitas tentativas. Bloqueado por 2 minutos." };
      return { error: `Usuário ou senha incorretos. ${Math.max(MAX_ATTEMPTS - count, 0)} tentativa(s) restante(s).` };
    }

    // Senha certa: zera o contador do servidor. Só agora dá para chamar, porque
    // a função tira a identidade do token da sessão que acabou de nascer.
    registrarSucesso();

    const { usuario: userData } = await buscarDadosUsuario(authData.user.id);
    if (!userData) {
      await sairDoAuth();
      return { error: "Usuário não encontrado ou inativo." };
    }

    clearAttempts(clean);
    tenantIdRef.current = authData.user?.app_metadata?.tenant_id ?? null;
    setCurrentUser(userData);
    saveSession(userData);
    logAction(userData.username, "auth:login", { msg: `Login realizado · ${userData.role}`, name: userData.name, role: userData.role });
    await carregarRef.current();
    return { ok: true };
  };

  const logout = async () => {
    if (currentUser) logAction(currentUser.username, "auth:logout", { msg: "Sessão encerrada", name: currentUser.name, role: currentUser.role });
    // A tela volta para o login na hora — quem clicou em "Sair" não deve
    // esperar a rede para ver que saiu.
    setCurrentUser(null);
    clearSession();
    // Mas o que autoriza qualquer leitura no banco é o token do Supabase, no
    // localStorage deste navegador. Sem internet ou com o servidor fora, o
    // `signOut` devolve { error } e sai ANTES de apagar o token: o próximo
    // carregamento usaria o refresh token para religar a sessão sem pedir
    // senha, e num PDV compartilhado isso é o próximo turno entrando como o
    // anterior. Então, se o servidor não confirmou, apagamos na mão.
    const { error } = await sairDoAuth();
    if (error) esquecerTokenAuthLocal();
    return { error: error ?? null };
  };
  // É por aqui que os cronômetros de inatividade e do teto de 8h chamam o
  // logout: eles guardam um callback estável e leem sempre a versão atual.
  logoutRef.current = logout;

  // ── Actions: Users ────────────────────────────────────────────
  const addUser = async (user) => {
    // omite id (gerado pelo banco). `permissions` agora É persistido: é o
    // OVERRIDE do funcionário (parcial; null = segue o cargo). Se a coluna
    // ainda não existe (migration 20260828 pendente), some do payload
    // (fail-open) e o usuário nasce seguindo o cargo.
    // A allowlist substitui o `const { id: _ignored, ...payload }` que havia
    // aqui: tirar só o `id` deixava passar qualquer outra chave que o objeto
    // trouxesse, `tenant_id` inclusive. Ver src/lib/camposPermitidos.js.
    const { campos: payload, ignorados } = separarCampos(user, COLUNAS_ESCRITA_USERS);
    if (ignorados.length > 0) {
      reportarInconsistencia("escrita com coluna fora da allowlist", { acao: "addUser", tabela: "users", ignorados });
    }
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
    const { data, error } = await criarUsuario(payload, colunasRetornoUsers());
    if (data) setUsersLocal(prev => [...prev, {
      ...data,
      permissoesOverride: data.permissions ?? null,
      permissions: mesclarPermissoes(mapaDoCargo(data.role), data.permissions),
    }]);
    return { data, error };
  };

  const updateUser = async (id, changes) => {
    // `permissions` (override do funcionário) É persistido — a menos que a
    // coluna ainda não exista no banco (fail-open, migration pendente).
    const { campos: payload, ignorados } = separarCampos(changes, COLUNAS_ESCRITA_USERS);
    if (ignorados.length > 0) {
      reportarInconsistencia("escrita com coluna fora da allowlist", { acao: "updateUser", tabela: "users", id, ignorados });
    }
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
    // .select() após o update: PostgREST retorna sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo (ex.: editor aberto para gerente, mas a
    // policy users_update exige admin) OU quando o id não bate. Sem checar
    // as linhas retornadas, a UI "atualizava" o estado local e fingia
    // sucesso sem nada persistir no banco.
    const { data, error } = await atualizarUsuario(id, payload, colunasRetornoUsers());
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "updateUser", tabela: "users", id });
      return {
        error: {
          code: "no_rows_updated",
          message: "Nenhuma linha atualizada, sem permissão (apenas admin edita usuários) ou usuário inexistente.",
        },
      };
    }
    setUsersLocal(prev => prev.map(u => {
      if (u.id !== id) return u;
      // Espelha o que FOI ao banco (payload), não o que o chamador pediu
      // (changes): com a allowlist, os dois podem diferir, e a tela mostrando
      // campo que não foi gravado é o "sucesso falso" que o resto desta
      // função existe para evitar.
      const merged = { ...u, ...payload };
      // Se o override veio nesta edição, adota-o (null = volta a seguir o
      // cargo); senão, preserva o override que o usuário já tinha.
      const override = Object.prototype.hasOwnProperty.call(payload, "permissions")
        ? (payload.permissions ?? null)
        : u.permissoesOverride;
      return {
        ...merged,
        permissoesOverride: override,
        permissions: mesclarPermissoes(mapaDoCargo(merged.role), override),
      };
    }));
    return { error: null, data };
  };

  const removeUser = async (id) => {
    // .select() após o delete: 0 linhas removidas (RLS filtra — apenas admin
    // remove usuários — ou id inexistente) resolve { error: null } no
    // supabase-js. Checar as linhas evita sucesso falso (mesmo padrão do
    // updateUser/cancelarVendaFechada).
    const { data, error } = await excluirUsuario(id);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "removeUser", tabela: "users", id });
      return { error: { code: "no_rows_deleted", message: "Nenhuma linha removida, sem permissão (apenas admin remove usuários) ou usuário inexistente." } };
    }
    setUsersLocal(prev => prev.filter(u => u.id !== id));
    return { error: null };
  };

  // Grava a matriz de permissões de UM cargo para este estabelecimento
  // (upsert por tenant_id+role). `permissoesCompletas` é o mapa inteiro do
  // cargo (todas as chaves booleanas). tenant_id explícito do tenant
  // carregado; a RLS exige tenant_id = tenant_atual_id() (só admin, só o
  // próprio tenant). Recalcula as permissões efetivas de todos os usuários
  // daquele cargo (cargo ⊕ override de cada um) para refletir na hora.
  const salvarPermissoesCargo = async (role, permissoesCompletas) => {
    if (!ROLES[role]) return { error: { message: "Cargo inválido." } };
    if (!tenant?.id) return { error: { message: "Estabelecimento ainda carregando, tente de novo." } };
    const payload = {
      tenant_id: tenant.id,
      role,
      permissions: permissoesCompletas,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await salvarPermissoesDoCargo(payload);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "salvarPermissoesCargo", tabela: "role_permissions", role });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha gravada, só um administrador edita permissões de cargo." } };
    }
    const efetivoCargo = mesclarPermissoes(getPermissions(role), permissoesCompletas);
    const novoMapa = { ...rolePermissions, [role]: efetivoCargo };
    setRolePermissionsLocal(novoMapa);
    setUsersLocal(prev => prev.map(u => (
      u.role !== role ? u : { ...u, permissions: mesclarPermissoes(efetivoCargo, u.permissoesOverride) }
    )));
    return { error: null };
  };

  // Fase 2 — camada de comercialização (ADR-005): única fonte de gating por
  // plano no front. Sidebar/rotas/telas novas devem checar por aqui, nunca
  // comparar tenant.planoCodigo diretamente.
  //
  // Enquanto o plano NÃO é conhecido (`tenant` ainda null: bootstrap em voo,
  // erro ao ler `tenants`/RLS, ou abertura sem internet — o snapshot offline
  // não guarda o plano) a resposta é "pode". Responder "não" aqui mentia para
  // quem paga: toda rota com `requiredModulo` virava "não está no seu plano",
  // a Sidebar escondia os módulos e o hub do Palm perdia os cartões — inclusive
  // a Cozinha, justo no cenário offline que o app promete atender. É a mesma
  // escolha já feita para a assinatura (PrivateRoute só bloqueia quando ela
  // está carregada). Com o plano em mãos, o gating volta a valer normalmente.
  const moduloHabilitadoNoPlano = (modulo) =>
    tenant ? moduloHabilitado(tenant.modulosDisponiveis, modulo) : true;
  // Fase 3 — add-ons pagos (decisão 019): equivalente para NF-e/TEF, que não
  // dependem de plano. Hooks de add-on devem checar por aqui, nunca ler
  // tenant.addonsAtivos diretamente. Add-on segue fail-CLOSED sem tenant: ao
  // contrário de um módulo, emitir NF-e/passar TEF depende do servidor de
  // qualquer jeito, e liberar por engano geraria documento fiscal indevido.
  const addonHabilitadoNoTenant = (addon) => addonHabilitado(tenant?.addonsAtivos, addon);

  // Aplica a identidade recém-salva sem refazer o bootstrap (S1-3).
  // Mescla SÓ `tema`: a linha crua que a RPC devolve não tem o que o
  // `buscarBootstrapTenant` enriquece (assinatura, módulos do plano,
  // add-ons). Trocar o objeto inteiro apagaria isso e derrubaria o gating
  // de módulo e a aba "Minha assinatura" até o próximo F5.
  const aplicarTenantSalvo = useCallback((linhaDoTenant) => {
    if (!linhaDoTenant || typeof linhaDoTenant !== "object") return;
    setTenantLocal((anterior) => (anterior ? { ...anterior, tema: linhaDoTenant.tema ?? null } : anterior));
  }, []);

  // ── Valor memorizado (ver a tarefa 2.2) ─────────────────────────
  // Valor memorizado: só muda quando muda um DADO da sessão. As ações têm
  // identidade fixa (useFuncaoEstavel) e chamam sempre a versão atual.
  const loginEstavel                 = useFuncaoEstavel(login);
  const logoutEstavel                = useFuncaoEstavel(logout);
  const addUserEstavel               = useFuncaoEstavel(addUser);
  const updateUserEstavel            = useFuncaoEstavel(updateUser);
  const removeUserEstavel            = useFuncaoEstavel(removeUser);
  const salvarPermissoesCargoEstavel = useFuncaoEstavel(salvarPermissoesCargo);
  const moduloHabilitadoEstavel      = useFuncaoEstavel(moduloHabilitadoNoPlano);
  const addonHabilitadoEstavel       = useFuncaoEstavel(addonHabilitadoNoTenant);
  const valorSessao = useMemo(() => ({
    // `loading` é a carga do estabelecimento depois do login; `isMobile`, a
    // largura da tela. Os dois valem para o app inteiro e mudam raramente.
    loading, isMobile,
    currentUser, users, tenant,
    assinatura: tenant?.assinatura ?? null,
    rolePermissions,
    // Mudam junto com `tenant`, que está nas dependências: quem consulta o
    // plano é redesenhado quando o plano muda.
    moduloHabilitado: moduloHabilitadoEstavel,
    addonHabilitado: addonHabilitadoEstavel,
    aplicarTenantSalvo,
    login: loginEstavel, logout: logoutEstavel,
    addUser: addUserEstavel, updateUser: updateUserEstavel, removeUser: removeUserEstavel,
    salvarPermissoesCargo: salvarPermissoesCargoEstavel,
  }), [loading, isMobile, currentUser, users, tenant, rolePermissions, aplicarTenantSalvo,
    moduloHabilitadoEstavel, addonHabilitadoEstavel, loginEstavel, logoutEstavel,
    addUserEstavel, updateUserEstavel, removeUserEstavel, salvarPermissoesCargoEstavel]);


  // ── Carga (só a coordenação do AppProvider chama) ───────────────
  const valorCarga = useMemo(() => ({
    definirUsuarios: setUsersLocal,
    definirTenant: setTenantLocal,
    definirPermissoesDosCargos: setRolePermissionsLocal,
    definirCarregando: setLoading,
  }), []);


  return (
    <SessaoCargaContext.Provider value={valorCarga}>
      <SessaoContext.Provider value={valorSessao}>
        {children}
      {/* O clique no botão já conta como atividade (o useIdleTimer escuta
          `click` na captura, o que zera a contagem); esconder aqui é só para o
          aviso sumir na hora, sem depender da propagação do evento. */}
      <AvisoSessao
        visivel={!!currentUser && avisoSessaoVisivel}
        totalMs={AVISO_INATIVIDADE_MS}
        onContinuar={() => setAvisoSessaoVisivel(false)}
      />
      </SessaoContext.Provider>
    </SessaoCargaContext.Provider>
  );
}
