'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Chunk {
  id: string;
  content: string;
  position: number;
  metadata: any;
}

interface Document {
  id: string;
  filename: string;
  type: string;
  content: string;
  createdAt: string;
  metadata: any;
  chunks: Chunk[];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchDocument(params.id as string);
    }
  }, [params.id]);

  const fetchDocument = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/documents/${id}`);
      
      if (!response.ok) {
        throw new Error('Document not found');
      }
      
      const data = await response.json();
      setDocument(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-600">{error || 'Document not found'}</p>
            <Link href="/documents" className="text-blue-600 hover:underline mt-2 inline-block">
              ← Back to documents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/documents" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to documents
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <h1 className="text-3xl font-bold mb-4">
            {document.filename}
          </h1>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Type</p>
              <p className="font-medium">{document.type}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Word Count</p>
              <p className="font-medium">{document.metadata?.wordCount?.toLocaleString() || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Chunks</p>
              <p className="font-medium">{document.chunks.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Uploaded</p>
              <p className="font-medium">{new Date(document.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-3">Preview</h2>
            <div className="bg-gray-50 rounded p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {document.metadata?.preview || document.content.slice(0, 500) + '...'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-bold mb-4">
            Chunks ({document.chunks.length})
          </h2>
          <p className="text-gray-600 mb-6">
            Document broken into chunks for AI processing
          </p>

          <div className="space-y-4">
            {document.chunks.map((chunk) => (
              <div key={chunk.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Chunk {chunk.position + 1}
                  </span>
                  <span className="text-xs text-gray-500">
                    {chunk.metadata?.wordCount || 0} words
                  </span>
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {chunk.content.slice(0, 300)}
                  {chunk.content.length > 300 ? '...' : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}