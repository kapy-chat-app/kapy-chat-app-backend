/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/analyze-emotion/route.ts - WITH GEMINI AI ADVICE
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import Call from "@/database/call.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitToCallRoom } from "@/lib/socket.helper";
import * as faceapi from "face-api.js";
import * as canvas from "canvas";
import Groq from "groq-sdk";
import {
  shouldSendAdvice,
  generateEmotionAdvice,
} from "@/lib/actions/emotion-counselor.action";

// ⭐ Setup face-api.js with canvas
const { Canvas, Image, ImageData } = canvas;
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

async function loadFaceAPIModels() {
  if (modelsLoaded) return;

  try {
    console.log("📦 Loading face-api.js models...");
    await faceapi.nets.tinyFaceDetector.loadFromDisk("./public/models");
    await faceapi.nets.faceExpressionNet.loadFromDisk("./public/models");
    modelsLoaded = true;
    console.log("✅ face-api.js models loaded");
  } catch (error) {
    console.error("❌ Failed to load face-api.js models:", error);
    throw new Error("Face detection models not available");
  }
}

// ⭐ Emotion history tracking per user in memory
const userEmotionHistory = new Map<
  string,
  {
    emotions: string[];
    lastAdviceTime: Date | null;
  }
>();

/**
 * ⭐ Real-time emotion analysis endpoint WITH AI ADVICE
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    await loadFaceAPIModels();

    const formData = await req.formData();

    console.log("📋 Received FormData:");
    for (const [key, value] of formData.entries()) {
      if (value instanceof Blob) {
        console.log(
          `  ${key}: Blob (${value.size} bytes, type: ${value.type})`
        );
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }

    const callId = formData.get("callId") as string;
    const timestamp = formData.get("timestamp") as string;
    const videoBlob = formData.get("video") as Blob | null;
    const audioBlob = formData.get("audio") as Blob | null;

    if (!callId) {
      return NextResponse.json({ error: "Missing callId" }, { status: 400 });
    }

    const call = await Call.findById(callId).populate({
      path: "conversation",
      populate: {
        path: "participants",
        select: "clerkId username avatar",
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isParticipant = call.participants.some(
      (p: any) => p.user.toString() === mongoUser._id.toString()
    );

    if (!isParticipant) {
      return NextResponse.json(
        { error: "Not a call participant" },
        { status: 403 }
      );
    }

    let emotionResult: any = null;

    // ⭐ ANALYZE with face-api.js + Groq Whisper
    if (videoBlob && audioBlob) {
      console.log("🎭 Analyzing both video and audio...");
      const [faceResult, voiceResult] = await Promise.all([
        analyzeVideoWithFaceAPI(videoBlob),
        analyzeAudioWithGroq(audioBlob),
      ]);
      emotionResult = combineEmotions(faceResult, voiceResult);
    } else if (videoBlob) {
      console.log("🎭 Analyzing video only...");
      emotionResult = await analyzeVideoWithFaceAPI(videoBlob);
    } else if (audioBlob) {
      console.log("🎭 Analyzing audio only...");
      emotionResult = await analyzeAudioWithGroq(audioBlob);
    } else {
      return NextResponse.json(
        { error: "No media data provided" },
        { status: 400 }
      );
    }

    if (!emotionResult) {
      return NextResponse.json(
        { error: "Emotion analysis failed" },
        { status: 500 }
      );
    }

    // Save emotion analysis
    const emotionAnalysis = await EmotionAnalysis.create({
      user: mongoUser._id,
      conversation: call.conversation._id,
      emotion_scores: emotionResult.emotionScores,
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.confidence,
      context: "call",
      metadata: {
        analyzed_on: "server",
        analyzed_at: new Date(timestamp),
        analysis_method: emotionResult.method || "face-api.js + groq-whisper",
        transcription: emotionResult.transcription,
      },
    });

    console.log("✅ Emotion saved:", emotionAnalysis._id);

    // ⭐⭐⭐ GENERATE AI ADVICE USING GEMINI ⭐⭐⭐
    let aiAdvice = "";
    const userKey = `${userId}_${callId}`;

    // Get or create emotion history for this user
    if (!userEmotionHistory.has(userKey)) {
      userEmotionHistory.set(userKey, {
        emotions: [],
        lastAdviceTime: null,
      });
    }

    const history = userEmotionHistory.get(userKey)!;

    // Update emotion history (keep last 5)
    history.emotions.push(emotionResult.emotion);
    if (history.emotions.length > 5) {
      history.emotions.shift();
    }

    // Check if we should send advice (rate limit: every 30s)
    if (shouldSendAdvice(history.lastAdviceTime, 30)) {
      const callDurationSeconds = call.startedAt
        ? Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000)
        : 0;

      const conversation = call.conversation as any;
      const isPrivateCall = conversation?.type === "private";

      try {
        console.log("🤖 [Gemini] Generating emotion advice...");

        aiAdvice = await generateEmotionAdvice({
          currentEmotion: emotionResult.emotion,
          confidence: emotionResult.confidence,
          recentEmotions: history.emotions,
          callDuration: callDurationSeconds,
          isPrivateCall,
          transcription: emotionResult.transcription,
        });

        if (aiAdvice) {
          history.lastAdviceTime = new Date();
          console.log(
            `✅ [Gemini] AI advice generated for ${userId}: "${aiAdvice}"`
          );
        }
      } catch (adviceError) {
        console.error("⚠️ Failed to generate advice:", adviceError);
        // Continue without advice
      }
    } else {
      const timeSinceLastAdvice = history.lastAdviceTime
        ? Math.floor((Date.now() - history.lastAdviceTime.getTime()) / 1000)
        : 0;
      console.log(
        `⏳ Cooldown active: ${timeSinceLastAdvice}s since last advice (need 30s)`
      );
    }

    // ⭐⭐⭐ BROADCAST TO CALL ROOM ⭐⭐⭐
    const eventData = {
      call_id: callId,
      user_id: userId,
      user_mongo_id: mongoUser._id.toString(),
      emotion: emotionResult.emotion,
      confidence: emotionResult.confidence,
      emotion_scores: emotionResult.emotionScores,
      timestamp: new Date().toISOString(),
      ai_advice: aiAdvice, // ⭐ NEW
      transcription: emotionResult.transcription,
    };

    await emitToCallRoom("callEmotionUpdate", callId, eventData);
    console.log("📡 Emotion update + advice broadcasted to call room");

    return NextResponse.json({
      success: true,
      data: {
        emotion: emotionResult.emotion,
        confidence: emotionResult.confidence,
        emotion_scores: emotionResult.emotionScores,
        analysis_id: emotionAnalysis._id.toString(),
        method: emotionResult.method,
        transcription: emotionResult.transcription,
        ai_advice: aiAdvice, // ⭐ NEW
      },
    });
  } catch (error) {
    console.error("❌ Emotion analysis error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

/**
 * ⭐ Analyze video emotion with face-api.js
 */
