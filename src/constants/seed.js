/** Produtos de exemplo — removidos quando o cliente cadastrar os seus */
export const SEED_PRODUCTS = [
  { id: 1,  name: "Cerveja 600ml",    price: 15, category: "Bebidas" },
  { id: 2,  name: "Refrigerante",     price: 8,  category: "Bebidas" },
  { id: 3,  name: "Água Mineral",     price: 5,  category: "Bebidas" },
  { id: 4,  name: "Suco Natural",     price: 12, category: "Bebidas" },
  { id: 5,  name: "Caipirinha",       price: 20, category: "Drinks"  },
  { id: 6,  name: "Long Neck",        price: 12, category: "Bebidas" },
  { id: 7,  name: "Porção de Fritas", price: 28, category: "Comidas" },
  { id: 8,  name: "Hambúrguer",       price: 32, category: "Comidas" },
  { id: 9,  name: "Petisco Misto",    price: 35, category: "Comidas" },
  { id: 10, name: "Combo 2 Cervejas", price: 24, category: "Combos"  },
];

/*
 * Os usuários-semente (`DEFAULT_USERS`/`SEED_FLAG`) foram REMOVIDOS: traziam
 * usuário e senha fixos no código-fonte e não eram consumidos por
 * nenhum ponto do sistema — resquício do protótipo em localStorage,
 * antes do Supabase Auth. Credencial padrão em SaaS
 * multi-estabelecimento é porta destrancada: o primeiro acesso de cada
 * estabelecimento nasce no provisionamento (`src/lib/console.js`), com senha
 * provisória sorteada por CSPRNG.
 */
