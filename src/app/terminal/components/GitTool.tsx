'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

type GitFile = {
  status: string;
  path: string;
};

type GitCommit = {
  hash: string;
  message: string;
};

export default function GitTool() {
  const searchParams = useSearchParams();
  const [allFiles, setAllFiles] = useState<GitFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const projectId = searchParams.get('projectId');

  const fetchGitStatus = async () => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch(`/api/git?projectId=${projectId}&projectRoot=${encodeURIComponent(projectRoot)}&action=status`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch git status');
      }
      
      setAllFiles(data.allFiles);
      setStagedFiles(data.stagedFiles);
      setUnstagedFiles(data.unstagedFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch git status');
      console.error('Error fetching git status:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGitLog = async () => {
    if (!projectId) return;
    
    try {
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch(`/api/git?projectId=${projectId}&projectRoot=${encodeURIComponent(projectRoot)}&action=log`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch git log');
      }
      
      setCommits(data.commits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch git log');
      console.error('Error fetching git log:', err);
    }
  };

  const fetchGitDiff = async (filePath: string) => {
    console.log('Fetching diff for', filePath)
    if (!projectId) return;
    
    try {
      setSelectedFile(filePath);
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch(`/api/git?projectId=${projectId}&projectRoot=${encodeURIComponent(projectRoot)}&action=diff&filePath=${encodeURIComponent(filePath)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch git diff');
      }
      
      setDiff(data.diff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch git diff');
      console.error('Error fetching git diff:', err);
    } finally {
      setLoading(false);
    }
  };

  const stageChanges = async (filePath: string) => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectRoot,
          action: 'stage',
          files: [filePath]
        })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to stage changes');
      }
      
      // Refresh data
      fetchGitStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stage changes');
      console.error('Error staging changes:', err);
    } finally {
      setLoading(false);
    }
  };

  const unstageChanges = async (filePath: string) => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      // Use git reset to unstage the file
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectRoot,
          action: 'unstage',
          files: [filePath]
        })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to unstage changes');
      }
      
      // Refresh data
      fetchGitStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unstage changes');
      console.error('Error unstaging changes:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetChanges = async (filePath: string) => {
    if (!projectId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectRoot,
          action: 'reset',
          files: [filePath]
        })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset changes');
      }
      
      // Refresh data
      fetchGitStatus();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset changes');
      console.error('Error resetting changes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!projectId || !commitMessage.trim()) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get projectRoot from localStorage or URL
      let projectRoot = localStorage.getItem(projectId)?.split('project_')[1] || '';
      if (!projectRoot) {
        // Fallback to URL path if not cached
        projectRoot = searchParams.get('path') || '';
        if (projectRoot) {
          // Cache the path for future use
          localStorage.setItem(projectId, `project_${projectRoot}`);
        }
      }
      
      const response = await fetch('/api/git', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectRoot,
          message: commitMessage,
          // Commit staged files only
          files: stagedFiles.map(file => file.path)
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to commit changes');
      }
      
      // Reset form
      setCommitMessage('');
      setSelectedFile(null);
      setDiff('');
      
      // Refresh data
      fetchGitStatus();
      fetchGitLog();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
      console.error('Error committing changes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      // Check if project path is already cached
      const cachedPath = localStorage.getItem(projectId);
      if (!cachedPath) {
        // If not cached, try to get path from URL
        const path = searchParams.get('path');
        if (path) {
          // Cache project path
          localStorage.setItem(projectId, `project_${path}`);
          console.log(`GitTool: Cached project path for ${projectId}: ${path}`);
        }
      }
      
      fetchGitStatus();
      fetchGitLog();
    }
  }, [projectId, searchParams]);

  if (loading && allFiles.length === 0 && commits.length === 0) {
    return <div className="p-4 text-gray-400">Loading Git data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-400">Error: {error}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-gray-700 text-sm font-medium">
        Git Tool
      </div>
      
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Commit section */}
        <div className="p-2 border-b border-gray-700">
          <h3 className="font-medium mb-2">Commit Changes</h3>
          <div className="space-y-2">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Enter commit message"
              className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
              rows={3}
            />
            <div className="flex justify-between items-center">
              <div className="text-xs text-gray-500">
                {stagedFiles.length} files staged for commit
              </div>
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || loading || stagedFiles.length === 0}
                className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {loading ? 'Committing...' : 'Commit'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Staged files section */}
        <div className="p-2 border-b border-gray-700 flex-1 flex flex-col">
          <h3 className="font-medium mb-2">Staged Changes ({stagedFiles.length})</h3>
          {stagedFiles.length === 0 ? (
            <p className="text-gray-500 text-sm">No staged changes</p>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-auto">
                {stagedFiles.map((file, index) => (
                  <div 
                    key={`staged-${index}`} 
                    className={`flex items-center justify-between p-2 rounded cursor-pointer mb-1 ${
                      selectedFile === file.path ? 'bg-gray-700' : 'hover:bg-gray-800'
                    }`}
                    onClick={() => fetchGitDiff(file.path)}
                  >
                    <div className="flex items-center">
                      <span className="mr-2 w-8 text-center">
                        {file.status.startsWith('M') && '✏️'}
                        {file.status.startsWith('A') && '➕'}
                        {file.status.startsWith('D') && '🗑️'}
                      </span>
                      <span className="truncate max-w-xs">{file.path}</span>
                    </div>
                    <span className="text-xs bg-blue-700 px-2 py-1 rounded">
                      {file.status}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          unstageChanges(file.path);
                        }}
                        className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded"
                      >
                        Unstage
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Unstaged files section */}
        <div className="p-2 border-b border-gray-700 flex-1 flex flex-col">
          <h3 className="font-medium mb-2">Changes ({unstagedFiles.length})</h3>
          {unstagedFiles.length === 0 ? (
            <p className="text-gray-500 text-sm">No changes detected</p>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-auto">
                {unstagedFiles.map((file, index) => (
                  <div 
                    key={`unstaged-${index}`} 
                    className={`flex items-center justify-between p-2 rounded cursor-pointer mb-1 ${
                      selectedFile === file.path ? 'bg-gray-700' : 'hover:bg-gray-800'
                    }`}
                    onClick={() => fetchGitDiff(file.path)}
                  >
                    <div className="flex items-center">
                      <span className="mr-2 w-8 text-center">
                        {file.status.endsWith('M') && '✏️'}
                        {file.status.endsWith('A') && '➕'}
                        {file.status.endsWith('D') && '🗑️'}
                        {file.status.includes('?') && '🆕'}
                      </span>
                      <span className="truncate max-w-xs">{file.path}</span>
                    </div>
                    <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                      {file.status}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stageChanges(file.path);
                        }}
                        className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                      >
                        Stage
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          resetChanges(file.path);
                        }}
                        className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Diff view */}
              {selectedFile && (
                <div className="mt-2 flex-1 flex flex-col border border-gray-700 rounded">
                  <div className="p-2 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                    <h3 className="font-medium text-sm">Diff: {selectedFile}</h3>
                    <button 
                      onClick={() => {
                        setSelectedFile(null);
                        setDiff('');
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-2 font-mono text-xs bg-gray-900">
                    {diff ? (
                      <pre className="whitespace-pre">{diff}</pre>
                    ) : (
                      <p className="text-gray-500">No changes to display</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Commit history */}
        <div className="p-2">
          <h3 className="font-medium mb-2">Recent Commits</h3>
          {commits.length === 0 ? (
            <p className="text-gray-500 text-sm">No commits found</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-auto">
              {commits.map((commit, index) => (
                <div key={index} className="p-2 bg-gray-800 rounded">
                  <div className="font-mono text-xs text-gray-400">{commit.hash.substring(0, 7)}</div>
                  <div className="text-sm mt-1">{commit.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}