async function analyzeVideoWithFaceAPI(videoBlob: Blob) {
  try {
    console.log("📹 Analyzing video with face-api.js...");
    const arrayBuffer = await videoBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const debugPath = `./public/debug-frames/frame-${Date.now()}.jpg`;
    try {
      const fs = require("fs");
      const path = require("path");
      const dir = path.dirname(debugPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(debugPath, buffer);
      console.log("🔍 DEBUG: Saved frame to:", debugPath);
    } catch (saveErr) {
      console.log("⚠️ Could not save debug frame:", saveErr);
    }

    const img = await canvas.loadImage(buffer);
    console.log("✅ Image loaded:", img.width, "x", img.height);

    let detection = await faceapi
      .detectSingleFace(
        img as any,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.3,
        })
      )
      .withFaceExpressions();

    if (!detection) {
      console.log("🔍 DEBUG: No face with threshold 0.3, trying 0.2...");
      detection = await faceapi
        .detectSingleFace(
          img as any,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.2,
          })
        )
        .withFaceExpressions();
    }

    if (!detection) {
      console.warn("⚠️ No face detected in video");
      return {
        emotion: "neutral",
        confidence: 0.5,
        emotionScores: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear: 0.1,
          surprise: 0.1,
          neutral: 0.5,
        },
        method: "face-api.js (no face detected)",
      };
    }

    const expressions = detection.expressions;
    const emotionScores = {
      joy: expressions.happy,
      sadness: expressions.sad,
      anger: expressions.angry,
      fear: expressions.fearful,
      surprise: expressions.surprised,
      neutral: expressions.neutral,
    };

    const dominant = Object.entries(emotionScores).reduce((a, b) =>
      (a[1] as number) > (b[1] as number) ? a : b
    );

    console.log(
      `✅ Dominant emotion: ${dominant[0]} (${(
        (dominant[1] as number) * 100
      ).toFixed(1)}%)`
    );

    return {
      emotion: dominant[0],
      confidence: dominant[1] as number,
      emotionScores,
      method: "face-api.js",
    };
  } catch (error) {
    console.error("❌ Video analysis failed:", error);
    return {
      emotion: "neutral",
      confidence: 0.3,
      emotionScores: {
        joy: 0.1,
        sadness: 0.1,
        anger: 0.1,
        fear: 0.1,
        surprise: 0.1,
        neutral: 0.5,
      },
      method: "face-api.js (error)",
    };
  }
}

/**
 * ⭐ Analyze audio emotion with Groq Whisper
 */
