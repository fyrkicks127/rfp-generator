import OpenAI from 'openai';
import { searchService } from './searchService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AgentResult {
  proposal: string;
  iterations: {
    research: string;
    draft: string;
    critique: string;
    revision: string;
  };
  tokensUsed: number;
  cost: number;
  processingTime: number;
  retrievedChunks: number;
}

export class AgentService {
  /**
   * Research Agent: Finds and analyzes relevant context
   */
  async researchAgent(rfpContent: string): Promise<string> {
    console.log('🔬 Research Agent: Analyzing RFP and finding context...');

    // Search for relevant past proposals
    const searchResults = await searchService.search(rfpContent, 8);
    
    if (searchResults.length === 0) {
      return 'No relevant past proposals found. Will generate from scratch.';
    }

    // Ask AI to analyze and synthesize the context
    const contextSummary = searchResults
      .map((result, i) => `
Reference ${i + 1} (Relevance: ${(result.score * 100).toFixed(0)}%)
From: ${result.metadata.filename}
Content: ${result.content}
---`)
      .join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a research analyst. Analyze past proposals and extract key strategies, approaches, and winning elements.',
        },
        {
          role: 'user',
          content: `RFP Requirements:
${rfpContent}

Past Successful Proposals:
${contextSummary}

Analyze these proposals and provide:
1. Key approaches that worked
2. Common winning strategies
3. Important elements to include
4. Unique selling points mentioned
5. Structure and flow patterns

Be concise but comprehensive.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    return response.choices[0].message.content || 'Analysis complete.';
  }

  /**
   * Writer Agent: Creates initial draft
   */
  async writerAgent(
    rfpContent: string,
    research: string,
    companyContext?: string
  ): Promise<string> {
    console.log('✍️  Writer Agent: Creating initial draft...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert proposal writer. Write compelling, professional proposals that win business.',
        },
        {
          role: 'user',
          content: `Write a comprehensive proposal for this RFP.

RFP REQUIREMENTS:
${rfpContent}

${companyContext ? `COMPANY CONTEXT:\n${companyContext}\n\n` : ''}

RESEARCH INSIGHTS:
${research}

Write a complete proposal with these sections:
1. Executive Summary
2. Understanding of Requirements
3. Proposed Solution & Approach
4. Timeline & Deliverables
5. Team & Qualifications
6. Why Choose Us
7. Next Steps

Make it persuasive, specific, and professional. Use insights from the research but write in your own voice.`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Critic Agent: Reviews and provides feedback
   */
  async criticAgent(rfpContent: string, draft: string): Promise<string> {
    console.log('🔍 Critic Agent: Reviewing draft...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a proposal review expert. Identify gaps, weaknesses, and areas for improvement.',
        },
        {
          role: 'user',
          content: `RFP REQUIREMENTS:
${rfpContent}

DRAFT PROPOSAL:
${draft}

Review this proposal and provide:

STRENGTHS:
- What works well
- Strong points to keep

WEAKNESSES:
- Missing requirements
- Vague sections
- Areas lacking detail

SPECIFIC IMPROVEMENTS:
1. [Improvement 1]
2. [Improvement 2]
3. [Improvement 3]

Be constructive and specific.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.4,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Writer Agent (Revision): Improves draft based on critique
   */
  async revisionAgent(
    rfpContent: string,
    draft: string,
    critique: string
  ): Promise<string> {
    console.log('📝 Writer Agent: Revising based on feedback...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert proposal writer. Revise proposals based on feedback to make them stronger.',
        },
        {
          role: 'user',
          content: `RFP REQUIREMENTS:
${rfpContent}

ORIGINAL DRAFT:
${draft}

REVIEWER FEEDBACK:
${critique}

Revise the proposal to address all feedback. Improve weak sections, add missing details, and make it more compelling. Keep what works well.

Output the complete revised proposal.`,
        },
      ],
      max_tokens: 3500,
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Orchestrator: Runs the full multi-agent pipeline
   */
  async generateWithAgents(
    rfpContent: string,
    companyContext?: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    let totalTokens = 0;

    try {
      // Step 1: Research
      const research = await this.researchAgent(rfpContent);
      const searchResults = await searchService.search(rfpContent, 8);
      
      // Step 2: Initial Draft
      const draft = await this.writerAgent(rfpContent, research, companyContext);
      
      // Step 3: Critique
      const critique = await this.criticAgent(rfpContent, draft);
      
      // Step 4: Revision
      const finalProposal = await this.revisionAgent(rfpContent, draft, critique);

      const processingTime = Date.now() - startTime;

      // Estimate tokens and cost (approximate)
      const estimatedTokens = 
        (research.length + draft.length + critique.length + finalProposal.length) / 4;
      totalTokens = Math.floor(estimatedTokens);
      
      // Cost calculation (approximate)
      const inputCost = (totalTokens * 0.6) / 1000000 * 2.5;
      const outputCost = (totalTokens * 0.4) / 1000000 * 10;
      const totalCost = inputCost + outputCost;

      return {
        proposal: finalProposal,
        iterations: {
          research,
          draft,
          critique,
          revision: finalProposal,
        },
        tokensUsed: totalTokens,
        cost: totalCost,
        processingTime,
        retrievedChunks: searchResults.length,
      };

    } catch (error) {
      console.error('Multi-agent error:', error);
      throw error;
    }
  }

  /**
   * Compare single-agent vs multi-agent
   */
  async compareApproaches(
    rfpContent: string,
    companyContext?: string
  ): Promise<{
    singleAgent: { proposal: string; time: number; tokens: number };
    multiAgent: AgentResult;
  }> {
    console.log('🔬 Running comparison: Single-Agent vs Multi-Agent...');

    // Single-agent approach (simple)
    const singleStart = Date.now();
    const singleResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Write a proposal for this RFP:\n\n${rfpContent}${companyContext ? `\n\nCompany: ${companyContext}` : ''}`,
        },
      ],
      max_tokens: 2000,
    });
    const singleTime = Date.now() - singleStart;
    const singleProposal = singleResponse.choices[0].message.content || '';
    const singleTokens = singleResponse.usage?.total_tokens || 0;

    // Multi-agent approach
    const multiAgent = await this.generateWithAgents(rfpContent, companyContext);

    return {
      singleAgent: {
        proposal: singleProposal,
        time: singleTime,
        tokens: singleTokens,
      },
      multiAgent,
    };
  }
}

// Export singleton
export const agentService = new AgentService();