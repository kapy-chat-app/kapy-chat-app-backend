// backend/lib/services/crazyGamesService.ts

import { CRAZY_GAMES } from '@/lib/data/crazy-games';
import { FormattedGame, FilterOptions } from '@/dtos/games.dto';

class CrazyGamesService {
  /**
   * Get all games với filters
   */
  getGames(options: FilterOptions = {}): FormattedGame[] {
    let games = [...CRAZY_GAMES];

    // Filter by category
    if (options.category && options.category !== 'all') {
      games = games.filter(g => 
        g.category.toLowerCase() === options.category!.toLowerCase()
      );
    }

    // Search by title or description
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      games = games.filter(g => 
        g.title.toLowerCase().includes(searchLower) ||
        g.description.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    if (options.sort === 'title') {
      games.sort((a, b) => a.title.localeCompare(b.title));
    } else if (options.sort === 'rating') {
      games.sort((a, b) => b.rating - a.rating);
    } else if (options.sort === 'popular') {
      games.sort((a, b) => b.plays - a.plays);
    }

    return games.map(game => this.formatGame(game));
  }

  /**
   * Get game by slug
   */
  getGameBySlug(slug: string): FormattedGame | null {
    const game = CRAZY_GAMES.find(g => g.slug === slug);
    if (!game) return null;
    return this.formatGame(game);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = [...new Set(CRAZY_GAMES.map(g => g.category))];
    return categories.sort();
  }

  /**
   * Get featured/popular games
   */
  getFeaturedGames(limit: number = 10): FormattedGame[] {
    const games = [...CRAZY_GAMES]
      .sort((a, b) => b.plays - a.plays)
      .slice(0, limit);

    return games.map(game => this.formatGame(game));
  }

  /**
   * Format game object
   */
  private formatGame(game: typeof CRAZY_GAMES[0]): FormattedGame {
    return {
      ...game,
      id: game.slug,
      embedUrl: this.getGameEmbedUrl(game.gameId, game.slug),
      gameUrl: this.getGamePageUrl(game.slug),
    };
  }

  /**
   * ✅ Get GameDistribution embed URL
   * Format: https://html5.gamedistribution.com/GAME_ID/?gd_sdk_referrer_url=https://gamedistribution.com/games/SLUG
   */
  private getGameEmbedUrl(gameId: string, slug: string): string {
    const referrerUrl = encodeURIComponent(`https://gamedistribution.com/games/${slug}`);
    return `https://html5.gamedistribution.com/${gameId}/?gd_sdk_referrer_url=${referrerUrl}`;
  }

  /**
   * ✅ Get GameDistribution game page URL
   */
  private getGamePageUrl(slug: string): string {
    return `https://gamedistribution.com/games/${slug}`;
  }

  /**
   * Track game play (có thể lưu vào database)
   */
  trackGamePlay(slug: string, userId?: string): void {
    console.log(`[Game Play] User: ${userId || 'guest'} - Game: ${slug}`);
    // TODO: Implement database tracking if needed
  }
}

export const crazyGamesService = new CrazyGamesService();