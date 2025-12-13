// src/app/api/ai/health/route.ts
import { geminiService } from "@/lib/services/germini.service";
import { NextResponse } from "next/server";

export async function GET() {
  const isHealthy = await geminiService.healthCheck();
  
  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unavailable',
    service: 'Gemini',
    model: process.env.GEMINI_MODEL || 'gemini-pro',
    timestamp: new Date().toISOString()
  });
}