// src/app/api/ai/health/route.ts
import { NextResponse } from "next/server";
import { ollamaService } from "@/lib/services/ollama.service";

export async function GET() {
  const isHealthy = await ollamaService.healthCheck();
  
  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unavailable',
    service: 'Ollama',
    model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    timestamp: new Date().toISOString()
  });
}