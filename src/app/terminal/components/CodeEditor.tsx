'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Editor from '@monaco-editor/react';

export default function CodeEditor({ 
  filePath,
  onSave 
}: { 
  filePath: string;
  onSave: () => void;
}) {
  const searchParams = useSearchParams();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState('plaintext');
  
  const projectId = searchParams.get('projectId');

  // Determine language based on file extension
  useEffect(() => {
    if (filePath) {
      const ext = filePath.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'js':
        case 'jsx':
          setLanguage('javascript');
          break;
        case 'ts':
        case 'tsx':
          setLanguage('typescript');
          break;
        case 'json':
          setLanguage('json');
          break;
        case 'html':
          setLanguage('html');
          break;
        case 'css':
          setLanguage('css');
          break;
        case 'md':
          setLanguage('markdown');
          break;
        case 'py':
          setLanguage('python');
          break;
        case 'java':
          setLanguage('java');
          break;
        case 'cpp':
        case 'cc':
        case 'cxx':
          setLanguage('cpp');
          break;
        case 'c':
          setLanguage('c');
          break;
        case 'go':
          setLanguage('go');
          break;
        case 'php':
          setLanguage('php');
          break;
        case 'sql':
          setLanguage('sql');
          break;
        case 'xml':
          setLanguage('xml');
          break;
        case 'yaml':
        case 'yml':
          setLanguage('yaml');
          break;
        default:
          setLanguage('plaintext');
      }
    }
  }, [filePath]);

  const fetchFile = async () => {
    if (!projectId || !filePath) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // 从 localStorage 获取 projectRoot
      const projectRoot = localStorage.getItem(projectId || '')?.split('project_')[1] || '';
      
      const response = await fetch(`/api/files?projectId=${projectId}&path=${encodeURIComponent(filePath)}${projectRoot ? `&projectRoot=${encodeURIComponent(projectRoot)}` : ''}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch file');
      }
      
      if (!data.isDirectory) {
        setContent(data.content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch file');
      console.error('Error fetching file:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!projectId || !filePath) return;
    
    try {
      setSaving(true);
      
      // 从 localStorage 获取 projectRoot
      const projectRoot = localStorage.getItem(projectId || '')?.split('project_')[1] || '';
      
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          path: filePath,
          content,
          projectRoot
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save file');
      }
      
      onSave();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save file');
      console.error('Error saving file:', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (filePath) {
      fetchFile();
    }
  }, [filePath, fetchFile]);

  if (loading) {
    return <div className="p-4 text-gray-400">Loading file...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error: {error}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-gray-700 flex justify-between items-center">
        <span className="text-sm truncate">{filePath}</span>
        <button
          onClick={saveFile}
          disabled={saving}
          className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={(value) => setContent(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on'
          }}
        />
      </div>
    </div>
  );
}