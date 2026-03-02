import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { documentService } from '../services/documentService.js';
import { embeddingService } from '../services/embeddingService.js';
import { qdrantService } from '../services/qdrantService.js';
import { authenticateUser, ensureUser } from '../middleware/auth.js';

export default async function documentsRoutes(fastify: FastifyInstance) {
  
  // Upload document
  fastify.post('/upload', {
    preHandler: [authenticateUser, ensureUser] // ← ADD THIS
  },async (request, reply) => {
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

      // const user = await prisma.user.findFirst({
      //   where: { email: 'test@example.com' }
      // });
      const user = request.user!;

      fastify.log.info(`Fetching documents for user: ${user.id} (${user.email})`); // ← ADD DEBUG LOG
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
        payload: {
          documentId: document.id,
          chunkId: chunk.id,
          content: chunk.content,
          position: chunk.position,
          userId: user.id, // ← ADD THIS - Store userId in Qdrant
          metadata: {
            type: documentType,
            filename: document.filename,
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


// List documents (PROTECTED)
  fastify.get('/', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;

      fastify.log.info(`Fetching documents for user: ${user.id} (${user.email})`); // ← ADD DEBUG LOG

      const documents = await prisma.document.findMany({
        where: { userId: user.id }, // ← This filters by logged-in user
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          type: true,
          createdAt: true,
          metadata: true,
        },
      });

      fastify.log.info(`Found ${documents.length} documents for user ${user.id}`); // ← ADD DEBUG LOG

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
fastify.get('/:id', {
  preHandler: [authenticateUser, ensureUser]
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const user = request.user!; // User from middleware

    fastify.log.info(`📄 Fetching document ${id} for user ${user.id} (${user.email})`);

    // First, check if document exists AND user owns it
    const document = await prisma.document.findFirst({
      where: { 
        id,
        userId: user.id // ← SECURITY: Only return if user owns it
      },
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
      fastify.log.warn(`❌ Document ${id} not found or access denied for user ${user.id}`);
      return reply.code(404).send({ 
        error: 'Document not found or access denied' 
      });
    }

    fastify.log.info(`✅ Document found: ${document.filename} (${document.chunks.length} chunks)`);

    return { document };
  } catch (error) {
    fastify.log.error('❌ Error fetching document:', error);
    return reply.code(500).send({
      error: 'Failed to fetch document',
    });
  }
});

  // Delete document
  fastify.delete('/:id',{
    preHandler: [authenticateUser, ensureUser] // ← ADD THIS
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Delete from PostgreSQL (chunks will cascade delete)
      await prisma.document.delete({
        where: { id },
      });

      // Delete from Qdrant
      await qdrantService.deleteByDocumentId(id);

      // ← ADD THIS: Invalidate search cache
      const { cacheService } = await import('../lib/redis.js');
      await cacheService.delPattern('search:*');
      fastify.log.info('🗑️  Cleared search cache');

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