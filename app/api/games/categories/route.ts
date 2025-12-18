// src/app/api/games/categories/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { crazyGamesService } from '@/lib/services/crazy-games.service';
import { ApiResponse } from '@/dtos/games.dto';

export async function GET(req: NextRequest) {
  try {
    const categories = crazyGamesService.getCategories();

    const response: ApiResponse<string[]> = {
      success: true,
      data: categories,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('API Error - Get Categories:', error);
    
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch categories',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}