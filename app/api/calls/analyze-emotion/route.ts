/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/analyze-emotion/route.ts - face-api.js + Groq Whisper (TYPESCRIPT FIXED)
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import Call from "@/database/call.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitToUserRoom } from "@/lib/socket.helper";
import * as faceapi from 'face-api.js';
import * as canvas from 'canvas';
import Groq from 'groq-sdk';

// ⭐ Setup face-api.js with canvas (ONLY ONCE on server start)
const { Canvas, Image, ImageData } = canvas;

// @ts-ignore - Type mismatch between canvas and face-api.js, but works at runtime
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

async function loadFaceAPIModels() {
  if (modelsLoaded) return;
  
  try {
    console.log('📦 Loading face-api.js models...');
    
    // Load models from local directory
    await faceapi.nets.tinyFaceDetector.loadFromDisk('./public/models');
    await faceapi.nets.faceExpressionNet.loadFromDisk('./public/models');
    
    modelsLoaded = true;
    console.log('✅ face-api.js models loaded');
  } catch (error) {
    console.error('❌ Failed to load face-api.js models:', error);
    throw new Error('Face detection models not available');
  }
}

/**
 * ⭐ Real-time emotion analysis endpoint
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Ensure models are loaded
    await loadFaceAPIModels();

    const formData = await req.formData();

    console.log("📋 Received FormData:");
    for (const [key, value] of formData.entries()) {
      if (value instanceof Blob) {
        console.log(`  ${key}: Blob (${value.size} bytes, type: ${value.type})`);
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
      path: 'conversation',
      populate: {
        path: 'participants',
        select: 'clerkId username avatar'
      }
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
      return NextResponse.json({ error: "Not a call participant" }, { status: 403 });
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
      return NextResponse.json({ error: "No media data provided" }, { status: 400 });
    }

    if (!emotionResult) {
      return NextResponse.json({ error: "Emotion analysis failed" }, { status: 500 });
    }

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

    const conversation = call.conversation as any;
    if (conversation?.participants && Array.isArray(conversation.participants)) {
      const eventData = {
        call_id: callId,
        user_id: userId,
        user_mongo_id: mongoUser._id.toString(),
        emotion: emotionResult.emotion,
        confidence: emotionResult.confidence,
        emotion_scores: emotionResult.emotionScores,
        timestamp: new Date().toISOString(),
      };

      for (const participant of conversation.participants) {
        const participantClerkId = participant.clerkId;
        if (!participantClerkId) continue;
        
        await emitToUserRoom("callEmotionUpdate", participantClerkId, eventData);
      }

      console.log("📡 Emotion update broadcasted to participants");
    }

    return NextResponse.json({
      success: true,
      data: {
        emotion: emotionResult.emotion,
        confidence: emotionResult.confidence,
        emotion_scores: emotionResult.emotionScores,
        analysis_id: emotionAnalysis._id.toString(),
        method: emotionResult.method,
        transcription: emotionResult.transcription,
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
 * ⭐ Analyze video emotion with face-api.js + EXTENSIVE DEBUG
 */
