/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/firebase-admin.ts - UPDATED: Correct project ID access
import admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

/**
 * ⭐ Initialize Firebase Admin SDK
 */
export function initializeFirebaseAdmin() {
  // Check if already initialized
  if (admin.apps.length > 0) {
    console.log('ℹ️ Firebase Admin already initialized');
    return admin.app();
  }

  try {
    // Priority 1: Service account file
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      console.log('🔧 Initializing Firebase from service account file...');
      
      const serviceAccountJson = fs.readFileSync(serviceAccountPath, 'utf8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      // ⭐ Validate required fields
      if (!serviceAccount.project_id) {
        throw new Error('firebase-service-account.json is missing "project_id" field');
      }
      if (!serviceAccount.private_key) {
        throw new Error('firebase-service-account.json is missing "private_key" field');
      }
      if (!serviceAccount.client_email) {
        throw new Error('firebase-service-account.json is missing "client_email" field');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log('✅ Firebase Admin initialized successfully');
      console.log('📊 Project ID:', serviceAccount.project_id); // Read from serviceAccount object
      return admin.app();
    }

    // Priority 2: Environment variables
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      console.log('🔧 Initializing Firebase from environment variables...');
      
      const credential = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };
      
      admin.initializeApp({
        credential: admin.credential.cert(credential),
      });

      console.log('✅ Firebase Admin initialized successfully');
      console.log('📊 Project ID:', process.env.FIREBASE_PROJECT_ID);
      return admin.app();
    }

    // No credentials found
    throw new Error(
      'Firebase credentials not found!\n' +
      'Provide either:\n' +
      '1. firebase-service-account.json in project root, OR\n' +
      '2. Environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY'
    );

  } catch (error: any) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    throw error;
  }
}

/**
 * Get Firebase Admin instance
 */
export function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }
  
  initializeFirebaseAdmin();
  return admin;
}

export default admin;