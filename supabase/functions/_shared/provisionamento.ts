/**
 * Compensação do provisionamento de estabelecimento — a inversa dos itens 3
 * e 5 de `provisionar-estabelecimento`.
 *
 * Vive aqui, fora do index.ts, por um motivo só: assim é TESTÁVEL. O
 * index.ts chama `Deno.serve` no topo e importa de URL, então nenhum teste
 * consegue carregá-lo. Este módulo não toca em nada do Deno — recebe os
 * clientes prontos por parâmetro — e é exercitado por
 * `src/lib/provisionamentoCompensacao.test.js`.
 *
 * O FURO QUE ISTO FECHA
 * As duas compensações descartavam o resultado:
 *
 *     await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
 *     await supabaseAdmin.auth.admin.deleteUser(authCreated.user.id);
 *
 * E desde a 20260908 a primeira passou a falhar SEMPRE: o tenant nasce com
 * linha em `public.assinaturas`, cuja FK para `tenants(id)` não tem ON DELETE
 * CASCADE (20260719_assinaturas.sql:26), então o delete cru devolvia 23503
 * (foreign_key_violation) — sem ninguém ler. Todo provisionamento que
 * falhasse depois de criar o tenant deixava um ESTABELECIMENTO ÓRFÃO: sem
 * nenhum usuário para entrar nele, mas com assinatura, vencimento e valor,
 * contando na "Receita mensal" do Console. E o caminho de falha mais provável
 * é o que o próprio index.ts chama de "esperado" (colisão de e-mail enquanto
 * TENANT_ROOT_DOMAIN está desligado), então os órfãos se acumulavam a cada
 * nova tentativa.
 *
 * Quem remove o tenant agora é a RPC `remover_tenant_provisionado`
 * (20260910): apaga o que o provisionamento semeia, se RECUSA a apagar um
 * estabelecimento que já tenha usuário ou pagamento, e devolve erro.
 */

/** O mínimo que este módulo usa de um cliente supabase-js. */
export type ClienteRpc = {
  rpc: (
    nome: string,
    params: Record<string, unknown>,
  ) => Promise<{ error?: { message?: string } | null }>;
};

export type ClienteAuthAdmin = {
  auth: {
    admin: {
      deleteUser: (id: string) => Promise<{ error?: { message?: string } | null }>;
    };
  };
};

export type TenantCriado = { id?: string; nome?: string; slug?: string };

function aviso(assunto: string, motivo: string) {
  return ` ATENÇÃO: ${assunto} e NÃO pôde ser removido automaticamente: ${motivo} Remova antes de tentar de novo.`;
}

function motivoDe(erro: { message?: string } | null | undefined) {
  const texto = String(erro?.message ?? "").trim();
  return texto || "o banco não disse o motivo.";
}

/**
 * Desfaz o tenant criado no item 3. Devolve "" quando conseguiu desfazer e
 * uma frase pronta para a tela do Console quando NÃO conseguiu — nunca lança
 * e nunca engole o erro: um órfão silencioso é pior do que um aviso feio.
 *
 * `cliente` tem de ser o cliente do CHAMADOR (JWT do super-admin), nunca o
 * service_role: a RPC é guardada por `is_super_admin()`, que lê
 * `app_metadata.gastro_role` do JWT — com a chave de serviço a guarda
 * reprovaria e nenhuma compensação funcionaria.
 */
export async function compensarProvisionamento(
  cliente: ClienteRpc,
  tenant: TenantCriado,
): Promise<string> {
  const nome = String(tenant?.nome ?? "").trim() || "sem nome";
  const ref = String(tenant?.slug ?? tenant?.id ?? "sem identificação").trim();
  try {
    const { error } = await cliente.rpc("remover_tenant_provisionado", {
      p_tenant_id: tenant?.id ?? null,
    });
    if (!error) return "";
    console.error("Compensação falhou — estabelecimento órfão:", tenant?.id, error.message);
    return aviso(`o estabelecimento "${nome}" (${ref}) foi criado`, motivoDe(error));
  } catch (e) {
    const motivo = motivoDe(e as { message?: string });
    console.error("Compensação falhou — estabelecimento órfão:", tenant?.id, motivo);
    return aviso(`o estabelecimento "${nome}" (${ref}) foi criado`, motivo);
  }
}

/**
 * Remove a credencial de auth criada no item 5 quando o perfil não entrou.
 * Sai ANTES do tenant: enquanto a credencial existir o e-mail segue ocupado e
 * uma nova tentativa com o mesmo username colidiria de novo.
 *
 * Mesmo contrato: "" quando desfez, frase de aviso quando não.
 */
export async function removerCredencialOrfa(
  admin: ClienteAuthAdmin,
  authUserId: string,
  email: string,
): Promise<string> {
  try {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (!error) return "";
    console.error("Falha ao remover a credencial órfã:", email, error.message);
    return aviso(`a credencial "${email}" foi criada`, motivoDe(error));
  } catch (e) {
    const motivo = motivoDe(e as { message?: string });
    console.error("Falha ao remover a credencial órfã:", email, motivo);
    return aviso(`a credencial "${email}" foi criada`, motivo);
  }
}
