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
      chart_of_accounts: {
        Row: {
          code: string;
          company_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          company_id: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          code?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
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
            foreignKeyName: "clients_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          capital_social: number;
          created_at: string;
          id: string;
          name: string;
          vat_rate: number;
        };
        Insert: {
          capital_social?: number;
          created_at?: string;
          id?: string;
          name: string;
          vat_rate?: number;
        };
        Update: {
          capital_social?: number;
          created_at?: string;
          id?: string;
          name?: string;
          vat_rate?: number;
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
      journal_entries: {
        Row: {
          company_id: string;
          created_at: string;
          description: string;
          entry_date: string;
          id: string;
          journal_code: string;
          order_id: string | null;
          purchase_id: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          description: string;
          entry_date?: string;
          id?: string;
          journal_code: string;
          order_id?: string | null;
          purchase_id?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          description?: string;
          entry_date?: string;
          id?: string;
          journal_code?: string;
          order_id?: string | null;
          purchase_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_entries_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entry_lines: {
        Row: {
          account_id: string;
          created_at: string;
          credit: number;
          debit: number;
          entry_id: string;
          id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          credit?: number;
          debit?: number;
          entry_id: string;
          id?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          credit?: number;
          debit?: number;
          entry_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "chart_of_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "journal_entries";
            referencedColumns: ["id"];
          },
        ];
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
          amount_paid: number;
          client_id: string;
          company_id: string;
          created_at: string;
          id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          amount_paid?: number;
          client_id: string;
          company_id: string;
          created_at?: string;
          id?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          status?: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          amount_paid?: number;
          client_id?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          status?: Database["public"]["Enums"]["order_status"];
          user_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
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
          {
            foreignKeyName: "orders_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
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
      production_items: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          production_id: string;
          quantity: number;
          unit_cost: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          production_id: string;
          quantity: number;
          unit_cost: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          production_id?: string;
          quantity?: number;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "production_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "production_items_production_id_fkey";
            columns: ["production_id"];
            isOneToOne: false;
            referencedRelation: "productions";
            referencedColumns: ["id"];
          },
        ];
      };
      productions: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "productions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "productions_warehouse_id_fkey";
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
          note: string | null;
          order_id: string | null;
          product_id: string;
          production_id: string | null;
          purchase_id: string | null;
          quantity: number;
          transfer_group_id: string | null;
          transformation_id: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id?: string | null;
          product_id: string;
          production_id?: string | null;
          purchase_id?: string | null;
          quantity: number;
          transfer_group_id?: string | null;
          transformation_id?: string | null;
          type: Database["public"]["Enums"]["transaction_type"];
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id?: string | null;
          product_id?: string;
          production_id?: string | null;
          purchase_id?: string | null;
          quantity?: number;
          transfer_group_id?: string | null;
          transformation_id?: string | null;
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
            foreignKeyName: "transactions_production_id_fkey";
            columns: ["production_id"];
            isOneToOne: false;
            referencedRelation: "productions";
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
            foreignKeyName: "transactions_transformation_id_fkey";
            columns: ["transformation_id"];
            isOneToOne: false;
            referencedRelation: "transformations";
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
      transformation_inputs: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          quantity: number;
          transformation_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          quantity: number;
          transformation_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          transformation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transformation_inputs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transformation_inputs_transformation_id_fkey";
            columns: ["transformation_id"];
            isOneToOne: false;
            referencedRelation: "transformations";
            referencedColumns: ["id"];
          },
        ];
      };
      transformation_outputs: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          quantity: number;
          transformation_id: string;
          unit_cost: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          quantity: number;
          transformation_id: string;
          unit_cost: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          transformation_id?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transformation_outputs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transformation_outputs_transformation_id_fkey";
            columns: ["transformation_id"];
            isOneToOne: false;
            referencedRelation: "transformations";
            referencedColumns: ["id"];
          },
        ];
      };
      transformations: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
          user_id: string;
          warehouse_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
          warehouse_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transformations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transformations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transformations_warehouse_id_fkey";
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
          must_change_password: boolean;
          role_id: number;
        };
        Insert: {
          company_id?: string | null;
          created_at?: string;
          email: string;
          id: string;
          must_change_password?: boolean;
          role_id: number;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          must_change_password?: boolean;
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
      cancel_order: {
        Args: { order_id: string };
        Returns: {
          amount_paid: number;
          client_id: string;
          company_id: string;
          created_at: string;
          id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_purchase: {
        Args: { purchase_id: string };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["purchase_status"];
          supplier_id: string;
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "purchases";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_order: {
        Args: { payload: Json };
        Returns: {
          amount_paid: number;
          client_id: string;
          company_id: string;
          created_at: string;
          id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_production: {
        Args: { payload: Json };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "productions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_purchase: {
        Args: { payload: Json };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["purchase_status"];
          supplier_id: string;
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "purchases";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_transformation: {
        Args: { payload: Json };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "transformations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_company_id: { Args: never; Returns: string };
      current_role_name: { Args: never; Returns: string };
      log_page_visit: { Args: { module: string }; Returns: undefined };
      receive_purchase: {
        Args: { purchase_id: string };
        Returns: {
          company_id: string;
          created_at: string;
          id: string;
          status: Database["public"]["Enums"]["purchase_status"];
          supplier_id: string;
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "purchases";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_payment: {
        Args: {
          amount_paid: number;
          order_id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
        };
        Returns: {
          amount_paid: number;
          client_id: string;
          company_id: string;
          created_at: string;
          id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      transfer_stock: {
        Args: {
          p_from_warehouse_id: string;
          p_product_id: string;
          p_quantity: number;
          p_to_warehouse_id: string;
        };
        Returns: undefined;
      };
      validate_order: {
        Args: { order_id: string };
        Returns: {
          amount_paid: number;
          client_id: string;
          company_id: string;
          created_at: string;
          id: string;
          payment_status: Database["public"]["Enums"]["payment_status"];
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          warehouse_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      order_status: "pending" | "validated" | "cancelled";
      payment_status: "unpaid" | "partial" | "paid";
      purchase_status: "pending" | "received" | "cancelled";
      transaction_type: "IN" | "OUT" | "ADJUSTMENT";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      order_status: ["pending", "validated", "cancelled"],
      payment_status: ["unpaid", "partial", "paid"],
      purchase_status: ["pending", "received", "cancelled"],
      transaction_type: ["IN", "OUT", "ADJUSTMENT"],
    },
  },
} as const;

// Alias pratiques utilisés dans le reste de l'app (auth, formulaires, RBAC).
export type TransactionType = Database["public"]["Enums"]["transaction_type"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type RoleName =
  | "admin"
  | "warehouse_manager"
  | "supervisor"
  | "sales_operator"
  | "purchasing"
  | "accounting"
  | "production_manager"
  | "controller"
  | "logistics_transport";
