'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: {
    filename: string;
    type: string;
    position: number;
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setSearched(false);

    try {
      const response = await fetch('http://localhost:3001/api/search/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 10,
        }),
      });

      const data = await response.json();
      setResults(data.results || []);
      setSearched(true);
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Highly Relevant';
    if (score >= 0.6) return 'Relevant';
    return 'Somewhat Relevant';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Semantic Search</h1>
          <p className="text-gray-600">
            Search your documents by meaning, not just keywords
          </p>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for cloud migration, security, data analytics..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Quick searches */}
          <div className="mt-4 flex gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Try:</span>
            {['cloud migration', 'security audit', 'data analytics', 'AWS services'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuery(suggestion);
                  setTimeout(() => handleSearch(), 100);
                }}
                className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {searched && (
          <div className="mb-4">
            <p className="text-gray-600">
              Found <strong>{results.length}</strong> results
              {query && ` for "${query}"`}
            </p>
          </div>
        )}

        {results.length === 0 && searched && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-600">No results found. Try a different search term.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={result.chunkId}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <Link
                      href={`/documents/${result.documentId}`}
                      className="text-lg font-semibold text-blue-600 hover:underline"
                    >
                      {result.metadata.filename}
                    </Link>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {result.metadata.type}
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                        Section {result.metadata.position + 1}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getScoreColor(result.score)}`}>
                      {(result.score * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {getScoreLabel(result.score)}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <p className="text-gray-700 leading-relaxed">
                  {result.content.length > 300
                    ? result.content.slice(0, 300) + '...'
                    : result.content}
                </p>

                {/* Footer */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    Result {index + 1} of {results.length}
                  </span>
                  <Link
                    href={`/documents/${result.documentId}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View full document →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}