async function analyzeVideoWithFaceAPI(videoBlob: Blob) {
  try {
    console.log('📹 Analyzing video with face-api.js...');
    console.log('🔍 DEBUG: Video blob size:', videoBlob.size, 'bytes');
    console.log('🔍 DEBUG: Video blob type:', videoBlob.type);

    const arrayBuffer = await videoBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('🔍 DEBUG: Buffer length:', buffer.length);
    console.log('🔍 DEBUG: Buffer first 20 bytes:', buffer.slice(0, 20).toString('hex'));
    
    // ⭐ DEBUG: Save image to disk for manual inspection
    const debugPath = `./public/debug-frames/frame-${Date.now()}.jpg`;
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(debugPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(debugPath, buffer);
      console.log('🔍 DEBUG: Saved frame to:', debugPath);
    } catch (saveErr) {
      console.log('⚠️ Could not save debug frame:', saveErr);
    }

    // Load image
    const img = await canvas.loadImage(buffer);
    console.log('✅ Image loaded:', img.width, 'x', img.height);
    console.log('🔍 DEBUG: Image aspect ratio:', (img.width / img.height).toFixed(2));

    // ⭐ DEBUG: Check image brightness (might be too dark)
    const tempCanvas = canvas.createCanvas(img.width, img.height);
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;
    
    let totalBrightness = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      totalBrightness += (r + g + b) / 3;
    }
    const avgBrightness = totalBrightness / (pixels.length / 4);
    console.log('🔍 DEBUG: Average brightness:', avgBrightness.toFixed(2), '(0-255)');
    
    if (avgBrightness < 30) {
      console.warn('⚠️ Image is very dark, face detection may fail');
    }

    // ⭐ DEBUG: Try multiple detector options
    console.log('🔍 DEBUG: Attempting face detection...');
    
    // Try with low threshold first
    let detection = await faceapi
      .detectSingleFace(img as any, new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.3, // Lower threshold
      }))
      .withFaceExpressions();

    if (!detection) {
      console.log('🔍 DEBUG: No face with threshold 0.3, trying 0.2...');
      detection = await faceapi
        .detectSingleFace(img as any, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.2,
        }))
        .withFaceExpressions();
    }

    if (!detection) {
      console.log('🔍 DEBUG: No face with threshold 0.2, trying smaller input size...');
      detection = await faceapi
        .detectSingleFace(img as any, new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: 0.3,
        }))
        .withFaceExpressions();
    }

    if (!detection) {
      console.warn('⚠️ No face detected in video');
      console.log('🔍 DEBUG: Tried multiple detection strategies, all failed');
      console.log('🔍 DEBUG: Check saved frame at:', debugPath);
      return {
        emotion: 'neutral',
        confidence: 0.5,
        emotionScores: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear: 0.1,
          surprise: 0.1,
          neutral: 0.5,
        },
        method: 'face-api.js (no face detected)',
      };
    }

    console.log('🔍 DEBUG: Face detected! Box:', {
      x: Math.round(detection.detection.box.x),
      y: Math.round(detection.detection.box.y),
      width: Math.round(detection.detection.box.width),
      height: Math.round(detection.detection.box.height),
    });

    const expressions = detection.expressions;

    console.log('🎭 Face expressions detected:');
    console.log(`  happy: ${(expressions.happy * 100).toFixed(1)}%`);
    console.log(`  sad: ${(expressions.sad * 100).toFixed(1)}%`);
    console.log(`  angry: ${(expressions.angry * 100).toFixed(1)}%`);
    console.log(`  fearful: ${(expressions.fearful * 100).toFixed(1)}%`);
    console.log(`  surprised: ${(expressions.surprised * 100).toFixed(1)}%`);
    console.log(`  neutral: ${(expressions.neutral * 100).toFixed(1)}%`);

    // Map face-api.js emotions to our format
    const emotionScores = {
      joy: expressions.happy,
      sadness: expressions.sad,
      anger: expressions.angry,
      fear: expressions.fearful,
      surprise: expressions.surprised,
      neutral: expressions.neutral,
    };

    // Get dominant emotion
    const dominant = Object.entries(emotionScores).reduce((a, b) => 
      (a[1] as number) > (b[1] as number) ? a : b
    );

    console.log(`✅ Dominant emotion: ${dominant[0]} (${((dominant[1] as number) * 100).toFixed(1)}%)`);

    return {
      emotion: dominant[0],
      confidence: dominant[1] as number,
      emotionScores,
      method: 'face-api.js',
    };
  } catch (error) {
    console.error('❌ Video analysis failed:', error);
    return {
      emotion: 'neutral',
      confidence: 0.3,
      emotionScores: {
        joy: 0.1,
        sadness: 0.1,
        anger: 0.1,
        fear: 0.1,
        surprise: 0.1,
        neutral: 0.5,
      },
      method: 'face-api.js (error)',
    };
  }
}

