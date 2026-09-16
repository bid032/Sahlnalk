export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_inventory: {
        Row: {
          account_email: string | null;
          account_password: string | null;
          account_type: string | null;
          account_username: string | null;
          created_at: string;
          delivered_at: string | null;
          delivered_order_item_id: string | null;
          extra_notes: string | null;
          id: string;
          import_batch_id: string | null;
          plan_id: string;
          sheet_row_index: number | null;
          sheet_title: string | null;
          source: string;
          spreadsheet_id: string | null;
          status: string;
          status_column_letter: string | null;
        };
        Insert: {
          account_email?: string | null;
          account_password?: string | null;
          account_type?: string | null;
          account_username?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          delivered_order_item_id?: string | null;
          extra_notes?: string | null;
          id?: string;
          import_batch_id?: string | null;
          plan_id: string;
          sheet_row_index?: number | null;
          sheet_title?: string | null;
          source?: string;
          spreadsheet_id?: string | null;
          status?: string;
          status_column_letter?: string | null;
        };
        Update: {
          account_email?: string | null;
          account_password?: string | null;
          account_type?: string | null;
          account_username?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          delivered_order_item_id?: string | null;
          extra_notes?: string | null;
          id?: string;
          import_batch_id?: string | null;
          plan_id?: string;
          sheet_row_index?: number | null;
          sheet_title?: string | null;
          source?: string;
          spreadsheet_id?: string | null;
          status?: string;
          status_column_letter?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "account_inventory_delivered_order_item_id_fkey";
            columns: ["delivered_order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_inventory_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "product_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action_type: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
          id: string;
          meta: Json;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action_type: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          id?: string;
          meta?: Json;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action_type?: string;
          actor_id?: string | null;
          actor_name?: string | null;
          created_at?: string;
          id?: string;
          meta?: Json;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          description_ar: string | null;
          description_en: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name_ar: string;
          name_en: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_ar?: string | null;
          description_en?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name_ar?: string;
          name_en?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      coupon_redemptions: {
        Row: {
          amount_discounted: number;
          coupon_id: string;
          created_at: string;
          id: string;
          order_id: string | null;
          user_id: string | null;
        };
        Insert: {
          amount_discounted?: number;
          coupon_id: string;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          amount_discounted?: number;
          coupon_id?: string;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          applies_to: Database["public"]["Enums"]["coupon_scope"];
          code: string;
          created_at: string;
          created_by: string | null;
          discount_type: Database["public"]["Enums"]["coupon_discount_type"];
          discount_value: number;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_order_amount: number | null;
          notes: string | null;
          product_ids: string[];
          updated_at: string;
          used_count: number;
        };
        Insert: {
          applies_to?: Database["public"]["Enums"]["coupon_scope"];
          code: string;
          created_at?: string;
          created_by?: string | null;
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"];
          discount_value: number;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number | null;
          notes?: string | null;
          product_ids?: string[];
          updated_at?: string;
          used_count?: number;
        };
        Update: {
          applies_to?: Database["public"]["Enums"]["coupon_scope"];
          code?: string;
          created_at?: string;
          created_by?: string | null;
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"];
          discount_value?: number;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order_amount?: number | null;
          notes?: string | null;
          product_ids?: string[];
          updated_at?: string;
          used_count?: number;
        };
        Relationships: [];
      };
      delivered_accounts: {
        Row: {
          account_email: string | null;
          account_password: string | null;
          account_username: string | null;
          delivered_at: string;
          delivered_by: string | null;
          extra_notes: string | null;
          id: string;
          order_item_id: string;
        };
        Insert: {
          account_email?: string | null;
          account_password?: string | null;
          account_username?: string | null;
          delivered_at?: string;
          delivered_by?: string | null;
          extra_notes?: string | null;
          id?: string;
          order_item_id: string;
        };
        Update: {
          account_email?: string | null;
          account_password?: string | null;
          account_username?: string | null;
          delivered_at?: string;
          delivered_by?: string | null;
          extra_notes?: string | null;
          id?: string;
          order_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivered_accounts_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      faqs: {
        Row: {
          answer_ar: string;
          answer_en: string;
          created_at: string;
          id: string;
          is_active: boolean;
          question_ar: string;
          question_en: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          answer_ar: string;
          answer_en: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          question_ar: string;
          question_en: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          answer_ar?: string;
          answer_en?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          question_ar?: string;
          question_en?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      google_sheet_integrations: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          id: string;
          name: string;
          slug: string;
          spreadsheet_id: string;
          updated_at: string;
          worksheet_name: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          name: string;
          slug: string;
          spreadsheet_id: string;
          updated_at?: string;
          worksheet_name: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          name?: string;
          slug?: string;
          spreadsheet_id?: string;
          updated_at?: string;
          worksheet_name?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"];
          created_at: string;
          delivery_type: Database["public"]["Enums"]["delivery_type"];
          frozen_unit_price: number;
          id: string;
          order_id: string;
          plan_id: string | null;
          plan_label: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          status: Database["public"]["Enums"]["order_item_status"];
          subscription_email: string | null;
          unit_price: number;
        };
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"];
          created_at?: string;
          delivery_type: Database["public"]["Enums"]["delivery_type"];
          frozen_unit_price: number;
          id?: string;
          order_id: string;
          plan_id?: string | null;
          plan_label: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
          status?: Database["public"]["Enums"]["order_item_status"];
          subscription_email?: string | null;
          unit_price: number;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"];
          created_at?: string;
          delivery_type?: Database["public"]["Enums"]["delivery_type"];
          frozen_unit_price?: number;
          id?: string;
          order_id?: string;
          plan_id?: string | null;
          plan_label?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          status?: Database["public"]["Enums"]["order_item_status"];
          subscription_email?: string | null;
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
            foreignKeyName: "order_items_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "product_plans";
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
          coupon_id: string | null;
          created_at: string;
          currency: string;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          discount_amount: number;
          id: string;
          notes: string | null;
          order_number: string;
          payment_gateway: Database["public"]["Enums"]["payment_gateway"] | null;
          payment_proof_url: string | null;
          payment_reference: string | null;
          payment_sender_phone: string | null;
          payment_status: string | null;
          fulfillment_status: string | null;
          paypal_order_id: string | null;
          paypal_capture_id: string | null;
          paid_at: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          discount_amount?: number;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_gateway?: Database["public"]["Enums"]["payment_gateway"] | null;
          payment_proof_url?: string | null;
          payment_reference?: string | null;
          payment_sender_phone?: string | null;
          payment_status?: string | null;
          fulfillment_status?: string | null;
          paypal_order_id?: string | null;
          paypal_capture_id?: string | null;
          paid_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          coupon_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          discount_amount?: number;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_gateway?: Database["public"]["Enums"]["payment_gateway"] | null;
          payment_proof_url?: string | null;
          payment_reference?: string | null;
          payment_sender_phone?: string | null;
          payment_status?: string | null;
          fulfillment_status?: string | null;
          paypal_order_id?: string | null;
          paypal_capture_id?: string | null;
          paid_at?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_costs: {
        Row: {
          cost_price: number;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          cost_price?: number;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          cost_price?: number;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_costs_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: true;
            referencedRelation: "product_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      product_plans: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null;
          compare_price: number | null;
          created_at: string;
          duration_days: number | null;
          id: string;
          is_active: boolean;
          label_ar: string;
          label_en: string;
          plan_variant: string | null;
          price: number;
          product_id: string;
          sheet_csv_url: string | null;
          sort_order: number;
          stock: number;
          updated_at: string;
        };
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"] | null;
          compare_price?: number | null;
          created_at?: string;
          duration_days?: number | null;
          id?: string;
          is_active?: boolean;
          label_ar: string;
          label_en: string;
          plan_variant?: string | null;
          price: number;
          product_id: string;
          sheet_csv_url?: string | null;
          sort_order?: number;
          stock?: number;
          updated_at?: string;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"] | null;
          compare_price?: number | null;
          created_at?: string;
          duration_days?: number | null;
          id?: string;
          is_active?: boolean;
          label_ar?: string;
          label_en?: string;
          plan_variant?: string | null;
          price?: number;
          product_id?: string;
          sheet_csv_url?: string | null;
          sort_order?: number;
          stock?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_plans_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_reviews: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_active: boolean;
          lang: string;
          product_id: string;
          rating: number;
          reviewer_name: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          lang?: string;
          product_id: string;
          rating: number;
          reviewer_name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          lang?: string;
          product_id?: string;
          rating?: number;
          reviewer_name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"];
          account_types: Database["public"]["Enums"]["account_type"][];
          category_id: string | null;
          category_ids: string[];
          cover_url: string | null;
          created_at: string;
          delivery_type: Database["public"]["Enums"]["delivery_type"];
          description_ar: string | null;
          description_en: string | null;
          discount_percent: number;
          google_spreadsheet_id: string | null;
          icon_url: string | null;
          id: string;
          is_bestseller: boolean;
          is_featured: boolean;
          loading_icon_url: string | null;
          name_ar: string;
          name_en: string;
          plan_variants: string[];
          short_description_ar: string | null;
          short_description_en: string | null;
          slug: string;
          sort_order: number;
          status: Database["public"]["Enums"]["product_status"];
          updated_at: string;
        };
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"];
          account_types?: Database["public"]["Enums"]["account_type"][];
          category_id?: string | null;
          category_ids?: string[];
          cover_url?: string | null;
          created_at?: string;
          delivery_type?: Database["public"]["Enums"]["delivery_type"];
          description_ar?: string | null;
          description_en?: string | null;
          discount_percent?: number;
          google_spreadsheet_id?: string | null;
          icon_url?: string | null;
          id?: string;
          is_bestseller?: boolean;
          is_featured?: boolean;
          loading_icon_url?: string | null;
          name_ar: string;
          name_en: string;
          plan_variants?: string[];
          short_description_ar?: string | null;
          short_description_en?: string | null;
          slug: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["product_status"];
          updated_at?: string;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"];
          account_types?: Database["public"]["Enums"]["account_type"][];
          category_id?: string | null;
          category_ids?: string[];
          cover_url?: string | null;
          created_at?: string;
          delivery_type?: Database["public"]["Enums"]["delivery_type"];
          description_ar?: string | null;
          description_en?: string | null;
          discount_percent?: number;
          google_spreadsheet_id?: string | null;
          icon_url?: string | null;
          id?: string;
          is_bestseller?: boolean;
          is_featured?: boolean;
          loading_icon_url?: string | null;
          name_ar?: string;
          name_en?: string;
          plan_variants?: string[];
          short_description_ar?: string | null;
          short_description_en?: string | null;
          slug?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["product_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          country: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          phone: string | null;
          preferred_language: string;
          stock_access: boolean;
          stock_password_hash: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          phone?: string | null;
          preferred_language?: string;
          stock_access?: boolean;
          stock_password_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          phone?: string | null;
          preferred_language?: string;
          stock_access?: boolean;
          stock_password_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          order_id: string | null;
          order_item_id: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          order_id?: string | null;
          order_item_id?: string | null;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          order_id?: string | null;
          order_item_id?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
        ];
      };
      site_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      testimonial_images: {
        Row: {
          caption: string | null;
          created_at: string;
          id: string;
          image_url: string;
          is_active: boolean;
          sort_order: number;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string;
          is_active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_list_users: {
        Args: never;
        Returns: {
          created_at: string;
          display_name: string;
          email: string;
          has_stock_password: boolean;
          id: string;
        }[];
      };
      admin_revenue_by_month: {
        Args: never;
        Returns: {
          month: string;
          orders_count: number;
          profit: number;
          revenue: number;
        }[];
      };
      admin_revenue_stats: {
        Args: { _end?: string; _start?: string };
        Returns: {
          items_count: number;
          orders_count: number;
          profit: number;
          revenue: number;
        }[];
      };
      admin_set_stock_access: {
        Args: { _access: boolean; _password?: string; _user_id: string };
        Returns: undefined;
      };
      admin_user_has_stock_password: {
        Args: { _user_id: string };
        Returns: boolean;
      };
      claim_inventory_for_item: {
        Args: { _order_item_id: string; _plan_id: string };
        Returns: string;
      };
      current_user_stock_access: { Args: never; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
      jsonb_diff: {
        Args: { _ignore?: string[]; _new: Json; _old: Json };
        Returns: Json;
      };
      log_action: {
        Args: {
          _action_type: string;
          _meta?: Json;
          _target_id: string;
          _target_type: string;
        };
        Returns: undefined;
      };
      public_coupons_for_product: {
        Args: { _product_id: string };
        Returns: {
          code: string;
          discount_type: string;
          discount_value: number;
          min_order_amount: number;
        }[];
      };
      recalc_order_totals: { Args: { _order_id: string }; Returns: undefined };
      redeem_coupon: {
        Args: { _amount: number; _coupon_id: string; _order_id: string };
        Returns: undefined;
      };
      sync_plan_stock_from_inventory: {
        Args: { _plan_id: string };
        Returns: undefined;
      };
      validate_coupon: {
        Args: { _code: string; _product_ids: string[]; _subtotal: number };
        Returns: {
          code: string;
          coupon_id: string;
          discount: number;
          discount_type: string;
          discount_value: number;
          message: string;
          valid: boolean;
        }[];
      };
      verify_stock_password: { Args: { _password: string }; Returns: boolean };
    };
    Enums: {
      account_type: "private" | "shared" | "both" | "own";
      app_role: "admin" | "user" | "moderator";
      coupon_discount_type: "percent" | "fixed";
      coupon_scope: "all" | "specific";
      delivery_type: "instant" | "manual";
      order_item_status: "pending" | "delivered" | "refunded";
      order_status: "pending" | "paid" | "processing" | "delivered" | "cancelled" | "refunded";
      payment_gateway: "paymob" | "kashier" | "manual" | "wallet_instapay" | "paypal";
      product_status: "active" | "draft" | "archived";
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
  public: {
    Enums: {
      account_type: ["private", "shared", "both", "own"],
      app_role: ["admin", "user", "moderator"],
      coupon_discount_type: ["percent", "fixed"],
      coupon_scope: ["all", "specific"],
      delivery_type: ["instant", "manual"],
      order_item_status: ["pending", "delivered", "refunded"],
      order_status: ["pending", "paid", "processing", "delivered", "cancelled", "refunded"],
      payment_gateway: ["paymob", "kashier", "manual", "wallet_instapay"],
      product_status: ["active", "draft", "archived"],
    },
  },
} as const;
