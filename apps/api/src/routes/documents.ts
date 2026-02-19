import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { documentService } from '../services/documentService.js';

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

      // Get document type from fields
      const fields = data.fields as any;
      const type = fields?.type?.value || 'OTHER';

      // Parse document to extract text
      fastify.log.info(`Parsing document: ${filename}`);
      const parsed = await documentService.parseDocument(buffer, mimetype);
      
      // Chunk the text
      const chunks = documentService.chunkText(parsed.text);
      fastify.log.info(`Created ${chunks.length} chunks from document`);

      // Extract additional metadata
      const extractedMetadata = documentService.extractMetadata(parsed.text);

      // Get existing test user
      const user = await prisma.user.findFirst({
        where: { email: 'test@example.com' }
      });

      if (!user) {
        return reply.code(500).send({
          error: 'Test user not found. Run: pnpm db:seed'
        });
      }

      // Save document with parsed content - EXPLICITLY set each field
      const document = await prisma.document.create({
        data: {
          userId: user.id,
          filename,
          fileUrl: `/uploads/${Date.now()}-${filename}`,
          type,
          content: parsed.text,
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

      // Save chunks to database
      await prisma.chunk.createMany({
        data: chunks.map((chunk, index) => ({
          documentId: document.id,
          content: chunk,
          position: index,
          metadata: {
            length: chunk.length,
            wordCount: chunk.split(/\s+/).filter(w => w.length > 0).length,
          },
        })),
      });

      fastify.log.info(`Document uploaded and processed: ${document.id}`);

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

      await prisma.document.delete({
        where: { id },
      });

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