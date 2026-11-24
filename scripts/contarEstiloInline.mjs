// Conta estilo inline num arquivo JSX: todo atributo `style` (objeto, variável
// ou expressão), menos o objeto que só atribui variável CSS (`{ "--gm-x": v }`),
// que é o padrão permitido. Usado pelo guard (src/lib/inlineStyleGuard.test.js)
// e pelas métricas (scripts/metricas-refatoracao.mjs), para os dois números
// serem o mesmo.
import { parse } from "@babel/parser";

/** O objeto só atribui variável CSS: toda chave é uma string que começa com "--". */
function soVariavelCss(expr) {
  return (
    expr?.type === "ObjectExpression" &&
    expr.properties.length > 0 &&
    expr.properties.every(
      (p) => p.type === "ObjectProperty" && p.key.type === "StringLiteral" && p.key.value.startsWith("--"),
    )
  );
}

export function contarEstiloInline(fonte) {
  const ast = parse(fonte, { sourceType: "module", plugins: ["jsx"] });
  let total = 0;
  const visitar = (no) => {
    if (!no || typeof no.type !== "string") return;
    if (
      no.type === "JSXAttribute" &&
      no.name?.name === "style" &&
      !(no.value?.type === "JSXExpressionContainer" && soVariavelCss(no.value.expression))
    ) {
      total += 1;
    }
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
