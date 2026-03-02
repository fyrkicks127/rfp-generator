import { FastifyInstance } from 'fastify';
import { agentService } from '../services/agentService.js';
import { prisma } from '../lib/db.js';
import { authenticateUser, ensureUser } from '../middleware/auth.js';

export default async function agentsRoutes(fastify: FastifyInstance) {
  
  // Multi-agent generation
  fastify.post('/generate', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!;
      const body = request.body as any;

      if (!body.rfpContent) {
        return reply.code(400).send({ error: 'rfpContent is required' });
      }

      fastify.log.info('🤖 Starting multi-agent generation...');

      const result = await agentService.generateWithAgents(
        body.rfpContent,
        user.id,
        body.companyContext
      );

      fastify.log.info(`✅ Multi-agent complete in ${result.processingTime}ms`);
      fastify.log.info(`📊 Used ${result.tokensUsed} tokens, cost: $${result.cost.toFixed(4)}`);

      

      let proposalId = null;
      if (user) {
        const proposal = await prisma.proposal.create({
          data: {
            userId: user.id,
            title: `Multi-Agent Proposal - ${new Date().toLocaleDateString()}`,
            content: result.proposal,
            status: 'DRAFT',
            metadata: {
              approach: 'multi-agent',
              tokensUsed: result.tokensUsed,
              cost: result.cost,
              processingTime: result.processingTime,
              retrievedChunks: result.retrievedChunks,
              iterations: {
                researchLength: result.iterations.research.length,
                draftLength: result.iterations.draft.length,
                critiqueLength: result.iterations.critique.length,
              },
            },
          },
        });
        proposalId = proposal.id;
      }

      return {
        success: true,
        proposal: result.proposal,
        iterations: result.iterations,
        metadata: {
          proposalId,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
          processingTime: result.processingTime,
          retrievedChunks: result.retrievedChunks,
        },
      };

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Multi-agent generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Compare single vs multi-agent
  fastify.post('/compare', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const body = request.body as any;
      const user = request.user!;
      if (!body.rfpContent) {
        return reply.code(400).send({ error: 'rfpContent is required' });
      }

      fastify.log.info('🔬 Comparing single-agent vs multi-agent...');

      const comparison = await agentService.compareApproaches(
        body.rfpContent,
        user.id,
        body.companyContext,
      );

      return {
        success: true,
        comparison: {
          singleAgent: {
            proposal: comparison.singleAgent.proposal,
            processingTime: comparison.singleAgent.time,
            tokensUsed: comparison.singleAgent.tokens,
          },
          multiAgent: {
            proposal: comparison.multiAgent.proposal,
            processingTime: comparison.multiAgent.processingTime,
            tokensUsed: comparison.multiAgent.tokensUsed,
            cost: comparison.multiAgent.cost,
            retrievedChunks: comparison.multiAgent.retrievedChunks,
          },
          winner: comparison.multiAgent.proposal.length > comparison.singleAgent.proposal.length
            ? 'Multi-Agent (more comprehensive)'
            : 'Single-Agent',
        },
      };

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Comparison failed',
      });
    }
  });
}