// src/actions/giphy.action.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { GiphyService } from "../services/giphy.service";

// ============================================
// SEARCH GIFS
// ============================================
export async function searchGifs(
  query: string,
  limit: number = 25,
  offset: number = 0,
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await GiphyService.searchGifs(query, limit, offset, rating);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error searching GIFs:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to search GIFs",
    };
  }
}

// ============================================
// SEARCH STICKERS
// ============================================
export async function searchStickers(
  query: string,
  limit: number = 25,
  offset: number = 0,
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await GiphyService.searchStickers(
      query,
      limit,
      offset,
      rating
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error searching Stickers:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to search Stickers",
    };
  }
}

// ============================================
// GET TRENDING GIFS
// ============================================
export async function getTrendingGifs(
  limit: number = 25,
  offset: number = 0,
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await GiphyService.getTrendingGifs(limit, offset, rating);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error getting trending GIFs:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get trending GIFs",
    };
  }
}

// ============================================
// GET TRENDING STICKERS
// ============================================
export async function getTrendingStickers(
  limit: number = 25,
  offset: number = 0,
  rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await GiphyService.getTrendingStickers(
      limit,
      offset,
      rating
    );

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error getting trending Stickers:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get trending Stickers",
    };
  }
}

// ============================================
// GET GIPHY ITEM BY ID
// ============================================
export async function getGiphyById(id: string) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const result = await GiphyService.getById(id);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error getting Giphy item:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get Giphy item",
    };
  }
}
