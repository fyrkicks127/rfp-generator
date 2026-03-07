import { Queue } from 'bullmq';
import { defaultQueueOptions, QUEUE_NAMES } from './queueConfig.js';

// Job data types
export interface DocumentProcessingJob {
  documentId: string;
  userId: string;
  filename: string;
  filepath: string;
  type: string;
  mimetype?: string;
}

export interface DocumentProcessingResult {
  documentId: string;
  chunksCreated: number;
  vectorsStored: number;
  processingTime: number;
}

// Create the queue
export const documentQueue = new Queue<DocumentProcessingJob>(
  QUEUE_NAMES.DOCUMENT_PROCESSING,
  defaultQueueOptions
);

console.log('✅ Document processing queue created');