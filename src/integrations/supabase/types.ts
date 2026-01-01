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
          annual_turnover: number | null
          classification: string | null
          classification_year: number | null
          created_at: string
          id: string
          is_default: boolean | null
          is_primary: boolean | null
          is_professional_services: boolean | null
          last_classified_at: string | null
          name: string
          next_filing_date: string | null
          registration_number: string
          registration_type: string | null
          tax_rate: number | null
          tin: string | null
          total_fixed_assets: number | null
          updated_at: string
          user_id: string
          vat_enabled: boolean | null
          vat_registered: boolean | null
        }
        Insert: {
          annual_turnover?: number | null
          classification?: string | null
          classification_year?: number | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_primary?: boolean | null
          is_professional_services?: boolean | null
          last_classified_at?: string | null
          name: string
          next_filing_date?: string | null
          registration_number: string
          registration_type?: string | null
          tax_rate?: number | null
          tin?: string | null
          total_fixed_assets?: number | null
          updated_at?: string
          user_id: string
          vat_enabled?: boolean | null
          vat_registered?: boolean | null
        }
        Update: {
          annual_turnover?: number | null
          classification?: string | null
          classification_year?: number | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_primary?: boolean | null
          is_professional_services?: boolean | null
          last_classified_at?: string | null
          name?: string
          next_filing_date?: string | null
          registration_number?: string
          registration_type?: string | null
          tax_rate?: number | null
          tin?: string | null
          total_fixed_assets?: number | null
          updated_at?: string
          user_id?: string
          vat_enabled?: boolean | null
          vat_registered?: boolean | null
        }
        Relationships: []
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
      related_parties: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          party_name: string
          party_tin: string | null
          relationship_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          party_name: string
          party_tin?: string | null
          relationship_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          party_name?: string
          party_tin?: string | null
          relationship_type?: string
          updated_at?: string | null
          user_id?: string
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
          notes: string | null
          priority: string | null
          priority_score: number | null
          reasons: string[]
          resolved_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          priority?: string | null
          priority_score?: number | null
          reasons: string[]
          resolved_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          priority?: string | null
          priority_score?: number | null
          reasons?: string[]
          resolved_at?: string | null
          status?: string | null
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
          age: number | null
          business_name: string | null
          business_type: string | null
          cac_number: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          entity_type: string | null
          first_name: string | null
          full_name: string | null
          has_active_vat: boolean | null
          id: string
          last_name: string | null
          nin: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          platform: string | null
          subscription_expires_at: string | null
          subscription_status: string | null
          subscription_tier: string | null
          tax_regime: string | null
          telegram_id: string | null
          telegram_username: string | null
          tin: string | null
          updated_at: string | null
          whatsapp_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          age?: number | null
          business_name?: string | null
          business_type?: string | null
          cac_number?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          has_active_vat?: boolean | null
          id?: string
          last_name?: string | null
          nin?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          platform?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_regime?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          tin?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          age?: number | null
          business_name?: string | null
          business_type?: string | null
          cac_number?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          entity_type?: string | null
          first_name?: string | null
          full_name?: string | null
          has_active_vat?: boolean | null
          id?: string
          last_name?: string | null
          nin?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          platform?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tax_regime?: string | null
          telegram_id?: string | null
          telegram_username?: string | null
          tin?: string | null
          updated_at?: string | null
          whatsapp_id?: string | null
          whatsapp_number?: string | null
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
