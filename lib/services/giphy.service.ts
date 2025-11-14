/* eslint-disable @typescript-eslint/no-explicit-any */
// src/services/giphy.service.ts
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || "";
const GIPHY_BASE_URL = "https://api.giphy.com/v1";

export class GiphyService {
  /**
   * Search GIFs from Giphy
   */
  static async searchGifs(
    query: string,
    limit: number = 25,
    offset: number = 0,
    rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
  ) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/gifs/search`);
      url.searchParams.append("api_key", GIPHY_API_KEY);
      url.searchParams.append("q", query);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      url.searchParams.append("rating", rating);
      url.searchParams.append("lang", "en");

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformGiphyResponse(data);
    } catch (error) {
      console.error("Error searching Giphy GIFs:", error);
      throw error;
    }
  }

  /**
   * Search Stickers from Giphy
   */
  static async searchStickers(
    query: string,
    limit: number = 25,
    offset: number = 0,
    rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
  ) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/stickers/search`);
      url.searchParams.append("api_key", GIPHY_API_KEY);
      url.searchParams.append("q", query);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      url.searchParams.append("rating", rating);
      url.searchParams.append("lang", "en");

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformGiphyResponse(data);
    } catch (error) {
      console.error("Error searching Giphy Stickers:", error);
      throw error;
    }
  }

  /**
   * Get trending GIFs
   */
  static async getTrendingGifs(
    limit: number = 25,
    offset: number = 0,
    rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
  ) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/gifs/trending`);
      url.searchParams.append("api_key", GIPHY_API_KEY);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      url.searchParams.append("rating", rating);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformGiphyResponse(data);
    } catch (error) {
      console.error("Error getting trending GIFs:", error);
      throw error;
    }
  }

  /**
   * Get trending Stickers
   */
  static async getTrendingStickers(
    limit: number = 25,
    offset: number = 0,
    rating: "g" | "pg" | "pg-13" | "r" = "pg-13"
  ) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/stickers/trending`);
      url.searchParams.append("api_key", GIPHY_API_KEY);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      url.searchParams.append("rating", rating);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformGiphyResponse(data);
    } catch (error) {
      console.error("Error getting trending Stickers:", error);
      throw error;
    }
  }

  /**
   * Get GIF/Sticker by ID
   */
  static async getById(id: string) {
    try {
      const url = new URL(`${GIPHY_BASE_URL}/gifs/${id}`);
      url.searchParams.append("api_key", GIPHY_API_KEY);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Giphy API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformGiphyItem(data.data);
    } catch (error) {
      console.error("Error getting Giphy item by ID:", error);
      throw error;
    }
  }

  /**
   * Transform Giphy API response
   */
  private static transformGiphyResponse(data: any) {
    return {
      items: data.data.map((item: any) => this.transformGiphyItem(item)),
      pagination: {
        total_count: data.pagination.total_count,
        count: data.pagination.count,
        offset: data.pagination.offset,
      },
    };
  }

  /**
   * Transform single Giphy item
   */
  private static transformGiphyItem(item: any) {
    return {
      id: item.id,
      url: item.url,
      title: item.title,
      rating: item.rating,
      images: {
        original: {
          url: item.images.original.url,
          width: parseInt(item.images.original.width),
          height: parseInt(item.images.original.height),
          size: parseInt(item.images.original.size || "0"),
        },
        preview_gif: item.images.preview_gif
          ? {
              url: item.images.preview_gif.url,
              width: parseInt(item.images.preview_gif.width),
              height: parseInt(item.images.preview_gif.height),
            }
          : undefined,
        fixed_width: item.images.fixed_width
          ? {
              url: item.images.fixed_width.url,
              width: parseInt(item.images.fixed_width.width),
              height: parseInt(item.images.fixed_width.height),
            }
          : undefined,
        fixed_height: item.images.fixed_height
          ? {
              url: item.images.fixed_height.url,
              width: parseInt(item.images.fixed_height.width),
              height: parseInt(item.images.fixed_height.height),
            }
          : undefined,
        downsized: item.images.downsized
          ? {
              url: item.images.downsized.url,
              width: parseInt(item.images.downsized.width || "0"),
              height: parseInt(item.images.downsized.height || "0"),
              size: parseInt(item.images.downsized.size || "0"),
            }
          : undefined,
      },
      tags: item.tags || [],
    };
  }

  /**
   * Convert Giphy item to RichMediaDTO
   */
  static giphyItemToRichMedia(giphyItem: any, type: "gif" | "sticker") {
    return {
      provider: "giphy",
      provider_id: giphyItem.id,
      url: giphyItem.url,
      media_url: giphyItem.images.original.url,
      preview_url: 
        giphyItem.images.preview_gif?.url || 
        giphyItem.images.fixed_width?.url || 
        giphyItem.images.downsized?.url,
      width: giphyItem.images.original.width,
      height: giphyItem.images.original.height,
      size: giphyItem.images.original.size,
      title: giphyItem.title,
      rating: giphyItem.rating,
      tags: giphyItem.tags,
      source_url: giphyItem.url,
    };
  }
}