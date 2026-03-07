'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';

export default function AgentsPage() {
  const [rfpContent, setRfpContent] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'final' | 'research' | 'draft' | 'critique'>('final');

  const handleGenerate = async () => {
  const { getToken } = useAuth();
    if (!rfpContent.trim()) {
      alert('Please enter RFP content');
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const token = await getToken();
      const response = await fetch('http://localhost:3001/api/agents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          rfpContent,
          companyContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setResult(data);

    } catch (error) {
      console.error('Generation error:', error);
      alert('Failed to generate: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🤖 Multi-Agent Proposal Generator</h1>
          <p className="text-gray-600">
            Four AI agents work together: Research → Write → Critique → Revise
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
                placeholder="Paste your RFP..."
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4">Company Context (Optional)</h2>
              <textarea
                value={companyContext}
                onChange={(e) => setCompanyContext(e.target.value)}
                placeholder="Company background..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating || !rfpContent.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-lg font-semibold text-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all"
            >
              {generating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Agents Working... (30-60s)
                </span>
              ) : (
                '🤖 Generate with Multi-Agent System'
              )}
            </button>

            {generating && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 mb-2">🔬 Research Agent: Finding context...</p>
                <p className="text-sm text-blue-800 mb-2">✍️ Writer Agent: Creating draft...</p>
                <p className="text-sm text-blue-800 mb-2">🔍 Critic Agent: Reviewing quality...</p>
                <p className="text-sm text-blue-800">📝 Writer Agent: Revising...</p>
              </div>
            )}
          </div>

          {/* Output Section */}
          <div className="space-y-6">
            {result && (
              <>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold mb-4">Stats</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Processing Time</p>
                      <p className="font-semibold">{(result.metadata.processingTime / 1000).toFixed(1)}s</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Tokens Used</p>
                      <p className="font-semibold">{result.metadata.tokensUsed?.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Cost</p>
                      <p className="font-semibold">${result.metadata.cost?.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Context Used</p>
                      <p className="font-semibold">{result.metadata.retrievedChunks} chunks</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex gap-2 mb-4 border-b">
                    <button
                      onClick={() => setActiveTab('final')}
                      className={`px-4 py-2 font-medium ${activeTab === 'final' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    >
                      Final Proposal
                    </button>
                    <button
                      onClick={() => setActiveTab('research')}
                      className={`px-4 py-2 font-medium ${activeTab === 'research' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    >
                      Research
                    </button>
                    <button
                      onClick={() => setActiveTab('draft')}
                      className={`px-4 py-2 font-medium ${activeTab === 'draft' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    >
                      Initial Draft
                    </button>
                    <button
                      onClick={() => setActiveTab('critique')}
                      className={`px-4 py-2 font-medium ${activeTab === 'critique' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    >
                      Critique
                    </button>
                  </div>

                  <div className="prose max-w-none">
                    {activeTab === 'final' && (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
                        {result.proposal}
                      </pre>
                    )}
                    {activeTab === 'research' && (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
                        {result.iterations.research}
                      </pre>
                    )}
                    {activeTab === 'draft' && (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
                        {result.iterations.draft}
                      </pre>
                    )}
                    {activeTab === 'critique' && (
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 font-sans">
                        {result.iterations.critique}
                      </pre>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      const text = activeTab === 'final' ? result.proposal : result.iterations[activeTab];
                      navigator.clipboard.writeText(text);
                    }}
                    className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                  >
                    📋 Copy
                  </button>
                </div>
              </>
            )}

            {!result && !generating && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <div className="text-6xl mb-4">🤖🤖🤖</div>
                <p className="text-gray-600 mb-2">
                  Multi-agent proposal will appear here
                </p>
                <p className="text-sm text-gray-500">
                  Takes 30-60 seconds (4 AI agents collaborating)
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <Link
            href="/generate"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            ← Single Agent
          </Link>
          <Link
            href="/search"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            🔍 Search
          </Link>
        </div>
      </div>
    </div>
  );
}