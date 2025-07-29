'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [projectPath, setProjectPath] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [clonePath, setClonePath] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');

  const generateProjectId = () => `project_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const handleOpenProject = () => {
    if (projectPath) {
      // Get or create projectId for this path
      const projectId = localStorage.getItem(`project_${projectPath}`) || generateProjectId();
      localStorage.setItem(`project_${projectPath}`, projectId);
      
      // Pass projectId and path to terminal
      router.push(`/terminal?path=${encodeURIComponent(projectPath)}&projectId=${projectId}&action=open`);
    }
  };

  const handleCloneProject = async () => {
    if (githubUrl && clonePath) {
      setIsCloning(true);
      setCloneError('');
      
      try {
        // Generate projectId for this repository
        const projectId = generateProjectId();
        
        // Call the clone API
        const response = await fetch('/api/clone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            githubUrl,
            clonePath,
            projectId,
          }),
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to clone repository');
        }
        
        // Store the project path in localStorage
        localStorage.setItem(projectId, `project_${data.path}`);
        
        // Redirect to terminal with the cloned project
        router.push(`/terminal?path=${encodeURIComponent(data.path)}&projectId=${projectId}&action=open`);
      } catch (error) {
        setCloneError(error instanceof Error ? error.message : 'Failed to clone repository. Please check the URL and try again.');
        setIsCloning(false);
      }
    } else if (!clonePath) {
      setCloneError('Please select a storage path for the cloned repository.');
    }
  };

  // Add a function to create a default terminal
  const handleDefaultTerminal = () => {
    // Generate a default projectId
    const projectId = generateProjectId();
    
    // Store the project root path in localStorage (using home directory instead of root)
    const homeDir = typeof process !== 'undefined' ? process.env.HOME || process.env.USERPROFILE || '/' : '/';
    localStorage.setItem(`project_${projectId}_root`, homeDir);
    
    // Navigate to terminal with the default project
    router.push(`/terminal?projectId=${projectId}`);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Project Studio</h1>
          <p className="text-gray-400">Create and manage your projects with ease</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Open Project Card */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Open Project</h2>
            <p className="text-gray-400 mb-4">Open an existing project from your local filesystem</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Project Path</label>
                <input
                  type="text"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleOpenProject}
                disabled={!projectPath}
                className={`w-full py-2 px-4 rounded font-medium ${
                  projectPath 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-700 cursor-not-allowed'
                }`}
              >
                Open Project
              </button>
            </div>
          </div>

          {/* Create Project Card */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Create Project</h2>
            <p className="text-gray-400 mb-4">Clone a project from GitHub</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">GitHub Repository URL</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Storage Path</label>
                <input
                  type="text"
                  value={clonePath}
                  onChange={(e) => setClonePath(e.target.value)}
                  placeholder="/path/to/store/repository"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {cloneError && (
                <div className="text-red-400 text-sm">{cloneError}</div>
              )}
              <button
                onClick={handleCloneProject}
                disabled={!githubUrl || !clonePath || isCloning}
                className={`w-full py-2 px-4 rounded font-medium ${
                  githubUrl && clonePath && !isCloning
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-gray-700 cursor-not-allowed'
                }`}
              >
                {isCloning ? 'Cloning...' : 'Clone from GitHub'}
              </button>
            </div>
          </div>

          {/* Default Terminal Card */}
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Terminal</h2>
            <p className="text-gray-400 mb-4">Open a default terminal session</p>
            <button
              onClick={handleDefaultTerminal}
              className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded font-medium"
            >
              Open Terminal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}