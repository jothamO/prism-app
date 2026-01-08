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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_preferences: {
        Row: {
          created_at: string | null
          email_daily_summary: boolean | null
          email_on_failed_verification: boolean | null
          email_on_new_user: boolean | null
          email_on_receipt_error: boolean | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_daily_summary?: boolean | null
          email_on_failed_verification?: boolean | null
          email_on_new_user?: boolean | null
          email_on_receipt_error?: boolean | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_daily_summary?: boolean | null
          email_on_failed_verification?: boolean | null
          email_on_new_user?: boolean | null
          email_on_receipt_error?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_feedback: {
        Row: {
          ai_model_version: string | null
          ai_prediction: Json
          amount: number | null
          business_id: string | null
          correction_type: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          item_description: string
          metadata: Json | null
          trained_at: string | null
          training_batch_id: string | null
          updated_at: string | null
          used_in_training: boolean | null
          user_correction: Json
          user_id: string
        }
        Insert: {
          ai_model_version?: string | null
          ai_prediction: Json
          amount?: number | null
          business_id?: string | null
          correction_type: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          item_description: string
          metadata?: Json | null
          trained_at?: string | null
          training_batch_id?: string | null
          updated_at?: string | null
          used_in_training?: boolean | null
          user_correction: Json
          user_id: string
        }
        Update: {
          ai_model_version?: string | null
          ai_prediction?: Json
          amount?: number | null
          business_id?: string | null
          correction_type?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          item_description?: string
          metadata?: Json | null
          trained_at?: string | null
          training_batch_id?: string | null
          updated_at?: string | null
          used_in_training?: boolean | null
          user_correction?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_summary: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_value: number
          period: string
          period_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_value: number
          period: string
          period_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_value?: number
          period?: string
          period_date?: string
        }
        Relationships: []
      }
      app_changelog_entries: {
        Row: {
          commit_hash: string | null
          component: string | null
          contributor: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          entry_type: string
          id: string
          pull_request_url: string | null
          release_id: string | null
          title: string
        }
        Insert: {
          commit_hash?: string | null
          component?: string | null
          contributor?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          entry_type: string
          id?: string
          pull_request_url?: string | null
          release_id?: string | null
          title: string
        }
        Update: {
          commit_hash?: string | null
          component?: string | null
          contributor?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          entry_type?: string
          id?: string
          pull_request_url?: string | null
          release_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_changelog_entries_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "app_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      app_releases: {
        Row: {
          created_at: string | null
          created_by: string | null
          github_release_id: number | null
          github_release_url: string | null
          id: string
          is_breaking: boolean | null
          is_major: boolean | null
          published_at: string | null
          release_date: string
          status: string
          summary: string | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          github_release_id?: number | null
          github_release_url?: string | null
          id?: string
          is_breaking?: boolean | null
          is_major?: boolean | null
          published_at?: string | null
          release_date?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          github_release_id?: number | null
          github_release_url?: string | null
          id?: string
          is_breaking?: boolean | null
          is_major?: boolean | null
          published_at?: string | null
          release_date?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_charges: {
        Row: {
          amount: number
          base_amount: number
          category: string
          confidence: number
          created_at: string
          description: string
          detected_at: string
          id: string
          is_deductible: boolean
          transaction_id: string
          updated_at: string
          user_id: string
          vat_amount: number
        }
        Insert: {
          amount: number
          base_amount: number
          category: string
          confidence?: number
          created_at?: string
          description: string
          detected_at?: string
          id?: string
          is_deductible?: boolean
          transaction_id: string
          updated_at?: string
          user_id: string
          vat_amount?: number
        }
        Update: {
          amount?: number
          base_amount?: number
          category?: string
          confidence?: number
          created_at?: string
          description?: string
          detected_at?: string
          id?: string
          is_deductible?: boolean
          transaction_id?: string
          updated_at?: string
          user_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_charges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          account_number: string | null
          bank_name: string | null
          business_id: string | null
          classification_accuracy: number | null
          classified_count: number | null
          closing_balance: number | null
          created_at: string | null
          currency: string | null
          error_message: string | null
          file_hash: string | null
          file_name: string | null
          file_url: string
          id: string
          metadata: Json | null
          opening_balance: number | null
          processing_completed_at: string | null
          processing_started_at: string | null
          processing_status: string | null
          statement_end_date: string | null
          statement_start_date: string | null
          total_credits: number | null
          total_debits: number | null
          transaction_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          business_id?: string | null
          classification_accuracy?: number | null
          classified_count?: number | null
          closing_balance?: number | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          metadata?: Json | null
          opening_balance?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          statement_end_date?: string | null
          statement_start_date?: string | null
          total_credits?: number | null
          total_debits?: number | null
          transaction_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          business_id?: string | null
          classification_accuracy?: number | null
          classified_count?: number | null
          closing_balance?: number | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          file_hash?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          metadata?: Json | null
          opening_balance?: number | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          processing_status?: string | null
          statement_end_date?: string | null
          statement_start_date?: string | null
          total_credits?: number | null
          total_debits?: number | null
          transaction_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          balance: number | null
          business_id: string | null
          capital_type: string | null
          category: string | null
          classification: string | null
          classification_source: string | null
          compliance_flags: Json | null
          confidence: number | null
          created_at: string | null
          credit: number | null
          debit: number | null
          description: string
          foreign_currency: string | null
          id: string
          is_bank_charge: boolean | null
          is_capital_injection: boolean | null
          is_emtl: boolean | null
          is_expense: boolean | null
          is_foreign_currency: boolean | null
          is_mobile_money: boolean | null
          is_nigerian_bank_charge: boolean | null
          is_pos_transaction: boolean | null
          is_revenue: boolean | null
          is_stamp_duty: boolean | null
          is_tax_relevant: boolean | null
          is_transfer: boolean | null
          is_ussd_transaction: boolean | null
          linked_expense_id: string | null
          linked_invoice_id: string | null
          metadata: Json | null
          mobile_money_provider: string | null
          reference: string | null
          statement_id: string | null
          transaction_date: string
          updated_at: string | null
          user_classification: string | null
          user_correction: Json | null
          user_id: string
          user_reviewed: boolean | null
          value_date: string | null
          vat_amount: number | null
          vat_applicable: boolean | null
        }
        Insert: {
          balance?: number | null
          business_id?: string | null
          capital_type?: string | null
          category?: string | null
          classification?: string | null
          classification_source?: string | null
          compliance_flags?: Json | null
          confidence?: number | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description: string
          foreign_currency?: string | null
          id?: string
          is_bank_charge?: boolean | null
          is_capital_injection?: boolean | null
          is_emtl?: boolean | null
          is_expense?: boolean | null
          is_foreign_currency?: boolean | null
          is_mobile_money?: boolean | null
          is_nigerian_bank_charge?: boolean | null
          is_pos_transaction?: boolean | null
          is_revenue?: boolean | null
          is_stamp_duty?: boolean | null
          is_tax_relevant?: boolean | null
          is_transfer?: boolean | null
          is_ussd_transaction?: boolean | null
          linked_expense_id?: string | null
          linked_invoice_id?: string | null
          metadata?: Json | null
          mobile_money_provider?: string | null
          reference?: string | null
          statement_id?: string | null
          transaction_date: string
          updated_at?: string | null
          user_classification?: string | null
          user_correction?: Json | null
          user_id: string
          user_reviewed?: boolean | null
          value_date?: string | null
          vat_amount?: number | null
          vat_applicable?: boolean | null
        }
        Update: {
          balance?: number | null
          business_id?: string | null
          capital_type?: string | null
          category?: string | null
          classification?: string | null
          classification_source?: string | null
          compliance_flags?: Json | null
          confidence?: number | null
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string
          foreign_currency?: string | null
          id?: string
          is_bank_charge?: boolean | null
          is_capital_injection?: boolean | null
          is_emtl?: boolean | null
          is_expense?: boolean | null
          is_foreign_currency?: boolean | null
          is_mobile_money?: boolean | null
          is_nigerian_bank_charge?: boolean | null
          is_pos_transaction?: boolean | null
          is_revenue?: boolean | null
          is_stamp_duty?: boolean | null
          is_tax_relevant?: boolean | null
          is_transfer?: boolean | null
          is_ussd_transaction?: boolean | null
          linked_expense_id?: string | null
          linked_invoice_id?: string | null
          metadata?: Json | null
          mobile_money_provider?: string | null
          reference?: string | null
          statement_id?: string | null
          transaction_date?: string
          updated_at?: string | null
          user_classification?: string | null
          user_correction?: Json | null
          user_id?: string
          user_reviewed?: boolean | null
          value_date?: string | null
          vat_amount?: number | null
          vat_applicable?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_commands: {
        Row: {
          command: string
          created_at: string | null
          description: string
          id: string
          is_enabled: boolean | null
          is_standard: boolean | null
          platform: string
          response_text: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          command: string
          created_at?: string | null
          description: string
          id?: string
          is_enabled?: boolean | null
          is_standard?: boolean | null
          platform?: string
          response_text?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          command?: string
          created_at?: string | null
          description?: string
          id?: string
          is_enabled?: boolean | null
          is_standard?: boolean | null
          platform?: string
          response_text?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      broadcast_messages: {
        Row: {
          admin_user_id: string
          completed_at: string | null
          created_at: string | null
          delivered_count: number | null
          failed_count: number | null
          filters: Json | null
          id: string
          message_text: string
          platform: string
          sent_count: number | null
          status: string | null
          total_recipients: number | null
        }
        Insert: {
          admin_user_id: string
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          filters?: Json | null
          id?: string
          message_text: string
          platform: string
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
        }
        Update: {
          admin_user_id?: string
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          failed_count?: number | null
          filters?: Json | null
          id?: string
          message_text?: string
          platform?: string
          sent_count?: number | null
          status?: string | null
          total_recipients?: number | null
        }
        Relationships: []
      }
      business_classification_patterns: {
        Row: {
          business_id: string
          category: string
          confidence: number | null
          correct_predictions: number | null
          created_at: string | null
          id: string
          item_pattern: string
          last_used_at: string | null
          occurrence_count: number | null
          total_amount: number | null
        }
        Insert: {
          business_id: string
          category: string
          confidence?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          id?: string
          item_pattern: string
          last_used_at?: string | null
          occurrence_count?: number | null
          total_amount?: number | null
        }
        Update: {
          business_id?: string
          category?: string
          confidence?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          id?: string
          item_pattern?: string
          last_used_at?: string | null
          occurrence_count?: number | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_classification_patterns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          account_setup: string | null
          annual_turnover: number | null
          business_stage: string | null
          business_type: string | null
          cac_data: Json | null
          cac_number: string | null
          cac_registration_number: string | null
          cac_verified: boolean | null
          capital_source: string | null
          classification: string | null
          classification_year: number | null
          company_size: string | null
          created_at: string
          handles_project_funds: boolean | null
          id: string
          industry: string | null
          industry_code: string | null
          informal_business: boolean | null
          is_default: boolean | null
          is_primary: boolean | null
          is_professional_services: boolean | null
          last_classified_at: string | null
          name: string
          next_filing_date: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          owner_user_id: string | null
          receives_capital_support: boolean | null
          registration_number: string | null
          registration_type: string | null
          revenue_range: string | null
          tax_category: string | null
          tax_rate: number | null
          tell_us_about_business: string | null
          tin: string | null
          tin_data: Json | null
          tin_verified: boolean | null
          total_fixed_assets: number | null
          updated_at: string
          user_id: string | null
          vat_enabled: boolean | null
          vat_registered: boolean | null
        }
        Insert: {
          account_setup?: string | null
          annual_turnover?: number | null
          business_stage?: string | null
          business_type?: string | null
          cac_data?: Json | null
          cac_number?: string | null
          cac_registration_number?: string | null
          cac_verified?: boolean | null
          capital_source?: string | null
          classification?: string | null
          classification_year?: number | null
          company_size?: string | null
          created_at?: string
          handles_project_funds?: boolean | null
          id?: string
          industry?: string | null
          industry_code?: string | null
          informal_business?: boolean | null
          is_default?: boolean | null
          is_primary?: boolean | null
          is_professional_services?: boolean | null
          last_classified_at?: string | null
          name: string
          next_filing_date?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          owner_user_id?: string | null
          receives_capital_support?: boolean | null
          registration_number?: string | null
          registration_type?: string | null
          revenue_range?: string | null
          tax_category?: string | null
          tax_rate?: number | null
          tell_us_about_business?: string | null
          tin?: string | null
          tin_data?: Json | null
          tin_verified?: boolean | null
          total_fixed_assets?: number | null
          updated_at?: string
          user_id?: string | null
          vat_enabled?: boolean | null
          vat_registered?: boolean | null
        }
        Update: {
          account_setup?: string | null
          annual_turnover?: number | null
          business_stage?: string | null
          business_type?: string | null
          cac_data?: Json | null
          cac_number?: string | null
          cac_registration_number?: string | null
          cac_verified?: boolean | null
          capital_source?: string | null
          classification?: string | null
          classification_year?: number | null
          company_size?: string | null
          created_at?: string
          handles_project_funds?: boolean | null
          id?: string
          industry?: string | null
          industry_code?: string | null
          informal_business?: boolean | null
          is_default?: boolean | null
          is_primary?: boolean | null
          is_professional_services?: boolean | null
          last_classified_at?: string | null
          name?: string
          next_filing_date?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          owner_user_id?: string | null
          receives_capital_support?: boolean | null
          registration_number?: string | null
          registration_type?: string | null
          revenue_range?: string | null
          tax_category?: string | null
          tax_rate?: number | null
          tell_us_about_business?: string | null
          tin?: string | null
          tin_data?: Json | null
          tin_verified?: boolean | null
          total_fixed_assets?: number | null
          updated_at?: string
          user_id?: string | null
          vat_enabled?: boolean | null
          vat_registered?: boolean | null
        }
        Relationships: []
      }
      cbn_exchange_rates: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          rate: number
          rate_date: string
          source: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency: string
          id?: string
          rate: number
          rate_date: string
          source: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cbn_rate_logs: {
        Row: {
          created_at: string | null
          currencies_updated: number | null
          error_message: string | null
          fetch_date: string
          id: string
          raw_response: Json | null
          source: string
          success: boolean
        }
        Insert: {
          created_at?: string | null
          currencies_updated?: number | null
          error_message?: string | null
          fetch_date?: string
          id?: string
          raw_response?: Json | null
          source?: string
          success: boolean
        }
        Update: {
          created_at?: string | null
          currencies_updated?: number | null
          error_message?: string | null
          fetch_date?: string
          id?: string
          raw_response?: Json | null
          source?: string
          success?: boolean
        }
        Relationships: []
      }
      chatbot_sessions: {
        Row: {
          context: Json | null
          created_at: string | null
          platform: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          platform: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          platform?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      code_change_proposals: {
        Row: {
          affected_files: string[]
          change_log_id: string | null
          code_diff: Json
          created_at: string
          description: string | null
          generated_by: string | null
          id: string
          implemented_at: string | null
          notes: string | null
          priority: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_files?: string[]
          change_log_id?: string | null
          code_diff?: Json
          created_at?: string
          description?: string | null
          generated_by?: string | null
          id?: string
          implemented_at?: string | null
          notes?: string | null
          priority?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_files?: string[]
          change_log_id?: string | null
          code_diff?: Json
          created_at?: string
          description?: string | null
          generated_by?: string | null
          id?: string
          implemented_at?: string | null
          notes?: string | null
          priority?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_change_proposals_change_log_id_fkey"
            columns: ["change_log_id"]
            isOneToOne: false
            referencedRelation: "compliance_change_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_change_proposals_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "active_tax_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_change_proposals_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "compliance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_change_log: {
        Row: {
          change_reason: string | null
          change_type: string
          changed_by: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          source_document_id: string | null
        }
        Insert: {
          change_reason?: string | null
          change_type: string
          changed_by?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          source_document_id?: string | null
        }
        Update: {
          change_reason?: string | null
          change_type?: string
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_change_log_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          document_id: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          rule_id: string | null
          severity: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          rule_id?: string | null
          severity?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          rule_id?: string | null
          severity?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_notifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "active_tax_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "compliance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_rules: {
        Row: {
          actions: Json | null
          applies_to: string[] | null
          conditions: Json | null
          created_at: string | null
          description: string | null
          document_id: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          parameters: Json | null
          previous_version_id: string | null
          priority: number | null
          provision_id: string | null
          rule_code: string | null
          rule_name: string
          rule_type: string
          tax_types: string[] | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          actions?: Json | null
          applies_to?: string[] | null
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          parameters?: Json | null
          previous_version_id?: string | null
          priority?: number | null
          provision_id?: string | null
          rule_code?: string | null
          rule_name: string
          rule_type: string
          tax_types?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          actions?: Json | null
          applies_to?: string[] | null
          conditions?: Json | null
          created_at?: string | null
          description?: string | null
          document_id?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          parameters?: Json | null
          previous_version_id?: string | null
          priority?: number | null
          provision_id?: string | null
          rule_code?: string | null
          rule_name?: string
          rule_type?: string
          tax_types?: string[] | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_rules_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_rules_provision_id_fkey"
            columns: ["provision_id"]
            isOneToOne: false
            referencedRelation: "legal_provisions"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_accounts: {
        Row: {
          account_name: string | null
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          mono_account_id: string
          mono_code: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          mono_account_id: string
          mono_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          mono_account_id?: string
          mono_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_state: {
        Row: {
          context: Json | null
          created_at: string | null
          expecting: string | null
          id: string
          telegram_id: string | null
          updated_at: string | null
          whatsapp_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          expecting?: string | null
          id?: string
          telegram_id?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          expecting?: string | null
          id?: string
          telegram_id?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
        }
        Relationships: []
      }
      document_processing_jobs: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          document_type: string
          document_url: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          max_attempts: number | null
          metadata: Json | null
          priority: number | null
          processing_status: string | null
          queued_at: string | null
          result: Json | null
          started_at: string | null
          statement_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          document_type: string
          document_url?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          priority?: number | null
          processing_status?: string | null
          queued_at?: string | null
          result?: Json | null
          started_at?: string | null
          statement_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          document_type?: string
          document_url?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          max_attempts?: number | null
          metadata?: Json | null
          priority?: number | null
          processing_status?: string | null
          queued_at?: string | null
          result?: Json | null
          started_at?: string | null
          statement_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      education_articles: {
        Row: {
          category: string
          content: string
          created_at: string | null
          description: string | null
          id: string
          is_published: boolean | null
          needs_review: boolean | null
          read_time: string | null
          review_notes: string | null
          slug: string
          source_provisions: string[] | null
          suggested_by_ai: boolean | null
          title: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          needs_review?: boolean | null
          read_time?: string | null
          review_notes?: string | null
          slug: string
          source_provisions?: string[] | null
          suggested_by_ai?: boolean | null
          title: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          needs_review?: boolean | null
          read_time?: string | null
          review_notes?: string | null
          slug?: string
          source_provisions?: string[] | null
          suggested_by_ai?: boolean | null
          title?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      emtl_charges: {
        Row: {
          amount: number
          category: string
          created_at: string
          detected_at: string
          has_vat: boolean
          id: string
          is_deductible: boolean
          linked_transfer_id: string | null
          reason: string | null
          status: string
          transaction_id: string
          transfer_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          detected_at?: string
          has_vat?: boolean
          id?: string
          is_deductible?: boolean
          linked_transfer_id?: string | null
          reason?: string | null
          status: string
          transaction_id: string
          transfer_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          detected_at?: string
          has_vat?: boolean
          id?: string
          is_deductible?: boolean
          linked_transfer_id?: string | null
          reason?: string | null
          status?: string
          transaction_id?: string
          transfer_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emtl_charges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string | null
          can_claim_input_vat: boolean | null
          category: string | null
          created_at: string | null
          date: string
          description: string
          id: string
          is_project_expense: boolean | null
          period: string
          project_id: string | null
          receipt_url: string | null
          supplier_name: string | null
          user_id: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount: number
          business_id?: string | null
          can_claim_input_vat?: boolean | null
          category?: string | null
          created_at?: string | null
          date: string
          description: string
          id?: string
          is_project_expense?: boolean | null
          period: string
          project_id?: string | null
          receipt_url?: string | null
          supplier_name?: string | null
          user_id?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          business_id?: string | null
          can_claim_input_vat?: boolean | null
          category?: string | null
          created_at?: string | null
          date?: string
          description?: string
          id?: string
          is_project_expense?: boolean | null
          period?: string
          project_id?: string | null
          receipt_url?: string | null
          supplier_name?: string | null
          user_id?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_items: {
        Row: {
          answer: string
          category: string
          created_at: string | null
          display_order: number | null
          id: string
          is_published: boolean | null
          needs_review: boolean | null
          question: string
          source_rules: string[] | null
          updated_at: string | null
        }
        Insert: {
          answer: string
          category: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          needs_review?: boolean | null
          question: string
          source_rules?: string[] | null
          updated_at?: string | null
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          needs_review?: boolean | null
          question?: string
          source_rules?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      filings: {
        Row: {
          auto_filed: boolean | null
          business_id: string | null
          created_at: string | null
          expense_count: number | null
          id: string
          input_vat: number | null
          invoice_count: number | null
          net_amount: number
          output_vat: number | null
          paid_at: string | null
          payment_status: string | null
          pdf_url: string | null
          period: string
          remita_rrr: string | null
          status: string | null
          submission_method: string | null
          submitted_at: string | null
          tax_type: string | null
          user_id: string | null
        }
        Insert: {
          auto_filed?: boolean | null
          business_id?: string | null
          created_at?: string | null
          expense_count?: number | null
          id?: string
          input_vat?: number | null
          invoice_count?: number | null
          net_amount: number
          output_vat?: number | null
          paid_at?: string | null
          payment_status?: string | null
          pdf_url?: string | null
          period: string
          remita_rrr?: string | null
          status?: string | null
          submission_method?: string | null
          submitted_at?: string | null
          tax_type?: string | null
          user_id?: string | null
        }
        Update: {
          auto_filed?: boolean | null
          business_id?: string | null
          created_at?: string | null
          expense_count?: number | null
          id?: string
          input_vat?: number | null
          invoice_count?: number | null
          net_amount?: number
          output_vat?: number | null
          paid_at?: string | null
          payment_status?: string | null
          pdf_url?: string | null
          period?: string
          remita_rrr?: string | null
          status?: string | null
          submission_method?: string | null
          submitted_at?: string | null
          tax_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_validations: {
        Row: {
          created_at: string | null
          fields_changed: string[] | null
          id: string
          invoice_id: string
          needs_review: boolean | null
          ocr_confidence_score: number | null
          original_data: Json
          user_id: string
          validated_data: Json
          validation_time_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          fields_changed?: string[] | null
          id?: string
          invoice_id: string
          needs_review?: boolean | null
          ocr_confidence_score?: number | null
          original_data: Json
          user_id: string
          validated_data: Json
          validation_time_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          fields_changed?: string[] | null
          id?: string
          invoice_id?: string
          needs_review?: boolean | null
          ocr_confidence_score?: number | null
          original_data?: Json
          user_id?: string
          validated_data?: Json
          validation_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_validations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_validations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          account_id: string | null
          bank_reference: string | null
          business_id: string | null
          business_registration_number: string | null
          confidence_score: number | null
          created_at: string | null
          customer_name: string | null
          customer_tin: string | null
          date: string
          id: string
          image_url: string | null
          invoice_number: string | null
          items: Json
          needs_review: boolean | null
          period: string
          review_reasons: string[] | null
          source: string | null
          status: string | null
          subtotal: number
          total: number
          updated_at: string | null
          user_confirmed: boolean | null
          user_id: string | null
          vat_amount: number
        }
        Insert: {
          account_id?: string | null
          bank_reference?: string | null
          business_id?: string | null
          business_registration_number?: string | null
          confidence_score?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_tin?: string | null
          date: string
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          items: Json
          needs_review?: boolean | null
          period: string
          review_reasons?: string[] | null
          source?: string | null
          status?: string | null
          subtotal: number
          total: number
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
          vat_amount: number
        }
        Update: {
          account_id?: string | null
          bank_reference?: string | null
          business_id?: string | null
          business_registration_number?: string | null
          confidence_score?: number | null
          created_at?: string | null
          customer_name?: string | null
          customer_tin?: string | null
          date?: string
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          items?: Json
          needs_review?: boolean | null
          period?: string
          review_reasons?: string[] | null
          source?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string | null
          user_confirmed?: boolean | null
          user_id?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "user_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          affected_taxpayers: string[] | null
          ai_summary: string | null
          created_at: string | null
          document_number: string | null
          document_type: string
          effective_date: string | null
          embedding: string | null
          expiry_date: string | null
          file_url: string | null
          id: string
          key_provisions: string[] | null
          metadata: Json | null
          needs_human_review: boolean | null
          publication_date: string | null
          raw_text: string | null
          regulatory_body_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_url: string | null
          status: string | null
          summary: string | null
          tax_types: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          affected_taxpayers?: string[] | null
          ai_summary?: string | null
          created_at?: string | null
          document_number?: string | null
          document_type: string
          effective_date?: string | null
          embedding?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          key_provisions?: string[] | null
          metadata?: Json | null
          needs_human_review?: boolean | null
          publication_date?: string | null
          raw_text?: string | null
          regulatory_body_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          tax_types?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          affected_taxpayers?: string[] | null
          ai_summary?: string | null
          created_at?: string | null
          document_number?: string | null
          document_type?: string
          effective_date?: string | null
          embedding?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          key_provisions?: string[] | null
          metadata?: Json | null
          needs_human_review?: boolean | null
          publication_date?: string | null
          raw_text?: string | null
          regulatory_body_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_url?: string | null
          status?: string | null
          summary?: string | null
          tax_types?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_regulatory_body_id_fkey"
            columns: ["regulatory_body_id"]
            isOneToOne: false
            referencedRelation: "regulatory_bodies"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_provisions: {
        Row: {
          affected_entities: string[] | null
          ai_interpretation: string | null
          compliance_actions: string[] | null
          confidence_score: number | null
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          keywords: string[] | null
          metadata: Json | null
          provision_type: string | null
          related_provisions: string[] | null
          section_number: string | null
          tax_implications: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          affected_entities?: string[] | null
          ai_interpretation?: string | null
          compliance_actions?: string[] | null
          confidence_score?: number | null
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          metadata?: Json | null
          provision_type?: string | null
          related_provisions?: string[] | null
          section_number?: string | null
          tax_implications?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_entities?: string[] | null
          ai_interpretation?: string | null
          compliance_actions?: string[] | null
          confidence_score?: number | null
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          keywords?: string[] | null
          metadata?: Json | null
          provision_type?: string | null
          related_provisions?: string[] | null
          section_number?: string | null
          tax_implications?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_provisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          context: Json | null
          created_at: string | null
          direction: string
          id: string
          media_url: string | null
          message_type: string | null
          user_id: string | null
          whatsapp_message_id: string | null
          whatsapp_status: string | null
        }
        Insert: {
          content?: string | null
          context?: Json | null
          created_at?: string | null
          direction: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          user_id?: string | null
          whatsapp_message_id?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          content?: string | null
          context?: Json | null
          created_at?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          message_type?: string | null
          user_id?: string | null
          whatsapp_message_id?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_models: {
        Row: {
          accuracy: number | null
          created_at: string | null
          deployed_at: string | null
          f1_score: number | null
          id: string
          is_active: boolean | null
          model_name: string
          model_type: string | null
          precision_score: number | null
          recall_score: number | null
          rule_version_hash: string | null
          rules_snapshot: Json | null
          status: string | null
          trained_at: string | null
          training_data_count: number | null
          version: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          deployed_at?: string | null
          f1_score?: number | null
          id?: string
          is_active?: boolean | null
          model_name: string
          model_type?: string | null
          precision_score?: number | null
          recall_score?: number | null
          rule_version_hash?: string | null
          rules_snapshot?: Json | null
          status?: string | null
          trained_at?: string | null
          training_data_count?: number | null
          version: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          deployed_at?: string | null
          f1_score?: number | null
          id?: string
          is_active?: boolean | null
          model_name?: string
          model_type?: string | null
          precision_score?: number | null
          recall_score?: number | null
          rule_version_hash?: string | null
          rules_snapshot?: Json | null
          status?: string | null
          trained_at?: string | null
          training_data_count?: number | null
          version?: string
        }
        Relationships: []
      }
      non_revenue_transactions: {
        Row: {
          amount: number
          bank_reference: string | null
          created_at: string | null
          date: string
          excluded_from_vat: boolean | null
          id: string
          is_project_fund: boolean | null
          metadata: Json | null
          project_id: string | null
          source: string | null
          transaction_type: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          created_at?: string | null
          date: string
          excluded_from_vat?: boolean | null
          id?: string
          is_project_fund?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          source?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          created_at?: string | null
          date?: string
          excluded_from_vat?: boolean | null
          id?: string
          is_project_fund?: boolean | null
          metadata?: Json | null
          project_id?: string | null
          source?: string | null
          transaction_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "non_revenue_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_revenue_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          age_group: string | null
          business_id: string | null
          completed: boolean | null
          completed_steps: Json | null
          current_step: number | null
          data: Json | null
          employment_status: string | null
          extracted_profile: Json | null
          id: string
          income_source: string | null
          income_sources_detected: string[] | null
          last_learning_update: string | null
          last_updated_at: string | null
          occupation: string | null
          pattern_metrics: Json | null
          profile_confidence: number | null
          started_at: string | null
          tax_category: string | null
          tax_category_reason: string | null
          total_steps: number | null
          user_id: string
        }
        Insert: {
          age_group?: string | null
          business_id?: string | null
          completed?: boolean | null
          completed_steps?: Json | null
          current_step?: number | null
          data?: Json | null
          employment_status?: string | null
          extracted_profile?: Json | null
          id?: string
          income_source?: string | null
          income_sources_detected?: string[] | null
          last_learning_update?: string | null
          last_updated_at?: string | null
          occupation?: string | null
          pattern_metrics?: Json | null
          profile_confidence?: number | null
          started_at?: string | null
          tax_category?: string | null
          tax_category_reason?: string | null
          total_steps?: number | null
          user_id: string
        }
        Update: {
          age_group?: string | null
          business_id?: string | null
          completed?: boolean | null
          completed_steps?: Json | null
          current_step?: number | null
          data?: Json | null
          employment_status?: string | null
          extracted_profile?: Json | null
          id?: string
          income_source?: string | null
          income_sources_detected?: string[] | null
          last_learning_update?: string | null
          last_updated_at?: string | null
          occupation?: string | null
          pattern_metrics?: Json | null
          profile_confidence?: number | null
          started_at?: string | null
          tax_category?: string | null
          tax_category_reason?: string | null
          total_steps?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profile_corrections: {
        Row: {
          ai_prediction: Json
          correction_reason: string | null
          created_at: string
          id: string
          signals: Json | null
          training_batch_id: string | null
          used_in_training: boolean | null
          user_correction: Json
          user_id: string
        }
        Insert: {
          ai_prediction: Json
          correction_reason?: string | null
          created_at?: string
          id?: string
          signals?: Json | null
          training_batch_id?: string | null
          used_in_training?: boolean | null
          user_correction: Json
          user_id: string
        }
        Update: {
          ai_prediction?: Json
          correction_reason?: string | null
          created_at?: string
          id?: string
          signals?: Json | null
          training_batch_id?: string | null
          used_in_training?: boolean | null
          user_correction?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_learning_history: {
        Row: {
          confidence: number | null
          created_at: string | null
          field_name: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          source: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          field_name: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          source?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          field_name?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          source?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_receipts: {
        Row: {
          amount: number
          bank_match_confidence: number | null
          bank_reference: string | null
          created_at: string | null
          date: string
          description: string | null
          expense_id: string | null
          id: string
          is_verified: boolean | null
          ocr_confidence: number | null
          ocr_extracted_amount: number | null
          ocr_extracted_vendor: string | null
          project_id: string
          receipt_url: string
          vendor_name: string | null
          verification_method: string | null
        }
        Insert: {
          amount: number
          bank_match_confidence?: number | null
          bank_reference?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          expense_id?: string | null
          id?: string
          is_verified?: boolean | null
          ocr_confidence?: number | null
          ocr_extracted_amount?: number | null
          ocr_extracted_vendor?: string | null
          project_id: string
          receipt_url: string
          vendor_name?: string | null
          verification_method?: string | null
        }
        Update: {
          amount?: number
          bank_match_confidence?: number | null
          bank_reference?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          is_verified?: boolean | null
          ocr_confidence?: number | null
          ocr_extracted_amount?: number | null
          ocr_extracted_vendor?: string | null
          project_id?: string
          receipt_url?: string
          vendor_name?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number
          business_id: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          exclude_from_vat: boolean | null
          id: string
          is_agency_fund: boolean | null
          name: string
          notes: string | null
          source_person: string
          source_relationship: string
          spent: number | null
          status: string | null
          tax_treatment: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          budget: number
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          exclude_from_vat?: boolean | null
          id?: string
          is_agency_fund?: boolean | null
          name: string
          notes?: string | null
          source_person: string
          source_relationship: string
          spent?: number | null
          status?: string | null
          tax_treatment?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          budget?: number
          business_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          exclude_from_vat?: boolean | null
          id?: string
          is_agency_fund?: boolean | null
          name?: string
          notes?: string | null
          source_person?: string
          source_relationship?: string
          spent?: number | null
          status?: string | null
          tax_treatment?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number | null
          category: string | null
          confidence: number | null
          confirmed: boolean | null
          created_at: string | null
          date: string | null
          id: string
          image_url: string | null
          merchant: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          category?: string | null
          confidence?: number | null
          confirmed?: boolean | null
          created_at?: string | null
          date?: string | null
          id?: string
          image_url?: string | null
          merchant?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          category?: string | null
          confidence?: number | null
          confirmed?: boolean | null
          created_at?: string | null
          date?: string | null
          id?: string
          image_url?: string | null
          merchant?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      regulation_relationships: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          relationship_type: string
          source_document_id: string
          target_document_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type: string
          source_document_id: string
          target_document_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          relationship_type?: string
          source_document_id?: string
          target_document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulation_relationships_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulation_relationships_target_document_id_fkey"
            columns: ["target_document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_bodies: {
        Row: {
          abbreviation: string
          created_at: string | null
          id: string
          jurisdiction: string | null
          name: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          abbreviation: string
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          name: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          abbreviation?: string
          created_at?: string | null
          id?: string
          jurisdiction?: string | null
          name?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      related_parties: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          party_name: string
          party_tin: string | null
          relationship_type: string
          tin_verified: boolean | null
          updated_at: string | null
          user_id: string
          verification_data: Json | null
          verification_date: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          party_name: string
          party_tin?: string | null
          relationship_type: string
          tin_verified?: boolean | null
          updated_at?: string | null
          user_id: string
          verification_data?: Json | null
          verification_date?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          party_name?: string
          party_tin?: string | null
          relationship_type?: string
          tin_verified?: boolean | null
          updated_at?: string | null
          user_id?: string
          verification_data?: Json | null
          verification_date?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string | null
          due_date: string
          id: string
          message: string
          reminder_type: string
          send_at: string
          sent: boolean | null
          sent_at: string | null
          tax_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          due_date: string
          id?: string
          message: string
          reminder_type: string
          send_at: string
          sent?: boolean | null
          sent_at?: string | null
          tax_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          due_date?: string
          id?: string
          message?: string
          reminder_type?: string
          send_at?: string
          sent?: boolean | null
          sent_at?: string | null
          tax_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      review_queue: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          priority: string | null
          priority_score: number | null
          reasons: string[]
          resolved_at: string | null
          status: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          priority?: string | null
          priority_score?: number | null
          reasons: string[]
          resolved_at?: string | null
          status?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          priority?: string | null
          priority_score?: number | null
          reasons?: string[]
          resolved_at?: string | null
          status?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          auto_verification_enabled: boolean | null
          default_tax_year: number | null
          filing_reminder_days: number | null
          id: string
          onboarding_mode: string | null
          telegram_enabled: boolean | null
          updated_at: string | null
          updated_by: string | null
          welcome_message_telegram: string | null
          welcome_message_whatsapp: string | null
          whatsapp_enabled: boolean | null
        }
        Insert: {
          auto_verification_enabled?: boolean | null
          default_tax_year?: number | null
          filing_reminder_days?: number | null
          id?: string
          onboarding_mode?: string | null
          telegram_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          welcome_message_telegram?: string | null
          welcome_message_whatsapp?: string | null
          whatsapp_enabled?: boolean | null
        }
        Update: {
          auto_verification_enabled?: boolean | null
          default_tax_year?: number | null
          filing_reminder_days?: number | null
          id?: string
          onboarding_mode?: string | null
          telegram_enabled?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
          welcome_message_telegram?: string | null
          welcome_message_whatsapp?: string | null
          whatsapp_enabled?: boolean | null
        }
        Relationships: []
      }
      tax_deadlines: {
        Row: {
          created_at: string | null
          day_of_month: number | null
          deadline_type: string
          description: string | null
          id: string
          is_active: boolean | null
          month_of_year: number | null
          recurrence: string | null
          source_rule_id: string | null
          specific_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_month?: number | null
          deadline_type: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          month_of_year?: number | null
          recurrence?: string | null
          source_rule_id?: string | null
          specific_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_month?: number | null
          deadline_type?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          month_of_year?: number | null
          recurrence?: string | null
          source_rule_id?: string | null
          specific_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_deadlines_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "active_tax_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_deadlines_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "compliance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_auth_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          telegram_id: string | null
          token: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          telegram_id?: string | null
          token: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          telegram_id?: string | null
          token?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_auth_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          business_id: string | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          mono_account_id: string
          purpose: string | null
          sync_status: string | null
          track_expenses: boolean | null
          track_sales: boolean | null
          user_id: string | null
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          mono_account_id: string
          purpose?: string | null
          sync_status?: string | null
          track_expenses?: boolean | null
          track_sales?: boolean | null
          user_id?: string | null
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          mono_account_id?: string
          purpose?: string | null
          sync_status?: string | null
          track_expenses?: boolean | null
          track_sales?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_compliance_preferences: {
        Row: {
          created_at: string | null
          email_notifications: boolean | null
          id: string
          in_app_notifications: boolean | null
          notify_amendments: boolean | null
          notify_deadlines: boolean | null
          notify_new_regulations: boolean | null
          notify_rate_changes: boolean | null
          tax_types: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          in_app_notifications?: boolean | null
          notify_amendments?: boolean | null
          notify_deadlines?: boolean | null
          notify_new_regulations?: boolean | null
          notify_rate_changes?: boolean | null
          tax_types?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          in_app_notifications?: boolean | null
          notify_amendments?: boolean | null
          notify_deadlines?: boolean | null
          notify_new_regulations?: boolean | null
          notify_rate_changes?: boolean | null
          tax_types?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_insights: {
        Row: {
          acted_on_at: string | null
          action: string
          auth_user_id: string | null
          created_at: string
          deadline: string | null
          description: string
          id: string
          is_acted_on: boolean | null
          is_read: boolean | null
          metadata: Json | null
          month: string
          potential_cost: number | null
          potential_saving: number | null
          priority: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acted_on_at?: string | null
          action: string
          auth_user_id?: string | null
          created_at?: string
          deadline?: string | null
          description: string
          id?: string
          is_acted_on?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          month: string
          potential_cost?: number | null
          potential_saving?: number | null
          priority: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acted_on_at?: string | null
          action?: string
          auth_user_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          is_acted_on?: boolean | null
          is_read?: boolean | null
          metadata?: Json | null
          month?: string
          potential_cost?: number | null
          potential_saving?: number | null
          priority?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tax_profiles: {
        Row: {
          ai_confidence: number | null
          created_at: string
          employment_status: string | null
          has_diplomatic_immunity: boolean | null
          id: string
          income_types: string[] | null
          industry_type: string | null
          is_disabled: boolean | null
          is_pensioner: boolean | null
          is_professional_services: boolean | null
          is_senior_citizen: boolean | null
          last_updated_at: string | null
          updated_at: string
          user_confirmed: boolean | null
          user_id: string
          user_type: string | null
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          employment_status?: string | null
          has_diplomatic_immunity?: boolean | null
          id?: string
          income_types?: string[] | null
          industry_type?: string | null
          is_disabled?: boolean | null
          is_pensioner?: boolean | null
          is_professional_services?: boolean | null
          is_senior_citizen?: boolean | null
          last_updated_at?: string | null
          updated_at?: string
          user_confirmed?: boolean | null
          user_id: string
          user_type?: string | null
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          employment_status?: string | null
          has_diplomatic_immunity?: boolean | null
          id?: string
          income_types?: string[] | null
          industry_type?: string | null
          is_disabled?: boolean | null
          is_pensioner?: boolean | null
          is_professional_services?: boolean | null
          is_senior_citizen?: boolean | null
          last_updated_at?: string | null
          updated_at?: string
          user_confirmed?: boolean | null
          user_id?: string
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_tax_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_type: string | null
          age: number | null
          auth_user_id: string | null
          auto_categorize: boolean | null
          bank_setup: string | null
          blocked_at: string | null
          blocked_reason: string | null
          business_name: string | null
          business_sector: string | null
          business_type: string | null
          bvn: string | null
          bvn_verified: boolean | null
          bvn_verified_name: string | null
          cac_number: string | null
          company_name: string | null
          consent_given: boolean | null
          created_at: string | null
          email: string | null
          entity_type: string | null
          first_name: string | null
          full_name: string | null
          has_active_vat: boolean | null
          has_business_income: boolean | null
          has_freelance_income: boolean | null
          has_investment_income: boolean | null
          has_pension_income: boolean | null
          has_rental_income: boolean | null
          has_salary_income: boolean | null
          id: string
          income_type: string | null
          informal_business: boolean | null
          insight_frequency: string | null
          is_active: boolean | null
          is_blocked: boolean | null
          kyc_level: number | null
          last_name: string | null
          location: string | null
          nin: string | null
          nin_verified: boolean | null
          nin_verified_name: string | null
          notification_preferences: Json | null
          occupation: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          phone: string | null
          platform: string | null
          primary_tax_category: string | null
          profile_confidence: number | null
          subscription_expires_at: string | null
          subscription_status: string | null
          subscription_tier: string | null
          tax_category: string | null
          tax_profile_summary: Json | null
          tax_regime: string | null
          telegram_id: string | null
          telegram_username: string | null
          tell_us_about_yourself: string | null
          tin: string | null
          updated_at: string | null
          verification_data: Json | null
          verification_source: string | null
          verification_status: string | null
          verified_at: string | null
          whatsapp_id: string | null
          whatsapp_number: string | null
          work_status: string | null
        }
        Insert: {
          account_type?: string | null
          age?: number | null
          auth_user_id?: string | null
          auto_categorize?: boolean | null
          bank_setup?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          business_name?: string | null
          business_sector?: string | null
          business_type?: string | null
          bvn?: string | null
          bvn_verified?: boolean | null
          bvn_verified_name?: string | null
          cac_number?: string | null
          company_name?: string | null
          consent_given?: boolean | null
          created_at?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          has_active_vat?: boolean | null
          has_business_income?: boolean | null
          has_freelance_income?: boolean | null
          has_investment_income?: boolean | null
          has_pension_income?: boolean | null
          has_rental_income?: boolean | null
          has_salary_income?: boolean | null
          id?: string
          income_type?: string | null
          informal_business?: boolean | null
          insight_frequency?: string | null
          is_active?: boolean | null
          is_blocked?: boolean | null
          kyc_level?: number | null
          last_name?: string | null
          location?: string | null
          nin?: string | null
          nin_verified?: boolean | null
          nin_verified_name?: string | null
          notification_preferences?: Json | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          platform?: string | null
          primary_tax_category?: string | null
          profile_confidence?: number | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_category?: string | null
          tax_profile_summary?: Json | null
          tax_regime?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          tell_us_about_yourself?: string | null
          tin?: string | null
          updated_at?: string | null
          verification_data?: Json | null
          verification_source?: string | null
          verification_status?: string | null
          verified_at?: string | null
          whatsapp_id?: string | null
          whatsapp_number?: string | null
          work_status?: string | null
        }
        Update: {
          account_type?: string | null
          age?: number | null
          auth_user_id?: string | null
          auto_categorize?: boolean | null
          bank_setup?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          business_name?: string | null
          business_sector?: string | null
          business_type?: string | null
          bvn?: string | null
          bvn_verified?: boolean | null
          bvn_verified_name?: string | null
          cac_number?: string | null
          company_name?: string | null
          consent_given?: boolean | null
          created_at?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          has_active_vat?: boolean | null
          has_business_income?: boolean | null
          has_freelance_income?: boolean | null
          has_investment_income?: boolean | null
          has_pension_income?: boolean | null
          has_rental_income?: boolean | null
          has_salary_income?: boolean | null
          id?: string
          income_type?: string | null
          informal_business?: boolean | null
          insight_frequency?: string | null
          is_active?: boolean | null
          is_blocked?: boolean | null
          kyc_level?: number | null
          last_name?: string | null
          location?: string | null
          nin?: string | null
          nin_verified?: boolean | null
          nin_verified_name?: string | null
          notification_preferences?: Json | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          platform?: string | null
          primary_tax_category?: string | null
          profile_confidence?: number | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_category?: string | null
          tax_profile_summary?: Json | null
          tax_regime?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          tell_us_about_yourself?: string | null
          tin?: string | null
          updated_at?: string | null
          verification_data?: Json | null
          verification_source?: string | null
          verification_status?: string | null
          verified_at?: string | null
          whatsapp_id?: string | null
          whatsapp_number?: string | null
          work_status?: string | null
        }
        Relationships: []
      }
      vat_reconciliations: {
        Row: {
          business_id: string | null
          created_at: string | null
          credit_brought_forward: number | null
          credit_carried_forward: number | null
          filed_at: string | null
          filed_by: string | null
          id: string
          input_vat: number
          input_vat_expenses_count: number | null
          net_vat: number
          output_vat: number
          output_vat_invoices_count: number | null
          period: string
          remittance_proof: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          credit_brought_forward?: number | null
          credit_carried_forward?: number | null
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          input_vat?: number
          input_vat_expenses_count?: number | null
          net_vat?: number
          output_vat?: number
          output_vat_invoices_count?: number | null
          period: string
          remittance_proof?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          credit_brought_forward?: number | null
          credit_carried_forward?: number | null
          filed_at?: string | null
          filed_by?: string | null
          id?: string
          input_vat?: number
          input_vat_expenses_count?: number | null
          net_vat?: number
          output_vat?: number
          output_vat_invoices_count?: number | null
          period?: string
          remittance_proof?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_reconciliations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reconciliations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_tax_rules: {
        Row: {
          description: string | null
          document_id: string | null
          effective_from: string | null
          effective_to: string | null
          id: string | null
          parameters: Json | null
          priority: number | null
          provision_id: string | null
          rule_code: string | null
          rule_name: string | null
          rule_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_rules_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_rules_provision_id_fkey"
            columns: ["provision_id"]
            isOneToOne: false
            referencedRelation: "legal_provisions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_analytics: {
        Row: {
          ai_classified_count: number | null
          avg_confidence: number | null
          bank_charge_count: number | null
          business_id: string | null
          emtl_count: number | null
          foreign_currency_count: number | null
          mobile_money_count: number | null
          pattern_classified_count: number | null
          period: string | null
          pos_count: number | null
          rule_classified_count: number | null
          total_count: number | null
          total_credits: number | null
          total_debits: number | null
          total_vat: number | null
          user_id: string | null
          ussd_count: number | null
          vat_applicable_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      capture_rules_for_ml_training: { Args: never; Returns: Json }
      find_similar_pattern: {
        Args: {
          p_business_id: string
          p_description: string
          p_threshold?: number
        }
        Returns: {
          category: string
          confidence: number
          id: string
          item_pattern: string
          similarity: number
        }[]
      }
      get_profile_confidence_trend: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          avg_confidence: number
          date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_pattern_usage: {
        Args: { pattern_id: string }
        Returns: undefined
      }
      refresh_transaction_analytics: { Args: never; Returns: undefined }
      search_compliance_documents: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          document_type: string
          id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      search_compliance_provisions: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          provision_type: string
          section_number: string
          similarity: number
          title: string
        }[]
      }
      upsert_business_pattern: {
        Args: {
          p_amount?: number
          p_business_id: string
          p_category: string
          p_pattern: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
