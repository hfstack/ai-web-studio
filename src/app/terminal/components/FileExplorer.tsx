'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

type FileSystemItem = {
  name: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
};

export default function FileExplorer({ 
  onFileSelect 
}: { 
  onFileSelect: (path: string) => void 
}) {
  const searchParams = useSearchParams();
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectId = searchParams.get('projectId');

  const fetchDirectory = async (path: string = '') => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      console.log('fetchDirectory', projectId, path);
      
      // 从 localStorage 获取 projectRoot
      const projectRoot = localStorage.getItem(`project_${projectId}`) || '';
      
      const response = await fetch(`/api/files?projectId=${projectId}&path=${encodeURIComponent(path)}${projectRoot ? `&projectRoot=${encodeURIComponent(projectRoot)}` : ''}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch directory');
      }
      
      if (data.isDirectory) {
        setItems(data.contents);
        setCurrentPath(path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch directory');
      console.error('Error fetching directory:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToParent = () => {
    if (currentPath === '') return;
    
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    fetchDirectory(parentPath);
  };

  const deleteItem = async (itemPath: string) => {
    if (!projectId) return;
    
    if (!confirm(`Are you sure you want to delete ${itemPath}?`)) {
      return;
    }
    
    try {
      // 从 localStorage 获取 projectRoot
      const projectRoot = localStorage.getItem(`project_${projectId}_root`) || '';
      
      const response = await fetch(
        `/api/files?projectId=${projectId}&path=${encodeURIComponent(itemPath)}${projectRoot ? `&projectRoot=${encodeURIComponent(projectRoot)}` : ''}`,
        { method: 'DELETE' }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete item');
      }
      
      // Refresh the current directory
      fetchDirectory(currentPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete item');
      console.error('Error deleting item:', err);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchDirectory();
    }
  }, [projectId]);

  if (loading) {
    return <div className="p-4 text-gray-400">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error: {error}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-gray-700 flex items-center">
        <button 
          onClick={navigateToParent}
          disabled={currentPath === ''}
          className="mr-2 px-2 py-1 bg-gray-700 rounded disabled:opacity-50"
        >
          ↩️
        </button>
        <span className="text-sm truncate">{currentPath || 'Project Root'}</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-gray-800">
          {items.map((item) => (
            <div 
              key={item.name} 
              className="flex items-center justify-between p-2 hover:bg-gray-800 cursor-pointer"
            >
              <div 
                className="flex items-center flex-1 min-w-0"
                onClick={() => {
                  if (item.isDirectory) {
                    fetchDirectory(currentPath ? `${currentPath}/${item.name}` : item.name);
                  } else {
                    const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                    onFileSelect(fullPath);
                  }
                }}
              >
                <span className="mr-2">
                  {item.isDirectory ? '📁' : '📄'}
                </span>
                <span className="truncate">{item.name}</span>
              </div>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                  deleteItem(fullPath);
                }}
                className="ml-2 px-2 py-1 bg-red-700 rounded hover:bg-red-600"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}