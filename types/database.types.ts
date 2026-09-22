export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_intentions: {
        Row: {
          amount: number
          created_at: string
          date_needed: string | null
          funding_method: Database["public"]["Enums"]["intention_funding_method"]
          id: string
          ministry_id: string
          purpose: string
          requested_by: string
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          settlement_closed_at: string | null
          status: Database["public"]["Enums"]["intention_status"]
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          date_needed?: string | null
          funding_method: Database["public"]["Enums"]["intention_funding_method"]
          id?: string
          ministry_id: string
          purpose: string
          requested_by: string
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_closed_at?: string | null
          status?: Database["public"]["Enums"]["intention_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date_needed?: string | null
          funding_method?: Database["public"]["Enums"]["intention_funding_method"]
          id?: string
          ministry_id?: string
          purpose?: string
          requested_by?: string
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_closed_at?: string | null
          status?: Database["public"]["Enums"]["intention_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_intentions_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_intentions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_intentions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          label: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          label: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          label?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_settlements: {
        Row: {
          amount: number
          created_at: string
          description: string
          expense_date: string
          id: string
          intention_id: string
          is_late: boolean
          movement_id: string | null
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          submitted_by: string
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          expense_date: string
          id?: string
          intention_id: string
          is_late?: boolean
          movement_id?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          submitted_by: string
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          intention_id?: string
          is_late?: boolean
          movement_id?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          submitted_by?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_settlements_intention_id_fkey"
            columns: ["intention_id"]
            isOneToOne: false
            referencedRelation: "budget_intentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          impersonator_id: string
          started_at: string
          target_user_id: string
        }
        Insert: {
          ended_at?: string | null
          ended_reason?: string | null
          expires_at: string
          id?: string
          impersonator_id: string
          started_at?: string
          target_user_id: string
        }
        Update: {
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          impersonator_id?: string
          started_at?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_impersonator_id_fkey"
            columns: ["impersonator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_routes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          local_part: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          local_part: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          local_part?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_email_routes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      intention_attachments: {
        Row: {
          created_at: string
          created_by_id: string
          file_name: string
          id: string
          intention_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by_id: string
          file_name: string
          id?: string
          intention_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by_id?: string
          file_name?: string
          id?: string
          intention_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "intention_attachments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intention_attachments_intention_id_fkey"
            columns: ["intention_id"]
            isOneToOne: false
            referencedRelation: "budget_intentions"
            referencedColumns: ["id"]
          },
        ]
      }
      intention_transfers: {
        Row: {
          amount: number
          created_at: string
          id: string
          intention_id: string
          movement_id: string | null
          notes: string | null
          registered_by: string
          transfer_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          intention_id: string
          movement_id?: string | null
          notes?: string | null
          registered_by: string
          transfer_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          intention_id?: string
          movement_id?: string | null
          notes?: string | null
          registered_by?: string
          transfer_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "intention_transfers_intention_id_fkey"
            columns: ["intention_id"]
            isOneToOne: true
            referencedRelation: "budget_intentions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intention_transfers_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intention_transfers_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ministries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          ministry_id: string
          notes: string | null
          unassigned_at: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          ministry_id: string
          notes?: string | null
          unassigned_at?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          ministry_id?: string
          notes?: string | null
          unassigned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_assignments_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_budgets: {
        Row: {
          assigned_amount: number
          budget_period_id: string
          created_at: string
          created_by: string | null
          id: string
          initial_used_amount: number
          ministry_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          assigned_amount: number
          budget_period_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          initial_used_amount?: number
          ministry_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          assigned_amount?: number
          budget_period_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          initial_used_amount?: number
          ministry_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_budgets_budget_period_id_fkey"
            columns: ["budget_period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_budgets_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_delegates: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          ministry_id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          ministry_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          ministry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_delegates_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_delegates_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_delegates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_attachments: {
        Row: {
          created_at: string
          created_by_id: string
          file_name: string
          id: string
          mime_type: string
          movement_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by_id: string
          file_name: string
          id?: string
          mime_type: string
          movement_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          movement_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_attachments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_attachments_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_audit_log: {
        Row: {
          action: string
          event_date: string
          id: string
          impersonator_id: string | null
          movement_id: string
          new_value: Json | null
          note: string | null
          previous_value: Json | null
          user_id: string
        }
        Insert: {
          action: string
          event_date?: string
          id?: string
          impersonator_id?: string | null
          movement_id: string
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          event_date?: string
          id?: string
          impersonator_id?: string | null
          movement_id?: string
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_audit_log_impersonator_id_fkey"
            columns: ["impersonator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_audit_log_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          movement_type: Database["public"]["Enums"]["movement_type"]
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          movement_type: Database["public"]["Enums"]["movement_type"]
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          movement_type?: Database["public"]["Enums"]["movement_type"]
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_subcategories: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "movement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_subcategories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          amount: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_id: string | null
          category_id: string
          created_at: string
          created_by_id: string
          delivered_by: string | null
          id: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          notification_error: string | null
          notification_sent_at: string | null
          notification_status: Database["public"]["Enums"]["notification_status"]
          notify_by_email: boolean
          payment_method_id: string | null
          receipt_email: string | null
          status: Database["public"]["Enums"]["movement_status"]
          subcategory_id: string | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          amount: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          category_id: string
          created_at?: string
          created_by_id: string
          delivered_by?: string | null
          id?: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          notification_error?: string | null
          notification_sent_at?: string | null
          notification_status?: Database["public"]["Enums"]["notification_status"]
          notify_by_email?: boolean
          payment_method_id?: string | null
          receipt_email?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          subcategory_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          amount?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          category_id?: string
          created_at?: string
          created_by_id?: string
          delivered_by?: string | null
          id?: string
          movement_date?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          notification_error?: string | null
          notification_sent_at?: string | null
          notification_status?: Database["public"]["Enums"]["notification_status"]
          notify_by_email?: boolean
          payment_method_id?: string | null
          receipt_email?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          subcategory_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_cancelled_by_id_fkey"
            columns: ["cancelled_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "movement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "movement_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_movements: {
        Row: {
          created_at: string
          id: string
          movement_id: string
          payroll_record_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_id: string
          payroll_record_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_id?: string
          payroll_record_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_movements_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_movements_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          created_at: string
          created_by_id: string
          id: string
          liquidacion_file_name: string | null
          liquidacion_mime_type: string | null
          liquidacion_size_bytes: number | null
          liquidacion_storage_path: string | null
          period: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_id: string
          id?: string
          liquidacion_file_name?: string | null
          liquidacion_mime_type?: string | null
          liquidacion_size_bytes?: number | null
          liquidacion_storage_path?: string | null
          period: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string
          id?: string
          liquidacion_file_name?: string | null
          liquidacion_mime_type?: string | null
          liquidacion_size_bytes?: number | null
          liquidacion_storage_path?: string | null
          period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      request_comments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["comment_entity"]
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["comment_entity"]
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["comment_entity"]
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          enabled: boolean
          permission: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          enabled?: boolean
          permission: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          enabled?: boolean
          permission?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      settlement_attachments: {
        Row: {
          created_at: string
          created_by_id: string
          file_name: string
          id: string
          mime_type: string
          settlement_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by_id: string
          file_name: string
          id?: string
          mime_type: string
          settlement_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          settlement_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_attachments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_attachments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "expense_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      severance_reserve_adjustments: {
        Row: {
          amount_delta: number
          created_at: string
          created_by_id: string
          id: string
          note: string
          period: string
        }
        Insert: {
          amount_delta: number
          created_at?: string
          created_by_id: string
          id?: string
          note: string
          period: string
        }
        Update: {
          amount_delta?: number
          created_at?: string
          created_by_id?: string
          id?: string
          note?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "severance_reserve_adjustments_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_log: {
        Row: {
          action: string
          entity: string
          entity_id: string | null
          event_date: string
          id: string
          impersonator_id: string | null
          new_value: Json | null
          note: string | null
          previous_value: Json | null
          user_id: string
        }
        Insert: {
          action: string
          entity: string
          entity_id?: string | null
          event_date?: string
          id?: string
          impersonator_id?: string | null
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          entity?: string
          entity_id?: string | null
          event_date?: string
          id?: string
          impersonator_id?: string | null
          new_value?: Json | null
          note?: string | null
          previous_value?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_audit_log_impersonator_id_fkey"
            columns: ["impersonator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_initial_admin: {
        Args: { p_email: string; p_full_name: string; p_password: string }
        Returns: string
      }
      create_user_with_role: {
        Args: {
          p_email: string
          p_full_name: string
          p_password: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      get_dashboard_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      get_ministry_budget_summary: {
        Args: { p_period_id?: string }
        Returns: Json
      }
      get_ministry_leftover_summary: {
        Args: { p_as_of?: string; p_ministry_id?: string }
        Returns: Json
      }
      get_my_active_ministries: { Args: never; Returns: string[] }
      get_my_ministries_as_minister: { Args: never; Returns: string[] }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_pending_reminders: { Args: never; Returns: Json }
      register_payroll: {
        Args: {
          p_category_id: string
          p_created_by_id: string
          p_lines: Json
          p_period: string
        }
        Returns: Json
      }
    }
    Enums: {
      comment_entity: "INTENTION" | "SETTLEMENT"
      intention_funding_method: "REIMBURSEMENT" | "TRANSFER"
      intention_status:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "DRAFT"
        | "CANCELLED"
      movement_status: "ACTIVE" | "CANCELLED"
      movement_type: "INCOME" | "EXPENSE"
      notification_status: "PENDING" | "SENT" | "ERROR" | "SKIPPED"
      settlement_status:
        | "PENDING"
        | "APPROVED"
        | "REJECTED"
        | "DRAFT"
        | "IN_REVIEW"
        | "RETURNED_FOR_CORRECTION"
        | "CANCELLED"
      user_role: "ADMIN" | "BURSAR" | "FINANCE" | "MINISTER" | "DELEGATE"
      user_status:
        | "ACTIVE"
        | "INACTIVE"
        | "PENDING_ACTIVATION"
        | "PENDING_RESET"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      comment_entity: ["INTENTION", "SETTLEMENT"],
      intention_funding_method: ["REIMBURSEMENT", "TRANSFER"],
      intention_status: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "DRAFT",
        "CANCELLED",
      ],
      movement_status: ["ACTIVE", "CANCELLED"],
      movement_type: ["INCOME", "EXPENSE"],
      notification_status: ["PENDING", "SENT", "ERROR", "SKIPPED"],
      settlement_status: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "DRAFT",
        "IN_REVIEW",
        "RETURNED_FOR_CORRECTION",
        "CANCELLED",
      ],
      user_role: ["ADMIN", "BURSAR", "FINANCE", "MINISTER", "DELEGATE"],
      user_status: [
        "ACTIVE",
        "INACTIVE",
        "PENDING_ACTIVATION",
        "PENDING_RESET",
      ],
    },
  },
} as const

