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
  public: {
    Tables: {
      absensi_asn: {
        Row: {
          catatan: string | null
          created_at: string
          device_info: string | null
          foto_url: string | null
          id: string
          is_late: boolean | null
          lat: number | null
          late_minutes: number | null
          lng: number | null
          lokasi: string | null
          opd_id: string | null
          schedule_id: string | null
          tipe: string
          user_id: string
          waktu: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          device_info?: string | null
          foto_url?: string | null
          id?: string
          is_late?: boolean | null
          lat?: number | null
          late_minutes?: number | null
          lng?: number | null
          lokasi?: string | null
          opd_id?: string | null
          schedule_id?: string | null
          tipe: string
          user_id: string
          waktu?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          device_info?: string | null
          foto_url?: string | null
          id?: string
          is_late?: boolean | null
          lat?: number | null
          late_minutes?: number | null
          lng?: number | null
          lokasi?: string | null
          opd_id?: string | null
          schedule_id?: string | null
          tipe?: string
          user_id?: string
          waktu?: string
        }
        Relationships: [
          {
            foreignKeyName: "absensi_asn_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absensi_asn_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_setting: {
        Row: {
          category: string | null
          key: string
          public_visible: boolean
          updated_at: string
          value: Json
        }
        Insert: {
          category?: string | null
          key: string
          public_visible?: boolean
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string | null
          key?: string
          public_visible?: boolean
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      aset: {
        Row: {
          catatan: string | null
          created_at: string
          deskripsi: string | null
          foto_url: string | null
          id: string
          kategori: string | null
          kode: string
          kondisi: string
          last_verified_at: string | null
          lat: number | null
          lifecycle_status: string | null
          lng: number | null
          lokasi: string | null
          lokasi_terkini: string | null
          merk: string | null
          nama: string
          nilai_perolehan: number | null
          nomor_seri: string | null
          opd_id: string | null
          pemegang_user_id: string | null
          status: string
          tanggal_perolehan: string | null
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          deskripsi?: string | null
          foto_url?: string | null
          id?: string
          kategori?: string | null
          kode: string
          kondisi?: string
          last_verified_at?: string | null
          lat?: number | null
          lifecycle_status?: string | null
          lng?: number | null
          lokasi?: string | null
          lokasi_terkini?: string | null
          merk?: string | null
          nama: string
          nilai_perolehan?: number | null
          nomor_seri?: string | null
          opd_id?: string | null
          pemegang_user_id?: string | null
          status?: string
          tanggal_perolehan?: string | null
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          deskripsi?: string | null
          foto_url?: string | null
          id?: string
          kategori?: string | null
          kode?: string
          kondisi?: string
          last_verified_at?: string | null
          lat?: number | null
          lifecycle_status?: string | null
          lng?: number | null
          lokasi?: string | null
          lokasi_terkini?: string | null
          merk?: string | null
          nama?: string
          nilai_perolehan?: number | null
          nomor_seri?: string | null
          opd_id?: string | null
          pemegang_user_id?: string | null
          status?: string
          tanggal_perolehan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aset_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aset_pemegang_user_id_fkey"
            columns: ["pemegang_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aset_riwayat: {
        Row: {
          aksi: string
          aset_id: string
          catatan: string | null
          created_at: string
          data: Json | null
          id: string
          lat: number | null
          lng: number | null
          lokasi_text: string | null
          oleh: string | null
        }
        Insert: {
          aksi: string
          aset_id: string
          catatan?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          lokasi_text?: string | null
          oleh?: string | null
        }
        Update: {
          aksi?: string
          aset_id?: string
          catatan?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          lokasi_text?: string | null
          oleh?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aset_riwayat_aset_id_fkey"
            columns: ["aset_id"]
            isOneToOne: false
            referencedRelation: "aset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aset_riwayat_oleh_fkey"
            columns: ["oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aset_verification_campaign: {
        Row: {
          created_at: string
          created_by: string | null
          deskripsi: string | null
          id: string
          nama: string
          periode_mulai: string | null
          periode_selesai: string | null
          status: string
          target_opd_ids: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deskripsi?: string | null
          id?: string
          nama: string
          periode_mulai?: string | null
          periode_selesai?: string | null
          status?: string
          target_opd_ids?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deskripsi?: string | null
          id?: string
          nama?: string
          periode_mulai?: string | null
          periode_selesai?: string | null
          status?: string
          target_opd_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      aset_verification_item: {
        Row: {
          aset_id: string
          campaign_id: string
          catatan: string | null
          created_at: string
          foto_url: string | null
          id: string
          lat: number | null
          lng: number | null
          lokasi_text: string | null
          opd_id: string | null
          status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          aset_id: string
          campaign_id: string
          catatan?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lokasi_text?: string | null
          opd_id?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          aset_id?: string
          campaign_id?: string
          catatan?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lokasi_text?: string | null
          opd_id?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aset_verification_item_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "aset_verification_campaign"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_id: string | null
          aksi: string
          correlation_id: string | null
          created_at: string
          data_sebelum: Json | null
          data_sesudah: Json | null
          entitas: string
          entitas_id: string | null
          id: string
          ip_address: string | null
          request_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          aksi: string
          correlation_id?: string | null
          created_at?: string
          data_sebelum?: Json | null
          data_sesudah?: Json | null
          entitas: string
          entitas_id?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          aksi?: string
          correlation_id?: string | null
          created_at?: string
          data_sebelum?: Json | null
          data_sesudah?: Json | null
          entitas?: string
          entitas_id?: string | null
          id?: string
          ip_address?: string | null
          request_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_snapshot: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          label: string
          size_bytes: number
          table_counts: Json
          tipe: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          label: string
          size_bytes?: number
          table_counts?: Json
          tipe?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          label?: string
          size_bytes?: number
          table_counts?: Json
          tipe?: string
        }
        Relationships: []
      }
      berita: {
        Row: {
          created_at: string
          gambar_url: string | null
          id: string
          isi: string
          judul: string
          penulis_id: string | null
          published_at: string | null
          ringkasan: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gambar_url?: string | null
          id?: string
          isi?: string
          judul: string
          penulis_id?: string | null
          published_at?: string | null
          ringkasan?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gambar_url?: string | null
          id?: string
          isi?: string
          judul?: string
          penulis_id?: string | null
          published_at?: string | null
          ringkasan?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cron_history: {
        Row: {
          affected_rows: number | null
          created_at: string
          detail: Json | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          request_id: string | null
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          affected_rows?: number | null
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          request_id?: string | null
          result?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          affected_rows?: number | null
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          request_id?: string | null
          result?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      data_terpadu_item: {
        Row: {
          aktif: boolean
          created_at: string
          format: string | null
          id: string
          ikon: string | null
          kategori: string
          label: string
          nilai_num: number | null
          nilai_num2: number | null
          nilai_teks: string | null
          opd: string | null
          satuan: string | null
          trend: string | null
          ukuran: string | null
          updated_at: string
          url: string | null
          urutan: number
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          format?: string | null
          id?: string
          ikon?: string | null
          kategori: string
          label: string
          nilai_num?: number | null
          nilai_num2?: number | null
          nilai_teks?: string | null
          opd?: string | null
          satuan?: string | null
          trend?: string | null
          ukuran?: string | null
          updated_at?: string
          url?: string | null
          urutan?: number
        }
        Update: {
          aktif?: boolean
          created_at?: string
          format?: string | null
          id?: string
          ikon?: string | null
          kategori?: string
          label?: string
          nilai_num?: number | null
          nilai_num2?: number | null
          nilai_teks?: string | null
          opd?: string | null
          satuan?: string | null
          trend?: string | null
          ukuran?: string | null
          updated_at?: string
          url?: string | null
          urutan?: number
        }
        Relationships: []
      }
      dataset_submission: {
        Row: {
          created_at: string
          data: Json
          id: string
          oleh_user_id: string
          opd_id: string | null
          status: string
          submitted_at: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          oleh_user_id: string
          opd_id?: string | null
          status?: string
          submitted_at?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          oleh_user_id?: string
          opd_id?: string | null
          status?: string
          submitted_at?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_submission_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dataset_template"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_template: {
        Row: {
          aktif: boolean
          allow_multiple_submit: boolean
          created_at: string
          created_by: string | null
          deadline: string | null
          deskripsi: string | null
          excel_layout: Json
          id: string
          judul: string
          kode: string | null
          kolom: Json
          opd_pemilik_id: string | null
          target_opd_ids: string[]
          target_role: string
          target_scope: string
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          allow_multiple_submit?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deskripsi?: string | null
          excel_layout?: Json
          id?: string
          judul: string
          kode?: string | null
          kolom?: Json
          opd_pemilik_id?: string | null
          target_opd_ids?: string[]
          target_role?: string
          target_scope?: string
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          allow_multiple_submit?: boolean
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deskripsi?: string | null
          excel_layout?: Json
          id?: string
          judul?: string
          kode?: string | null
          kolom?: Json
          opd_pemilik_id?: string | null
          target_opd_ids?: string[]
          target_role?: string
          target_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      dead_letter_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          job_name: string
          payload: Json
          replayed_to: string | null
          request_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_name: string
          payload?: Json
          replayed_to?: string | null
          request_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_name?: string
          payload?: Json
          replayed_to?: string | null
          request_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
        }
        Relationships: []
      }
      desa: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          kecamatan: string | null
          nama: string
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          kecamatan?: string | null
          nama: string
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          kecamatan?: string | null
          nama?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          due_at: string | null
          form_id: string
          id: string
          opd_id: string | null
          status: string
          updated_at: string
          user_id: string
          version_number: number
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          due_at?: string | null
          form_id: string
          id?: string
          opd_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version_number?: number
        }
        Update: {
          assigned_at?: string
          created_at?: string
          due_at?: string | null
          form_id?: string
          id?: string
          opd_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_assignments_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          created_at: string
          form_id: string
          help_text: string | null
          id: string
          kode: string
          label: string
          options: Json | null
          placeholder: string | null
          required: boolean
          tipe: string
          urutan: number
          validation: Json | null
        }
        Insert: {
          created_at?: string
          form_id: string
          help_text?: string | null
          id?: string
          kode: string
          label: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          tipe: string
          urutan?: number
          validation?: Json | null
        }
        Update: {
          created_at?: string
          form_id?: string
          help_text?: string | null
          id?: string
          kode?: string
          label?: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          tipe?: string
          urutan?: number
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submission_files: {
        Row: {
          cleanup_status: string
          created_at: string
          field_kode: string | null
          finalized_at: string | null
          id: string
          mime: string | null
          provider: string | null
          size_bytes: number
          storage_path: string
          submission_id: string | null
          upload_started_at: string
          uploaded_by: string | null
        }
        Insert: {
          cleanup_status?: string
          created_at?: string
          field_kode?: string | null
          finalized_at?: string | null
          id?: string
          mime?: string | null
          provider?: string | null
          size_bytes?: number
          storage_path: string
          submission_id?: string | null
          upload_started_at?: string
          uploaded_by?: string | null
        }
        Update: {
          cleanup_status?: string
          created_at?: string
          field_kode?: string | null
          finalized_at?: string | null
          id?: string
          mime?: string | null
          provider?: string | null
          size_bytes?: number
          storage_path?: string
          submission_id?: string | null
          upload_started_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submission_versions: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          files: Json | null
          id: string
          submission_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          files?: Json | null
          id?: string
          submission_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          files?: Json | null
          id?: string
          submission_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_versions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          assignment_id: string | null
          created_at: string
          data: Json
          form_id: string
          id: string
          opd_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version_snapshot: Json | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          version_number: number
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          form_id: string
          id?: string
          opd_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version_snapshot?: Json | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          version_number?: number
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          data?: Json
          form_id?: string
          id?: string
          opd_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version_snapshot?: Json | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "form_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_targets: {
        Row: {
          created_at: string
          form_id: string
          id: string
          target_type: string
          target_value: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          target_type: string
          target_value: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          target_type?: string
          target_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_targets_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          allow_multiple_submit: boolean
          archived_at: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          deskripsi: string | null
          id: string
          judul: string
          opd_pemilik_id: string | null
          published_at: string | null
          published_by: string | null
          schema_snapshot: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          allow_multiple_submit?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deskripsi?: string | null
          id?: string
          judul: string
          opd_pemilik_id?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          allow_multiple_submit?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deskripsi?: string | null
          id?: string
          judul?: string
          opd_pemilik_id?: string | null
          published_at?: string | null
          published_by?: string | null
          schema_snapshot?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          job_type: string
          max_attempts: number
          payload: Json
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          max_attempts?: number
          payload?: Json
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          max_attempts?: number
          payload?: Json
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: []
      }
      kantor_qr: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          lokasi: string | null
          opd_id: string
          radius_m: number
          token: string
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          lokasi?: string | null
          opd_id: string
          radius_m?: number
          token: string
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          lokasi?: string | null
          opd_id?: string
          radius_m?: number
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kantor_qr_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: true
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      kategori_layanan: {
        Row: {
          aktif: boolean
          created_at: string
          deskripsi: string | null
          id: string
          nama: string
          sla_hari: number
          slug: string
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          deskripsi?: string | null
          id?: string
          nama: string
          sla_hari?: number
          slug: string
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          deskripsi?: string | null
          id?: string
          nama?: string
          sla_hari?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      laporan_masyarakat: {
        Row: {
          created_at: string
          ditangani_oleh: string | null
          email: string
          id: string
          kategori: string
          lokasi: string | null
          nama: string
          nik: string | null
          no_hp: string | null
          opd_id: string | null
          status: string
          tindak_lanjut: string | null
          updated_at: string
          uraian: string
        }
        Insert: {
          created_at?: string
          ditangani_oleh?: string | null
          email: string
          id?: string
          kategori: string
          lokasi?: string | null
          nama: string
          nik?: string | null
          no_hp?: string | null
          opd_id?: string | null
          status?: string
          tindak_lanjut?: string | null
          updated_at?: string
          uraian: string
        }
        Update: {
          created_at?: string
          ditangani_oleh?: string | null
          email?: string
          id?: string
          kategori?: string
          lokasi?: string | null
          nama?: string
          nik?: string | null
          no_hp?: string | null
          opd_id?: string | null
          status?: string
          tindak_lanjut?: string | null
          updated_at?: string
          uraian?: string
        }
        Relationships: [
          {
            foreignKeyName: "laporan_masyarakat_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      layanan_publik: {
        Row: {
          aktif: boolean
          alur: string | null
          created_at: string
          deskripsi: string | null
          id: string
          ikon: string | null
          judul: string
          opd_id: string | null
          persyaratan: string | null
          sla_hari: number
          slug: string
          updated_at: string
          urutan: number
        }
        Insert: {
          aktif?: boolean
          alur?: string | null
          created_at?: string
          deskripsi?: string | null
          id?: string
          ikon?: string | null
          judul: string
          opd_id?: string | null
          persyaratan?: string | null
          sla_hari?: number
          slug: string
          updated_at?: string
          urutan?: number
        }
        Update: {
          aktif?: boolean
          alur?: string | null
          created_at?: string
          deskripsi?: string | null
          id?: string
          ikon?: string | null
          judul?: string
          opd_id?: string | null
          persyaratan?: string | null
          sla_hari?: number
          slug?: string
          updated_at?: string
          urutan?: number
        }
        Relationships: [
          {
            foreignKeyName: "layanan_publik_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          judul: string
          link: string | null
          meta: Json | null
          read_at: string | null
          tipe: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          judul: string
          link?: string | null
          meta?: Json | null
          read_at?: string | null
          tipe: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          judul?: string
          link?: string | null
          meta?: Json | null
          read_at?: string | null
          tipe?: string
          user_id?: string
        }
        Relationships: []
      }
      opd: {
        Row: {
          created_at: string
          id: string
          kategori: string[]
          nama: string
          singkatan: string
        }
        Insert: {
          created_at?: string
          id?: string
          kategori?: string[]
          nama: string
          singkatan: string
        }
        Update: {
          created_at?: string
          id?: string
          kategori?: string[]
          nama?: string
          singkatan?: string
        }
        Relationships: []
      }
      pejabat: {
        Row: {
          aktif: boolean
          created_at: string
          foto_url: string | null
          id: string
          is_pimpinan: boolean
          jabatan: string
          nama: string
          updated_at: string
          urutan: number
          user_id: string | null
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          foto_url?: string | null
          id?: string
          is_pimpinan?: boolean
          jabatan: string
          nama: string
          updated_at?: string
          urutan?: number
          user_id?: string | null
        }
        Update: {
          aktif?: boolean
          created_at?: string
          foto_url?: string | null
          id?: string
          is_pimpinan?: boolean
          jabatan?: string
          nama?: string
          updated_at?: string
          urutan?: number
          user_id?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          kategori: string | null
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          kategori?: string | null
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          kategori?: string | null
          label?: string
        }
        Relationships: []
      }
      permohonan: {
        Row: {
          atas_nama_hp: string | null
          atas_nama_nama: string | null
          atas_nama_nik: string | null
          deskripsi: string | null
          id: string
          judul: string
          kategori: string
          kode: string
          opd_id: string
          pemohon_id: string
          petugas_id: string | null
          prioritas: string
          ringkasan: string | null
          status: Database["public"]["Enums"]["status_permohonan"]
          tanggal_masuk: string
          tenggat: string | null
          untuk_orang_lain: boolean
          updated_at: string
          wakil_ambil_nama: string | null
          wakil_ambil_nik: string | null
        }
        Insert: {
          atas_nama_hp?: string | null
          atas_nama_nama?: string | null
          atas_nama_nik?: string | null
          deskripsi?: string | null
          id?: string
          judul: string
          kategori: string
          kode: string
          opd_id: string
          pemohon_id: string
          petugas_id?: string | null
          prioritas?: string
          ringkasan?: string | null
          status?: Database["public"]["Enums"]["status_permohonan"]
          tanggal_masuk?: string
          tenggat?: string | null
          untuk_orang_lain?: boolean
          updated_at?: string
          wakil_ambil_nama?: string | null
          wakil_ambil_nik?: string | null
        }
        Update: {
          atas_nama_hp?: string | null
          atas_nama_nama?: string | null
          atas_nama_nik?: string | null
          deskripsi?: string | null
          id?: string
          judul?: string
          kategori?: string
          kode?: string
          opd_id?: string
          pemohon_id?: string
          petugas_id?: string | null
          prioritas?: string
          ringkasan?: string | null
          status?: Database["public"]["Enums"]["status_permohonan"]
          tanggal_masuk?: string
          tenggat?: string | null
          untuk_orang_lain?: boolean
          updated_at?: string
          wakil_ambil_nama?: string | null
          wakil_ambil_nik?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permohonan_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      permohonan_rating: {
        Row: {
          created_at: string
          id: string
          komentar: string | null
          permohonan_id: string
          skor: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          komentar?: string | null
          permohonan_id: string
          skor: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          komentar?: string | null
          permohonan_id?: string
          skor?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permohonan_rating_permohonan_id_fkey"
            columns: ["permohonan_id"]
            isOneToOne: false
            referencedRelation: "permohonan"
            referencedColumns: ["id"]
          },
        ]
      }
      permohonan_riwayat: {
        Row: {
          aksi: string
          catatan: string | null
          created_at: string
          id: string
          oleh: string | null
          permohonan_id: string
        }
        Insert: {
          aksi: string
          catatan?: string | null
          created_at?: string
          id?: string
          oleh?: string | null
          permohonan_id: string
        }
        Update: {
          aksi?: string
          catatan?: string | null
          created_at?: string
          id?: string
          oleh?: string | null
          permohonan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permohonan_riwayat_permohonan_id_fkey"
            columns: ["permohonan_id"]
            isOneToOne: false
            referencedRelation: "permohonan"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          asn_type: string | null
          created_at: string
          desa: string | null
          id: string
          jabatan: string | null
          nama_lengkap: string
          nik: string | null
          nip: string | null
          no_hp: string | null
          opd_id: string | null
          status: string
          system_position: string | null
          updated_at: string
          username: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          asn_type?: string | null
          created_at?: string
          desa?: string | null
          id: string
          jabatan?: string | null
          nama_lengkap?: string
          nik?: string | null
          nip?: string | null
          no_hp?: string | null
          opd_id?: string | null
          status?: string
          system_position?: string | null
          updated_at?: string
          username?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          asn_type?: string | null
          created_at?: string
          desa?: string | null
          id?: string
          jabatan?: string | null
          nama_lengkap?: string
          nik?: string | null
          nip?: string | null
          no_hp?: string | null
          opd_id?: string | null
          status?: string
          system_position?: string | null
          updated_at?: string
          username?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_opd_id_fkey"
            columns: ["opd_id"]
            isOneToOne: false
            referencedRelation: "opd"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscription: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit: {
        Row: {
          bucket: string
          count: number
          id: string
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          id?: string
          identifier: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          id?: string
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          count: number
          id: string
          identifier: string
          last_hit_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          id?: string
          identifier: string
          last_hit_at?: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          id?: string
          identifier?: string
          last_hit_at?: string
          window_start?: string
        }
        Relationships: []
      }
      rbac_audit: {
        Row: {
          aksi: string
          created_at: string
          data_sebelum: Json | null
          data_sesudah: Json | null
          entitas: string | null
          id: string
          target_user_id: string | null
          user_id: string | null
        }
        Insert: {
          aksi: string
          created_at?: string
          data_sebelum?: Json | null
          data_sesudah?: Json | null
          entitas?: string | null
          id?: string
          target_user_id?: string | null
          user_id?: string | null
        }
        Update: {
          aksi?: string
          created_at?: string
          data_sebelum?: Json | null
          data_sesudah?: Json | null
          entitas?: string | null
          id?: string
          target_user_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      retention_policies: {
        Row: {
          enabled: boolean
          entity: string
          last_deleted_count: number | null
          last_run_at: string | null
          retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          entity: string
          last_deleted_count?: number | null
          last_run_at?: string | null
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          entity?: string
          last_deleted_count?: number | null
          last_run_at?: string | null
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      retry_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          job_name: string
          last_attempt_at: string | null
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          request_id: string | null
          status: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          job_name: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          request_id?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          job_name?: string
          last_attempt_at?: string | null
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          request_id?: string | null
          status?: string
        }
        Relationships: []
      }
      shift: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          jam_mulai: string
          jam_selesai: string
          kode: string
          nama: string
          updated_at: string
          warna: string | null
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          jam_mulai: string
          jam_selesai: string
          kode: string
          nama: string
          updated_at?: string
          warna?: string | null
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          jam_mulai?: string
          jam_selesai?: string
          kode?: string
          nama?: string
          updated_at?: string
          warna?: string | null
        }
        Relationships: []
      }
      shift_assignment: {
        Row: {
          created_at: string
          id: string
          shift_id: string
          tanggal: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shift_id: string
          tanggal: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shift_id?: string
          tanggal?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignment_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shift"
            referencedColumns: ["id"]
          },
        ]
      }
      uat_results: {
        Row: {
          catatan: string | null
          id: string
          run_at: string
          run_by: string | null
          scenario_id: string
          status: string
        }
        Insert: {
          catatan?: string | null
          id?: string
          run_at?: string
          run_by?: string | null
          scenario_id: string
          status: string
        }
        Update: {
          catatan?: string | null
          id?: string
          run_at?: string
          run_by?: string | null
          scenario_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "uat_results_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "uat_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      uat_scenarios: {
        Row: {
          code: string | null
          created_at: string
          enabled: boolean
          expected: string | null
          id: string
          judul: string
          langkah: string | null
          modul: string
          role: string
          urutan: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          enabled?: boolean
          expected?: string | null
          id?: string
          judul: string
          langkah?: string | null
          modul: string
          role: string
          urutan?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          enabled?: boolean
          expected?: string | null
          id?: string
          judul?: string
          langkah?: string | null
          modul?: string
          role?: string
          urutan?: number
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          expires_at: string | null
          granted: boolean
          granted_by: string | null
          id: string
          permission_code: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_code: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          id?: string
          permission_code?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_token: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          used_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          token: string
          used_at?: string | null
          used_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      work_schedule: {
        Row: {
          aktif: boolean
          created_at: string
          hari_kerja: number[]
          id: string
          jam_masuk: string
          jam_pulang: string
          nama: string
          opd_id: string | null
          toleransi_menit: number
          updated_at: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          hari_kerja?: number[]
          id?: string
          jam_masuk?: string
          jam_pulang?: string
          nama: string
          opd_id?: string | null
          toleransi_menit?: number
          updated_at?: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          hari_kerja?: number[]
          id?: string
          jam_masuk?: string
          jam_pulang?: string
          nama?: string
          opd_id?: string | null
          toleransi_menit?: number
          updated_at?: string
        }
        Relationships: []
      }
      work_schedule_assignment: {
        Row: {
          berlaku_dari: string
          berlaku_sampai: string | null
          created_at: string
          id: string
          schedule_id: string
          user_id: string
        }
        Insert: {
          berlaku_dari?: string
          berlaku_sampai?: string | null
          created_at?: string
          id?: string
          schedule_id: string
          user_id: string
        }
        Update: {
          berlaku_dari?: string
          berlaku_sampai?: string | null
          created_at?: string
          id?: string
          schedule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedule_assignment_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aset_compliance: { Args: { _opd_id: string }; Returns: Json }
      attendance_compliance: {
        Args: { _from: string; _to: string; _user_id: string }
        Returns: Json
      }
      count_permohonan_bulan_ini: { Args: never; Returns: number }
      get_effective_permissions: {
        Args: { _user_id: string }
        Returns: {
          permission_code: string
        }[]
      }
      get_user_desa: { Args: { _user_id: string }; Returns: string }
      get_user_opd: { Args: { _user_id: string }; Returns: string }
      governance_summary: { Args: never; Returns: Json }
      has_permission: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      opd_attendance_today: { Args: { _opd_id: string }; Returns: Json }
      opd_kinerja_agg: {
        Args: never
        Returns: {
          jumlah_selesai: number
          opd_id: string
          selesai_dengan_sla: number
          status: string
          tepat_waktu: number
          total: number
          total_hari_selesai: number
        }[]
      }
      opd_rating_agg: {
        Args: never
        Returns: {
          jumlah_rating: number
          opd_id: string
          total_rating: number
        }[]
      }
      production_health_score: { Args: never; Returns: Json }
      rate_limit_increment: {
        Args: { _scope: string; _subject: string; _window_start: string }
        Returns: number
      }
      rating_list_admin: {
        Args: never
        Returns: {
          created_at: string
          komentar: string
          opd_id: string
          opd_nama: string
          opd_singkatan: string
          pemohon_nama: string
          permohonan_id: string
          permohonan_judul: string
          permohonan_kode: string
          rating_id: string
          skor: number
          user_id: string
        }[]
      }
      riwayat_dengan_petugas: {
        Args: { _permohonan_id: string }
        Returns: {
          aksi: string
          catatan: string
          created_at: string
          email_petugas: string
          id: string
          nama_petugas: string
          oleh: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "warga"
        | "admin_opd"
        | "super_admin"
        | "admin_desa"
        | "asn"
        | "admin_pemda"
      job_status: "pending" | "running" | "success" | "failed" | "dead"
      status_permohonan: "baru" | "diproses" | "selesai" | "ditolak"
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
      app_role: [
        "warga",
        "admin_opd",
        "super_admin",
        "admin_desa",
        "asn",
        "admin_pemda",
      ],
      job_status: ["pending", "running", "success", "failed", "dead"],
      status_permohonan: ["baru", "diproses", "selesai", "ditolak"],
    },
  },
} as const
