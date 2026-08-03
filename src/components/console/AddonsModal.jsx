import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuPuzzle, LuInfo } from "react-icons/lu";
import { listarAddons, listarAddonsPorTenant, alternarAddon, resumirAddonsDoTenant } from "@/lib/console";
import { AVISOS_ADDON, CONSEQUENCIAS_DESLIGAR } from "@/constants/addons";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// corpo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";
import "./AddonsModal.css";

/**
 * Liga e desliga os add-ons pagos (NF-e, TEF) de um estabelecimento —
 * Console da plataforma, F022 (decisões 019, 021 e 027).
 *
 * Por que é intuitivo (Princípio nº1): uma linha por add-on, com o nome
 * comercial vindo do catálogo do banco, o estado escrito por extenso
 * ("Ligado"/"Desligado") e UM botão que faz a única coisa que falta fazer
 * naquela linha. Não há formulário nem "salvar" no rodapé: a ação é a
 * linha, e o resultado aparece nela. Desligar tira um recurso do cliente na
 * hora, então pede um "sim" que NOMEIA o que vai parar de funcionar, em vez
 * de um "tem certeza?" que não informa nada (CLAUDE.md: confirmar ações
 * destrutivas; prevenção de erro > mensagem de erro).
 *
 * E cada add-on avisa, ANTES do clique, o que ainda não funciona de ponta a
 * ponta (`AVISOS_ADDON`) — TEF só simula a aprovação, NF-e só emite com o
 * certificado do cliente no servidor. Sem isso o dono venderia ao cliente
 * algo que a tela deixou parecer pronto.
 *
 * O front NÃO decide autorização: a RPC `alternar_addon_tenant` (20260915)
 * revalida o papel `plataforma` no banco (SECURITY DEFINER +
 * is_super_admin()) — `tenant_addons` não tem policy de escrita. Aqui só
 * montamos a chamada e mostramos o resultado.
 */
