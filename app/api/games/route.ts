import { NextRequest, NextResponse } from 'next/server';
import { crazyGamesService } from '@/lib/services/crazy-games.service';
import { ApiResponse, FormattedGame } from '@/dtos/games.dto';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const sort = searchParams.get('sort') as 'title' | 'rating' | 'popular' | undefined;

    const games = crazyGamesService.getGames({
      category,
      search,
      sort,
    });

    const response: ApiResponse<FormattedGame[]> = {
      success: true,
      data: games,
      total: games.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error - Get Games:', error);
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch games',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}