import { FastifyInstance } from 'fastify';
import { authenticateUser, ensureUser } from '../middleware/auth.js';
import { prisma } from '../lib/db.js';
import { documentQueue } from '../queues/documentQueue.js';

export default async function jobsRoutes(fastify: FastifyInstance) {
  
  // Get job status
  fastify.get('/:jobId', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const user = request.user!;

      // Get job from database
      const job = await prisma.job.findFirst({
        where: {
          id: jobId,
          userId: user.id, // Security: only user's jobs
        },
      });

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      // Get additional info from BullMQ if job is active
      let bullJob = null;
      if (job.status === 'ACTIVE' || job.status === 'PENDING') {
        try {
          bullJob = await documentQueue.getJob(jobId);
        } catch (err) {
          fastify.log.warn('Could not fetch BullMQ job:');//, err
        }
      }

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        data: job.data,
        result: job.result,
        error: job.error,
        attempts: job.attempts,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        bullmq: bullJob ? {
          progress: bullJob.progress,
          returnvalue: bullJob.returnvalue,
        } : null,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to get job status' });
    }
  });

  // List user's jobs
  fastify.get('/', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const query = request.query as any;

      const status = query.status; // Filter by status
      const limit = parseInt(query.limit || '20');
      const offset = parseInt(query.offset || '0');

      const where: any = { userId: user.id };
      if (status) {
        where.status = status;
      }

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.job.count({ where }),
      ]);

      return {
        jobs,
        total,
        limit,
        offset,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to list jobs' });
    }
  });

  // Cancel a job
  fastify.post('/:jobId/cancel', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const user = request.user!;

      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: user.id },
      });

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      if (job.status === 'COMPLETED' || job.status === 'FAILED') {
        return reply.code(400).send({ 
          error: 'Cannot cancel completed or failed job' 
        });
      }

      // Remove from BullMQ queue
      const bullJob = await documentQueue.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
      }

      // Update in database
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
        },
      });

      return { message: 'Job cancelled successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to cancel job' });
    }
  });

  // Retry a failed job
  fastify.post('/:jobId/retry', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const user = request.user!;

      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: user.id },
      });

      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      if (job.status !== 'FAILED') {
        return reply.code(400).send({ 
          error: 'Only failed jobs can be retried' 
        });
      }

      // Reset job status
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'PENDING',
          error: null,
          progress: 0,
        },
      });

      // Re-add to queue
      const jobData = job.data as any;
      await documentQueue.add('process-document', jobData, {
        jobId: job.id,
      });

      return { message: 'Job queued for retry' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to retry job' });
    }
  });
}