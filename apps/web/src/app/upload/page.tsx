'use client';

import { useState } from 'react';

type DocumentType = 'RFP' | 'PAST_PROPOSAL' | 'COMPANY_PROFILE' | 'OTHER';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<DocumentType>('RFP');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const response = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Upload Document</h1>
        <p className="text-gray-600 mb-8">
          Upload RFPs, past proposals, or company profiles
        </p>

        {/* Upload Form */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* File Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="RFP">RFP (Request for Proposal)</option>
              <option value="PAST_PROPOSAL">Past Proposal</option>
              <option value="COMPANY_PROFILE">Company Profile</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer"
              >
                <div className="text-gray-600">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-blue-600">
                      Click to upload
                    </span>{' '}
                    or drag and drop
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    PDF, DOCX, DOC, or TXT (max 10MB)
                  </p>
                </div>
              </label>

              {file && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    {file.name}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="text-red-800 font-semibold mb-1">Upload Failed</h3>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Success Display */}
        {result && (
          <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-green-800 font-semibold mb-3 flex items-center">
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Upload Successful
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-gray-700 mb-1">Document Info</p>
                <p className="text-gray-600">ID: {result.document.id.slice(0, 8)}...</p>
                <p className="text-gray-600">File: {result.document.filename}</p>
                <p className="text-gray-600">Type: {result.document.type}</p>
              </div>
              <div>
                <p className="font-medium text-gray-700 mb-1">Processing Results</p>
                <p className="text-gray-600">Size: {(result.document.size / 1024).toFixed(2)} KB</p>
                <p className="text-gray-600">Words: {result.document.wordCount?.toLocaleString() || 'N/A'}</p>
                <p className="text-gray-600">Chunks: {result.document.chunkCount || 0}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}