/**
 * ⭐ Analyze audio emotion with Groq Whisper + Sentiment
 */
async function analyzeAudioWithGroq(audioBlob: Blob) {
  try {
    console.log('🎤 Analyzing audio with Groq Whisper...');

    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Convert Blob to File for Groq API
    const arrayBuffer = await audioBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a File-like object
    const audioFile = new File([buffer], 'audio.m4a', { 
      type: audioBlob.type || 'audio/m4a' 
    });

    console.log('📤 Sending to Groq Whisper API...');

    // Transcribe with Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      language: "vi", // Vietnamese support
      response_format: "json",
    });

    const text = transcription.text;
    console.log('✅ Transcribed:', text);

    if (!text || text.trim().length === 0) {
      console.warn('⚠️ No speech detected in audio');
      return {
        emotion: 'neutral',
        confidence: 0.5,
        emotionScores: {
          joy: 0.1,
          sadness: 0.1,
          anger: 0.1,
          fear: 0.1,
          surprise: 0.1,
          neutral: 0.5,
        },
        method: 'groq-whisper (no speech)',
        transcription: '',
      };
    }

    // Analyze sentiment from transcription
    const sentiment = analyzeSentiment(text);

    console.log(`✅ Audio emotion: ${sentiment.emotion} (${(sentiment.confidence * 100).toFixed(1)}%)`);

    return {
      ...sentiment,
      method: 'groq-whisper + sentiment',
      transcription: text,
    };
  } catch (error) {
    console.error('❌ Audio analysis failed:', error);
    return {
      emotion: 'neutral',
      confidence: 0.3,
      emotionScores: {
        joy: 0.1,
        sadness: 0.1,
        anger: 0.1,
        fear: 0.1,
        surprise: 0.1,
        neutral: 0.5,
      },
      method: 'groq-whisper (error)',
      transcription: '',
    };
  }
}

/**
 * ⭐ Analyze sentiment from text (Vietnamese + English)
 */
