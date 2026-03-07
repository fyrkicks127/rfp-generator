'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [type, setType] = useState<string>('RFP');
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setUploading(true);
    setStatus('Uploading...');

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('type', type);

      // Upload file (queues job)
      const response = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setJobId(data.jobId);
      setStatus('Processing...');

      // Poll for job status
      pollJobStatus(data.jobId, token!);

    } catch (error) {
      console.error('Upload error:', error);
      setStatus('Upload failed');
      setUploading(false);
    }
  };

  const pollJobStatus = async (jobId: string, token: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/jobs/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to get job status');
        }

        const job = await response.json();
        
        setProgress(job.progress);
        
        if (job.status === 'COMPLETED') {
          clearInterval(interval);
          setStatus('Completed!');
          setUploading(false);
          
          // Redirect to documents page after 2 seconds
          setTimeout(() => {
            router.push('/documents');
          }, 2000);
        } else if (job.status === 'FAILED') {
          clearInterval(interval);
          setStatus(`Failed: ${job.error}`);
          setUploading(false);
        } else if (job.status === 'ACTIVE') {
          setStatus('Processing...');
        } else if (job.status === 'PENDING') {
          setStatus('Queued...');
        }

      } catch (error) {
        console.error('Poll error:', error);
        clearInterval(interval);
        setStatus('Error checking status');
        setUploading(false);
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Upload Document</h1>
        <p className="text-gray-600 mb-8">
          Upload RFPs, past proposals, or company profiles
        </p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={uploading}
            >
              <option value="RFP">RFP</option>
              <option value="PAST_PROPOSAL">Past Proposal</option>
              <option value="COMPANY_PROFILE">Company Profile</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={uploading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {uploading && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{status}</span>
                <span className="text-sm text-gray-600">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className={`
              w-full py-3 px-6 rounded-lg font-medium transition-colors
              ${!selectedFile || uploading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {uploading ? 'Processing...' : 'Upload Document'}
          </button>
        </div>
      </div>
    </div>
  );
}