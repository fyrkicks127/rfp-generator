import { FastifyInstance } from 'fastify';
import { authenticateUser, ensureUser } from '../middleware/auth.js';
import { exportService } from '../services/exportService.js';
import { prisma } from '../lib/db.js';
import fs from 'fs/promises';

export default async function exportRoutes(fastify: FastifyInstance) {
  
  // Export proposal as PDF
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

      fastify.log.info(`📄 Exporting PDF for user ${user.id}`);

      // Create export record
      const exportRecord = await prisma.export.create({
        data: {
          userId: user.id,
          proposalId: proposalId || null,
          filename: `${title}.pdf`,
          format: 'PDF',
          status: 'PROCESSING',
        },
      });

      // Generate PDF
      const filepath = await exportService.exportToPDF({
        title,
        content,
        format: 'PDF',
      });

      // Update export record
      await prisma.export.update({
        where: { id: exportRecord.id },
        data: {
          fileUrl: filepath,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      fastify.log.info(`✅ PDF exported: ${filepath}`);

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

  // Export proposal as PPTX
  fastify.post('/pptx', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const body = request.body as any;

      const { proposalId, title, content, template = 'default' } = body;

      if (!title || !content) {
        return reply.code(400).send({
          error: 'Missing required fields: title, content',
        });
      }

      fastify.log.info(`📊 Exporting PPTX for user ${user.id}`);

      // Create export record
      const exportRecord = await prisma.export.create({
        data: {
          userId: user.id,
          proposalId: proposalId || null,
          filename: `${title}.pptx`,
          format: 'PPTX',
          status: 'PROCESSING',
          metadata: { template },
        },
      });

      // Generate PPTX
      const filepath = await exportService.exportToPPTX({
        title,
        content,
        format: 'PPTX',
        template,
      });

      // Update export record
      await prisma.export.update({
        where: { id: exportRecord.id },
        data: {
          fileUrl: filepath,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      fastify.log.info(`✅ PPTX exported: ${filepath}`);

      return {
        exportId: exportRecord.id,
        filename: exportRecord.filename,
        format: 'PPTX',
        status: 'COMPLETED',
      };
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

      // Get export record
      const exportRecord = await prisma.export.findFirst({
        where: {
          id: exportId,
          userId: user.id, // Security: only user's exports
        },
      });

      if (!exportRecord || !exportRecord.fileUrl) {
        return reply.code(404).send({
          error: 'Export not found',
        });
      }

      // Send file
      const stream = await fs.readFile(exportRecord.fileUrl);
      
      reply
        .header('Content-Type', exportRecord.format === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        .header('Content-Disposition', `attachment; filename="${exportRecord.filename}"`)
        .send(stream);

    } catch (error) {
      fastify.log.error('Download error:');//, error
      return reply.code(500).send({
        error: 'Failed to download file',
      });
    }
  });

  // List user's exports
  fastify.get('/history', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;

      const exports = await prisma.export.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          filename: true,
          format: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      });

      return {
        exports,
        total: exports.length,
      };
    } catch (error) {
      fastify.log.error('Export history error:');//, error
      return reply.code(500).send({
        error: 'Failed to get export history',
      });
    }
  });
}