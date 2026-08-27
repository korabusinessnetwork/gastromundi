import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { entrar as entrarNoAuth, sair as sairDoAuth, socioDaSessao, observarSessao } from "@/lib/pautasAuth";
import {
  listarPessoas,
  listarPautas,
  criarPauta as criarNoBanco,
  atualizarPauta as atualizarNoBanco,
  atualizarStatus as atualizarStatusNoBanco,
} from "@/lib/pautas";

/**
 * Estado das Pautas da Kora — sessão do sócio, lista de sócios e lista de
 * pautas em um lugar só.
 *
 * Deliberadamente pequeno e separado do AppContext: aqui não há PDV, caixa,
 * fila offline nem tenant. O host das pautas nem monta o AppProvider.
 */

const PautasContext = createContext(null);

export function PautasProvider({ children }) {
  const [slug,      setSlug]      = useState(null);   // sócio logado
  const [pessoas,   setPessoas]   = useState([]);
  const [pautas,    setPautas]    = useState([]);
  const [carregando, setCarregando] = useState(true); // sessão sendo conferida
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erro,      setErro]      = useState("");

  // Evita setState depois de desmontar (StrictMode monta duas vezes em dev).
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  // Sessão: confere ao abrir e acompanha mudanças (logout em outra aba,
  // token expirado) — a tela volta ao login sozinha.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const atual = await socioDaSessao();
      if (!cancelado) { setSlug(atual); setCarregando(false); }
    })();
    const cancelarObservacao = observarSessao((novo) => {
      if (!cancelado) setSlug(novo);
    });
    return () => { cancelado = true; cancelarObservacao(); };
  }, []);

  const recarregar = async () => {
    setCarregandoLista(true);
    setErro("");
    const [resPessoas, resPautas] = await Promise.all([listarPessoas(), listarPautas()]);
    if (!vivo.current) return;
    if (resPessoas.error || resPautas.error) {
      setErro("Não conseguimos carregar as pautas. Confira sua internet e tente de novo.");
    } else {
      setPessoas(resPessoas.data ?? []);
      setPautas(resPautas.data ?? []);
    }
    setCarregandoLista(false);
  };

  // Só busca dados com sessão de sócio — sem ela a RLS negaria tudo e a tela
  // mostraria um erro que não é do usuário.
  useEffect(() => {
    if (!slug) { setPessoas([]); setPautas([]); return; }
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const entrar = async (usuario, senha) => {
    const resultado = await entrarNoAuth(usuario, senha);
    if (resultado.ok) setSlug(resultado.slug);
    return resultado;
  };

  const sair = async () => {
    setSlug(null);
    setPessoas([]);
    setPautas([]);
    return sairDoAuth();
  };

  // As três ações de escrita devolvem { error } para a tela decidir o que
  // dizer, e atualizam a lista local na hora (sem recarregar tudo).
  const criarPauta = async (dados) => {
    const { data, error } = await criarNoBanco(dados, slug);
    if (!error && data) setPautas((atual) => [data, ...atual]);
    return { data, error };
  };

  const atualizarPauta = async (id, dados) => {
    const { data, error } = await atualizarNoBanco(id, dados, slug);
    if (!error && data) setPautas((atual) => atual.map((p) => (p.id === id ? data : p)));
    return { data, error };
  };

  const mudarStatus = async (id, status) => {
    const { data, error } = await atualizarStatusNoBanco(id, status, slug);
    if (!error && data) setPautas((atual) => atual.map((p) => (p.id === id ? data : p)));
    return { data, error };
  };

  const pessoaAtual = useMemo(
    () => pessoas.find((p) => p.slug === slug) ?? (slug ? { slug, nome: slug } : null),
    [pessoas, slug],
  );

  const valor = {
    slug, pessoaAtual, pessoas, pautas,
    carregando, carregandoLista, erro,
    entrar, sair, recarregar,
    criarPauta, atualizarPauta, mudarStatus,
  };

  return <PautasContext.Provider value={valor}>{children}</PautasContext.Provider>;
}

export function usePautas() {
  const ctx = useContext(PautasContext);
  if (!ctx) throw new Error("usePautas precisa estar dentro de <PautasProvider>");
  return ctx;
}