async function analyzeAudioWithGroq(audioBlob: Blob) {
  try {
    console.log("🎤 Analyzing audio with Groq Whisper...");

    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY not configured");
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioFile = new File([buffer], "audio.m4a", {
      type: audioBlob.type || "audio/m4a",
    });

    console.log("📤 Sending to Groq Whisper API...");

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      language: "vi",
      response_format: "json",
    });

    const text = transcription.text;
    console.log("✅ Transcribed:", text);

    if (!text || text.trim().length === 0) {
      console.warn("⚠️ No speech detected in audio");
      return {
        emotion: "neutral",
        confidence: 0.5,
        emotionScores: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear: 0.1,
          surprise: 0.1,
          neutral: 0.5,
        },
        method: "groq-whisper (no speech)",
        transcription: "",
      };
    }

    const sentiment = analyzeSentiment(text);
    console.log(
      `✅ Audio emotion: ${sentiment.emotion} (${(
        sentiment.confidence * 100
      ).toFixed(1)}%)`
    );

    return {
      ...sentiment,
      method: "groq-whisper + sentiment",
      transcription: text,
    };
  } catch (error) {
    console.error("❌ Audio analysis failed:", error);
    return {
      emotion: "neutral",
      confidence: 0.3,
      emotionScores: {
        joy: 0.1,
        sadness: 0.1,
        anger: 0.1,
        fear: 0.1,
        surprise: 0.1,
        neutral: 0.5,
      },
      method: "groq-whisper (error)",
      transcription: "",
    };
  }
}

/**
 * ⭐ Analyze sentiment from text
 */
function analyzeSentiment(text: string) {
  const lowerText = text.toLowerCase();

  const keywords = {
    joy: [
      "happy",
      "great",
      "love",
      "wonderful",
      "amazing",
      "haha",
      "lol",
      "vui",
      "mừng",
      "hạnh phúc",
      "tuyệt",
      "hay",
      "tốt",
      "thích",
      "yêu",
      "hehe",
      "hihi",
    ],
    anger: [
      "fuck",
      "shit",
      "damn",
      "angry",
      "hate",
      "địt",
      "đụ",
      "lồn",
      "cặc",
      "đéo",
      "đm",
      "dm",
      "vcl",
      "vl",
      "cc",
      "giận",
      "tức",
      "ghét",
      "ngu",
      "ngốc",
      "chó",
    ],
    sadness: [
      "sad",
      "cry",
      "depressed",
      "buồn",
      "khóc",
      "tệ",
      "chán",
      "thất vọng",
      "nhớ",
      "cô đơn",
      "đau",
    ],
    fear: [
      "scared",
      "afraid",
      "worry",
      "sợ",
      "lo",
      "lo lắng",
      "hồi hộp",
      "lo âu",
    ],
    surprise: [
      "wow",
      "omg",
      "what",
      "ồ",
      "ơ",
      "ủa",
      "hả",
      "trời",
      "sao",
      "ngạc nhiên",
    ],
  };

  const scores: Record<string, number> = {
    joy: 0,
    anger: 0,
    sadness: 0,
    fear: 0,
    surprise: 0,
    neutral: 0.3,
  };

  for (const [emotion, words] of Object.entries(keywords)) {
    const matches = words.filter((word) => lowerText.includes(word));
    if (matches.length > 0) {
      scores[emotion] = Math.min(matches.length * 0.5, 1.0);
    }
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  if (totalScore > 0) {
    for (const key in scores) {
      scores[key] = scores[key] / totalScore;
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < 0.4) {
    scores.neutral = 0.6;
    const newTotal = Object.values(scores).reduce((a, b) => a + b, 0);
    for (const key in scores) {
      scores[key] = scores[key] / newTotal;
    }
  }

  const dominant = Object.entries(scores).reduce((a, b) =>
    (a[1] as number) > (b[1] as number) ? a : b
  );

  return {
    emotion: dominant[0],
    confidence: dominant[1] as number,
    emotionScores: scores,
  };
}

/**
 * Combine video and audio emotions
 */
function combineEmotions(faceResult: any, voiceResult: any) {
  if (!faceResult && !voiceResult) return null;
  if (!faceResult) return voiceResult;
  if (!voiceResult) return faceResult;

  console.log("🔗 Combining face and voice emotions...");

  const combined: Record<string, number> = {};
  const faceConfidence = faceResult.confidence;
  const isNoFaceDetected = faceResult.method?.includes("no face detected");

  let faceWeight: number;
  let voiceWeight: number;

  if (isNoFaceDetected || faceConfidence < 0.6) {
    faceWeight = 0.3;
    voiceWeight = 0.7;
    console.log(
      "⚠️ No face detected, using audio-heavy weighting (30% face, 70% audio)"
    );
  } else {
    faceWeight = 0.6;
    voiceWeight = 0.4;
    console.log(
      "✅ Face detected, using standard weighting (60% face, 40% audio)"
    );
  }

  Object.keys(faceResult.emotionScores).forEach((emotion) => {
    combined[emotion] =
      faceResult.emotionScores[emotion] * faceWeight +
      voiceResult.emotionScores[emotion] * voiceWeight;
  });

  const dominantEmotion = Object.entries(combined).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )[0];

  console.log(
    `✅ Combined emotion: ${dominantEmotion[0]} (${(
      (dominantEmotion[1] as number) * 100
    ).toFixed(1)}%)`
  );

  return {
    emotion: dominantEmotion[0],
    confidence: dominantEmotion[1] as number,
    emotionScores: combined,
    method: "face-api.js + groq-whisper (combined)",
    transcription: voiceResult.transcription,
  };
}
