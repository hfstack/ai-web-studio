'use client';

import { useState, useEffect } from 'react';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  lastModified: Date;
  canRead: boolean;
}

interface FolderSelectorProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  className?: string;
}

export default function FolderSelector({ value, onChange, placeholder = "Select a folder", className = "" }: FolderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [contents, setContents] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/browse-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPath: path }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setContents(data.contents);
        setCurrentPath(data.currentPath);
      } else {
        setError(data.error || 'Failed to load directory');
      }
    } catch (error) {
      setError('Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderSelect = (path: string) => {
    onChange(path);
    setIsOpen(false);
  };

  const handleNavigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parentPath);
  };

  const handleDirectoryClick = (item: FileItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(currentPath);
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      {/* Input field */}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded"
          title="Browse folders"
        >
          📁
        </button>
      </div>

      {/* Folder browser modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Select Folder</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            {/* Current path */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleNavigateUp}
                className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-sm"
                disabled={currentPath === '/'}
              >
                ↑
              </button>
              <span className="text-sm text-gray-400 truncate">{currentPath}</span>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="h-96 flex items-center justify-center border border-gray-600 rounded">
                <div className="text-gray-400">Loading...</div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="h-96 flex items-center justify-center border border-gray-600 rounded">
                <div className="text-red-400">{error}</div>
              </div>
            )}

            {/* Directory contents */}
            {!loading && !error && (
              <div className="h-96 overflow-auto border border-gray-600 rounded">
                <table className="w-full text-sm">
                  <thead className="bg-gray-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Size</th>
                      <th className="px-3 py-2 text-left">Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.map((item, index) => (
                      <tr
                        key={index}
                        className={`border-t border-gray-700 hover:bg-gray-700 cursor-pointer ${
                          item.isDirectory ? 'text-blue-400' : 'text-gray-300'
                        }`}
                        onClick={() => item.isDirectory ? handleDirectoryClick(item) : handleFolderSelect(item.path)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {item.isDirectory ? '📁' : '📄'}
                            <span className="truncate">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {item.isDirectory ? 'Folder' : 'File'}
                        </td>
                        <td className="px-3 py-2">
                          {item.isDirectory ? '-' : `${Math.round(item.size / 1024)} KB`}
                        </td>
                        <td className="px-3 py-2">
                          {new Date(item.lastModified).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFolderSelect(currentPath)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded"
              >
                Select Current Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}