function analyzeSentiment(text: string) {
  const lowerText = text.toLowerCase();

  // Vietnamese + English emotion keywords
  const keywords = {
    joy: [
      // English
      'happy', 'great', 'love', 'wonderful', 'amazing', 'haha', 'lol', 'awesome', 
      'fantastic', 'excellent', 'good', 'nice', 'yay', 'hooray',
      // Vietnamese
      'vui', 'mừng', 'hạnh phúc', 'tuyệt', 'hay', 'tốt', 'đẹp', 'thích', 'yêu',
      'hehe', 'hihi', 'haha', 'ok', 'oke',
    ],
    anger: [
      // English
      'fuck', 'shit', 'damn', 'angry', 'hate', 'stupid', 'idiot', 'hell', 
      'asshole', 'bitch', 'piss', 'mad', 'wtf', 'dammit', 'crap',
      // Vietnamese - EXPANDED with more variations
      'địt', 'đụ', 'lồn', 'cặc', 'đéo', 'đm', 'dm', 'vcl', 'vl', 'cc', 
      'giận', 'tức', 'ghét', 'ngu', 'ngốc', 'chó', 'câm mẹ', 'đồ ngu',
      'mẹ mày', 'con chó', 'thằng', 'con', 'óc chó', 'não cá vàng',
      'đĩ', 'đồ điên', 'khốn', 'khốn nạn', 'đồ khốn', 'đồ súc sinh',
      'cút', 'biến', 'im mồm', 'im miệng', 'tức quá', 'bực', 'bực mình',
      'clgt', 'dcm', 'dcmm', 'dmm', 'vãi', 'vãi lồn', 'đụ má',
    ],
    sadness: [
      // English
      'sad', 'cry', 'depressed', 'terrible', 'awful', 'miss', 'sorry', 
      'disappointed', 'lonely', 'hurt',
      // Vietnamese
      'buồn', 'khóc', 'tệ', 'chán', 'thất vọng', 'nhớ', 'cô đơn', 'đau', 
      'thương', 'tiếc', 'xin lỗi',
    ],
    fear: [
      // English
      'scared', 'afraid', 'worry', 'nervous', 'anxious', 'fear', 'terrified',
      // Vietnamese
      'sợ', 'lo', 'lo lắng', 'hồi hộp', 'lo âu', 'kinh', 'hoảng',
    ],
    surprise: [
      // English
      'wow', 'omg', 'what', 'really', 'seriously', 'amazing', 'unbelievable',
      // Vietnamese
      'ồ', 'ơ', 'ủa', 'hả', 'trời', 'sao', 'thật', 'không thể', 'ngạc nhiên',
    ],
  };

  const scores: Record<string, number> = {
    joy: 0,
    anger: 0,
    sadness: 0,
    fear: 0,
    surprise: 0,
    neutral: 0.3, // Base neutral score
  };

  // Count keyword matches with HIGHER weight for strong emotions
  for (const [emotion, words] of Object.entries(keywords)) {
    const matches = words.filter(word => lowerText.includes(word));
    
    if (matches.length > 0) {
      // ⭐ INCREASED weight: 0.5 instead of 0.35
      scores[emotion] = Math.min(matches.length * 0.5, 1.0);
      console.log(`  ${emotion}: found ${matches.length} keywords (score: ${scores[emotion].toFixed(2)})`);
    }
  }

  // Normalize scores to sum to 1
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  
  if (totalScore > 0) {
    for (const key in scores) {
      scores[key] = scores[key] / totalScore;
    }
  }

  // If no strong emotion detected, boost neutral
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < 0.4) {
    scores.neutral = 0.6;
    // Renormalize
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
 * ⭐ ADAPTIVE WEIGHTS: If no face detected, prioritize audio
 */
function combineEmotions(faceResult: any, voiceResult: any) {
  if (!faceResult && !voiceResult) return null;
  if (!faceResult) return voiceResult;
  if (!voiceResult) return faceResult;

  console.log('🔗 Combining face and voice emotions...');

  const combined: Record<string, number> = {};
  
  // ⭐ ADAPTIVE WEIGHTING:
  // If face confidence is low (no face detected = neutral 0.5), prioritize audio
  const faceConfidence = faceResult.confidence;
  const isNoFaceDetected = faceResult.method?.includes('no face detected');
  
  let faceWeight: number;
  let voiceWeight: number;
  
  if (isNoFaceDetected || faceConfidence < 0.6) {
    // No face or low confidence → prioritize audio
    faceWeight = 0.3;
    voiceWeight = 0.7;
    console.log('⚠️ No face detected, using audio-heavy weighting (30% face, 70% audio)');
  } else {
    // Face detected → standard weighting
    faceWeight = 0.6;
    voiceWeight = 0.4;
    console.log('✅ Face detected, using standard weighting (60% face, 40% audio)');
  }

  Object.keys(faceResult.emotionScores).forEach((emotion) => {
    combined[emotion] =
      faceResult.emotionScores[emotion] * faceWeight +
      voiceResult.emotionScores[emotion] * voiceWeight;
  });

  const dominantEmotion = Object.entries(combined).sort(
    ([, a], [, b]) => (b as number) - (a as number)
  )[0];

  console.log(`✅ Combined emotion: ${dominantEmotion[0]} (${((dominantEmotion[1] as number) * 100).toFixed(1)}%)`);

  return {
    emotion: dominantEmotion[0],
    confidence: dominantEmotion[1] as number,
    emotionScores: combined,
    method: 'face-api.js + groq-whisper (combined)',
    transcription: voiceResult.transcription,
  };
}