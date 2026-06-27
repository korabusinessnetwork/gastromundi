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

/** Flag usada para detectar senhas de seed não migradas */
export const SEED_FLAG = "SEED:";

/** Usuários padrão — senhas serão hasheadas na primeira execução */
export const DEFAULT_USERS = [
  { id: 1, name: "Administrador", username: "admin",   password: SEED_FLAG + "Admin@2025!",   role: "admin"   },
  { id: 2, name: "Caixa",         username: "caixa",   password: SEED_FLAG + "Caixa@2025!",   role: "caixa"   },
  { id: 3, name: "Garçom",        username: "garcom",  password: SEED_FLAG + "Garcom@2025!",  role: "garcom"  },
  { id: 4, name: "Gerente",       username: "gerente", password: SEED_FLAG + "Gerente@2025!", role: "gerente" },
];
