import { FastifyInstance } from 'fastify';
import { authenticateUser, ensureUser } from '../middleware/auth.js';
import { exportService } from '../services/exportService.js';
import { prisma } from '../lib/db.js';
import fs from 'fs/promises';

export default async function exportRoutes(fastify: FastifyInstance) {
  
  // Export as PDF
  fastify.post('/pdf', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const body = request.body as any;

      const { proposalId, title, content } = body;

      if (!title || !content) {
        return reply.code(400).send({
          error: 'Missing required fields: title, content',
        });
      }

      const exportRecord = await prisma.export.create({
        data: {
          userId: user.id,
          proposalId: proposalId || null,
          filename: `${title}.pdf`,
          format: 'PDF',
          status: 'PROCESSING',
        },
      });

      const filepath = await exportService.exportToPDF({
        title,
        content,
        format: 'PDF',
      });

      await prisma.export.update({
        where: { id: exportRecord.id },
        data: {
          fileUrl: filepath,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return {
        exportId: exportRecord.id,
        filename: exportRecord.filename,
        format: 'PDF',
        status: 'COMPLETED',
      };
    } catch (error) {
      fastify.log.error('PDF export error:');//,error
      return reply.code(500).send({
        error: 'Failed to export PDF',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Export as PPTX
  // Export as PPTX
fastify.post('/pptx', {
  preHandler: [authenticateUser, ensureUser]
}, async (request, reply) => {
  try {
    const user = request.user!;
    const body = request.body as any;

    const { proposalId, title, content } = body;

    fastify.log.info(`📊 PPTX Export Request - Title: ${title?.substring(0, 50)}, Content Length: ${content?.length}`);

    if (!title || !content) {
      fastify.log.warn('❌ Missing fields:');//, { title: !!title, content: !!content }
      return reply.code(400).send({
        error: 'Missing required fields: title, content',
      });
    }

    const exportRecord = await prisma.export.create({
      data: {
        userId: user.id,
        proposalId: proposalId || null,
        filename: `${title}.pptx`,
        format: 'PPTX',
        status: 'PROCESSING',
      },
    });

    fastify.log.info(`📝 Created export record: ${exportRecord.id}`);

    try {
      const filepath = await exportService.exportToPPTX({
        title,
        content,
        format: 'PPTX',
      });

      fastify.log.info(`✅ PPTX created at: ${filepath}`);

      await prisma.export.update({
        where: { id: exportRecord.id },
        data: {
          fileUrl: filepath,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      return {
        exportId: exportRecord.id,
        filename: exportRecord.filename,
        format: 'PPTX',
        status: 'COMPLETED',
      };
    } catch (serviceError) {
      fastify.log.error('❌ Export service error:', serviceError);//
      
      // Update export record to failed
      await prisma.export.update({
        where: { id: exportRecord.id },
        data: {
          status: 'FAILED',
          metadata: {
            error: serviceError instanceof Error ? serviceError.message : 'Unknown error',
          },
        },
      });

      throw serviceError;
    }
  } catch (error) {
    fastify.log.error('PPTX export error:');//, error
    return reply.code(500).send({
      error: 'Failed to export PPTX',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

  // Download export file
  fastify.get('/download/:exportId', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const { exportId } = request.params as { exportId: string };

      const exportRecord = await prisma.export.findFirst({
        where: {
          id: exportId,
          userId: user.id,
        },
      });

      if (!exportRecord || !exportRecord.fileUrl) {
        return reply.code(404).send({ error: 'Export not found' });
      }

      const stream = await fs.readFile(exportRecord.fileUrl);
      
      reply
        .header('Content-Type', exportRecord.format === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        .header('Content-Disposition', `attachment; filename="${exportRecord.filename}"`)
        .send(stream);

    } catch (error) {
      fastify.log.error('Download error:');//, error
      return reply.code(500).send({ error: 'Failed to download file' });
    }
  });
}