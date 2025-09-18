// app/api/chat/route.ts
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  // Logic xử lý chat
  return Response.json({ messages: [] })
}