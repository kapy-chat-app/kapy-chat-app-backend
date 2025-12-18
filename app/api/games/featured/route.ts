// src/app/api/games/featured/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { crazyGamesService } from '@/lib/services/crazy-games.service';
import { ApiResponse, FormattedGame } from '@/dtos/games.dto';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const games = crazyGamesService.getFeaturedGames(limit);

    const response: ApiResponse<FormattedGame[]> = {
      success: true,
      data: games,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error - Get Featured Games:', error);
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch featured games',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}