'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import socketIOClient from 'socket.io-client';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import GitTool from './components/GitTool';

// Tab type
type Tab = {
  id: string;
  type: 'file' | 'web' | 'git';
  title: string;
  path?: string; // For file tabs
  url?: string;  // For web tabs
};

// WebTabTitle component for editing web tab URLs
function WebTabTitle({ title, url, onUpdateUrl }: { 
  title: string; 
  url: string; 
  onUpdateUrl: (newUrl: string) => void 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTitleClick = () => {
    setIsEditing(true);
    setEditValue(url);
  };

  const handleSave = () => {
    if (editValue && editValue !== url) {
      // Ensure URL has protocol
      const fullUrl = editValue.startsWith('http') ? editValue : `https://${editValue}`;
      onUpdateUrl(fullUrl);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return isEditing ? (
    <input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className="bg-gray-600 text-white px-1 rounded w-full"
    />
  ) : (
    <span 
      className="truncate max-w-xs hover:underline" 
      onClick={handleTitleClick}
      title={`Click to edit URL: ${url}`}
    >
      {title}
    </span>
  );
}

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [showWebViewer, setShowWebViewer] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [isIdeCollapsed, setIsIdeCollapsed] = useState(false);
  const [debugCommand, setDebugCommand] = useState('npm run server');
  const [debugPort, setDebugPort] = useState('3030');
  const [showDebugConfig, setShowDebugConfig] = useState(false);
  const [isTerminalInitialized, setIsTerminalInitialized] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<any>(null);
  const fitAddon = useRef<any>(null);

  // Detect mobile device
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Handle terminal resizing when window or layout changes
  useEffect(() => {
    const handleResize = () => {
      if (fitAddon.current && terminal.current) {
        // Small delay to ensure DOM has updated
        setTimeout(() => {
          try {
            fitAddon.current.fit();
          } catch (e) {
            console.warn('Failed to resize terminal:', e);
          }
        }, 100);
      }
    };

    handleResize(); // Resize immediately when component mounts or layout state changes
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isIdeCollapsed, isMobile]); // Depend on layout-changing states

  // Dynamically import xterm only on client side
  useEffect(() => {
    let isMounted = true;

    const initTerminal = async () => {
      if (!terminalRef.current) return;

      // Dynamic imports for client-side only
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (!isMounted) return;

      // Get CSS variable values for terminal theme
      const getTerminalTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        return {
          background: styles.getPropertyValue('--terminal-bg').trim() || '#1a202c',
          foreground: styles.getPropertyValue('--terminal-text').trim() || '#e2e8f0',
        };
      };

      // Create terminal instance if it doesn't exist
      if (!terminal.current) {
        terminal.current = new Terminal({
          rows: 30,
          theme: getTerminalTheme(),
        });

        // Add fit addon
        fitAddon.current = new FitAddon();
        terminal.current.loadAddon(fitAddon.current);
      }

      // Open terminal in container if not already opened
      if (!terminal.current.element) {
        terminal.current.open(terminalRef.current!);
      }

      // Fit terminal to container
      if (fitAddon.current) {
        fitAddon.current.fit();
      }

      // Update terminal theme when theme changes
      const handleThemeChange = () => {
        if (terminal.current) {
          terminal.current.options.theme = getTerminalTheme();
        }
      };

      // Listen for theme changes
      window.addEventListener('theme-change', handleThemeChange);

      // Mark terminal as initialized
      setIsTerminalInitialized(true);

      // Cleanup listener
      return () => {
        window.removeEventListener('theme-change', handleThemeChange);
      };
    };

    initTerminal();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle terminal input
  useEffect(() => {
    if (!terminal.current || !socket || !isConnected || !isTerminalInitialized) return;
    // Handle terminal input
    const dataListener = terminal.current.onData((data: string) => {
      if (socket && isConnected) {
        socket.emit('terminal-input', data);
      }
    });

    // Cleanup listener
    return () => {
      if (dataListener) {
        dataListener.dispose();
      }
    };
  }, [socket, isConnected, isTerminalInitialized]); // Add isTerminalInitialized dependency

  // Initialize terminal and socket connection
  useEffect(() => {
    // Only initialize if we don't already have a socket
    if (socket) return;
    
    // Initialize Socket.IO connection
    const newSocket = socketIOClient({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('Connected to server with socket ID:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);

      // Create terminal session through Socket.IO
      newSocket.emit('create-terminal-session', {
        projectId: searchParams.get('projectId'),
        path: searchParams.get('path') || '/' // 使用URL中的path参数，如果没有则默认为根目录
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      console.error('Error details:', {
        message: err.message,
      });
      setConnectionError(`Connection failed: ${err.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server. Reason:', reason);
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // The disconnection was initiated by the server, you need to reconnect manually
        newSocket.connect();
      }
    });
    
    newSocket.on('terminal-output', (data: string) => {
      console.log('Received terminal output:', data);
      if (terminal.current) {
        terminal.current.write(data);
      }
    });
    
    // Handle terminal session creation response
    newSocket.on('terminal-session-created', (data) => {
      if (data.success) {
        console.log('Terminal session created:', data.sessionId);
        setSessionId(data.sessionId);
      } else {
        console.error('Failed to create terminal session:', data.error);
        setConnectionError(data.error);
      }
    });
    
    // Handle session errors
    newSocket.on('session-error', (data) => {
      console.error('Session error:', data.message);
      setConnectionError(data.message);
      // Reset session so it can be recreated
      setSessionId(null);
    });
    
    setSocket(newSocket);
    
    // Return cleanup function
    return () => {
      // Clean up only when component unmounts
      if (newSocket) {
        const currentProjectId = searchParams.get('projectId');
        if (currentProjectId && sessionId) {
          // Only cleanup if the session belongs to the current project
          newSocket.emit('cleanup-session', { sessionId, projectId: currentProjectId });
        }

        // Remove listeners
        newSocket.off('connect');
        newSocket.off('connect_error');
        newSocket.off('disconnect');
        newSocket.off('terminal-output');
        newSocket.off('terminal-session-created');
        newSocket.off('session-error');

        // Close the socket
        newSocket.close();
      }
    };
  }, []); // Empty dependency array to run only once

  // Reconnect when navigating back to the page with an existing socket but no session
  useEffect(() => {
    if (socket && !sessionId && isConnected) {
      // Create a new terminal session
      socket.emit('create-terminal-session', {
        projectId: searchParams.get('projectId'),
        path: searchParams.get('path') || '/'
      });
    }
  }, [socket, sessionId, isConnected, searchParams]);

  // Load saved debug settings
  useEffect(() => {
    const savedCommand = localStorage.getItem('debugCommand');
    const savedPort = localStorage.getItem('debugPort');
    
    if (savedCommand) setDebugCommand(savedCommand);
    if (savedPort) setDebugPort(savedPort);
  }, []);

  const handleGoHome = () => {
    router.push('/');
  };

  // Theme toggle function
  const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Dispatch custom event to notify theme change
    window.dispatchEvent(new CustomEvent('theme-change'));
  };

  // Set initial theme based on localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (systemPrefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const handleDebugCommand = async () => {
    try {
      // Save settings to localStorage
      localStorage.setItem('debugCommand', debugCommand);
      localStorage.setItem('debugPort', debugPort);
      const currentProjectId = searchParams.get('projectId');
      const projectRoot = localStorage.getItem(currentProjectId || '')?.split('project_')[1] || ''; 
      const response = await fetch('/api/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: debugCommand,
          port: debugPort,
          path: projectRoot
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.url) {
        // Set webUrl and directly create a new tab for the web page
        const url = data.url;
        
        // Create new tab directly instead of just setting webUrl
        const newTab: Tab = {
          id: `web-${Date.now()}`,
          type: 'web',
          title: url.replace(/^https?:\/\//, '').split('/')[0],
          url: url
        };
        
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      } else {
        console.error('Failed to run debug command:', data.error);
      }
    } catch (error) {
      console.error('Error running debug command:', error);
    }
  };

  const handleFileSelect = (filePath: string) => {
    // Check if file is already open
    const existingTab = tabs.find(tab => tab.type === 'file' && tab.path === filePath);
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTabId(existingTab.id);
    } else {
      // Create new tab
      const newTab: Tab = {
        id: `file-${Date.now()}`,
        type: 'file',
        title: filePath.split('/').pop() || filePath,
        path: filePath
      };
      
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    
    if (isMobile) {
      setShowFileExplorer(false); // Close drawer on mobile after selecting file
    }
  };

  const openWebViewer = () => {
    setShowWebViewer(true);
  };

  const openGitTool = () => {
    // Check if Git tool is already open
    const existingTab = tabs.find(tab => tab.type === 'git');
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTabId(existingTab.id);
    } else {
      // Create new tab
      const newTab: Tab = {
        id: `git-${Date.now()}`,
        type: 'git',
        title: 'Git Tool'
      };
      
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const loadWebPage = () => {
    if (!webUrl) return;
    
    // Check if web page is already open
    const existingTab = tabs.find(tab => tab.type === 'web' && tab.url === webUrl);
    if (existingTab) {
      // Switch to existing tab
      setActiveTabId(existingTab.id);
    } else {
      // Create new tab
      const newTab: Tab = {
        id: `web-${Date.now()}`,
        type: 'web',
        title: webUrl.replace(/^https?:\/\//, '').split('/')[0],
        url: webUrl
      };
      
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    
    setShowWebViewer(false);
    setWebUrl('');
  };

  // Function to update web tab URL
  const updateWebTabUrl = (tabId: string, newUrl: string) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId && tab.type === 'web') {
        return {
          ...tab,
          title: newUrl.replace(/^https?:\/\//, '').split('/')[0],
          url: newUrl
        };
      }
      return tab;
    }));
    
    // Also update the webUrl state if this is the active tab
    const activeTab = tabs.find(tab => tab.id === tabId);
    if (activeTab && activeTab.id === activeTabId && activeTab.type === 'web') {
      setWebUrl(newUrl);
    }
  };

  const closeTab = (tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      
      // If we're closing the active tab, switch to another tab
      if (tabId === activeTabId) {
        if (newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else {
          setActiveTabId(null);
        }
      }
      
      return newTabs;
    });
  };

  const handleFileSave = () => {
    // Refresh the file explorer after saving
  };

  const toggleFileExplorer = () => {
    setShowFileExplorer(!showFileExplorer);
  };

  const handleCtrlC = () => {
    if (socket && isConnected && sessionId) {
      // Send Ctrl+C character (ASCII 3) to the terminal
      socket.emit('terminal-input', '\x03');
    }
  };

  const handleArrowUp = () => {
    if (socket && isConnected && sessionId) {
      // Send Arrow Up character (ESC [ A) to the terminal
      socket.emit('terminal-input', '\x1b[A');
    }
  };

  const handleArrowDown = () => {
    if (socket && isConnected && sessionId) {
      // Send Arrow Down character (ESC [ B) to the terminal
      socket.emit('terminal-input', '\x1b[B');
    }
  };

  const handleEnter = () => {
    if (socket && isConnected && sessionId) {
      // Send Enter character (CR) to the terminal
      socket.emit('terminal-input', '\r');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">AIWebStudio</h1>
        <div className="flex space-x-2">
          {isMobile && (
            <button 
              onClick={toggleFileExplorer}
              className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded"
            >
              ☰
            </button>
          )}
          <button 
            onClick={() => setShowDebugConfig(!showDebugConfig)}
            className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm"
          >
            Debug
          </button>
          <button 
            onClick={toggleTheme}
            className="bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Theme
          </button>
          <button 
            onClick={handleGoHome}
            className="bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Home
          </button>
        </div>
      </header>

      {/* Debug Configuration Panel */}
      {showDebugConfig && (
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Command</label>
              <input
                type="text"
                value={debugCommand}
                onChange={(e) => setDebugCommand(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="number"
                value={debugPort}
                onChange={(e) => setDebugPort(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleDebugCommand}
                className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 rounded font-medium"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        // Mobile layout - vertical stack
        <div className="flex flex-col flex-1 overflow-auto">
          {/* Terminal Section - Top */}
          <div className={`${isIdeCollapsed ? 'h-5/6' : 'h-1/3'} flex flex-col border-b border-gray-700`}>
            <div className="p-2 bg-gray-800 text-sm font-medium">
              Terminal
            </div>
            <div 
              ref={terminalRef} 
              className="flex-1 overflow-hidden p-2"
            />
            <div className="border-t border-gray-700 p-2 text-xs text-gray-500 flex justify-between items-center">
              <div>
                {!isConnected && !connectionError && "Connecting to terminal..."}
                {connectionError && (
                  <div className="bg-red-900 text-red-200 p-2 rounded">
                    {connectionError}
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={handleArrowUp}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ↑
                </button>
                <button 
                  onClick={handleArrowDown}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ↓
                </button>
                <button 
                  onClick={handleEnter}
                  disabled={!isConnected || !sessionId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ⏎
                </button>
                <button 
                  onClick={handleCtrlC}
                  disabled={!isConnected || !sessionId}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ⌃C
                </button>
              </div>
            </div>
          </div>

          {/* IDE Section - Bottom */}
          <div className={`${isIdeCollapsed ? 'h-10' : 'h-2/3'} flex flex-col`}>
            <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
              <span>Online IDE</span>
              <div className="flex space-x-2">
                <button 
                  onClick={() => setIsIdeCollapsed(!isIdeCollapsed)}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded text-xs"
                >
                  {isIdeCollapsed ? '▼' : '▲'}
                </button>
                <button 
                  onClick={openWebViewer}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded text-xs"
                >
                  Web
                </button>
                <button 
                  onClick={openGitTool}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded text-xs"
                >
                  Git
                </button>
                {!showFileExplorer && (
                  <button 
                    onClick={toggleFileExplorer}
                    className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                  >
                    ☰
                  </button>
                )}
              </div>
            </div>
            
            {!isIdeCollapsed && (
              <>
                {/* Tab bar */}
                {tabs.length > 0 && (
                  <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
                    {tabs.map(tab => (
                      <div 
                        key={tab.id}
                        className={`flex items-center px-3 py-2 text-sm cursor-pointer border-r border-gray-700 ${
                          activeTabId === tab.id ? 'bg-gray-700' : 'hover:bg-gray-750'
                        }`}
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        <span className="mr-2">{tab.type === 'file' ? '📄' : tab.type === 'web' ? '🌐' : 'Git'}</span>
                        {tab.type === 'web' ? (
                          <WebTabTitle 
                            title={tab.title} 
                            url={tab.url || ''} 
                            onUpdateUrl={(newUrl) => updateWebTabUrl(tab.id, newUrl)} 
                          />
                        ) : (
                          <span className="truncate max-w-xs">{tab.title}</span>
                        )}
                        <button 
                          className="ml-2 text-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(tab.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex-1 flex overflow-hidden">
                  {showFileExplorer ? (
                    // File Explorer Overlay for Mobile
                    <div className="absolute inset-0 z-10 bg-gray-900 flex flex-col">
                      <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
                        <span>File Explorer</span>
                        <button 
                          onClick={toggleFileExplorer}
                          className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <FileExplorer onFileSelect={handleFileSelect} />
                      </div>
                    </div>
                  ) : showWebViewer ? (
                    // Web Viewer Overlay for Mobile
                    <div className="absolute inset-0 z-10 bg-gray-900 flex flex-col">
                      <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
                        <span>Open Web Page</span>
                        <button 
                          onClick={() => setShowWebViewer(false)}
                          className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <input
                          type="text"
                          value={webUrl}
                          onChange={(e) => setWebUrl(e.target.value)}
                          placeholder="Enter URL (e.g., https://example.com)"
                          className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
                        />
                        <button
                          onClick={loadWebPage}
                          className="self-start px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ) : activeTabId ? (
                    // Active tab content
                    (() => {
                      const activeTab = tabs.find(tab => tab.id === activeTabId);
                      if (!activeTab) return null;
                      
                      return activeTab.type === 'file' && activeTab.path ? (
                        <div className="w-full h-full">
                          <CodeEditor 
                            filePath={activeTab.path} 
                            onSave={handleFileSave} 
                          />
                        </div>
                      ) : activeTab.type === 'web' && activeTab.url ? (
                        <div className="w-full h-full">
                          <iframe 
                            src={activeTab.url} 
                            className="w-full h-full"
                            title={activeTab.title}
                          />
                        </div>
                      ) : activeTab.type === 'git' ? (
                        <div className="w-full h-full">
                          <GitTool />
                        </div>
                      ) : null;
                    })()
                  ) : (
                    // Empty state
                    <div className="flex-1 flex items-center justify-center text-gray-500 w-full">
                      Open a file or webpage to get started
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        // Desktop layout - horizontal split
        <div className="flex flex-1 overflow-hidden">
          {/* Terminal Section - Left (30%) */}
          <div className="w-[30%] flex flex-col border-r border-gray-700">
            <div className="p-2 bg-gray-800 text-sm font-medium">
              Terminal
            </div>
            <div 
              ref={terminalRef} 
              className="flex-1 overflow-hidden p-2"
            />
            <div className="border-t border-gray-700 p-2 text-xs text-gray-500 flex justify-between items-center">
              <div>
                {!isConnected && !connectionError && "Connecting to terminal..."}
                {connectionError && (
                  <div className="bg-red-900 text-red-200 p-2 rounded">
                    {connectionError}
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button 
                  onClick={handleArrowUp}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ↑
                </button>
                <button 
                  onClick={handleArrowDown}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ↓
                </button>
                <button 
                  onClick={handleEnter}
                  disabled={!isConnected || !sessionId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ⏎
                </button>
                <button 
                  onClick={handleEnter}
                  disabled={!isConnected || !sessionId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ⏎
                </button>
                <button 
                  onClick={handleCtrlC}
                  disabled={!isConnected || !sessionId}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  ⌃C
                </button>
              </div>
            </div>
          </div>

          {/* IDE Section - Right (70%) */}
          <div className="w-[70%] flex flex-col">
            <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
              <span>Online IDE</span>
              <div className="flex space-x-2">
                <button 
                  onClick={openWebViewer}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  Open Web Page
                </button>
                <button 
                  onClick={openGitTool}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                  Git Tool
                </button>
              </div>
            </div>
            
            {/* Tab bar */}
            {tabs.length > 0 && (
              <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
                {tabs.map(tab => (
                  <div 
                    key={tab.id}
                    className={`flex items-center px-3 py-2 text-sm cursor-pointer border-r border-gray-700 ${
                      activeTabId === tab.id ? 'bg-gray-700' : 'hover:bg-gray-750'
                    }`}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <span className="mr-2">{tab.type === 'file' ? '📄' : tab.type === 'web' ? '🌐' : 'Git'}</span>
                    {tab.type === 'web' ? (
                      <WebTabTitle 
                        title={tab.title} 
                        url={tab.url || ''} 
                        onUpdateUrl={(newUrl) => updateWebTabUrl(tab.id, newUrl)} 
                      />
                    ) : (
                      <span className="truncate max-w-xs">{tab.title}</span>
                    )}
                    <button 
                      className="ml-2 text-gray-400 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex-1 flex overflow-hidden">
              {/* File Explorer - Left side of IDE (30%) */}
              <div className="w-[30%] border-r border-gray-700 flex flex-col">
                <FileExplorer onFileSelect={handleFileSelect} />
              </div>
              
              {/* Tab Content - Right side of IDE (70%) */}
              <div className="w-[70%] flex flex-col">
                {showWebViewer ? (
                  // Web Viewer for Desktop
                  <div className="absolute inset-0 z-10 bg-gray-900 flex flex-col" style={{left: '30%', width: '70%'}}>
                    <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
                      <span>Open Web Page</span>
                      <button 
                        onClick={() => setShowWebViewer(false)}
                        className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <input
                        type="text"
                        value={webUrl}
                        onChange={(e) => setWebUrl(e.target.value)}
                        placeholder="Enter URL (e.g., https://example.com)"
                        className="w-full p-2 mb-4 bg-gray-800 border border-gray-700 rounded text-white"
                      />
                      <button
                        onClick={loadWebPage}
                        className="self-start px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ) : activeTabId ? (
                  (() => {
                    const activeTab = tabs.find(tab => tab.id === activeTabId);
                    if (!activeTab) return null;
                    
                    return activeTab.type === 'file' && activeTab.path ? (
                      <CodeEditor 
                        filePath={activeTab.path} 
                        onSave={handleFileSave} 
                      />
                    ) : activeTab.type === 'web' && activeTab.url ? (
                      <iframe 
                        src={activeTab.url} 
                        className="w-full h-full"
                        title={activeTab.title}
                      />
                    ) : activeTab.type === 'git' ? (
                      <div className="w-full h-full">
                        <GitTool />
                      </div>
                    ) : null;
                  })()
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500">
                    Open a file or webpage to get started
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TerminalContent />
    </Suspense>
  );
}