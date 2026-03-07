import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, redisConnection } from '../queues/queueConfig.js';
import { DocumentProcessingJob, DocumentProcessingResult } from '../queues/documentQueue.js';
import { prisma } from '../lib/db.js';
import { documentService } from '../services/documentService.js';
import { embeddingService } from '../services/embeddingService.js';
import { qdrantService } from '../services/qdrantService.js';
import fs from 'fs/promises';

interface ChunkData {
  content: string;
  metadata: {
    wordCount: number;
    characterCount: number;
    lineCount: number;
  };
}

/**
 * Worker that processes document upload jobs
 */
export const documentWorker = new Worker<DocumentProcessingJob, DocumentProcessingResult>(
  QUEUE_NAMES.DOCUMENT_PROCESSING,
  async (job: Job<DocumentProcessingJob>) => {
    const startTime = Date.now();
    const { documentId, userId, filename, filepath, type } = job.data;

    console.log(`📄 Processing document job ${job.id}: ${filename}`);

    try {
      // ✅ FIX 1: Validate filepath exists in job data
      if (!filepath) {
        throw new Error('File path is missing from job data');
      }

      // ✅ FIX 2: Check if file exists before attempting to read
      try {
        await fs.access(filepath);
        console.log(`✅ File found at: ${filepath}`);
      } catch (error) {
        throw new Error(`File not found at path: ${filepath}`);
      }

      // Update job status in database
      await updateJobProgress(job.id!, 'ACTIVE', 10);

      // Step 1: Read file into buffer
      console.log('📖 Step 1/5: Reading file...');
      const buffer = await fs.readFile(filepath);
      
      // Detect mimetype from filename
      let mimetype = 'text/plain';
      if (filename.endsWith('.pdf')) {
        mimetype = 'application/pdf';
      } else if (filename.endsWith('.docx')) {
        mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (filename.endsWith('.txt')) {
        mimetype = 'text/plain';
      }

      console.log(`📄 File type: ${mimetype}, size: ${buffer.length} bytes`);
      await job.updateProgress(15);
      await updateJobProgress(job.id!, 'ACTIVE', 15);

      // Step 2: Parse document (returns ParsedDocument)
      console.log('📖 Step 2/5: Parsing document...');
      const parsedDoc = await documentService.parseDocument(buffer, mimetype);
      const parsedContent = typeof parsedDoc === 'string' ? parsedDoc : parsedDoc.text;

      // ✅ FIX 3: Validate parsed content is not empty
      if (!parsedContent || parsedContent.trim().length === 0) {
        throw new Error('Failed to extract text from document or document is empty');
      }

      console.log(`✅ Extracted ${parsedContent.length} characters from document`);
      await job.updateProgress(30);
      await updateJobProgress(job.id!, 'ACTIVE', 30);

      // Step 3: Chunk the content
      console.log('✂️ Step 3/5: Chunking content...');
      const chunkStrings: string[] = documentService.chunkText(parsedContent);

      // ✅ FIX 4: Validate chunks were created
      if (!chunkStrings || chunkStrings.length === 0) {
        throw new Error('Failed to create chunks from document content');
      }

      // ✅ FIX 5: Transform string chunks into ChunkData objects
      const chunks: ChunkData[] = chunkStrings.map((chunkContent) => {
        const lines = chunkContent.split('\n');
        const words = chunkContent.split(/\s+/).filter(Boolean);
        
        return {
          content: chunkContent,
          metadata: {
            wordCount: words.length,
            characterCount: chunkContent.length,
            lineCount: lines.length,
          },
        };
      });

      console.log(`✅ Created ${chunks.length} chunks`);
      await job.updateProgress(50);
      await updateJobProgress(job.id!, 'ACTIVE', 50);

      // Step 4: Save chunks to database
      console.log('💾 Step 4/5: Saving chunks to database...');
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new Error('Document not found in database');
      }

      // ✅ FIX: Update document with full content and metadata
      await prisma.document.update({
        where: { id: documentId },
        data: {
          content: parsedContent, // Save full text content
          metadata: {
            ...((document.metadata as any) || {}),
            wordCount: parsedContent.split(/\s+/).filter(Boolean).length,
            characterCount: parsedContent.length,
            chunkCount: chunks.length,
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`✅ Updated document with full content (${parsedContent.length} characters)`);

      const createdChunks = await Promise.all(
        chunks.map((chunk, index) =>
          prisma.chunk.create({
            data: {
              documentId,
              content: chunk.content,
              position: index,
              metadata: chunk.metadata as any,
            },
          })
        )
      );

      console.log(`✅ Saved ${createdChunks.length} chunks to database`);
      await job.updateProgress(70);
      await updateJobProgress(job.id!, 'ACTIVE', 70);

      // Step 5: Generate embeddings and store in Qdrant
      console.log('🤖 Step 5/5: Generating embeddings...');
      const texts = createdChunks.map((c) => c.content);
      const embeddings = await embeddingService.generateEmbeddings(texts);

      const vectors = createdChunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        payload: {
          documentId,
          chunkId: chunk.id,
          content: chunk.content,
          position: chunk.position,
          userId,
          metadata: {
            type,
            filename,
            wordCount: (chunk.metadata as any)?.wordCount,
          },
        },
      }));

      await qdrantService.upsertVectors(vectors);

      console.log(`✅ Stored ${vectors.length} vectors in Qdrant`);
      await job.updateProgress(100);
      
      // Save result to job
      const result = {
        documentId,
        chunksCreated: createdChunks.length,
        vectorsStored: vectors.length,
        processingTime: Date.now() - startTime,
      };

      await updateJobProgress(job.id!, 'COMPLETED', 100, undefined, result);

      // ✅ FIX 6: Clean up temp file after successful processing
      try {
        await fs.unlink(filepath);
        console.log(`🗑️ Cleaned up file: ${filepath}`);
      } catch (err) {
        console.warn('⚠️ Failed to delete file (may already be deleted):', err);
      }

      console.log(
        `✅ Document processed successfully in ${result.processingTime}ms: ${createdChunks.length} chunks, ${vectors.length} vectors`
      );

      return result;
      
    } catch (error) {
      console.error(`❌ Document processing failed:`, error);
      
      // Update job status to failed
      const currentProgress = typeof job.progress === 'number' ? job.progress : 0;
      await updateJobProgress(
        job.id!,
        'FAILED',
        currentProgress,
        error instanceof Error ? error.message : 'Unknown error'
      );

      // ✅ FIX 7: Try to clean up temp file even on failure
      if (filepath) {
        try {
          await fs.unlink(filepath);
          console.log(`🗑️ Cleaned up file after failure: ${filepath}`);
        } catch (err) {
          // Ignore cleanup errors - file may not exist
          console.warn('⚠️ Could not clean up file:', err);
        }
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

/**
 * Update job status in database
 */
async function updateJobProgress(
  jobId: string,
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED',
  progress: number,
  error?: string,
  result?: any
) {
  try {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        progress,
        error,
        result: result || undefined,
        attempts: { increment: status === 'FAILED' ? 1 : 0 },
        completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined,
      },
    });
  } catch (err) {
    console.error('Failed to update job progress in DB:', err);
  }
}

// Worker event handlers
documentWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

documentWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

documentWorker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

console.log('✅ Document worker started');