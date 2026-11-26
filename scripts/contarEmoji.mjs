// Conta emoji no que o código escreve: texto JSX, string e pedaço de template.
// Comentário fica de fora. Usado pelo guard (src/lib/emojiGuard.test.js) e pelas
// métricas (scripts/metricas-refatoracao.mjs), para os dois números serem o mesmo.
//
// "Emoji" aqui é a propriedade Unicode Extended_Pictographic: pega 📦, ⚠️, 🧾,
// e deixa de fora as setas e o visto (→, ✓, ✕) que o sistema usa como texto.
// ©, ® e ™ também ficam de fora: estão na propriedade, mas são símbolos de
// texto (o crédito do mapa que a licença do OpenStreetMap exige, o rodapé).
import { parse } from "@babel/parser";

const EMOJI = /(?![©®™])\p{Extended_Pictographic}/gu;

function texto(no) {
  if (no.type === "JSXText" || no.type === "StringLiteral") return no.value;
  if (no.type === "TemplateElement") return no.value.raw;
  return null;
}

export function contarEmoji(fonte) {
  if (!/(?![©®™])\p{Extended_Pictographic}/u.test(fonte)) return 0;
  const ast = parse(fonte, { sourceType: "module", plugins: ["jsx"] });
  let total = 0;
  const visitar = (no) => {
    if (!no || typeof no.type !== "string") return;
    const t = texto(no);
    if (t) total += (t.match(EMOJI) ?? []).length;
    for (const chave of Object.keys(no)) {
      if (chave === "loc" || chave === "start" || chave === "end") continue;
      const v = no[chave];
      if (Array.isArray(v)) v.forEach(visitar);
      else if (v && typeof v === "object") visitar(v);
    }
  };
  visitar(ast.program);
  return total;
}
