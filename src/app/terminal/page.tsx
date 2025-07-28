'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import socketIOClient from 'socket.io-client';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';

// Tab type
type Tab = {
  id: string;
  type: 'file' | 'web';
  title: string;
  path?: string; // For file tabs
  url?: string;  // For web tabs
};

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

  // Dynamically import xterm only on client side
  useEffect(() => {
    let isMounted = true;

    const initTerminal = async () => {
      if (!terminalRef.current || terminal.current) return;

      // Dynamic imports for client-side only
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (!isMounted) return;

      // Create terminal instance
      terminal.current = new Terminal({
        rows: 30,
        theme: {
          background: '#1a202c', // gray-900
          foreground: '#e2e8f0', // gray-200
        },
      });

      // Add fit addon
      fitAddon.current = new FitAddon();
      terminal.current.loadAddon(fitAddon.current);

      // Open terminal in container
      terminal.current.open(terminalRef.current!);

      // Fit terminal to container
      fitAddon.current.fit();

      // Handle terminal input
      terminal.current.onData((data: string) => {
        if (socket && isConnected) {
          socket.emit('terminal-input', data);
        }
      });
    };

    initTerminal();

    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);

      // Dispose terminal
      if (terminal.current) {
        terminal.current.dispose();
      }
    };
  }, [socket, isConnected]);

  // Initialize terminal and socket connection
  useEffect(() => {
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
        projectId: searchParams.get('projectId')
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
    
    setSocket(newSocket);
    
    // Cleanup on unmount
    return () => {
      if (newSocket) {
        if (sessionId) {
          newSocket.emit('cleanup-session', { sessionId });
        }
        newSocket.close();
      }
    };
  }, []);

  const handleGoHome = () => {
    router.push('/');
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Project Studio</h1>
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
            onClick={handleGoHome}
            className="bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Home
          </button>
        </div>
      </header>

      {isMobile ? (
        // Mobile layout - vertical stack
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Terminal Section - Top */}
          <div className="h-1/2 flex flex-col border-b border-gray-700">
            <div className="p-2 bg-gray-800 text-sm font-medium">
              Terminal
            </div>
            <div 
              ref={terminalRef} 
              className="flex-1 overflow-hidden p-2"
            />
            <div className="border-t border-gray-700 p-2 text-xs text-gray-500">
              {!isConnected && !connectionError && "Connecting to terminal..."}
              {connectionError && (
                <div className="bg-red-900 text-red-200 p-2 rounded">
                  {connectionError}
                </div>
              )}
            </div>
          </div>

          {/* IDE Section - Bottom */}
          <div className="h-1/2 flex flex-col">
            <div className="p-2 bg-gray-800 text-sm font-medium flex justify-between items-center">
              <span>Online IDE</span>
              <div className="flex space-x-2">
                <button 
                  onClick={openWebViewer}
                  className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded text-xs"
                >
                  Web
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
                    <span className="mr-2">{tab.type === 'file' ? '📄' : '🌐'}</span>
                    <span className="truncate max-w-xs">{tab.title}</span>
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
                  ) : null;
                })()
              ) : (
                // Empty state
                <div className="flex-1 flex items-center justify-center text-gray-500 w-full">
                  Open a file or webpage to get started
                </div>
              )}
            </div>
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
            <div className="border-t border-gray-700 p-2 text-xs text-gray-500">
              {!isConnected && !connectionError && "Connecting to terminal..."}
              {connectionError && (
                <div className="bg-red-900 text-red-200 p-2 rounded">
                  {connectionError}
                </div>
              )}
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
                    <span className="mr-2">{tab.type === 'file' ? '📄' : '🌐'}</span>
                    <span className="truncate max-w-xs">{tab.title}</span>
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
                {activeTabId ? (
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