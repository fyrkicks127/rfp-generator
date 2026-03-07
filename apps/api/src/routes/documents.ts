import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/db.js';
import { qdrantService } from '../services/qdrantService.js';
import { authenticateUser, ensureUser } from '../middleware/auth.js';
import { documentQueue } from '../queues/documentQueue.js';
import path from 'path';
import fs from 'fs/promises';

export default async function documentsRoutes(fastify: FastifyInstance) {
  
  // Upload document (PROTECTED) - Now async with queue
  fastify.post('/upload', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const filename = data.filename;
      const mimetype = data.mimetype;

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ];

      if (!allowedTypes.includes(mimetype)) {
        return reply.code(400).send({
          error: 'Invalid file type. Only PDF, DOCX, and TXT files are allowed.',
        });
      }

      const type = (data as any).fields?.type?.value || 'OTHER';

      // ✅ FIX 1: Create persistent uploads directory in apps/api
      // Use absolute path from project root
      const uploadsDir = path.join(process.cwd(), 'apps', 'api', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });

      // ✅ FIX 2: Save file to persistent location (not /tmp)
      const persistentFilePath = path.join(uploadsDir, `${Date.now()}-${filename}`);
      await fs.writeFile(persistentFilePath, buffer);

      fastify.log.info(`💾 File saved to persistent location: ${persistentFilePath}`);

      // Create document record in database (without chunks yet)
      const document = await prisma.document.create({
        data: {
          userId: user.id,
          filename,
          fileUrl: persistentFilePath, // ✅ FIX 3: Store persistent path in DB
          type,
          metadata: {
            size: buffer.length,
            mimetype,
          },
        },
      });

      fastify.log.info(`📄 Document created: ${document.id} for user ${user.id}`);

      // Create job record in database
      const job = await prisma.job.create({
        data: {
          userId: user.id,
          type: 'DOCUMENT_UPLOAD',
          status: 'PENDING',
          data: {
            documentId: document.id,
            filename,
            filepath: persistentFilePath, // ✅ FIX 4: Use persistent path in job data
            type,
          },
        },
      });

      // Add job to queue
      await documentQueue.add(
        'process-document',
        {
          documentId: document.id,
          userId: user.id,
          filename,
          filepath: persistentFilePath, // ✅ FIX 5: Pass persistent path to worker
          type,
          mimetype,
        },
        {
          jobId: job.id,
          priority: (user.plan === 'PRO' || user.plan === 'TEAM') ? 1 : 10,
        }
      );

      fastify.log.info(`✅ Job queued: ${job.id}`);

      return reply.code(202).send({
        message: 'Document upload queued for processing',
        documentId: document.id,
        jobId: job.id,
        status: 'PENDING',
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Upload failed',
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

      fastify.log.info(`Fetching documents for user: ${user.id} (${user.email})`);

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

      fastify.log.info(`Found ${documents.length} documents for user ${user.id}`);

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
      const user = request.user!;

      fastify.log.info(`📄 Fetching document ${id} for user ${user.id} (${user.email})`);

      const document = await prisma.document.findFirst({
        where: { 
          id,
          userId: user.id
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
      fastify.log.error('❌ Error fetching document:');
      return reply.code(500).send({
        error: 'Failed to fetch document',
      });
    }
  });

  // Delete document
  fastify.delete('/:id', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.user!;

      // ✅ FIX 6: Get document before deleting to access file path
      const document = await prisma.document.findFirst({
        where: { id, userId: user.id },
      });

      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      // Delete from PostgreSQL (chunks will cascade delete)
      await prisma.document.delete({
        where: { id },
      });

      // Delete from Qdrant
      await qdrantService.deleteByDocumentId(id);

      // ✅ FIX 7: Delete physical file if it exists
      if (document.fileUrl) {
        try {
          await fs.unlink(document.fileUrl);
          fastify.log.info(`🗑️ Deleted file: ${document.fileUrl}`);
        } catch (err) {
          fastify.log.warn(`⚠️ Could not delete file: ${document.fileUrl}`);// ,err
        }
      }

      // Invalidate search cache
      const { cacheService } = await import('../lib/redis.js');
      await cacheService.delPattern('search:*');
      fastify.log.info('🗑️ Cleared search cache');

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