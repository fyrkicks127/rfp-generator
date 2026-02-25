import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { documentService } from '../services/documentService.js';
import { embeddingService } from '../services/embeddingService.js';
import { qdrantService } from '../services/qdrantService.js';

export default async function documentsRoutes(fastify: FastifyInstance) {
  
  // Upload document
  fastify.post('/upload', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ 
          error: 'No file uploaded' 
        });
      }

      // Get file buffer
      const buffer = await data.toBuffer();
      const filename = data.filename;
      const mimetype = data.mimetype;

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
      ];

      if (!allowedTypes.includes(mimetype)) {
        return reply.code(400).send({
          error: 'Invalid file type. Only PDF, DOCX, DOC, and TXT files are allowed.',
        });
      }

      // Get document type from upload form
      const fields = data.fields as any;
      const documentType = fields?.type?.value || 'OTHER'; // RFP, PAST_PROPOSAL, etc.

      // ============================================
      // STEP 1: Parse the document
      // ============================================
      fastify.log.info(`Parsing document: ${filename}`);
      const parsed = await documentService.parseDocument(buffer, mimetype);
      
      // ============================================
      // STEP 2: Break text into chunks
      // ============================================
      const chunks = documentService.chunkText(parsed.text);
      fastify.log.info(`Created ${chunks.length} chunks from document`);

      // Extract preview and other metadata
      const extractedMetadata = documentService.extractMetadata(parsed.text);

      // ============================================
      // STEP 3: Get user (for now, test user)
      // ============================================
      const user = await prisma.user.findFirst({
        where: { email: 'test@example.com' }
      });

      if (!user) {
        return reply.code(500).send({
          error: 'Test user not found. Run: pnpm db:seed'
        });
      }

      // ============================================
      // STEP 4: Save document to PostgreSQL
      // ============================================
      const document = await prisma.document.create({
        data: {
          userId: user.id,
          filename,
          fileUrl: `/uploads/${Date.now()}-${filename}`,
          type: documentType, // ← IMPORTANT: This is the document type
          content: parsed.text,
          
          // PostgreSQL metadata (for display/reference)
          metadata: {
            size: buffer.length,
            mimetype: mimetype,
            uploadedAt: new Date().toISOString(),
            wordCount: parsed.metadata.wordCount,
            characterCount: parsed.metadata.characterCount,
            pageCount: parsed.metadata.pageCount || null,
            chunkCount: chunks.length,
            preview: extractedMetadata.preview,
            lineCount: extractedMetadata.lineCount,
            hasNumbers: extractedMetadata.hasNumbers,
            hasUrls: extractedMetadata.hasUrls,
          },
        },
      });

      // ============================================
      // STEP 5: Save chunks to PostgreSQL
      // ============================================
      const createdChunks = await Promise.all(
        chunks.map((chunk, index) =>
          prisma.chunk.create({
            data: {
              documentId: document.id,
              content: chunk,
              position: index,
              
              // Chunk metadata (PostgreSQL)
              metadata: {
                length: chunk.length,
                wordCount: chunk.split(/\s+/).filter(w => w.length > 0).length,
              },
            },
          })
        )
      );

      // ============================================
      // STEP 6: Generate embeddings
      // ============================================
      fastify.log.info(`Generating embeddings for ${chunks.length} chunks...`);
      const embeddings = await embeddingService.generateEmbeddings(chunks);

      // ============================================
      // STEP 7: Prepare vectors for Qdrant
      // ============================================
      const vectors = createdChunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        
        // Qdrant payload (what gets stored in vector DB)
        payload: {
          documentId: document.id,
          chunkId: chunk.id,
          content: chunk.content,
          position: chunk.position,
          
          // ← THIS IS THE KEY PART: Add metadata with type
          metadata: {
            type: documentType,              // ← IMPORTANT: For filtering by type
            filename: document.filename,     // ← For display
            wordCount: (chunk.metadata as any)?.wordCount,
          },
        },
      }));

      // ============================================
      // STEP 8: Store vectors in Qdrant
      // ============================================
      await qdrantService.upsertVectors(vectors);
      fastify.log.info(`✅ Stored ${vectors.length} vectors in Qdrant`);

      // ============================================
      // STEP 9: Return success response
      // ============================================
      return {
        success: true,
        document: {
          id: document.id,
          filename: document.filename,
          type: document.type,
          size: buffer.length,
          wordCount: parsed.metadata.wordCount,
          chunkCount: chunks.length,
          createdAt: document.createdAt,
        },
      };
      
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to upload document',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // List documents
  fastify.get('/', async (request, reply) => {
    try {
      const user = await prisma.user.findFirst({
        where: { email: 'test@example.com' }
      });

      if (!user) {
        return { documents: [], total: 0 };
      }

      const documents = await prisma.document.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          type: true,
          createdAt: true,
          metadata: true,
        },
      });

      return {
        documents,
        total: documents.length,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch documents',
      });
    }
  });

  // Get single document with chunks
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const document = await prisma.document.findUnique({
        where: { id },
        include: {
          chunks: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              content: true,
              position: true,
              metadata: true,
            },
          },
        },
      });

      if (!document) {
        return reply.code(404).send({ 
          error: 'Document not found' 
        });
      }

      return { document };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to fetch document',
      });
    }
  });

  // Delete document
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Delete from PostgreSQL (chunks will cascade delete)
      await prisma.document.delete({
        where: { id },
      });

      // Delete from Qdrant
      await qdrantService.deleteByDocumentId(id);

      return { 
        success: true,
        message: 'Document deleted successfully',
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to delete document',
      });
    }
  });
}