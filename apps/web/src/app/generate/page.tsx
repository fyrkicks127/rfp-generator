'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

export default function GeneratePage() {
  const [rfpContent, setRfpContent] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [proposal, setProposal] = useState('');
  const [metadata, setMetadata] = useState<any>(null);

  const handleGenerate = async () => {
  const { getToken } = useAuth();
    if (!rfpContent.trim()) {
      alert('Please enter RFP content');
      return;
    }

    setGenerating(true);
    setProposal('');
    setMetadata(null);

    try {
      const token = await getToken();
      const response = await fetch('http://localhost:3001/api/generate/proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          rfpContent,
          companyContext,
          tone: 'professional',
          provider: 'claude',
          saveProposal: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setProposal(data.proposal);
      setMetadata(data.metadata);

    } catch (error) {
      console.error('Generation error:', error);
      alert('Failed to generate proposal: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Proposal Generator</h1>
          <p className="text-gray-600">
            Paste your RFP content and let AI generate a professional proposal
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">RFP Content</h2>
              <textarea
                value={rfpContent}
                onChange={(e) => setRfpContent(e.target.value)}
                placeholder="Paste your RFP content here...&#10;&#10;Example:&#10;We need cloud migration services to move our infrastructure to AWS.&#10;Timeline: 6 months&#10;Budget: $500,000&#10;Requirements: Migration planning, implementation, training, support"
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Company Context (Optional)</h2>
              <textarea
                value={companyContext}
                onChange={(e) => setCompanyContext(e.target.value)}
                placeholder="Add context about your company...&#10;&#10;Example:&#10;We are TechCorp, a leading cloud consulting firm with 10 years of AWS experience. We've successfully migrated over 100 enterprise applications."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !rfpContent.trim()}
              className="w-full bg-blue-600 text-white px-6 py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Proposal...
                </span>
              ) : (
                '🤖 Generate Proposal with AI'
              )}
            </button>
          </div>

          {/* Output Section */}
          <div className="space-y-6">
            {metadata && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Generation Stats</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Model</p>
                    <p className="font-semibold">{metadata.model?.split('-')[1] || 'Claude'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Processing Time</p>
                    <p className="font-semibold">{(metadata.processingTime / 1000).toFixed(1)}s</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Tokens Used</p>
                    <p className="font-semibold">{metadata.tokensUsed?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Cost</p>
                    <p className="font-semibold">${metadata.cost?.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Retrieved Chunks</p>
                    <p className="font-semibold">{metadata.retrievedChunks}</p>
                  </div>
                  {metadata.proposalId && (
                    <div>
                      <p className="text-sm text-gray-600">Saved</p>
                      <p className="font-semibold text-green-600">✓ Yes</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {proposal && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Generated Proposal</h2>
                  <button
                    onClick={() => navigator.clipboard.writeText(proposal)}
                    className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
                    {proposal}
                  </pre>
                </div>
              </div>
            )}

            {!proposal && !generating && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <div className="text-6xl mb-4">🤖</div>
                <p className="text-gray-600">
                  Generated proposal will appear here
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 flex gap-4">
          <Link
            href="/documents"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            ← View Documents
          </Link>
          <Link
            href="/search"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            🔍 Search Documents
          </Link>
        </div>
      </div>
    </div>
  );
}