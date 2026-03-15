'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId?: string;
  title: string;
  content: string;
}

export default function ExportModal({
  isOpen,
  onClose,
  proposalId,
  title,
  content,
}: ExportModalProps) {
  const { getToken } = useAuth();
  const [format, setFormat] = useState<'PDF' | 'PPTX'>('PDF');
  const [template, setTemplate] = useState('default');
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setExporting(true);

    try {
      const token = await getToken();
      const endpoint = format === 'PDF' ? '/api/export/pdf' : '/api/export/pptx';

      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          proposalId,
          title,
          content,
          template: format === 'PPTX' ? template : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const data = await response.json();

      // Download file
      const downloadResponse = await fetch(
        `http://localhost:3001/api/export/download/${data.exportId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!downloadResponse.ok) {
        throw new Error('Download failed');
      }

      // Create download link
      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert(`✅ ${format} exported successfully!`);
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6">Export Proposal</h2>

        {/* Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Export Format
          </label>
          <div className="flex space-x-4">
            <button
              onClick={() => setFormat('PDF')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                format === 'PDF'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              📄 PDF
            </button>
            <button
              onClick={() => setFormat('PPTX')}
              className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                format === 'PPTX'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              📊 PowerPoint
            </button>
          </div>
        </div>

        {/* Template Selection (PPTX only) */}
        {format === 'PPTX' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="default">Default</option>
              <option value="modern">Modern</option>
              <option value="professional">Professional</option>
            </select>
          </div>
        )}

        {/* Filename Preview */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Filename:</p>
          <p className="font-medium text-gray-900 truncate">
            {title}.{format.toLowerCase()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex space-x-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${
              exporting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {exporting ? 'Exporting...' : `Export as ${format}`}
          </button>
        </div>
      </div>
    </div>
  );
}