export default function AddonsModal({ tenant, onFechar, onAlterado }) {
  const [catalogo, setCatalogo] = useState([]);
  const [contratados, setContratados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLeitura, setErroLeitura] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  // Estado POR LINHA: uma linha salvando não trava as outras, e o erro de
  // uma não apaga o que as outras mostram.
  const [salvando, setSalvando] = useState("");
  const [erros, setErros] = useState({});
  const [confirmando, setConfirmando] = useState("");

  const tenantId = tenant?.id ?? null;

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErroLeitura(false);
    (async () => {
      const [{ data: addons, error: eAddons }, { data: linhas, error: eLinhas }] = await Promise.all([
        listarAddons(),
        listarAddonsPorTenant(),
      ]);
      if (cancelado) return;
      setCarregando(false);
      if (eAddons || eLinhas) {
        setErroLeitura(true);
        return;
      }
      setCatalogo(addons);
      setContratados(linhas);
    })();
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  const linhas = useMemo(
    () => resumirAddonsDoTenant(catalogo, contratados, tenantId),
    [catalogo, contratados, tenantId]
  );

  const aplicar = async (codigo, ativo) => {
    // Trava de clique repetido: sem ela, dois cliques em "Desligar mesmo
    // assim" disparam duas chamadas e a resposta mais lenta sobrescreve a UI
    // com um estado velho.
    if (salvando) return;
    setConfirmando("");
    setSalvando(codigo);
    setErros((e) => ({ ...e, [codigo]: "" }));
    const { data, error } = await alternarAddon(tenantId, codigo, ativo);
    setSalvando("");

    if (error) {
      setErros((e) => ({ ...e, [codigo]: error.message ?? "Não foi possível alterar o add-on." }));
      return;
    }

    // O que vale é o que o servidor gravou, não o que pedimos: a linha
    // devolvida pela RPC substitui a que estava em memória.
    const linha = Array.isArray(data) ? data[0] : data;
    setContratados((atuais) => {
      const outras = atuais.filter(
        (l) => !(l.tenant_id === tenantId && l.addon_codigo === codigo)
      );
      return linha ? [...outras, linha] : outras;
    });
    onAlterado?.({ codigo, ativo: linha?.ativo ?? ativo });
  };

  const ligados = linhas.filter((l) => l.ativo).length;

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, Boolean(salvando));

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Add-ons do estabelecimento">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuPuzzle size={20} aria-hidden />
            <h2>Add-ons</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={Boolean(salvando)} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{tenant?.nome}</p>
            <p className="nem-secao__ajuda">
              Add-ons são cobrados à parte da mensalidade e valem em qualquer
              plano. O que você ligar aqui passa a valer na hora para este
              estabelecimento.
            </p>
          </section>

          {carregando && (
            <p className="adm-carregando" role="status">
              <LuLoaderCircle size={15} className="nem-spin" aria-hidden /> Carregando os add-ons…
            </p>
          )}

          {!carregando && erroLeitura && (
            <div className="adm-erro" role="alert">
              <p className="adm-erro__titulo">
                <LuTriangleAlert size={16} aria-hidden />
                Não foi possível ler os add-ons.
              </p>
              <p className="adm-erro__texto">
                Sem essa leitura não dá para saber o que este estabelecimento já
                tem contratado — e ligar às cegas poderia desligar o que estava
                ligado.
              </p>
              <button type="button" className="adm-relere" onClick={() => setTentativa((n) => n + 1)}>
                Tentar de novo
              </button>
            </div>
          )}

          {!carregando && !erroLeitura && linhas.length === 0 && (
            <p className="adm-vazio" role="status">
              Nenhum add-on cadastrado no catálogo da plataforma ainda.
            </p>
          )}

          {!carregando && !erroLeitura && linhas.length > 0 && (
            <ul className="adm-lista">
              {linhas.map((addon) => {
                const aviso = AVISOS_ADDON[addon.codigo];
                const estaSalvando = salvando === addon.codigo;
                const erro = erros[addon.codigo];
                const pedindoConfirmacao = confirmando === addon.codigo;

                return (
                  <li key={addon.codigo} className="adm-item">
                    <div className="adm-item__topo">
                      <div className="adm-item__texto">
                        <p className="adm-item__nome">{addon.nome}</p>
                        {addon.descricao && <p className="adm-item__descricao">{addon.descricao}</p>}
                      </div>
                      <span
                        className={`adm-estado${addon.ativo ? " adm-estado--ligado" : ""}`}
                      >
                        {addon.ativo ? "Ligado" : "Desligado"}
                      </span>
                    </div>

                    {aviso && (
                      <p className="adm-item__aviso">
                        <LuInfo size={15} aria-hidden /> {aviso}
                      </p>
                    )}

                    {pedindoConfirmacao ? (
                      <div className="adm-confirma" role="alertdialog" aria-label={`Desligar ${addon.nome}`}>
                        <p className="adm-confirma__texto">
                          <LuTriangleAlert size={16} aria-hidden />
                          {CONSEQUENCIAS_DESLIGAR[addon.codigo] ??
                            `Ao desligar, este estabelecimento perde ${addon.nome} na hora.`}
                        </p>
                        <div className="adm-confirma__acoes">
                          <button
                            type="button"
                            className="nem-btn nem-btn--secundario"
                            onClick={() => setConfirmando("")}
                          >
                            Manter ligado
                          </button>
                          <button
                            type="button"
                            className="adm-botao adm-botao--perigo"
                            disabled={estaSalvando}
                            onClick={() => aplicar(addon.codigo, false)}
                          >
                            Desligar mesmo assim
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`adm-botao${addon.ativo ? " adm-botao--desligar" : " adm-botao--ligar"}`}
                        disabled={estaSalvando}
                        onClick={() =>
                          addon.ativo ? setConfirmando(addon.codigo) : aplicar(addon.codigo, true)
                        }
                      >
                        {estaSalvando ? (
                          <>
                            <LuLoaderCircle size={15} className="nem-spin" aria-hidden /> Salvando…
                          </>
                        ) : addon.ativo ? (
                          "Desligar"
                        ) : (
                          "Ligar"
                        )}
                      </button>
                    )}

                    {erro && (
                      <p className="adm-item__erro" role="alert">
                        <LuTriangleAlert size={15} aria-hidden /> {erro}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="nem-footer">
          <span className="adm-rodape">
            {carregando || erroLeitura
              ? ""
              : ligados === 0
                ? "Nenhum add-on ligado"
                : ligados === 1
                  ? "1 add-on ligado"
                  : `${ligados} add-ons ligados`}
          </span>
          <button className="nem-btn nem-btn--primario" onClick={onFechar} disabled={Boolean(salvando)}>
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
