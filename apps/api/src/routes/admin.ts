import { FastifyInstance } from 'fastify';
import { documentQueue } from '../queues/documentQueue.js';

export default async function adminRoutes(fastify: FastifyInstance) {
  
  // Simple queue stats endpoint
  fastify.get('/queue-stats', async (request, reply) => {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        documentQueue.getWaitingCount(),
        documentQueue.getActiveCount(),
        documentQueue.getCompletedCount(),
        documentQueue.getFailedCount(),
      ]);

      return {
        queue: 'document-processing',
        stats: {
          waiting,
          active,
          completed,
          failed,
          total: waiting + active + completed + failed,
        },
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get queue stats' });
    }
  });

  // List recent jobs
  fastify.get('/jobs', async (request, reply) => {
    try {
      const query = request.query as any;
      const limit = parseInt(query.limit || '10');

      const [waiting, active, completed, failed] = await Promise.all([
        documentQueue.getWaiting(0, limit),
        documentQueue.getActive(0, limit),
        documentQueue.getCompleted(0, limit),
        documentQueue.getFailed(0, limit),
      ]);

      return {
        waiting: waiting.map(j => ({ id: j.id, name: j.name, data: j.data })),
        active: active.map(j => ({ id: j.id, name: j.name, data: j.data, progress: j.progress })),
        completed: completed.map(j => ({ id: j.id, name: j.name, returnvalue: j.returnvalue })),
        failed: failed.map(j => ({ id: j.id, name: j.name, failedReason: j.failedReason })),
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get jobs' });
    }
  });
}