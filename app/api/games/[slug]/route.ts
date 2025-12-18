// src/app/api/games/[slug]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { crazyGamesService } from '@/lib/services/crazy-games.service';
import { ApiResponse, FormattedGame } from '@/dtos/games.dto';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: 'Game slug is required',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const game = crazyGamesService.getGameBySlug(slug);

    if (!game) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: 'Game not found',
      };
      return NextResponse.json(errorResponse, { status: 404 });
    }

    const response: ApiResponse<FormattedGame> = {
      success: true,
      data: game,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error - Get Game:', error);
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch game',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}