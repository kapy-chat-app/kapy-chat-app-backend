// src/app/api/games/[slug]/play/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { crazyGamesService } from '@/lib/services/crazy-games.service';
import { ApiResponse } from '@/dtos/games.dto';

interface PlayGameData {
  slug: string;
  title: string;
  embedUrl: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const body = await req.json();
    const { userId } = body;

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

    // Track game play
    crazyGamesService.trackGamePlay(slug, userId);

    const response: ApiResponse<PlayGameData> = {
      success: true,
      data: {
        slug: game.slug,
        title: game.title,
        embedUrl: game.embedUrl,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error - Play Game:', error);
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to load game',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}