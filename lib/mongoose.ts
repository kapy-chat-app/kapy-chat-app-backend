// lib/mongoose.ts
import mongoose from "mongoose";

declare global {
  var __mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

let cached = global.__mongoose;
if (!cached) {
  cached = global.__mongoose = { conn: null, promise: null };
}

export async function connectToDatabase() {
  // 👉 ĐỌC ENV NGAY TRONG HÀM (sau khi dotenv đã load)
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error("DATABASE_URL IS MISSING!");
  }

  if (cached!.conn) return cached!.conn;

  if (!cached!.promise) {
    mongoose.set("strictQuery", true);
    cached!.promise = mongoose.connect(uri, {
      dbName: "sec-shop",
    });
  }

  cached!.conn = await cached!.promise;
  return cached!.conn;
}
