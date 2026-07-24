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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attribution_conflicts: {
        Row: {
          attribution_a: string
          attribution_b: string
        }
        Insert: {
          attribution_a: string
          attribution_b: string
        }
        Update: {
          attribution_a?: string
          attribution_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribution_conflicts_attribution_a_fkey"
            columns: ["attribution_a"]
            isOneToOne: false
            referencedRelation: "attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_conflicts_attribution_b_fkey"
            columns: ["attribution_b"]
            isOneToOne: false
            referencedRelation: "attributions"
            referencedColumns: ["id"]
          },
        ]
      }
      attributions: {
        Row: {
          action_key: string
          id: string
          label: string
          module: string
        }
        Insert: {
          action_key: string
          id?: string
          label: string
          module: string
        }
        Update: {
          action_key?: string
          id?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          capital_social: number
          created_at: string
          id: string
          impot_societes_rate: number
          name: string
          precompte_isb_rate: number
          taxe_immobiliere_rate: number
          taxe_professionnelle_rate: number
          vat_rate: number
        }
        Insert: {
          capital_social?: number
          created_at?: string
          id?: string
          impot_societes_rate?: number
          name: string
          precompte_isb_rate?: number
          taxe_immobiliere_rate?: number
          taxe_professionnelle_rate?: number
          vat_rate?: number
        }
        Update: {
          capital_social?: number
          created_at?: string
          id?: string
          impot_societes_rate?: number
          name?: string
          precompte_isb_rate?: number
          taxe_immobiliere_rate?: number
          taxe_professionnelle_rate?: number
          vat_rate?: number
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          acquisition_cost: number
          acquisition_date: string
          category: string
          company_id: string
          created_at: string
          disposal_date: string | null
          id: string
          name: string
          useful_life_years: number
          user_id: string
        }
        Insert: {
          acquisition_cost: number
          acquisition_date: string
          category: string
          company_id: string
          created_at?: string
          disposal_date?: string | null
          id?: string
          name: string
          useful_life_years: number
          user_id: string
        }
        Update: {
          acquisition_cost?: number
          acquisition_date?: string
          category?: string
          company_id?: string
          created_at?: string
          disposal_date?: string | null
          id?: string
          name?: string
          useful_life_years?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string
          created_at: string
          description: string
          entry_date: string
          id: string
          journal_code: string
          order_id: string | null
          purchase_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          entry_date?: string
          id?: string
          journal_code: string
          order_id?: string | null
          purchase_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          journal_code?: string
          order_id?: string | null
          purchase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          module: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          module: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          module?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        Insert: {
          amount_paid?: number
          client_id: string
          company_id: string
          created_at?: string
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        Update: {
          amount_paid?: number
          client_id?: string
          company_id?: string
          created_at?: string
          id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          status?: Database["public"]["Enums"]["order_status"]
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          created_at: string
          id: string
          new_price: number
          old_price: number
          product_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_price: number
          old_price: number
          product_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_price?: number
          old_price?: number
          product_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stocks: {
        Row: {
          id: string
          product_id: string
          stock: number
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          stock?: number
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          stock?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stocks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stocks_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          production_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          production_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          production_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_items_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          price: number
          stock: number
          unit: string
          vat_exempt: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          price: number
          stock?: number
          unit?: string
          vat_exempt?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock?: number
          unit?: string
          vat_exempt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_losses: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity_lost: number
          reason: string | null
          transporter_id: string
          unit_cost: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity_lost: number
          reason?: string | null
          transporter_id: string
          unit_cost: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity_lost?: number
          reason?: string | null
          transporter_id?: string
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_losses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_losses_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_losses_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_losses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          company_id: string
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          freight_cost: number
          handling_cost: number
          id: string
          observation: string | null
          receipt_number: number
          received_at: string | null
          repackage_count: number | null
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          truck_plate: string | null
          user_id: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          freight_cost?: number
          handling_cost?: number
          id?: string
          observation?: string | null
          receipt_number?: never
          received_at?: string | null
          repackage_count?: number | null
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          truck_plate?: string | null
          user_id: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          freight_cost?: number
          handling_cost?: number
          id?: string
          observation?: string | null
          receipt_number?: never
          received_at?: string | null
          repackage_count?: number | null
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id?: string
          truck_plate?: string | null
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: never
          name: string
        }
        Update: {
          id?: never
          name?: string
        }
        Relationships: []
      }
      stock_loss_requests: {
        Row: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string
          rejection_reason: string | null
          repackaged_quantity: number | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
          transformation_id: string | null
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason: string
          rejection_reason?: string | null
          repackaged_quantity?: number | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
          transformation_id?: string | null
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string
          rejection_reason?: string | null
          repackaged_quantity?: number | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
          transformation_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_loss_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_transformation_id_fkey"
            columns: ["transformation_id"]
            isOneToOne: false
            referencedRelation: "transformations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_loss_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          company_id: string
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: number
          product_id: string
          quantity_received: number
          quantity_remaining: number
          source_transaction_id: string | null
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: never
          product_id: string
          quantity_received: number
          quantity_remaining: number
          source_transaction_id?: string | null
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: never
          product_id?: string
          quantity_received?: number
          quantity_remaining?: number
          source_transaction_id?: string | null
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_lot_allocations: {
        Row: {
          id: string
          lot_id: string
          quantity: number
          transaction_id: string
        }
        Insert: {
          id?: string
          lot_id: string
          quantity: number
          transaction_id: string
        }
        Update: {
          id?: string
          lot_id?: string
          quantity?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_lot_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_lot_allocations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          note: string | null
          order_id: string | null
          product_id: string
          production_id: string | null
          purchase_id: string | null
          quantity: number
          transfer_group_id: string | null
          transformation_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          unit_cost: number | null
          user_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          product_id: string
          production_id?: string | null
          purchase_id?: string | null
          quantity: number
          transfer_group_id?: string | null
          transformation_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
          user_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          product_id?: string
          production_id?: string | null
          purchase_id?: string | null
          quantity?: number
          transfer_group_id?: string | null
          transformation_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transformation_id_fkey"
            columns: ["transformation_id"]
            isOneToOne: false
            referencedRelation: "transformations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_inputs: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          transformation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          transformation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          transformation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformation_inputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_inputs_transformation_id_fkey"
            columns: ["transformation_id"]
            isOneToOne: false
            referencedRelation: "transformations"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_outputs: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          transformation_id: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          transformation_id: string
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          transformation_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "transformation_outputs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformation_outputs_transformation_id_fkey"
            columns: ["transformation_id"]
            isOneToOne: false
            referencedRelation: "transformations"
            referencedColumns: ["id"]
          },
        ]
      }
      transformations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transformations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transformations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      transporters: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transporters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_attributions: {
        Row: {
          attribution_id: string
          created_at: string
          granted_by: string | null
          id: string
          level: string
          user_id: string
        }
        Insert: {
          attribution_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          level: string
          user_id: string
        }
        Update: {
          attribution_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_attributions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attributions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_attributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
          must_change_password: boolean
          role_id: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id: string
          must_change_password?: boolean
          role_id?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean
          role_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          company_id: string
          created_at: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_stock_loss: {
        Args: { p_request_id: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string
          rejection_reason: string | null
          repackaged_quantity: number | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
          transformation_id: string | null
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_loss_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order: {
        Args: { order_id: string }
        Returns: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_purchase: {
        Args: { purchase_id: string }
        Returns: {
          company_id: string
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          freight_cost: number
          handling_cost: number
          id: string
          observation: string | null
          receipt_number: number
          received_at: string | null
          repackage_count: number | null
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          truck_plate: string | null
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_fixed_asset: {
        Args: {
          p_acquisition_cost: number
          p_acquisition_date: string
          p_category: string
          p_name: string
          p_useful_life_years: number
        }
        Returns: {
          acquisition_cost: number
          acquisition_date: string
          category: string
          company_id: string
          created_at: string
          disposal_date: string | null
          id: string
          name: string
          useful_life_years: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fixed_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: { payload: Json }
        Returns: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_production: {
        Args: { payload: Json }
        Returns: {
          company_id: string
          created_at: string
          id: string
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "productions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_purchase: {
        Args: { payload: Json }
        Returns: {
          company_id: string
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          freight_cost: number
          handling_cost: number
          id: string
          observation: string | null
          receipt_number: number
          received_at: string | null
          repackage_count: number | null
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          truck_plate: string | null
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transformation: {
        Args: { payload: Json }
        Returns: {
          company_id: string
          created_at: string
          id: string
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transformations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      current_role_name: { Args: never; Returns: string }
      dispose_fixed_asset: {
        Args: { p_asset_id: string; p_disposal_date: string }
        Returns: {
          acquisition_cost: number
          acquisition_date: string
          category: string
          company_id: string
          created_at: string
          disposal_date: string | null
          id: string
          name: string
          useful_life_years: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fixed_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_consume_stock_lots: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_transaction_id: string
          p_warehouse_id: string
        }
        Returns: undefined
      }
      has_attribution: {
        Args: { p_action_key: string; p_min_level?: string }
        Returns: boolean
      }
      has_module_access: { Args: { p_module: string }; Returns: boolean }
      log_page_visit: { Args: { module: string }; Returns: undefined }
      receive_purchase: {
        Args: {
          losses?: Json
          lot_expiry_dates?: Json
          p_driver_name?: string
          p_driver_phone?: string
          p_freight_cost?: number
          p_handling_cost?: number
          p_observation?: string
          p_repackage_count?: number
          p_truck_plate?: string
          purchase_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          freight_cost: number
          handling_cost: number
          id: string
          observation: string | null
          receipt_number: number
          received_at: string | null
          repackage_count: number | null
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          truck_plate: string | null
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment: {
        Args: { amount: number; order_id: string }
        Returns: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_stock_loss: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string
          rejection_reason: string | null
          repackaged_quantity: number | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
          transformation_id: string | null
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_loss_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_stock_loss: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reason: string
          p_repackaged_quantity?: number
          p_warehouse_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string
          rejection_reason: string | null
          repackaged_quantity: number | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
          transformation_id: string | null
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_loss_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_attributions: {
        Args: { p_attributions: Json; p_user_id: string }
        Returns: undefined
      }
      transfer_stock: {
        Args: {
          p_from_warehouse_id: string
          p_product_id: string
          p_quantity: number
          p_to_warehouse_id: string
        }
        Returns: undefined
      }
      update_product_price: {
        Args: { new_price: number; product_id: string; reason?: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          name: string
          price: number
          stock: number
          unit: string
          vat_exempt: boolean
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_order: {
        Args: { order_id: string }
        Returns: {
          amount_paid: number
          client_id: string
          company_id: string
          created_at: string
          id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          user_id: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      order_status: "pending" | "validated" | "cancelled"
      payment_status: "unpaid" | "partial" | "paid"
      purchase_status: "pending" | "received" | "cancelled"
      transaction_type: "IN" | "OUT" | "ADJUSTMENT"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

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
} as const

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
