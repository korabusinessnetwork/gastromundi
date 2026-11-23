// Gerado por `npm run tipos:banco` a partir do schema de produção. Não edite à mão:
// rode o comando de novo depois de aplicar migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addons: {
        Row: {
          codigo: string
          descricao: string | null
          nome: string
        }
        Insert: {
          codigo: string
          descricao?: string | null
          nome: string
        }
        Update: {
          codigo?: string
          descricao?: string | null
          nome?: string
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          carencia_dias: number
          ciclo_dias: number
          criado_em: string
          data_inicio: string
          data_vencimento: string
          isencao_motivo: string | null
          isento_ate: string | null
          status: string
          tenant_id: string
          ultima_renovacao: string | null
          valor_mensal: number
        }
        Insert: {
          carencia_dias?: number
          ciclo_dias?: number
          criado_em?: string
          data_inicio?: string
          data_vencimento: string
          isencao_motivo?: string | null
          isento_ate?: string | null
          status?: string
          tenant_id: string
          ultima_renovacao?: string | null
          valor_mensal?: number
        }
        Update: {
          carencia_dias?: number
          ciclo_dias?: number
          criado_em?: string
          data_inicio?: string
          data_vencimento?: string
          isencao_motivo?: string | null
          isento_ate?: string | null
          status?: string
          tenant_id?: string
          ultima_renovacao?: string | null
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_pagamentos: {
        Row: {
          competencia: string
          confirmado_em: string
          confirmado_por: string | null
          estornado_em: string | null
          estornado_por: string | null
          estorno_motivo: string | null
          id: string
          metodo: string | null
          tenant_id: string
          valor: number
        }
        Insert: {
          competencia: string
          confirmado_em?: string
          confirmado_por?: string | null
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          id?: string
          metodo?: string | null
          tenant_id: string
          valor: number
        }
        Update: {
          competencia?: string
          confirmado_em?: string
          confirmado_por?: string | null
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_motivo?: string | null
          id?: string
          metodo?: string | null
          tenant_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_pagamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentos: {
        Row: {
          autor: string
          autorizado_por: string | null
          created_at: string
          id: string
          motivo: string
          sessao_aberta_em: string | null
          tenant_id: string
          tipo: string
          valor: number
        }
        Insert: {
          autor: string
          autorizado_por?: string | null
          created_at?: string
          id?: string
          motivo: string
          sessao_aberta_em?: string | null
          tenant_id?: string
          tipo: string
          valor: number
        }
        Update: {
          autor?: string
          autorizado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string
          sessao_aberta_em?: string | null
          tenant_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categoria_grupo: {
        Row: {
          category: string
          grupo_id: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          category: string
          grupo_id: number
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          grupo_id?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categoria_grupo_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categoria_grupo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_roteamento: {
        Row: {
          categoria: string
          id: string
          local_impressao_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria: string
          id?: string
          local_impressao_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          id?: string
          local_impressao_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_roteamento_local_impressao_id_fkey"
            columns: ["local_impressao_id"]
            isOneToOne: false
            referencedRelation: "locais_impressao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_roteamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          anonimizado: boolean
          created_at: string
          criado_por: string | null
          documento: string | null
          documento_tipo: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          anonimizado?: boolean
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          documento_tipo?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          anonimizado?: boolean
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          documento_tipo?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_produtos: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          preco_customizado: number | null
          produto_id: number
          quantidade: number
          tenant_id: string
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          preco_customizado?: number | null
          produto_id: number
          quantidade?: number
          tenant_id?: string
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          preco_customizado?: number | null
          produto_id?: number
          quantidade?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_produtos_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_produtos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_subprodutos: {
        Row: {
          combo_id: string
          created_at: string
          id: string
          preco_customizado: number | null
          quantidade: number
          subproduto_id: string
          tenant_id: string
        }
        Insert: {
          combo_id: string
          created_at?: string
          id?: string
          preco_customizado?: number | null
          quantidade?: number
          subproduto_id: string
          tenant_id?: string
        }
        Update: {
          combo_id?: string
          created_at?: string
          id?: string
          preco_customizado?: number | null
          quantidade?: number
          subproduto_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_subprodutos_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_subprodutos_subproduto_id_fkey"
            columns: ["subproduto_id"]
            isOneToOne: false
            referencedRelation: "subprodutos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_subprodutos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          item_principal_id: number
          modo: string
          nome: string
          preco_total: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          item_principal_id: number
          modo?: string
          nome: string
          preco_total?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          item_principal_id?: number
          modo?: string
          nome?: string
          preco_total?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "combos_item_principal_id_fkey"
            columns: ["item_principal_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      complementos: {
        Row: {
          disponivel: boolean
          grupo_id: string
          id: string
          nome: string
          ordem: number
          preco: number
          produto_id: number | null
          tenant_id: string
        }
        Insert: {
          disponivel?: boolean
          grupo_id: string
          id?: string
          nome: string
          ordem?: number
          preco?: number
          produto_id?: number | null
          tenant_id?: string
        }
        Update: {
          disponivel?: boolean
          grupo_id?: string
          id?: string
          nome?: string
          ordem?: number
          preco?: number
          produto_id?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complementos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_complemento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complementos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complementos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          key: string
          tenant_id: string
          value: Json
        }
        Insert: {
          key: string
          tenant_id?: string
          value: Json
        }
        Update: {
          key?: string
          tenant_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      config_delivery: {
        Row: {
          aberto: boolean
          endereco_origem: string | null
          endereco_origem_bloqueado: boolean
          faixas_taxa: Json
          fuso: string
          horario: Json
          origem_lat: number | null
          origem_lng: number | null
          pedido_minimo: number
          tempo_preparo_min: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          aberto?: boolean
          endereco_origem?: string | null
          endereco_origem_bloqueado?: boolean
          faixas_taxa?: Json
          fuso?: string
          horario?: Json
          origem_lat?: number | null
          origem_lng?: number | null
          pedido_minimo?: number
          tempo_preparo_min?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          aberto?: boolean
          endereco_origem?: string | null
          endereco_origem_bloqueado?: boolean
          faixas_taxa?: Json
          fuso?: string
          horario?: Json
          origem_lat?: number | null
          origem_lng?: number | null
          pedido_minimo?: number
          tempo_preparo_min?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_delivery_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pedido_itens: {
        Row: {
          combo_id: string | null
          complementos: Json
          id: string
          nome: string
          obs: string | null
          pedido_id: string
          preco_unit: number
          produto_id: number | null
          qtd: number
          tenant_id: string
        }
        Insert: {
          combo_id?: string | null
          complementos?: Json
          id?: string
          nome: string
          obs?: string | null
          pedido_id: string
          preco_unit: number
          produto_id?: number | null
          qtd?: number
          tenant_id: string
        }
        Update: {
          combo_id?: string | null
          complementos?: Json
          id?: string
          nome?: string
          obs?: string | null
          pedido_id?: string
          preco_unit?: number
          produto_id?: number | null
          qtd?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pedido_itens_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "delivery_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pedido_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pedidos: {
        Row: {
          bairro: string | null
          cep: string | null
          cliente_nome: string
          cliente_telefone: string | null
          complemento_endereco: string | null
          created_at: string
          endereco: string
          entrega_lat: number | null
          entrega_lng: number | null
          forma_pagamento: string
          id: string
          levar_maquininha: boolean
          numero: string
          pending_id: string | null
          status: string
          subtotal: number
          taxa_entrega: number
          tenant_id: string
          total: number
          troco_para: number | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          complemento_endereco?: string | null
          created_at?: string
          endereco: string
          entrega_lat?: number | null
          entrega_lng?: number | null
          forma_pagamento: string
          id?: string
          levar_maquininha?: boolean
          numero: string
          pending_id?: string | null
          status?: string
          subtotal: number
          taxa_entrega?: number
          tenant_id: string
          total: number
          troco_para?: number | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          complemento_endereco?: string | null
          created_at?: string
          endereco?: string
          entrega_lat?: number | null
          entrega_lng?: number | null
          forma_pagamento?: string
          id?: string
          levar_maquininha?: boolean
          numero?: string
          pending_id?: string | null
          status?: string
          subtotal?: number
          taxa_entrega?: number
          tenant_id?: string
          total?: number
          troco_para?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pedidos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estacoes: {
        Row: {
          created_at: string | null
          id: string
          impressoras: Json
          nome: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          impressoras?: Json
          nome: string
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          impressoras?: Json
          nome?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          minimo: number
          produto_id: number
          quantidade: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          minimo?: number
          produto_id: number
          quantidade?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          minimo?: number
          produto_id?: number
          quantidade?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_baixas_aplicadas: {
        Row: {
          aplicada_em: string
          op_id: string
          produto_id: number | null
          qtd: number
          subproduto_id: string | null
          tenant_id: string | null
          tipo: string
        }
        Insert: {
          aplicada_em?: string
          op_id: string
          produto_id?: number | null
          qtd: number
          subproduto_id?: string | null
          tenant_id?: string | null
          tipo?: string
        }
        Update: {
          aplicada_em?: string
          op_id?: string
          produto_id?: number | null
          qtd?: number
          subproduto_id?: string | null
          tenant_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      estoque_entradas: {
        Row: {
          created_at: string | null
          data_entrada: string | null
          id: string
          nota_fiscal_id: string | null
          observacao: string | null
          preco_unitario: number | null
          product_id: number | null
          quantidade: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          data_entrada?: string | null
          id?: string
          nota_fiscal_id?: string | null
          observacao?: string | null
          preco_unitario?: number | null
          product_id?: number | null
          quantidade?: number | null
          tenant_id?: string
        }
        Update: {
          created_at?: string | null
          data_entrada?: string | null
          id?: string
          nota_fiscal_id?: string | null
          observacao?: string | null
          preco_unitario?: number | null
          product_id?: number | null
          quantidade?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_entradas_nota_fiscal_id_fkey"
            columns: ["nota_fiscal_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_entradas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_entradas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_subprodutos: {
        Row: {
          minimo: number
          quantidade: number
          subproduto_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          minimo?: number
          quantidade?: number
          subproduto_id: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          minimo?: number
          quantidade?: number
          subproduto_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_subprodutos_subproduto_id_fkey"
            columns: ["subproduto_id"]
            isOneToOne: true
            referencedRelation: "subprodutos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_subprodutos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos: {
        Row: {
          created_at: string
          data: Json
          id: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_subgrupos: {
        Row: {
          grupo_filho_id: string
          grupo_pai_id: string
          id: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          grupo_filho_id: string
          grupo_pai_id: string
          id?: string
          ordem?: number
          tenant_id?: string
        }
        Update: {
          grupo_filho_id?: string
          grupo_pai_id?: string
          id?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_subgrupos_grupo_filho_id_fkey"
            columns: ["grupo_filho_id"]
            isOneToOne: false
            referencedRelation: "grupos_complemento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_subgrupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "grupos_complemento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_subgrupos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_categoria: {
        Row: {
          created_at: string | null
          id: number
          nome: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          nome: string
          tenant_id?: string
        }
        Update: {
          created_at?: string | null
          id?: never
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_categoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_complemento: {
        Row: {
          created_at: string
          id: string
          max_escolhas: number
          min_escolhas: number
          nome: string
          ordem: number
          produto_id: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_escolhas?: number
          min_escolhas?: number
          nome: string
          ordem?: number
          produto_id?: number | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_escolhas?: number
          min_escolhas?: number
          nome?: string
          ordem?: number
          produto_id?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_complemento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_complemento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_uso: {
        Row: {
          chamadas: number
          dia: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chamadas?: number
          dia?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          chamadas?: number
          dia?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      itens_fiscal: {
        Row: {
          aliquota_cbs: number | null
          aliquota_cofins: number | null
          aliquota_ibs: number | null
          aliquota_icms: number | null
          aliquota_ipi: number | null
          aliquota_is: number | null
          aliquota_pis: number | null
          cest: string | null
          cfop: string | null
          csosn: string | null
          cst_cofins: string | null
          cst_icms: string | null
          cst_ipi: string | null
          cst_pis: string | null
          id: string
          item_id: number
          ncm: string | null
          observacao_fiscal: string | null
          origem_mercadoria: string | null
          reducao_base_icms: number | null
          regime_tributario: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          aliquota_cbs?: number | null
          aliquota_cofins?: number | null
          aliquota_ibs?: number | null
          aliquota_icms?: number | null
          aliquota_ipi?: number | null
          aliquota_is?: number | null
          aliquota_pis?: number | null
          cest?: string | null
          cfop?: string | null
          csosn?: string | null
          cst_cofins?: string | null
          cst_icms?: string | null
          cst_ipi?: string | null
          cst_pis?: string | null
          id?: string
          item_id: number
          ncm?: string | null
          observacao_fiscal?: string | null
          origem_mercadoria?: string | null
          reducao_base_icms?: number | null
          regime_tributario?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          aliquota_cbs?: number | null
          aliquota_cofins?: number | null
          aliquota_ibs?: number | null
          aliquota_icms?: number | null
          aliquota_ipi?: number | null
          aliquota_is?: number | null
          aliquota_pis?: number | null
          cest?: string | null
          cfop?: string | null
          csosn?: string | null
          cst_cofins?: string | null
          cst_icms?: string | null
          cst_ipi?: string | null
          cst_pis?: string | null
          id?: string
          item_id?: number
          ncm?: string | null
          observacao_fiscal?: string | null
          origem_mercadoria?: string | null
          reducao_base_icms?: number | null
          regime_tributario?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_fiscal_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fiscal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvas_eventos: {
        Row: {
          created_at: string
          id: number
          modulo: string
          operator_id: string | null
          payload: Json
          processado: boolean
          tenant_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: number
          modulo: string
          operator_id?: string | null
          payload?: Json
          processado?: boolean
          tenant_id?: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: number
          modulo?: string
          operator_id?: string | null
          payload?: Json
          processado?: boolean
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvas_eventos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvas_insights: {
        Row: {
          acao: Json | null
          created_at: string
          descricao: string
          id: string
          modulo: string
          origem: Json
          severidade: string
          status: string
          status_em: string | null
          status_por: string | null
          tenant_id: string
          tipo: string
          titulo: string
          visibilidade: string
        }
        Insert: {
          acao?: Json | null
          created_at?: string
          descricao: string
          id?: string
          modulo: string
          origem?: Json
          severidade?: string
          status?: string
          status_em?: string | null
          status_por?: string | null
          tenant_id?: string
          tipo: string
          titulo: string
          visibilidade?: string
        }
        Update: {
          acao?: Json | null
          created_at?: string
          descricao?: string
          id?: string
          modulo?: string
          origem?: Json
          severidade?: string
          status?: string
          status_em?: string | null
          status_por?: string | null
          tenant_id?: string
          tipo?: string
          titulo?: string
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "jarvas_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          baixado_em: string | null
          baixado_por: string | null
          categoria: string
          cliente_id: string | null
          competencia: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          origem: string
          retroativo: boolean
          status: string
          tenant_id: string
          tipo: string
          valor: number
          vencimento: string | null
          venda_id: string | null
        }
        Insert: {
          baixado_em?: string | null
          baixado_por?: string | null
          categoria: string
          cliente_id?: string | null
          competencia: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          origem?: string
          retroativo?: boolean
          status?: string
          tenant_id?: string
          tipo: string
          valor: number
          vencimento?: string | null
          venda_id?: string | null
        }
        Update: {
          baixado_em?: string | null
          baixado_por?: string | null
          categoria?: string
          cliente_id?: string | null
          competencia?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          origem?: string
          retroativo?: boolean
          status?: string
          tenant_id?: string
          tipo?: string
          valor?: number
          vencimento?: string | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          criado_em: string
          email: string
          id: string
          nome: string
          origem: string
          plano_itens: string[] | null
          plano_total: number | null
          whatsapp: string
        }
        Insert: {
          criado_em?: string
          email: string
          id?: string
          nome: string
          origem?: string
          plano_itens?: string[] | null
          plano_total?: number | null
          whatsapp: string
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          origem?: string
          plano_itens?: string[] | null
          plano_total?: number | null
          whatsapp?: string
        }
        Relationships: []
      }
      locais_impressao: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tenant_id?: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locais_impressao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      login_tentativas: {
        Row: {
          bloqueado_ate: string | null
          email: string
          falhas: number
          janela_inicio: string
        }
        Insert: {
          bloqueado_ate?: string | null
          email: string
          falhas?: number
          janela_inicio?: string
        }
        Update: {
          bloqueado_ate?: string | null
          email?: string
          falhas?: number
          janela_inicio?: string
        }
        Relationships: []
      }
      mesas: {
        Row: {
          capacidade: number | null
          created_at: string | null
          numero: string
          posicao_x: number | null
          posicao_y: number | null
          status_manual: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          capacidade?: number | null
          created_at?: string | null
          numero: string
          posicao_x?: number | null
          posicao_y?: number | null
          status_manual?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          capacidade?: number | null
          created_at?: string | null
          numero?: string
          posicao_x?: number | null
          posicao_y?: number | null
          status_manual?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mesas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nfce_emitidas: {
        Row: {
          c_stat: string | null
          cancelada_em: string | null
          chave: string | null
          created_at: string
          dh_emi: string | null
          id: string
          justificativa_cancelamento: string | null
          motivo: string | null
          numero: number | null
          protocolo: string | null
          protocolo_cancelamento: string | null
          serie: number | null
          status: string
          tenant_id: string
          tentativas: number
          tp_amb: number | null
          tp_emis: number | null
          transmitida_em: string | null
          updated_at: string
          url_qrcode: string | null
          v_nf: number | null
          venda_id: string | null
          x_motivo: string | null
          xml: string | null
          xml_evento: string | null
          xml_tipo: string | null
        }
        Insert: {
          c_stat?: string | null
          cancelada_em?: string | null
          chave?: string | null
          created_at?: string
          dh_emi?: string | null
          id?: string
          justificativa_cancelamento?: string | null
          motivo?: string | null
          numero?: number | null
          protocolo?: string | null
          protocolo_cancelamento?: string | null
          serie?: number | null
          status: string
          tenant_id: string
          tentativas?: number
          tp_amb?: number | null
          tp_emis?: number | null
          transmitida_em?: string | null
          updated_at?: string
          url_qrcode?: string | null
          v_nf?: number | null
          venda_id?: string | null
          x_motivo?: string | null
          xml?: string | null
          xml_evento?: string | null
          xml_tipo?: string | null
        }
        Update: {
          c_stat?: string | null
          cancelada_em?: string | null
          chave?: string | null
          created_at?: string
          dh_emi?: string | null
          id?: string
          justificativa_cancelamento?: string | null
          motivo?: string | null
          numero?: number | null
          protocolo?: string | null
          protocolo_cancelamento?: string | null
          serie?: number | null
          status?: string
          tenant_id?: string
          tentativas?: number
          tp_amb?: number | null
          tp_emis?: number | null
          transmitida_em?: string | null
          updated_at?: string
          url_qrcode?: string | null
          v_nf?: number | null
          venda_id?: string | null
          x_motivo?: string | null
          xml?: string | null
          xml_evento?: string | null
          xml_tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfce_emitidas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nfce_inutilizacoes: {
        Row: {
          ano: number
          c_stat: string | null
          created_at: string
          id: string
          justificativa: string
          nnf_fin: number
          nnf_ini: number
          protocolo: string | null
          serie: number
          status: string
          tenant_id: string
          tp_amb: number | null
          x_motivo: string | null
          xml: string | null
        }
        Insert: {
          ano: number
          c_stat?: string | null
          created_at?: string
          id?: string
          justificativa: string
          nnf_fin: number
          nnf_ini: number
          protocolo?: string | null
          serie: number
          status: string
          tenant_id?: string
          tp_amb?: number | null
          x_motivo?: string | null
          xml?: string | null
        }
        Update: {
          ano?: number
          c_stat?: string | null
          created_at?: string
          id?: string
          justificativa?: string
          nnf_fin?: number
          nnf_ini?: number
          protocolo?: string | null
          serie?: number
          status?: string
          tenant_id?: string
          tp_amb?: number | null
          x_motivo?: string | null
          xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfce_inutilizacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          chave_acesso: string | null
          created_at: string | null
          data_emissao: string | null
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          numero: string | null
          origem: string | null
          serie: string | null
          status: string | null
          tenant_id: string
          valor_total: number | null
          xml_raw: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string | null
          data_emissao?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: string | null
          origem?: string | null
          serie?: string | null
          status?: string | null
          tenant_id?: string
          valor_total?: number | null
          xml_raw?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string | null
          data_emissao?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero?: string | null
          origem?: string | null
          serie?: string | null
          status?: string | null
          tenant_id?: string
          valor_total?: number | null
          xml_raw?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_itens: {
        Row: {
          codigo_xml: string | null
          descricao_xml: string | null
          fator_conversao: number | null
          id: string
          nota_fiscal_id: string | null
          preco_total: number | null
          preco_unitario: number | null
          product_id: number | null
          quantidade: number | null
          quantidade_estoque: number | null
          tenant_id: string
          unidade_xml: string | null
        }
        Insert: {
          codigo_xml?: string | null
          descricao_xml?: string | null
          fator_conversao?: number | null
          id?: string
          nota_fiscal_id?: string | null
          preco_total?: number | null
          preco_unitario?: number | null
          product_id?: number | null
          quantidade?: number | null
          quantidade_estoque?: number | null
          tenant_id?: string
          unidade_xml?: string | null
        }
        Update: {
          codigo_xml?: string | null
          descricao_xml?: string | null
          fator_conversao?: number | null
          id?: string
          nota_fiscal_id?: string | null
          preco_total?: number | null
          preco_unitario?: number | null
          product_id?: number | null
          quantidade?: number | null
          quantidade_estoque?: number | null
          tenant_id?: string
          unidade_xml?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_itens_nota_fiscal_id_fkey"
            columns: ["nota_fiscal_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_itens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_logs: {
        Row: {
          action_type: string
          created_at: string
          id: number
          operator_id: string
          payload: Json | null
          tenant_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: number
          operator_id: string
          payload?: Json | null
          tenant_id?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: number
          operator_id?: string
          payload?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pautas: {
        Row: {
          atualizada_por: string | null
          contexto: string
          created_at: string
          criada_por: string | null
          envolvidos: string[]
          finalizada_em: string | null
          id: string
          intuito: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          atualizada_por?: string | null
          contexto?: string
          created_at?: string
          criada_por?: string | null
          envolvidos?: string[]
          finalizada_em?: string | null
          id?: string
          intuito: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          atualizada_por?: string | null
          contexto?: string
          created_at?: string
          criada_por?: string | null
          envolvidos?: string[]
          finalizada_em?: string | null
          id?: string
          intuito?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      pautas_pessoas: {
        Row: {
          ativo: boolean
          created_at: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      pending: {
        Row: {
          apelido: string | null
          cliente_id: string | null
          cliente_nome: string | null
          comanda: string | null
          created_at: string
          created_by: string | null
          editando_desde: string | null
          editando_nome: string | null
          editando_por: string | null
          em_preparo_em: string | null
          garcom: string | null
          id: string
          items: Json
          mesa: string | null
          note: string | null
          pronto_em: string | null
          status: string
          status_cozinha: string
          tenant_id: string
          total: number | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comanda?: string | null
          created_at?: string
          created_by?: string | null
          editando_desde?: string | null
          editando_nome?: string | null
          editando_por?: string | null
          em_preparo_em?: string | null
          garcom?: string | null
          id: string
          items?: Json
          mesa?: string | null
          note?: string | null
          pronto_em?: string | null
          status?: string
          status_cozinha?: string
          tenant_id?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          comanda?: string | null
          created_at?: string
          created_by?: string | null
          editando_desde?: string | null
          editando_nome?: string | null
          editando_por?: string | null
          em_preparo_em?: string | null
          garcom?: string | null
          id?: string
          items?: Json
          mesa?: string | null
          note?: string | null
          pronto_em?: string | null
          status?: string
          status_cozinha?: string
          tenant_id?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          codigo: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          nome: string
          ordem: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      planos_modulos: {
        Row: {
          modulo_codigo: string
          plano_codigo: string
        }
        Insert: {
          modulo_codigo: string
          plano_codigo: string
        }
        Update: {
          modulo_codigo?: string
          plano_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_modulos_plano_codigo_fkey"
            columns: ["plano_codigo"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string
          codigo_barras: string | null
          emoji: string | null
          fator_consumo_estoque: number | null
          id: number
          name: string
          price: number
          produzivel: boolean
          proxima_validade: string | null
          tenant_id: string
          unidade_consumo: string | null
          unidade_estoque: string
          unidades_compra: Json
          validade_dias: number | null
        }
        Insert: {
          active?: boolean
          category: string
          codigo_barras?: string | null
          emoji?: string | null
          fator_consumo_estoque?: number | null
          id?: number
          name: string
          price: number
          produzivel?: boolean
          proxima_validade?: string | null
          tenant_id?: string
          unidade_consumo?: string | null
          unidade_estoque?: string
          unidades_compra?: Json
          validade_dias?: number | null
        }
        Update: {
          active?: boolean
          category?: string
          codigo_barras?: string | null
          emoji?: string | null
          fator_consumo_estoque?: number | null
          id?: number
          name?: string
          price?: number
          produzivel?: boolean
          proxima_validade?: string | null
          tenant_id?: string
          unidade_consumo?: string | null
          unidade_estoque?: string
          unidades_compra?: Json
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_delivery: {
        Row: {
          descricao: string | null
          disponivel: boolean
          foto_url: string | null
          id: string
          ordem: number
          produto_id: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          descricao?: string | null
          disponivel?: boolean
          foto_url?: string | null
          id?: string
          ordem?: number
          produto_id: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          descricao?: string | null
          disponivel?: boolean
          foto_url?: string | null
          id?: string
          ordem?: number
          produto_id?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_delivery_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_delivery_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_grupos: {
        Row: {
          grupo_id: string
          id: string
          ordem: number
          produto_id: number
          tenant_id: string
        }
        Insert: {
          grupo_id: string
          id?: string
          ordem?: number
          produto_id: number
          tenant_id?: string
        }
        Update: {
          grupo_id?: string
          id?: string
          ordem?: number
          produto_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_complemento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_grupos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_grupos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permissions: Json
          role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          permissions?: Json
          role: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          permissions?: Json
          role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          at: string
          data: Json
          id: string
          tenant_id: string
        }
        Insert: {
          at?: string
          data?: Json
          id: string
          tenant_id?: string
        }
        Update: {
          at?: string
          data?: Json
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      senha_admin_tentativas: {
        Row: {
          auth_id: string
          falhas: number
          janela_inicio: string
        }
        Insert: {
          auth_id: string
          falhas?: number
          janela_inicio?: string
        }
        Update: {
          auth_id?: string
          falhas?: number
          janela_inicio?: string
        }
        Relationships: []
      }
      solicitacoes_conta: {
        Row: {
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          email: string
          estabelecimento: string
          id: string
          nome: string
          observacao: string | null
          plano_codigo: string | null
          plano_itens: string[] | null
          plano_nome: string | null
          plano_total: number | null
          slug_desejado: string
          status: string
          tenant_id: string | null
          whatsapp: string
        }
        Insert: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email: string
          estabelecimento: string
          id?: string
          nome: string
          observacao?: string | null
          plano_codigo?: string | null
          plano_itens?: string[] | null
          plano_nome?: string | null
          plano_total?: number | null
          slug_desejado: string
          status?: string
          tenant_id?: string | null
          whatsapp: string
        }
        Update: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          email?: string
          estabelecimento?: string
          id?: string
          nome?: string
          observacao?: string | null
          plano_codigo?: string | null
          plano_itens?: string[] | null
          plano_nome?: string | null
          plano_total?: number | null
          slug_desejado?: string
          status?: string
          tenant_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_conta_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subprodutos: {
        Row: {
          ativo: boolean
          categoria: string | null
          controla_estoque: boolean
          created_at: string
          id: string
          nome: string
          preco: number
          tenant_id: string
          unidade_medida: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          controla_estoque?: boolean
          created_at?: string
          id?: string
          nome: string
          preco?: number
          tenant_id?: string
          unidade_medida?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          controla_estoque?: boolean
          created_at?: string
          id?: string
          nome?: string
          preco?: number
          tenant_id?: string
          unidade_medida?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subprodutos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addons: {
        Row: {
          addon_codigo: string
          ativado_em: string
          ativo: boolean
          tenant_id: string
        }
        Insert: {
          addon_codigo: string
          ativado_em?: string
          ativo?: boolean
          tenant_id: string
        }
        Update: {
          addon_codigo?: string
          ativado_em?: string
          ativo?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addons_addon_codigo_fkey"
            columns: ["addon_codigo"]
            isOneToOne: false
            referencedRelation: "addons"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "tenant_addons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_fiscal_config: {
        Row: {
          ambiente: number
          ativo: boolean
          bairro: string | null
          cep: string | null
          cnpj: string | null
          codigo_municipio: string | null
          complemento: string | null
          contingencia_ativa: boolean
          contingencia_desde: string | null
          created_at: string
          crt: number | null
          csc_id: string | null
          fone: string | null
          ie: string | null
          im: string | null
          logradouro: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero_end: string | null
          proximo_numero: number
          razao_social: string | null
          serie: number
          tenant_id: string
          uf: string
          updated_at: string
          url_autorizacao: string | null
          url_inutilizacao: string | null
          url_qrcode: string | null
          url_recepcao_evento: string | null
        }
        Insert: {
          ambiente?: number
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cnpj?: string | null
          codigo_municipio?: string | null
          complemento?: string | null
          contingencia_ativa?: boolean
          contingencia_desde?: string | null
          created_at?: string
          crt?: number | null
          csc_id?: string | null
          fone?: string | null
          ie?: string | null
          im?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero_end?: string | null
          proximo_numero?: number
          razao_social?: string | null
          serie?: number
          tenant_id?: string
          uf?: string
          updated_at?: string
          url_autorizacao?: string | null
          url_inutilizacao?: string | null
          url_qrcode?: string | null
          url_recepcao_evento?: string | null
        }
        Update: {
          ambiente?: number
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cnpj?: string | null
          codigo_municipio?: string | null
          complemento?: string | null
          contingencia_ativa?: boolean
          contingencia_desde?: string | null
          created_at?: string
          crt?: number | null
          csc_id?: string | null
          fone?: string | null
          ie?: string | null
          im?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero_end?: string | null
          proximo_numero?: number
          razao_social?: string | null
          serie?: number
          tenant_id?: string
          uf?: string
          updated_at?: string
          url_autorizacao?: string | null
          url_inutilizacao?: string | null
          url_qrcode?: string | null
          url_recepcao_evento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_fiscal_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          plano_codigo?: string
          slug: string
          tema?: Json
          termos_aceitos_em?: string | null
          termos_versao?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          plano_codigo?: string
          slug?: string
          tema?: Json
          termos_aceitos_em?: string | null
          termos_versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plano_codigo_fkey"
            columns: ["plano_codigo"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      trabalhos_impressao: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          documento: Json
          erro: string | null
          estacao_id: string | null
          id: string
          impresso_em: string | null
          local_impressao_id: string
          status: string
          tenant_id: string
          tentativas: number
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          documento: Json
          erro?: string | null
          estacao_id?: string | null
          id?: string
          impresso_em?: string | null
          local_impressao_id: string
          status?: string
          tenant_id?: string
          tentativas?: number
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          documento?: Json
          erro?: string | null
          estacao_id?: string | null
          id?: string
          impresso_em?: string | null
          local_impressao_id?: string
          status?: string
          tenant_id?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "trabalhos_impressao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          abreviacao: string
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          abreviacao: string
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
          tenant_id?: string
          tipo: string
        }
        Update: {
          abreviacao?: string
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_medida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          auth_id: string | null
          id: number
          name: string
          permissions: Json | null
          role: string
          tenant_id: string | null
          username: string
        }
        Insert: {
          active?: boolean
          auth_id?: string | null
          id?: number
          name: string
          permissions?: Json | null
          role: string
          tenant_id?: string | null
          username: string
        }
        Update: {
          active?: boolean
          auth_id?: string | null
          id?: number
          name?: string
          permissions?: Json | null
          role?: string
          tenant_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_itens: {
        Row: {
          cancelado: boolean
          cancelado_por: string | null
          id: string
          motivo_cancelamento: string | null
          nome: string
          preco: number
          product_id: number | null
          qtd: number
          tenant_id: string
          venda_id: string
        }
        Insert: {
          cancelado?: boolean
          cancelado_por?: string | null
          id?: string
          motivo_cancelamento?: string | null
          nome: string
          preco: number
          product_id?: number | null
          qtd?: number
          tenant_id?: string
          venda_id: string
        }
        Update: {
          cancelado?: boolean
          cancelado_por?: string | null
          id?: string
          motivo_cancelamento?: string | null
          nome?: string
          preco?: number
          product_id?: number | null
          qtd?: number
          tenant_id?: string
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      venda_pagamentos: {
        Row: {
          id: string
          metodo: string
          tenant_id: string
          valor: number
          venda_id: string
        }
        Insert: {
          id?: string
          metodo: string
          tenant_id?: string
          valor: number
          venda_id: string
        }
        Update: {
          id?: string
          metodo?: string
          tenant_id?: string
          valor?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_pagamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          at: string
          cancelada: boolean
          cancelada_em: string | null
          cancelada_por: string | null
          cashier: string | null
          cliente_id: string | null
          comanda: string | null
          id: string
          mesa: string | null
          motivo_cancelamento: string | null
          subtotal: number | null
          taxa_servico: boolean
          tenant_id: string
          total: number
          valor_ajuste: number
          valor_taxa: number
        }
        Insert: {
          at?: string
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_por?: string | null
          cashier?: string | null
          cliente_id?: string | null
          comanda?: string | null
          id: string
          mesa?: string | null
          motivo_cancelamento?: string | null
          subtotal?: number | null
          taxa_servico?: boolean
          tenant_id?: string
          total: number
          valor_ajuste?: number
          valor_taxa?: number
        }
        Update: {
          at?: string
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_por?: string | null
          cashier?: string | null
          cliente_id?: string | null
          comanda?: string | null
          id?: string
          mesa?: string | null
          motivo_cancelamento?: string | null
          subtotal?: number | null
          taxa_servico?: boolean
          tenant_id?: string
          total?: number
          valor_ajuste?: number
          valor_taxa?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alterar_layout_tenant: {
        Args: { p_layout: string; p_tenant_id: string }
        Returns: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alterar_plano_tenant: {
        Args: { p_plano_codigo: string; p_tenant_id: string }
        Returns: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      alternar_addon_tenant: {
        Args: { p_addon_codigo: string; p_ativo: boolean; p_tenant_id: string }
        Returns: {
          addon_codigo: string
          ativado_em: string
          ativo: boolean
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_addons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      analytics_plataforma: {
        Args: { p_dias?: number }
        Returns: {
          faturamento_centavos: number
          pedidos: number
          tenant_id: string
          ultima_venda: string
        }[]
      }
      apagar_dados_estabelecimento: {
        Args: { p_confirmacao: string; p_tenant_id: string }
        Returns: Json
      }
      assinatura_ativa: { Args: { p_tenant_id: string }; Returns: boolean }
      assinatura_atual_ativa: { Args: never; Returns: boolean }
      atualizar_identidade_tenant: {
        Args: { p_logo_url?: string; p_nome_exibicao?: string }
        Returns: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      baixar_estoque: {
        Args: { p_op_id?: string; p_produto_id: number; p_qtd: number }
        Returns: {
          minimo: number
          quantidade: number
        }[]
      }
      baixar_estoque_subproduto: {
        Args: { p_op_id?: string; p_qtd: number; p_subproduto_id: string }
        Returns: {
          minimo: number
          quantidade: number
        }[]
      }
      branding_por_slug: {
        Args: { p_slug: string }
        Returns: {
          nome: string
          tema: Json
        }[]
      }
      calcular_status_assinatura: {
        Args: {
          p_carencia_dias: number
          p_data_vencimento: string
          p_hoje?: string
        }
        Returns: string
      }
      calcular_taxa_entrega: {
        Args: {
          p_bairro?: string
          p_cep: string
          p_lat?: number
          p_lng?: number
          p_slug: string
        }
        Returns: Json
      }
      cardapio_publico: { Args: { p_slug: string }; Returns: Json }
      categoria_interna: { Args: { p_categoria: string }; Returns: boolean }
      combo_indisponivel: {
        Args: { p_combo_id: string; p_tenant: string }
        Returns: boolean
      }
      confirmar_renovacao_assinatura: {
        Args: {
          p_competencia: string
          p_confirmado_por: string
          p_metodo: string
          p_tenant_id: string
          p_valor: number
        }
        Returns: {
          carencia_dias: number
          ciclo_dias: number
          criado_em: string
          data_inicio: string
          data_vencimento: string
          isencao_motivo: string | null
          isento_ate: string | null
          status: string
          tenant_id: string
          ultima_renovacao: string | null
          valor_mensal: number
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      criar_pedido_delivery: {
        Args: { p_payload: Json; p_slug: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      decidir_solicitacao_conta: {
        Args: {
          p_id: string
          p_observacao?: string
          p_status: string
          p_tenant_id?: string
        }
        Returns: {
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          email: string
          estabelecimento: string
          id: string
          nome: string
          observacao: string | null
          plano_codigo: string | null
          plano_itens: string[] | null
          plano_nome: string | null
          plano_total: number | null
          slug_desejado: string
          status: string
          tenant_id: string | null
          whatsapp: string
        }
        SetofOptions: {
          from: "*"
          to: "solicitacoes_conta"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      definir_isencao_tenant: {
        Args: { p_isento_ate: string; p_motivo?: string; p_tenant_id: string }
        Returns: {
          carencia_dias: number
          ciclo_dias: number
          criado_em: string
          data_inicio: string
          data_vencimento: string
          isencao_motivo: string | null
          isento_ate: string | null
          status: string
          tenant_id: string
          ultima_renovacao: string | null
          valor_mensal: number
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      definir_mensalidade_tenant: {
        Args: { p_tenant_id: string; p_valor: number }
        Returns: {
          carencia_dias: number
          ciclo_dias: number
          criado_em: string
          data_inicio: string
          data_vencimento: string
          isencao_motivo: string | null
          isento_ate: string | null
          status: string
          tenant_id: string
          ultima_renovacao: string | null
          valor_mensal: number
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delivery_aberto_agora: {
        Args: {
          p_aberto: boolean
          p_agora?: string
          p_fuso?: string
          p_horario: Json
        }
        Returns: boolean
      }
      delivery_distancia_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      delivery_tenant_por_slug: { Args: { p_slug: string }; Returns: string }
      eh_socio_pautas: { Args: never; Returns: boolean }
      entrada_estoque: {
        Args: { p_delta: number; p_op_id?: string; p_produto_id: number }
        Returns: {
          minimo: number
          quantidade: number
        }[]
      }
      estornar_pagamento_assinatura: {
        Args: {
          p_estornado_por: string
          p_motivo: string
          p_pagamento_id: string
        }
        Returns: {
          carencia_dias: number
          ciclo_dias: number
          criado_em: string
          data_inicio: string
          data_vencimento: string
          isencao_motivo: string | null
          isento_ate: string | null
          status: string
          tenant_id: string
          ultima_renovacao: string | null
          valor_mensal: number
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exportar_dados_estabelecimento: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      fuso_valido: { Args: { p_fuso: string }; Returns: string }
      grupos_do_produto: {
        Args: { p_produto_id: number; p_tenant: string }
        Returns: {
          grupo_id: string
        }[]
      }
      hhmm_para_minutos: { Args: { p_hhmm: string }; Returns: number }
      is_super_admin: { Args: never; Returns: boolean }
      jarvas_resumo_vendas: {
        Args: { p_desde: string; p_limite_produtos?: number }
        Returns: Json
      }
      limpar_reserva_mesa: { Args: { mesa_numero: string }; Returns: undefined }
      login_tentativas_estado: { Args: { p_chave: string }; Returns: Json }
      login_tentativas_falha: { Args: { p_chave: string }; Returns: Json }
      login_tentativas_sucesso: { Args: never; Returns: undefined }
      montar_grupo_delivery: {
        Args: { p_depth: number; p_grupo_id: string; p_tenant: string }
        Returns: Json
      }
      provisionar_tenant: {
        Args: {
          p_nome: string
          p_plano_codigo?: string
          p_slug?: string
          p_tema?: Json
        }
        Returns: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      proximo_numero_nfce: { Args: { p_tenant_id: string }; Returns: number }
      registrar_lead_apex: {
        Args: {
          p_email: string
          p_itens?: string[]
          p_nome: string
          p_total?: number
          p_whatsapp: string
        }
        Returns: Json
      }
      registrar_solicitacao_conta: {
        Args: {
          p_email: string
          p_estabelecimento: string
          p_itens?: string[]
          p_nome: string
          p_plano_codigo?: string
          p_plano_nome?: string
          p_slug?: string
          p_total?: number
          p_whatsapp: string
        }
        Returns: Json
      }
      registrar_tentativa_login: {
        Args: { p_email: string; p_senha: string }
        Returns: Json
      }
      registrar_uso_ia: {
        Args: { p_limite?: number }
        Returns: {
          chamadas: number
          excedeu: boolean
        }[]
      }
      relatorio_vendas: {
        Args: {
          p_fim: string
          p_inicio: string
          p_limite_produtos?: number
          p_tz?: string
        }
        Returns: Json
      }
      remover_tenant_provisionado: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      renomear_tenant: {
        Args: { p_nome: string; p_tenant_id: string }
        Returns: {
          created_at: string
          id: string
          nome: string
          plano_codigo: string
          slug: string
          tema: Json
          termos_aceitos_em: string | null
          termos_versao: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      saude_plataforma: {
        Args: { p_dias?: number }
        Returns: {
          fiscais_paradas: number
          fiscais_recusadas: number
          fiscal_parada_desde: string
          impressao_parada_desde: string
          impressoes_com_erro: number
          impressoes_paradas: number
          tenant_id: string
        }[]
      }
      set_contingencia_fiscal: {
        Args: { p_ativa: boolean }
        Returns: undefined
      }
      sincronizar_status_assinatura: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      slug_reservado: { Args: { p_slug: string }; Returns: boolean }
      slugify_tenant: { Args: { p_texto: string }; Returns: string }
      tenant_atual_id: { Args: never; Returns: string }
      tenant_atual_tem_addon: { Args: { p_addon: string }; Returns: boolean }
      tenant_atual_tem_modulo: { Args: { p_modulo: string }; Returns: boolean }
      tenant_do_usuario_atual: { Args: never; Returns: string }
      tenant_tem_modulo: {
        Args: { p_modulo: string; p_tenant_id: string }
        Returns: boolean
      }
      verificar_senha_admin: {
        Args: { p_password: string; p_username?: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
