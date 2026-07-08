// Généré depuis le schéma réel : `npm run db:types` (supabase gen types typescript --linked).
// Ne pas éditer à la main — relancer la commande après toute nouvelle migration.
// Note : le schéma public contient aussi `erp_data` (clé/valeur), une table préexistante
// sur ce projet Supabase, sans rapport avec Sahel d'Or — non utilisée par cette app.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      erp_data: {
        Row: {
          key: string;
          updated_at: string | null;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string | null;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string | null;
          value?: string;
        };
        Relationships: [];
      };
      logs: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          module: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          module: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          module?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      product_stocks: {
        Row: {
          id: string;
          product_id: string;
          stock: number;
          warehouse_id: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          stock?: number;
          warehouse_id: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          stock?: number;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_stocks_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stocks_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          name: string;
          price: number;
          stock: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          name: string;
          price: number;
          stock?: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          price?: number;
          stock?: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_items: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          purchase_id: string;
          quantity: number;
          unit_cost: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          purchase_id: string;
          quantity: number;
          unit_cost: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          purchase_id?: string;
          quantity?: number;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["purchase_status"];
          supplier_id: string;
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["purchase_status"];
          supplier_id: string;
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          status?: Database["public"]["Enums"]["purchase_status"];
          supplier_id?: string;
          user_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: never;
          name: string;
        };
        Update: {
          id?: never;
          name?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          address: string | null;
          company_id: string;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          phone: string | null;
        };
        Insert: {
          address?: string | null;
          company_id: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
        };
        Update: {
          address?: string | null;
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          created_at: string;
          id: string;
          order_id: string | null;
          product_id: string;
          purchase_id: string | null;
          quantity: number;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          order_id?: string | null;
          product_id: string;
          purchase_id?: string | null;
          quantity: number;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          order_id?: string | null;
          product_id?: string;
          purchase_id?: string | null;
          quantity?: number;
          type?: Database["public"]["Enums"]["transaction_type"];
          user_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          company_id: string | null;
          created_at: string;
          email: string;
          id: string;
          role_id: number;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          email: string;
          id: string;
          role_id: number;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          role_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "users_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      warehouses: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          location: string | null;
          name: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          name: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          location?: string | null;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cancel_purchase: {
        Args: { purchase_id: string };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      create_order: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      create_purchase: {
        Args: { payload: Json };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
      current_company_id: { Args: Record<string, never>; Returns: string };
      current_role_name: { Args: Record<string, never>; Returns: string };
      receive_purchase: {
        Args: { purchase_id: string };
        Returns: Database["public"]["Tables"]["purchases"]["Row"];
      };
    };
    Enums: {
      order_status: "pending" | "validated" | "cancelled";
      purchase_status: "pending" | "received" | "cancelled";
      transaction_type: "IN" | "OUT" | "ADJUSTMENT";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Alias pratiques utilisés dans le reste de l'app (auth, formulaires, RBAC).
export type TransactionType = Database["public"]["Enums"]["transaction_type"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];
export type RoleName = "admin" | "manager" | "seller" | "auditor";
