export interface MoodEntryRes {
  id: string;
  mood_score: number;
  mood_tags: string[];
  note?: string;
  activities: string[];
  weather?: string;
  sleep_hours?: number;
  energy_level: number;
  social_interaction_level: number;
  work_stress_level: number;
  context_photo?: {
    id: string;
    url: string;
  };
  location?: {
    coordinates: [number, number];
    address?: string;
  };
  created_at: Date;
}

export interface MoodEntryCreateReq {
  mood_score: number;
  mood_tags?: string[];
  note?: string;
  activities?: string[];
  weather?: string;
  sleep_hours?: number;
  energy_level: number;
  social_interaction_level: number;
  work_stress_level: number;
  context_photo_id?: string;
  location?: {
    coordinates: [number, number];
    address?: string;
  };
}