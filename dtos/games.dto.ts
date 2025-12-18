// backend/dtos/games.dto.ts

export interface Game {
  slug: string;
  gameId: string; 
  title: string;
  description: string;
  thumbnail: string;
  category: string;
  rating: number;
  plays: number;
}

export interface FormattedGame extends Game {
  id: string;
  embedUrl: string; // https://html5.gamedistribution.com/GAME_ID/?gd_sdk_referrer_url=...
  gameUrl: string;  // https://gamedistribution.com/games/SLUG
}

export interface FilterOptions {
  category?: string;
  search?: string;
  sort?: 'title' | 'rating' | 'popular';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}