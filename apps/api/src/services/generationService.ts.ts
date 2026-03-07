import OpenAI from 'openai';
import { searchService } from './searchService.js';


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GenerationRequest {
  rfpContent: string;
  companyContext?: string;
  tone?: 'professional' | 'friendly' | 'technical';
  maxLength?: number;
}

export interface GenerationResult {
  proposal: string;
  model: string;
  tokensUsed: number;
  cost: number;
  retrievedChunks: number;
  processingTime: number;
}

export class GenerationService {
  /**
   * Generate proposal using RAG
   */
  async generateProposal(
    request: GenerationRequest,
    userId: string,
    provider: 'claude' | 'openai' = 'openai'
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Search for relevant past proposals
      console.log('🔍 Searching for relevant context...');
      const searchResults = await searchService.search(
        request.rfpContent,
        5, // Top 5 most relevant chunks
        userId
       // 'PAST_PROPOSAL' // Only search past proposals
      );

      console.log(`📚 Found ${searchResults.length} relevant chunks`);

      // Step 2: Build context from search results
      const context = this.buildContext(searchResults);

      // Step 3: Create prompt
      const prompt = this.buildPrompt(
        request.rfpContent,
        context,
        request.companyContext,
        request.tone
      );

      // Step 4: Generate with selected provider
      let result: GenerationResult;
      result = await this.generateWithOpenAI(prompt, searchResults.length);

      // Add processing time
      result.processingTime = Date.now() - startTime;

      return result;

    } catch (error) {
      console.error('Generation error:', error);
      throw new Error(`Failed to generate proposal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build context from search results
   */
  private buildContext(searchResults: any[]): string {
    if (searchResults.length === 0) {
      return 'No relevant past proposals found.';
    }

    let context = 'Here are relevant sections from past successful proposals:\n\n';

    searchResults.forEach((result, index) => {
      context += `--- Reference ${index + 1} (Relevance: ${(result.score * 100).toFixed(0)}%) ---\n`;
      context += `From: ${result.metadata.filename}\n`;
      context += `Content: ${result.content}\n\n`;
    });

    return context;
  }

  /**
   * Build the main prompt
   */
  private buildPrompt(
    rfpContent: string,
    context: string,
    companyContext?: string,
    tone: string = 'professional'
  ): string {
    return `You are an expert proposal writer. Your task is to write a compelling proposal response to the following RFP.

${companyContext ? `COMPANY CONTEXT:\n${companyContext}\n\n` : ''}

RFP REQUIREMENTS:
${rfpContent}

${context}

INSTRUCTIONS:
- Write a professional, persuasive proposal
- Address all requirements mentioned in the RFP
- Use insights from the reference proposals above, but write in your own words
- Structure the proposal with clear sections:
  1. Executive Summary
  2. Understanding of Requirements
  3. Proposed Solution/Approach
  4. Timeline
  5. Qualifications
  6. Why Choose Us
- Tone: ${tone}
- Be specific and concrete
- Highlight unique value propositions
- Keep it concise but comprehensive

Generate the proposal now:`;
  }

  
  /**
   * Generate using OpenAI GPT-4
   */
  private async generateWithOpenAI(
    prompt: string,
    retrievedChunks: number
  ): Promise<GenerationResult> {
    console.log('🤖 Generating with GPT-4o...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert proposal writer with years of experience writing winning RFP responses.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4000,
      temperature: 0.7,
    });

    const proposal = response.choices[0].message.content || '';

    // Calculate cost (approximate)
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens / 1000000) * 2.5 + (outputTokens / 1000000) * 10;

    return {
      proposal,
      model: 'gpt-4o',
      tokensUsed: inputTokens + outputTokens,
      cost,
      retrievedChunks,
      processingTime: 0,
    };
  }

  /**
   * Quick generation without RAG (for comparison)
   */
  async generateWithoutRAG(
    rfpContent: string,
    //provider: 'openai' | 'openai'
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    const prompt = `You are an expert proposal writer. Write a proposal response to this RFP:

${rfpContent}

Generate a professional proposal with:
1. Executive Summary
2. Understanding of Requirements
3. Proposed Solution
4. Timeline
5. Why Choose Us`;

    let result: GenerationResult;
    
    result = await this.generateWithOpenAI(prompt, 0);
    

    result.processingTime = Date.now() - startTime;
    return result;
  }
}

// Export singleton
export const generationService = new GenerationService();