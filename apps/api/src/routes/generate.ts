import { FastifyInstance } from 'fastify';
import { generationService } from '../services/generationService.ts';
import { prisma } from '../lib/db.js';
import { z } from 'zod';
import { authenticateUser, ensureUser } from '../middleware/auth.js';

const generateSchema = z.object({
  rfpContent: z.string().min(10, 'RFP content too short'),
  rfpDocumentId: z.string().optional(),
  companyContext: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'technical']).optional(),
  provider: z.enum(['claude', 'openai']).optional(),
  saveProposal: z.boolean().optional(),
});

export default async function generateRoutes(fastify: FastifyInstance) {
  
  // Generate proposal with RAG
  fastify.post('/proposal', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const user = request.user!; // ← Get user
      const body = request.body as any;
      
      const validated = generateSchema.parse({
        rfpContent: body.rfpContent,
        rfpDocumentId: body.rfpDocumentId,
        companyContext: body.companyContext,
        tone: body.tone || 'professional',
        provider: body.provider || 'claude',
        saveProposal: body.saveProposal !== false, // Default true
      });

      fastify.log.info('🚀 Starting proposal generation...');

      // Generate proposal
      const result = await generationService.generateProposal(
        {
          rfpContent: validated.rfpContent,
          companyContext: validated.companyContext,
          tone: validated.tone,
        },
        user.id,
        validated.provider
      );

      fastify.log.info(`✅ Generated ${result.tokensUsed} tokens in ${result.processingTime}ms`);
      fastify.log.info(`💰 Cost: $${result.cost.toFixed(4)}`);

      // Save to database if requested
      let proposalId = null;
      if (validated.saveProposal) {
        // Get test user
        const user = await prisma.user.findFirst({
          where: { email: 'test@example.com' }
        });

        if (user) {
          const proposal = await prisma.proposal.create({
            data: {
              userId: user.id,
              title: `Generated Proposal - ${new Date().toLocaleDateString()}`,
              content: result.proposal,
              status: 'DRAFT',
              rfpId: validated.rfpDocumentId,
              metadata: {
                model: result.model,
                tokensUsed: result.tokensUsed,
                cost: result.cost,
                retrievedChunks: result.retrievedChunks,
                processingTime: result.processingTime,
                generatedAt: new Date().toISOString(),
              },
            },
          });

          proposalId = proposal.id;
          fastify.log.info(`💾 Saved proposal: ${proposalId}`);
        }
      }

      return {
        success: true,
        proposal: result.proposal,
        metadata: {
          proposalId,
          model: result.model,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
          retrievedChunks: result.retrievedChunks,
          processingTime: result.processingTime,
        },
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors,
        });
      }

      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Generate from uploaded document
  fastify.post('/from-document/:documentId', {
    preHandler: [authenticateUser, ensureUser]
  }, async (request, reply) => {
    try {
      const { documentId } = request.params as { documentId: string };
      const body = request.body as any;
      const user = request.user!; // ← Get user
      // Get document
      const document = await prisma.document.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      // Generate using document content
      const result = await generationService.generateProposal(
        {
          rfpContent: document.content,
          companyContext: body.companyContext,
          tone: body.tone || 'professional',
        },
        user.id,
        body.provider || 'claude'
      );

      
      let proposalId = null;
      if (user) {
        const proposal = await prisma.proposal.create({
          data: {
            userId: user.id,
            title: `Proposal for ${document.filename}`,
            content: result.proposal,
            status: 'DRAFT',
            rfpId: documentId,
            metadata: {
              model: result.model,
              tokensUsed: result.tokensUsed,
              cost: result.cost,
              retrievedChunks: result.retrievedChunks,
              processingTime: result.processingTime,
            },
          },
        });
        proposalId = proposal.id;
      }

      return {
        success: true,
        proposal: result.proposal,
        metadata: {
          proposalId,
          documentId,
          filename: document.filename,
          model: result.model,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
          retrievedChunks: result.retrievedChunks,
          processingTime: result.processingTime,
        },
      };

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Generation failed',
      });
    }
  });

  // Compare RAG vs No-RAG
  fastify.post('/compare',{
    preHandler: [authenticateUser, ensureUser]
  },  async (request, reply) => {
    try {
      const body = request.body as any;
    const user = request.user!; // ← Get user
      if (!body.rfpContent) {
        return reply.code(400).send({ error: 'rfpContent is required' });
      }

      fastify.log.info('🔬 Comparing RAG vs No-RAG...');

      // Generate both
      const [withRAG, withoutRAG] = await Promise.all([
        generationService.generateProposal({
          rfpContent: body.rfpContent,
        },
          user.id),
        generationService.generateWithoutRAG(body.rfpContent),
      ]);

      return {
        withRAG: {
          proposal: withRAG.proposal,
          retrievedChunks: withRAG.retrievedChunks,
          tokensUsed: withRAG.tokensUsed,
          cost: withRAG.cost,
        },
        withoutRAG: {
          proposal: withoutRAG.proposal,
          retrievedChunks: withoutRAG.retrievedChunks,
          tokensUsed: withoutRAG.tokensUsed,
          cost: withoutRAG.cost,
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