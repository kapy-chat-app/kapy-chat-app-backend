export interface FileRes {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  url: string;
  created_at: Date;
  
  // ✨ NEW: E2EE fields (optional)
  is_encrypted?: boolean;
  encryption_metadata?: {
    iv: string;
    auth_tag: string;
    original_size: number;
    encrypted_size: number;
  };
}