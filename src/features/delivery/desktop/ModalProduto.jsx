import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { logAction } from "@/features/auditoria/dados/logger";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuPencil, LuTrash2, LuX, LuCheck, LuImage, LuImages, LuUpload, LuRefreshCw, LuTriangleAlert, LuPlus } from "react-icons/lu";
import {
  salvarProdutoDelivery, formatarReais
} from "@/features/delivery/deliveryAdmin";
import { enviarFotoProduto, copiarFotoParaProduto, ACCEPT_IMAGEM } from "@/features/delivery/dados/deliveryFotos";
import { useGaleriaFotos } from "@/features/delivery/hooks/useGaleriaFotos";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { desvincularGrupoProduto, listarBibliotecaGrupos, vincularGrupoProduto } from "@/features/delivery/dados/admin";
import NovoGrupoExtrasInline from "@/features/delivery/desktop/NovoGrupoExtrasInline";

// Modal criar/editar item do delivery.
// Addon: só a camada de delivery (foto/descrição/disponível/ordem) —
//   nome/preço vêm do PDV e aparecem só para referência.
// Standalone: nome/preço/categoria + a camada de delivery, tudo junto.
export default function ModalProduto({
  modo, item, ehAddon, products, tenant, currentUser, addProduct, updateProduct, recarregarProdutos, aviso, onFechar, onSalvo,
}) {
  const prod = item?.produto || null;
  const [nome, setNome] = useState(prod?.name || "");
  const [preco, setPreco] = useState(prod?.price != null ? String(prod.price) : "");
  const [categoria, setCategoria] = useState(prod?.category || "");
  const [descricao, setDescricao] = useState(item?.descricao || "");
  // Foto: a URL já gravada (edição) e, quando o dono escolhe uma nova, o
  // File local + a prévia (object URL). O upload só acontece no salvar,
  // quando o produto_id já existe (standalone "novo" cria o produto antes).
  const [fotoUrl, setFotoUrl] = useState(item?.foto_url || "");
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState("");
  // Foto escolhida da GALERIA (path de origem no bucket). Copiamos para o
  // slot do produto só no salvar, mantendo os produtos independentes.
  const [fotoGaleriaOrigem, setFotoGaleriaOrigem] = useState(null);
  const fotoInputRef = useRef(null);
  const fotoAlvoRef = useRef(null);
  // Extras (grupos de complemento) que aparecem NESTE produto. Antes,
  // criar o produto aqui e dar extras a ele eram duas viagens: salvava,
  // ia na aba Complementos, abria cada grupo e marcava o produto na lista
  // "aparece nestes produtos". Agora é a mesma tela, e ao criar já sai com
  // os extras ligados.
  const [biblioteca, setBiblioteca] = useState([]);
  const [carregandoExtras, setCarregandoExtras] = useState(true);
  // Biblioteca VAZIA e biblioteca que FALHOU não são a mesma coisa: vazia é
  // "ainda não existe grupo" (dá para criar um); falhou é "não sei o que
  // existe", e oferecer criar levaria o dono a duplicar um grupo que já tem.
  const [extrasIndisponiveis, setExtrasIndisponiveis] = useState(false);
  const [extras, setExtras] = useState(() => new Set());
  // Painel de criar grupo sem sair daqui. null = fechado.
  const [criandoGrupo, setCriandoGrupo] = useState(null);
  // Os vínculos como estavam ao abrir: o salvar aplica só a DIFERENÇA, em
  // vez de apagar tudo e regravar. Regravar mexeria em vínculos que esta
  // tela nem mostrou, e cada escrita é uma chance de falhar no meio.
  const extrasOriginais = useRef(new Set());

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data, error } = await listarBibliotecaGrupos();
      if (!ativo) return;
      setCarregandoExtras(false);
      // Falha aqui não trava o cadastro do produto: a seção some e o dono
      // liga os extras depois, pela aba Complementos, como sempre fez.
      if (error) { setExtrasIndisponiveis(true); return; }
      setExtrasIndisponiveis(false);
      setBiblioteca(data ?? []);
      const meus = new Set(
        (data ?? [])
          .filter((g) => (g.produtoIds ?? []).some((id) => String(id) === String(item?.produto_id)))
          .map((g) => String(g.id)),
      );
      setExtras(meus);
      extrasOriginais.current = meus;
    })();
    return () => { ativo = false; };
  }, [item?.produto_id]);

  const alternarExtra = (id) =>
    setExtras((prev) => {
      const nova = new Set(prev);
      const k = String(id);
      if (nova.has(k)) nova.delete(k);
      else nova.add(k);
      return nova;
    });

  // Disponibilidade NÃO se edita aqui — o botão mora no card, na grade.
  // O valor de agora é carregado só para o salvar não zerá-lo: o payload de
  // `salvarProdutoDelivery` é a linha inteira, então omitir o campo apagaria
  // o "indisponível" que o dono acabou de marcar na grade. Produto novo
  // nasce disponível.
  const disponivel = item?.disponivel ?? true;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Menu de escolha (clicar na foto) + modal da galeria.
  const {
    menuFotoAberto, menuPos, alternarMenuFoto, fecharMenuFoto,
    galeriaAberta, galeriaFotos, galeriaCarregando, galeriaErro, abrirGaleria, fecharGaleria,
  } = useGaleriaFotos({ tenantId: tenant?.id, alvoRef: fotoAlvoRef });

  // Libera o object URL da prévia ao trocar/fechar (evita vazamento).
  useEffect(() => {
    return () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview); };
  }, [fotoPreview]);

  const escolherFoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!file) return;
    if (!file.type?.startsWith("image/")) return setErro("Escolha um arquivo de imagem.");
    setErro("");
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoGaleriaOrigem(null); // enviar arquivo novo cancela escolha da galeria
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const removerFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview("");
    setFotoFile(null);
    setFotoUrl("");
    setFotoGaleriaOrigem(null);
  };

  // Escolhe uma foto da galeria: mostra na prévia e marca para copiar no salvar.
  const selecionarDaGaleria = (foto) => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview("");
    setFotoFile(null);
    setFotoUrl(foto.url);
    setFotoGaleriaOrigem(foto.path);
    fecharGaleria();
    setErro("");
  };

  const temFoto = !!(fotoPreview || fotoUrl);

  const categorias = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  // Produto novo é cadastrado aqui em `products` mesmo no modo integrado:
  // é o mesmo catálogo do PDV, e obrigar a pessoa a sair para o Cadastro
  // Produtos e voltar para importar era o caminho torto que existia.
  // Editar no integrado continua sem tocar em `products` — nome e preço
  // são do PDV.
  const criaProduto = !ehAddon || modo === "novo";

  const salvar = async () => {
    if (salvando) return;
    // Quem cria o produto precisa de nome+preço.
    if (criaProduto) {
      if (!nome.trim()) return setErro("Informe o nome do produto.");
      const p = parseFloat(String(preco).replace(",", "."));
      if (isNaN(p) || p <= 0) return setErro("Preço deve ser maior que zero.");
    }
    setSalvando(true);
    setErro("");

    let produtoId = item?.produto_id;

    // Cria/atualiza o produto em products (este é o cadastro dele).
    if (criaProduto) {
      const payload = {
        name: nome.trim().toUpperCase(),
        price: parseFloat(String(preco).replace(",", ".")),
        category: categoria.trim() || "Delivery",
      };
      if (modo === "novo") {
        const { data, error } = await addProduct(payload);
        if (error || !data?.id) {
          setSalvando(false);
          return setErro(error?.message || "Não foi possível criar o produto.");
        }
        produtoId = data.id;
        logAction(currentUser?.username, "delivery:produto:criar", { msg: `Produto de delivery criado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
      } else {
        const { error } = await updateProduct(item.produto_id, payload);
        if (error) {
          setSalvando(false);
          return setErro(error.message || "Não foi possível salvar o produto.");
        }
      }
    }

    // Foto: se o dono escolheu uma nova, sobe agora (produto_id já existe).
    let fotoFinal = fotoUrl.trim() || null;
    if (fotoFile) {
      const { url, error: eFoto } = await enviarFotoProduto({
        file: fotoFile,
        tenantId: tenant?.id,
        produtoId,
      });
      if (eFoto) {
        setSalvando(false);
        return setErro(eFoto.message || "Não foi possível enviar a foto.");
      }
      fotoFinal = url;
    } else if (fotoGaleriaOrigem) {
      // Escolheu da galeria: copia para o slot próprio do produto (independência).
      const { url, error: eCopy } = await copiarFotoParaProduto({
        tenantId: tenant?.id,
        produtoId,
        origemPath: fotoGaleriaOrigem,
      });
      if (eCopy) {
        setSalvando(false);
        return setErro(eCopy.message || "Não foi possível usar a foto da galeria.");
      }
      fotoFinal = url;
    }

    // Camada de delivery (sempre).
    const { error } = await salvarProdutoDelivery({
      id: item?.id,
      produto_id: produtoId,
      foto_url: fotoFinal,
      descricao: descricao.trim() || null,
      disponivel,
      ordem: item?.ordem ?? 0,
    });
    if (error) {
      setSalvando(false);
      return setErro(error.message || "Não foi possível salvar no delivery.");
    }

    // Extras: só o que MUDOU. O produto e a camada de delivery já estão
    // gravados, então uma falha aqui não desfaz o cadastro — avisa e deixa
    // o resto salvo, em vez de fingir que nada aconteceu.
    const antes = extrasOriginais.current;
    const ligar = [...extras].filter((id) => !antes.has(id));
    const desligar = [...antes].filter((id) => !extras.has(id));
    let falhouExtra = false;
    for (const id of ligar) {
      const { error: e } = await vincularGrupoProduto(id, produtoId);
      if (e) falhouExtra = true;
    }
    for (const id of desligar) {
      const { error: e } = await desvincularGrupoProduto(id, produtoId);
      if (e) falhouExtra = true;
    }

    setSalvando(false);
    if (falhouExtra) {
      return setErro("O produto foi salvo, mas não deu para ajustar os extras. Tente de novo pela aba Complementos.");
    }

    if (criaProduto) await recarregarProdutos();
    aviso(modo === "novo" ? "Produto adicionado ao delivery." : "Alterações salvas.", "ok");
    onSalvo();
  };

  return createPortal(
    <>
    <div className="delivery-view__overlay" {...fecharAoClicarFora(onFechar)}>
      <div className="delivery-view__modal">
        <div className="delivery-view__modal-topo">
          <div className="delivery-view__modal-titulo">
            {modo === "novo" ? "Novo produto do delivery" : "Editar produto do delivery"}
          </div>
          <button onClick={onFechar} className="delivery-view__modal-fechar">
            <LuX size={18} />
          </button>
        </div>

        {/* Produto novo: os campos do cadastro. Editando no integrado: só a
            referência do PDV, porque nome e preço são de lá. */}
        {!criaProduto ? (
          <div className="delivery-view__aviso delivery-view__aviso--info">
            <strong>{prod?.name || "Produto"}</strong>
            {prod?.price != null ? ` · ${formatarReais(prod.price)}` : ""}, nome e preço vêm do
            cadastro do PDV. Aqui você ajusta como ele aparece no delivery.
          </div>
        ) : (
          <>
            <div className="delivery-view__campo">
              <label className="delivery-view__label">Nome *</label>
              <input className="delivery-view__input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: X-Salada" maxLength={60} />
            </div>
            <div className="delivery-view__campo-linha">
              <div className="delivery-view__campo delivery-view__campo--flex">
                <label className="delivery-view__label">Preço (R$) *</label>
                <input className="delivery-view__input" type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div className="delivery-view__campo">
              <label className="delivery-view__label">Categoria</label>
              <input className="delivery-view__input" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Lanches" maxLength={40} list="delivery-cats" />
              <datalist id="delivery-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </>
        )}

        {/* Extras deste produto. Mesma biblioteca da aba Complementos — o
            grupo continua sendo reutilizável em vários produtos; aqui só se
            marca em quais ele aparece. Sem isto, criar um produto e dar
            extras a ele eram duas viagens de tela. */}
        {!carregandoExtras && !extrasIndisponiveis && (
          <div className="delivery-view__campo">
            <label className="delivery-view__label">
              Extras deste produto <span className="delivery-view__hint">(opcional)</span>
            </label>
            {/* Biblioteca vazia escondia a seção INTEIRA — quem cadastrava o
                primeiro produto do delivery não via nem que extras existiam,
                e tinha de descobrir sozinho a aba Complementos. */}
            {biblioteca.length === 0 && criandoGrupo == null && (
              <p className="delivery-view__hint">
                Nenhum grupo de extras ainda. Crie o primeiro aqui mesmo,
                depois ele fica disponível para os outros produtos também.
              </p>
            )}
            <div className="delivery-view__extras-lista">
              {biblioteca.map((g) => {
                const nItens = (g.itens ?? []).length;
                const obrigatorio = Number(g.min_escolhas) > 0;
                return (
                  <label key={g.id} className="delivery-view__import-item">
                    <input
                      type="checkbox"
                      checked={extras.has(String(g.id))}
                      onChange={() => alternarExtra(g.id)}
                    />
                    <span className="delivery-view__item-nome">{g.nome}</span>
                    <span className="delivery-view__hint">
                      {obrigatorio ? "Obrigatório" : "Opcional"} · {nItens}{" "}
                      {nItens === 1 ? "item" : "itens"}
                    </span>
                  </label>
                );
              })}
            </div>
            {criandoGrupo == null ? (
              <button
                type="button"
                onClick={() => setCriandoGrupo("")}
                className="delivery-view__extras-criar"
              >
                <LuPlus size={14} /> Criar grupo de extras
              </button>
            ) : (
              <NovoGrupoExtrasInline
                nomeInicial={criandoGrupo}
                onCancelar={() => setCriandoGrupo(null)}
                onCriado={(grupo, avisoParcial) => {
                  // Entra na lista JÁ marcado: quem acabou de criar o grupo
                  // para este produto não quer marcá-lo de novo.
                  setBiblioteca((prev) => [...prev, grupo]);
                  setExtras((prev) => new Set(prev).add(String(grupo.id)));
                  setCriandoGrupo(null);
                  if (avisoParcial) aviso?.(avisoParcial, "err");
                }}
              />
            )}
            <span className="delivery-view__hint">
              O mesmo grupo pode aparecer em vários produtos. Para editar as opções
              de um grupo que já existe, use a aba Complementos.
            </span>
          </div>
        )}

        {/* Camada de delivery (ambos os modos) — foto do produto (upload) */}
        <div className="delivery-view__campo">
          <label className="delivery-view__label">
            <LuImage size={13} className="delivery-view__label-icone" />
            Foto do produto
          </label>
          <div className="delivery-view__foto-upload">
            <input
              ref={fotoInputRef}
              type="file"
              accept={ACCEPT_IMAGEM}
              onChange={escolherFoto}
              className="delivery-view__foto-input"
            />
            {/* Clicar na foto abre o menu de escolha (enviar nova / galeria). */}
            <div className="delivery-view__foto-alvo-wrap">
              <button
                ref={fotoAlvoRef}
                type="button"
                className="delivery-view__foto-alvo"
                onClick={alternarMenuFoto}
                aria-haspopup="menu"
                aria-expanded={menuFotoAberto}
                title="Clique para trocar a foto"
              >
                {temFoto ? (
                  <img className="delivery-view__foto-preview" src={fotoPreview || fotoUrl} alt="Prévia da foto do produto" />
                ) : (
                  <div className="delivery-view__foto-vazia">
                    <LuImage size={26} />
                  </div>
                )}
                <span className="delivery-view__foto-editar">
                  <LuPencil size={12} color="#fff" />
                </span>
              </button>

              {menuFotoAberto && (
                <>
                  <div className="delivery-view__foto-menu-fundo" onClick={() => fecharMenuFoto()} />
                  <div className="delivery-view__foto-menu" role="menu" style={{ "--menu-topo": menuPos ? `${menuPos.top}px` : "auto", "--menu-esquerda": menuPos ? `${menuPos.left}px` : "auto" }}>
                    <button
                      type="button"
                      role="menuitem"
                      className="delivery-view__foto-menu-item"
                      onClick={() => { fecharMenuFoto(); fotoInputRef.current?.click(); }}
                    >
                      <LuUpload size={15} color={varColor(C.accent)} /> Enviar nova foto
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="delivery-view__foto-menu-item"
                      onClick={abrirGaleria}
                    >
                      <LuImages size={15} color={varColor(C.accent)} /> Escolher da galeria
                    </button>
                    {temFoto && (
                      <button
                        type="button"
                        role="menuitem"
                        className="delivery-view__foto-menu-item delivery-view__foto-menu-item--perigo"
                        onClick={() => { removerFoto(); fecharMenuFoto(); }}
                      >
                        <LuTrash2 size={15} /> Remover foto
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <span className="delivery-view__hint">
              Clique na foto para enviar do celular ou escolher da galeria. Ajustamos o tamanho automaticamente.
            </span>
          </div>
        </div>
        <div className="delivery-view__campo">
          <label className="delivery-view__label">Descrição</label>
          <textarea className="delivery-view__textarea" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Pão, hambúrguer, queijo, alface e tomate." maxLength={280} />
        </div>
        {erro && (
          <div className="delivery-view__aviso delivery-view__aviso--erro">
            <LuTriangleAlert size={14} className="gm-icone-texto" aria-hidden="true" /> {erro}
          </div>
        )}

        <div className="delivery-view__modal-botoes">
          <button onClick={onFechar} className="delivery-view__btn delivery-view__btn--secundario">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="delivery-view__btn delivery-view__btn--primario">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>

    {/* Galeria: todas as fotos já enviadas por este estabelecimento. */}
    {galeriaAberta && (
      <div className="delivery-view__overlay" {...fecharAoClicarFora(() => fecharGaleria())}>
        <div className="delivery-view__modal delivery-view__galeria">
          <div className="delivery-view__modal-topo">
            <div className="delivery-view__modal-titulo">
              <LuImages size={16} className="delivery-view__titulo-icone" />
              Galeria de fotos
            </div>
            <button onClick={() => fecharGaleria()} className="delivery-view__modal-fechar">
              <LuX size={18} />
            </button>
          </div>

          {galeriaCarregando ? (
            <div className="delivery-view__galeria-estado">
              <LuRefreshCw size={22} className="delivery-view__girando" />
              Carregando as fotos…
            </div>
          ) : galeriaErro ? (
            <div className="delivery-view__galeria-estado">
              <div className="delivery-view__aviso delivery-view__aviso--erro">
                <LuTriangleAlert size={14} className="gm-icone-texto" aria-hidden="true" /> {galeriaErro}
              </div>
              <button
                type="button"
                onClick={abrirGaleria}
                className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--tentar"
              >
                <LuRefreshCw size={14} /> Tentar de novo
              </button>
            </div>
          ) : galeriaFotos.length === 0 ? (
            <div className="delivery-view__galeria-estado">
              <LuImage size={30} />
              <div className="delivery-view__galeria-estado-titulo">Nenhuma foto ainda</div>
              <div className="delivery-view__hint">
                Envie a primeira foto de um produto e ela aparecerá aqui para reusar.
              </div>
            </div>
          ) : (
            <div className="delivery-view__galeria-grade">
              {galeriaFotos.map((foto) => {
                const selecionada = fotoGaleriaOrigem === foto.path;
                return (
                  <button
                    key={foto.path}
                    type="button"
                    className={`delivery-view__galeria-item${selecionada ? " is-sel" : ""}`}
                    onClick={() => selecionarDaGaleria(foto)}
                    title="Usar esta foto"
                  >
                    <img src={foto.url} alt="Foto do delivery" loading="lazy" />
                    {selecionada && (
                      <span className="delivery-view__galeria-check">
                        <LuCheck size={14} color="#fff" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    )}
    </>,
    document.body
  );
}
