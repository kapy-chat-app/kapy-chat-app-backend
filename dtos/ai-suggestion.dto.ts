export interface AISuggestionRes {
  id: string;
  suggestion_type: string;
  title: string;
  content: string;
  priority: string;
  based_on_emotions: string[];
  suggested_actions: {
    action_type: string;
    content: string;
    duration?: number;
    media?: {
      id: string;
      url: string;
      file_name: string;
    };
  }[];
  is_read: boolean;
  expires_at?: Date;
  created_at: Date;
}
