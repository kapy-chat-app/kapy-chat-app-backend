import { NextResponse } from "next/server";

export async function GET() {
  const io = (global as any).io;
  
  return NextResponse.json({
    socketAvailable: !!io,
    typeofSocket: typeof io,
    hasEmit: typeof io?.emit === 'function',
    timestamp: new Date()
  });
}