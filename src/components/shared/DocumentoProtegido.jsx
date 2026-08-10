import { useState } from "react";
import { LuFileText, LuEye, LuEyeOff } from "react-icons/lu";
import { formatarDocumento, ocultarDocumento } from "@/lib/documento";
import "./DocumentoProtegido.css";

/**
 * CPF/CNPJ do cliente em modo de EXIBIÇÃO, oculto por padrão (LGPD).
 *
 * O CPF aparecia por extenso em toda tela de cliente — lista e cadastro —
 * à vista de quem passasse pelo balcão. Aqui ele nasce mascarado
 * (`***.456.789-**`, o suficiente para o operador confirmar de quem é o
 * cadastro) e só abre por completo com um clique explícito de quem tem
 * permissão. Cada abertura chama `onRevelar`, que é o gancho do log de
 * auditoria — a regra pedida é registrar também o ACESSO ao dado sensível,
 * não só a alteração.
 *
 * CNPJ é mostrado inteiro e sem botão: documento de empresa é público por
 * natureza, esconder atrapalharia sem proteger ninguém.
 *
 * `podeRevelar` falso deixa o valor mascarado e não desenha botão nenhum —
 * é também o que a lista usa, porque lá o cartão inteiro já é um `<button>`
 * e botão dentro de botão é marcação inválida.
 *
 * Intuitivo (princípio nº 1): o rótulo diz o que é ("CPF"), os pontinhos
 * mostram na hora que há dado escondido, e o botão diz em palavra o que
 * vai acontecer ("Ver" / "Ocultar") — sem ícone solto para adivinhar.
 *
 * Decisão 018: estilo em folha co-localizada; só tokens --gm-* (white-label,
 * decisão 017).
 *
 * @param {{
 *   documento?: string|null,
 *   tipo?: 'cpf'|'cnpj'|null,
 *   podeRevelar?: boolean,
 *   onRevelar?: () => void,
 *   tamanhoIcone?: number,
 * }} props
 */
export default function DocumentoProtegido({
  documento,
  tipo,
  podeRevelar = false,
  onRevelar,
  tamanhoIcone = 13,
}) {
  const [revelado, setRevelado] = useState(false);
  if (!documento) return null;

  const ehCnpj = tipo === "cnpj";
  const rotulo = ehCnpj ? "CNPJ" : "CPF";
  const aberto = ehCnpj || revelado;
  const texto = aberto
    ? formatarDocumento(documento, tipo)
    : ocultarDocumento(documento, tipo);

  const alternar = () => {
    const proximo = !revelado;
    setRevelado(proximo);
    // Só a abertura vira registro: esconder de volta não é acesso a dado.
    if (proximo) onRevelar?.();
  };

  return (
    <span className="documento-protegido">
      <LuFileText size={tamanhoIcone} className="documento-protegido__icone" />
      <span className="documento-protegido__rotulo">{rotulo}</span>
      <span className="documento-protegido__valor">{texto}</span>
      {podeRevelar && !ehCnpj && (
        <button
          type="button"
          onClick={alternar}
          aria-pressed={revelado}
          className="documento-protegido__botao"
          title={revelado ? "Ocultar o CPF de novo" : "Mostrar o CPF completo (fica registrado)"}
        >
          {revelado ? <LuEyeOff size={12} /> : <LuEye size={12} />}
          {revelado ? "Ocultar" : "Ver"}
        </button>
      )}
    </span>
  );
}
