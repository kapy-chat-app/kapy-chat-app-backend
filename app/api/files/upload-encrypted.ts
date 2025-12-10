// pages/api/files/upload-encrypted.ts - NEW FILE
import { uploadEncryptedFile } from '@/lib/actions/file.action';
import { auth } from '@clerk/nextjs/server';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { encryptedBase64, originalFileName, originalFileType, encryptionMetadata } = req.body;

    if (!encryptedBase64 || !originalFileName || !encryptionMetadata) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    console.log('📤 API: Uploading encrypted file:', originalFileName);

    const result = await uploadEncryptedFile(
      encryptedBase64,
      originalFileName,
      originalFileType,
      encryptionMetadata
    );

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('❌ Upload encrypted file API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // ✅ Increase limit cho encrypted files
    },
  },
};