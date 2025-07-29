'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Project = {
  id: string;
  path: string;
  name: string;
  lastAccessed: number;
};

export default function HomePage() {
  const router = useRouter();
  const [projectPath, setProjectPath] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [clonePath, setClonePath] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [debugCommand, setDebugCommand] = useState('npm run serve');
  const [debugPort, setDebugPort] = useState('3010');
  const [showDebugConfig, setShowDebugConfig] = useState(false);

  // Load projects from localStorage on component mount
  useEffect(() => {
    loadProjects();
    
    // Load saved debug settings
    const savedCommand = localStorage.getItem('debugCommand');
    const savedPort = localStorage.getItem('debugPort');
    
    if (savedCommand) setDebugCommand(savedCommand);
    if (savedPort) setDebugPort(savedPort);
  }, []);

  const loadProjects = () => {
    const projectList: Project[] = [];
    
    // Iterate through localStorage to find project entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('project_')) {
        const path = (localStorage.getItem(key) || '').split('project_')[1] || '';
        
        projectList.push({
          id: key,
          path: path,
          name: path.split('/').pop() || path,
          lastAccessed: Date.now() // In a real app, you might store and retrieve this
        });
      }
    }
    
    // Sort by last accessed (newest first)
    projectList.sort((a, b) => b.lastAccessed - a.lastAccessed);
    setProjects(projectList);
  };

  const generateProjectId = () => `project_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  const handleOpenProject = () => {
    if (projectPath) {
      // Get or create projectId for this path

      // Find existing projectId for this path or create a new one
      let projectId = null;
      
      // Check if we already have this project path stored
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('project_')) {
          const storedPath = localStorage.getItem(key);
          if (storedPath === `project_${projectPath}`) {
            projectId = key;
            break;
          }
        }
      }
      
      // If not found, generate a new projectId
      if (!projectId) {
        projectId = generateProjectId();
        localStorage.setItem(projectId, `project_${projectPath}`);
      }
      
      // Pass projectId and path to terminal
      router.push(`/terminal?path=${encodeURIComponent(projectPath)}&projectId=${projectId}&action=open`);
    }
  };

  const handleOpenRecentProject = (project: Project) => {
    router.push(`/terminal?path=${encodeURIComponent(project.path)}&projectId=${project.id}&action=open`);
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
        localStorage.setItem(projectId,`project_${data.path}`);
        
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
    localStorage.setItem(projectId, homeDir);
    
    // Navigate to terminal with the default project
    router.push(`/terminal?projectId=${projectId}`);
  };

  // Handle debug command
  const handleDebugCommand = async () => {
    try {
      // Save settings to localStorage
      localStorage.setItem('debugCommand', debugCommand);
      localStorage.setItem('debugPort', debugPort);
      
      const response = await fetch('/api/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: debugCommand,
          port: debugPort
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.url) {
        // Open the new page in a new tab
        window.open(data.url, '_blank');
      } else {
        console.error('Failed to run debug command:', data.error);
      }
    } catch (error) {
      console.error('Error running debug command:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center relative">
          <h1 className="text-4xl font-bold mb-2">Project Studio</h1>
          <p className="text-gray-400">Create and manage your projects with ease</p>
          <button 
            onClick={() => setShowDebugConfig(!showDebugConfig)}
            className="absolute top-0 right-0 bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm"
          >
            Debug
          </button>
        </div>

        {/* Debug Configuration Panel */}
        {showDebugConfig && (
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Debug Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Command</label>
                <input
                  type="text"
                  value={debugCommand}
                  onChange={(e) => setDebugCommand(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <input
                  type="number"
                  value={debugPort}
                  onChange={(e) => setDebugPort(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleDebugCommand}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 rounded font-medium"
              >
                Run Debug Command
              </button>
            </div>
          </div>
        )}

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

        {/* Recent Projects Section */}
        {projects.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-2xl font-bold mb-4">Recent Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div 
                  key={project.id}
                  className="bg-gray-700 rounded p-4 hover:bg-gray-600 cursor-pointer transition-colors"
                  onClick={() => handleOpenRecentProject(project)}
                >
                  <div className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">{project.id}</div>
                  <div className="text-sm text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap">{project.name}</div>
                  <div className="text-xs text-gray-500 mt-2">
                    Last accessed: {new Date(project.lastAccessed).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}