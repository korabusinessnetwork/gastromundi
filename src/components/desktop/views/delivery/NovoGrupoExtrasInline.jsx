import { useState } from "react";
import { LuPlus, LuX, LuMinus } from "react-icons/lu";
import { salvarGrupoComplemento, salvarComplemento } from "@/lib/deliveryAdmin";
import { instrucaoGrupo } from "@/lib/gruposEscolha";
import "./NovoGrupoExtrasInline.css";

/**
 * Criar um grupo de extras SEM sair da tela de produto.
 *
 * O buraco: a seção "Extras deste produto" só deixava marcar grupo que já
 * existia, e sumia por completo quando a biblioteca estava vazia. Quem
 * cadastrava o primeiro produto do delivery não via nem a seção — tinha de
 * descobrir sozinho a aba Complementos, criar lá, e voltar. E, para o
 * segundo grupo, o mesmo vai-e-volta.
 *
 * O grupo continua sendo da BIBLIOTECA (reutilizável em vários produtos) —
 * isto aqui é só um atalho de criação, não um grupo "do produto". Quem
 * chama recebe o grupo criado em `onCriado` e marca no produto.
 *
 * Mínimo/máximo usam a MESMA frase do PDV (instrucaoGrupo), porque é a
 * mesma regra: máximo 0 é sem limite, e o número conta unidades.
 *
 * Por que é intuitivo (princípio nº 1): três campos visíveis de uma vez
 * (nome, quantas, opções), a frase em português dizendo o que a combinação
 * significa, e o botão de salvar só acende quando dá para salvar.
 */
export default function NovoGrupoExtrasInline({ nomeInicial = "", onCriado, onCancelar }) {
  const [nome, setNome] = useState(nomeInicial);
  const [minimo, setMinimo] = useState(0);
  const [maximo, setMaximo] = useState(1);
  const [opcoes, setOpcoes] = useState([{ nome: "", preco: "" }]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const mudarOpcao = (i, campo, valor) =>
    setOpcoes((prev) => prev.map((o, n) => (n === i ? { ...o, [campo]: valor } : o)));
  const addOpcao = () => setOpcoes((prev) => [...prev, { nome: "", preco: "" }]);
  const removerOpcao = (i) => setOpcoes((prev) => prev.filter((_, n) => n !== i));

  // Mesma aritmética do editor do PDV: o teto acompanha o piso, e 0 é
  // "sem limite" — uma faixa que se contradiz travaria o pedido do cliente.
  const setMin = (v) => {
    const m = Math.max(0, v);
    setMinimo(m);
    setMaximo((teto) => (teto === 0 ? 0 : Math.max(teto, m, 1)));
  };
  const setMax = (v) => setMaximo(v <= 0 ? 0 : Math.max(v, minimo, 1));

  const validas = opcoes.filter((o) => o.nome.trim());
  const bloqueado = salvando || !nome.trim() || validas.length === 0;

  const salvar = async () => {
    if (bloqueado) return;
    setSalvando(true);
    setErro("");

    const { data: grupo, error } = await salvarGrupoComplemento({
      nome: nome.trim(),
      min_escolhas: minimo,
      max_escolhas: maximo,
    });
    if (error || !grupo) {
      setSalvando(false);
      setErro("Não foi possível criar o grupo. Tente de novo.");
      return;
    }

    // Opção que falhar é reportada, mas o grupo já existe: devolvê-lo assim
    // mesmo é melhor do que deixar o dono achando que nada foi criado e
    // cadastrar tudo de novo, gerando grupo duplicado.
    let falhou = 0;
    for (let i = 0; i < validas.length; i++) {
      const o = validas[i];
      const { error: e } = await salvarComplemento({
        grupo_id: grupo.id,
        nome: o.nome.trim(),
        preco: Math.max(0, parseFloat(String(o.preco).replace(",", ".")) || 0),
        ordem: i,
      });
      if (e) falhou += 1;
    }

    setSalvando(false);
    onCriado?.(
      { ...grupo, itens: validas.map((o) => ({ nome: o.nome.trim() })) },
      falhou > 0 ? `${falhou} opção(ões) não foram salvas, confira na aba Complementos.` : null,
    );
  };

  return (
    <div className="novo-extras">
      <div className="novo-extras__topo">
        <strong className="novo-extras__titulo">Novo grupo de extras</strong>
        <button type="button" onClick={onCancelar} className="novo-extras__fechar" aria-label="Cancelar">
          <LuX size={16} />
        </button>
      </div>

      <label className="novo-extras__campo">
        <span className="novo-extras__label">Nome do grupo</span>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Adicionais, Ponto da carne"
          maxLength={80}
          className="novo-extras__input"
        />
      </label>

      <div className="novo-extras__minmax">
        <span className="novo-extras__label">Mínimo</span>
        <div className="novo-extras__stepper">
          <button type="button" aria-label="Diminuir o mínimo" onClick={() => setMin(minimo - 1)} className="novo-extras__stepper-btn"><LuMinus size={12} /></button>
          <span className="novo-extras__stepper-valor">{minimo}</span>
          <button type="button" aria-label="Aumentar o mínimo" onClick={() => setMin(minimo + 1)} className="novo-extras__stepper-btn"><LuPlus size={12} /></button>
        </div>
        <span className="novo-extras__label">Máximo</span>
        <div className="novo-extras__stepper">
          <button type="button" aria-label="Diminuir o máximo" onClick={() => setMax(maximo - 1)} className="novo-extras__stepper-btn"><LuMinus size={12} /></button>
          <span className="novo-extras__stepper-valor">{maximo === 0 ? "sem limite" : maximo}</span>
          <button type="button" aria-label="Aumentar o máximo" onClick={() => setMax(maximo + 1)} className="novo-extras__stepper-btn"><LuPlus size={12} /></button>
        </div>
      </div>
      <p className="novo-extras__ajuda">{instrucaoGrupo(minimo, maximo)}.</p>

      <span className="novo-extras__label">Opções</span>
      <div className="novo-extras__opcoes">
        {opcoes.map((o, i) => (
          <div key={i} className="novo-extras__opcao">
            <input
              value={o.nome}
              onChange={(e) => mudarOpcao(i, "nome", e.target.value)}
              placeholder="Ex: Bacon"
              maxLength={80}
              aria-label={`Nome da opção ${i + 1}`}
              className="novo-extras__input novo-extras__input--nome"
            />
            <div className="novo-extras__preco-campo">
              <span className="novo-extras__cifrao">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={o.preco}
                onChange={(e) => mudarOpcao(i, "preco", e.target.value)}
                placeholder="0,00"
                aria-label={`Preço da opção ${i + 1}`}
                className="novo-extras__preco-input"
              />
            </div>
            {opcoes.length > 1 && (
              <button type="button" onClick={() => removerOpcao(i)} className="novo-extras__remover" aria-label={`Remover a opção ${i + 1}`}>
                <LuX size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addOpcao} className="novo-extras__add">
        <LuPlus size={14} /> Adicionar opção
      </button>

      {erro && <p className="novo-extras__erro">{erro}</p>}

      <div className="novo-extras__botoes">
        <button type="button" onClick={onCancelar} className="novo-extras__btn-cancelar">Cancelar</button>
        <button
          type="button"
          onClick={salvar}
          disabled={bloqueado}
          className="novo-extras__btn-salvar"
          style={{ cursor: bloqueado ? "not-allowed" : "pointer" }}
        >
          {salvando ? "Criando…" : "Criar grupo"}
        </button>
      </div>
    </div>
  );
}
