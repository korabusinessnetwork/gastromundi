import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { LuPlus, LuX, LuCircleAlert } from "react-icons/lu";
import "@/styles/chave.css";
import "./NovosProdutosInline.css";

/**
 * Cadastro de produtos SEM SAIR da montagem do grupo de escolha.
 *
 * O atrito que isto remove: para montar "escolha a cerveja" era preciso
 * abandonar a tela, cadastrar as seis cervejas uma a uma em Produtos e
 * voltar para montar o grupo. Agora digita-se os seis nomes aqui, de uma
 * vez, e eles já entram no grupo.
 *
 * O que NÃO muda: cada opção continua sendo um produto de verdade. É a
 * ligação com o produto que faz o estoque baixar, a margem existir e o
 * PDV saber o preço — uma opção que fosse só um texto solto venderia
 * "uma cerveja qualquer" e não daria baixa em nada.
 *
 * "Vender também avulso" é a diferença entre a lata de Coca (produto de
 * cardápio: conta estoque, tem margem, vende sozinha) e um item que só
 * existe dentro do combo — este entra como Insumo, a categoria que o
 * sistema já usa para o que não é item de cardápio.
 */

// Categoria de sistema para o que não é item de cardápio (ver
// src/lib/categoriasProduto.js).
const CATEGORIA_INTERNA = "Insumo";

const linhaVazia = () => ({ nome: "", preco: "" });

export default function NovosProdutosInline({ nomeInicial = "", categorias = [], onCriados, onCancelar }) {
  const { addProduct } = useApp();

  const [linhas, setLinhas] = useState([{ nome: nomeInicial, preco: "" }]);
  const [vendeAvulso, setVendeAvulso] = useState(true);
  const [vaiParaCozinha, setVaiParaCozinha] = useState(true);
  const [categoria, setCategoria] = useState(categorias[0] ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const alterar = (i, patch) => setLinhas(linhas.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const remover = (i) => setLinhas(linhas.length === 1 ? [linhaVazia()] : linhas.filter((_, n) => n !== i));
  const acrescentar = () => setLinhas([...linhas, linhaVazia()]);

  // Enter na última linha acrescenta outra: quem está cadastrando seis
  // cervejas digita seis vezes, não clica seis vezes.
  const aoTeclar = (i) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i === linhas.length - 1) acrescentar();
  };

  const preenchidas = linhas.filter((l) => l.nome.trim());
  // Produto de cardápio sem preço é produto que ninguém consegue vender —
  // e o cardápio público nem publica (migration 20260918). Melhor exigir
  // aqui do que deixar cadastrar e quebrar depois. Insumo não tem preço de
  // venda, então a exigência não vale para ele.
  const semPreco = vendeAvulso && preenchidas.some((l) => !(Number(l.preco) > 0));
  const semCategoria = vendeAvulso && !categoria.trim();
  const podeCriar = preenchidas.length > 0 && !semPreco && !semCategoria && !salvando;

  const criar = async () => {
    if (!podeCriar) return;
    setSalvando(true);
    setErro(null);

    const criados = [];
    const falharam = [];
    for (const linha of preenchidas) {
      const { data, error } = await addProduct({
        name: linha.nome.trim(),
        price: vendeAvulso ? Number(linha.preco) : 0,
        category: vendeAvulso ? categoria.trim() : CATEGORIA_INTERNA,
        active: true,
        produzivel: vaiParaCozinha,
      });
      if (error || !data) falharam.push(linha);
      else criados.push(data);
    }

    setSalvando(false);
    // Os que deram certo entram no grupo mesmo se outro falhou — refazer o
    // que já funcionou seria criar produto repetido.
    if (criados.length > 0) onCriados(criados);
    if (falharam.length > 0) {
      setLinhas(falharam);
      setErro(
        falharam.length === 1
          ? "Não deu para cadastrar este produto. Verifique a internet e tente de novo."
          : `Não deu para cadastrar ${falharam.length} produtos. Verifique a internet e tente de novo.`,
      );
      return;
    }
    onCancelar();
  };

  return (
    <div className="novos-produtos">
      <div className="novos-produtos__titulo">Cadastrar produto novo</div>
      <p className="novos-produtos__ajuda">
        Escreva um por linha — eles são criados de verdade e já entram neste grupo.
      </p>

      <div className="novos-produtos__linhas">
        {linhas.map((linha, i) => (
          <div key={i} className="novos-produtos__linha">
            <input
              value={linha.nome}
              onChange={(e) => alterar(i, { nome: e.target.value })}
              onKeyDown={aoTeclar(i)}
              placeholder="Nome do produto"
              maxLength={120}
              className="novos-produtos__nome"
            />
            {vendeAvulso && (
              <div className="novos-produtos__preco-campo">
                <span className="novos-produtos__cifrao">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={linha.preco}
                  onChange={(e) => alterar(i, { preco: e.target.value })}
                  onKeyDown={aoTeclar(i)}
                  placeholder="0,00"
                  className="novos-produtos__preco"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => remover(i)}
              className="novos-produtos__remover"
              title="Tirar esta linha"
            >
              <LuX size={15} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={acrescentar} className="novos-produtos__mais">
        <LuPlus size={14} /> Acrescentar linha
      </button>

      <label className="chave">
        <input
          type="checkbox"
          checked={vendeAvulso}
          onChange={(e) => setVendeAvulso(e.target.checked)}
          className="chave__campo"
        />
        <span className="chave__pino" />
        <span className="chave__texto">
          <span className="chave__titulo">Vender também avulso, no cardápio</span>
          <span className="chave__ajuda">
            Ligado: é produto de cardápio — conta estoque, tem margem e pode ser vendido sozinho
            (uma lata de refrigerante). Desligado: entra como Insumo e só existe dentro do combo.
          </span>
        </span>
      </label>

      <label className="chave">
        <input
          type="checkbox"
          checked={vaiParaCozinha}
          onChange={(e) => setVaiParaCozinha(e.target.checked)}
          className="chave__campo"
        />
        <span className="chave__pino" />
        <span className="chave__texto">
          <span className="chave__titulo">Vai para a cozinha preparar</span>
          <span className="chave__ajuda">
            Desligue para bebida de geladeira e afins, que saem sem passar pela produção.
          </span>
        </span>
      </label>

      {vendeAvulso && (
        <div className="novos-produtos__campo">
          <label className="novos-produtos__rotulo" htmlFor="novos-produtos-categoria">Categoria</label>
          <input
            id="novos-produtos-categoria"
            list="novos-produtos-categorias"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ex.: Bebidas"
            maxLength={60}
            className="novos-produtos__categoria"
          />
          <datalist id="novos-produtos-categorias">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      )}

      {erro && (
        <div className="novos-produtos__erro">
          <LuCircleAlert size={14} /> {erro}
        </div>
      )}

      <div className="novos-produtos__acoes">
        <button
          type="button"
          onClick={criar}
          disabled={!podeCriar}
          title={
            semPreco ? "Falta o preço de algum produto"
              : semCategoria ? "Escolha a categoria"
                : preenchidas.length === 0 ? "Escreva ao menos um nome"
                  : undefined
          }
          className="novos-produtos__criar"
        >
          {salvando
            ? "Cadastrando…"
            : `Cadastrar ${preenchidas.length || ""} ${preenchidas.length === 1 ? "produto" : "produtos"}`.replace("  ", " ")}
        </button>
        <button type="button" onClick={onCancelar} className="novos-produtos__cancelar">
          Cancelar
        </button>
      </div>
    </div>
  );
}
