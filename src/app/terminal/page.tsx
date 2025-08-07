'use client';

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import socketIOClient from 'socket.io-client';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import GitTool from './components/GitTool';
import ConsoleTab from './components/ConsoleTab';
import DebugModal from './components/DebugModal';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';

// Tab type
type Tab = {
  id: string;
  type: 'file' | 'web' | 'git' | 'console';
  title: string;
  path?: string; // For file tabs
  url?: string;  // For web tabs
  port?: number; // For console tabs
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
  const { logout, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // 默认假设是移动设备，避免布局闪烁
  const [isMobile, setIsMobile] = useState(true);
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [showWebViewer, setShowWebViewer] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  // 移动端默认折叠IDE
  const [isIdeCollapsed, setIsIdeCollapsed] = useState(true);
  const [debugPort, setDebugPort] = useState('3030');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [showDebugConfig, setShowDebugConfig] = useState(false);
  const [isTerminalInitialized, setIsTerminalInitialized] = useState(false);
  const [projectCommand, setProjectCommand] = useState('');
  const [availableScripts, setAvailableScripts] = useState<{key: string, command: string}[]>([]);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const consoleContentCache = useRef<Map<number, string>>(new Map());

  // Detect mobile device
  useEffect(() => {
    const checkIsMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // 如果是移动设备，确保IDE是折叠状态
      if (mobile) {
        setIsIdeCollapsed(true);
      }
    };
    
    // 立即执行检测
    checkIsMobile();
    
    // 添加窗口大小变化监听
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
            fitAddon.current?.fit();
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

    // Add keyboard shortcut for scrolling to bottom
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'End' && e.ctrlKey) {
        e.preventDefault();
        handleScrollToBottom();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Cleanup listener
    return () => {
      if (dataListener) {
        dataListener.dispose();
      }
      document.removeEventListener('keydown', handleKeyDown);
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
      reconnectionAttempts: 20, // Increased from 5 to 20
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Max 5 seconds between attempts
      timeout: 30000, // 30 seconds connection timeout
    });

    newSocket.on('connect', () => {
      console.log('Connected to server with socket ID:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);

      // Try to restore existing session first, otherwise create new one
      if (sessionId) {
        console.log('Attempting to restore session:', sessionId);
        newSocket.emit('restore-terminal-session', {
          projectId: searchParams.get('projectId'),
          sessionId: sessionId
        });
      } else {
        // Create terminal session through Socket.IO
        newSocket.emit('create-terminal-session', {
          projectId: searchParams.get('projectId'),
          path: searchParams.get('path') || '/' // 使用URL中的path参数，如果没有则默认为根目录
        });
      }
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

    // Handle terminal session restore response
    newSocket.on('terminal-session-restored', (data) => {
      if (data.success) {
        console.log('Terminal session restored:', data.sessionId);
        // Session ID remains the same, just update connection state
      } else {
        console.log('Session restore failed, creating new session:', data.error);
        // If restore fails, create a new session
        setSessionId(null);
        newSocket.emit('create-terminal-session', {
          projectId: searchParams.get('projectId'),
          path: searchParams.get('path') || '/'
        });
      }
    });
    
    // Handle session errors
    newSocket.on('session-error', (data) => {
      console.error('Session error:', data.message);
      setConnectionError(data.message);
      // Reset session so it can be recreated
      setSessionId(null);
    });

    // Handle heartbeat acknowledgment
    newSocket.on('terminal-heartbeat-ack', (data) => {
      console.log('Heartbeat acknowledged:', data.timestamp);
    });
    
    setSocket(newSocket);
    
    // Start heartbeat mechanism
    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected && sessionId) {
        newSocket.emit('terminal-heartbeat', { sessionId });
      }
    }, 30000); // Send heartbeat every 30 seconds
    
    // Return cleanup function
    return () => {
      // Clean up heartbeat interval
      clearInterval(heartbeatInterval);
      
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
        newSocket.off('terminal-session-restored');
        newSocket.off('session-error');
        newSocket.off('terminal-heartbeat-ack');

        // Close the socket
        newSocket.close();
      }
    };
  }, [searchParams]); // Add searchParams, sessionId, and socket dependencies

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

  // Check and cache project ID and path
  useEffect(() => {
    const projectId = searchParams.get('projectId');
    const path = searchParams.get('path');
    
    if (projectId) {
      // Check if project path is already cached
      const cachedPath = localStorage.getItem(projectId);
      if (!cachedPath && path) {
        // Cache project path if not already cached
        localStorage.setItem(projectId, `project_${path}`);
        console.log(`Cached project path for ${projectId}: ${path}`);
      }
    }
  }, [searchParams]);

  // Load project package.json to get all scripts
  useEffect(() => {
    const loadProjectScripts = async () => {
      const currentProjectId = searchParams.get('projectId');
      const projectRoot = localStorage.getItem(currentProjectId || '')?.split('project_')[1] || ''; 
      
      if (projectRoot) {
        try {
          const response = await fetch(`/api/files?projectId=${currentProjectId}&path=${encodeURIComponent(`package.json`)}&projectRoot=${encodeURIComponent(projectRoot)}`, {
            method: 'GET',
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.content) {
              const packageJson = JSON.parse(data.content);
              const scripts = packageJson.scripts || {};
              
              // Convert scripts object to array of {key, command}
              const scriptsArray = Object.entries(scripts).map(([key, command]) => ({
                key,
                command: command as string
              }));
              
              setAvailableScripts(scriptsArray);
              
              // Set default command (start > dev > serve > first available)
              const defaultCommand = scripts.start || scripts.dev || scripts.serve || scriptsArray[0]?.command || '';
              setProjectCommand(defaultCommand);
            }
          }
        } catch (error) {
          console.error('Error loading package.json:', error);
        }
      }
    };
    
    loadProjectScripts();
  }, [searchParams]);

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
      const currentProjectId = searchParams.get('projectId');
      const projectRoot = localStorage.getItem(currentProjectId || '')?.split('project_')[1] || ''; 
      
      // Get command from package.json or use empty string
      let command = projectCommand;
      
      // Add port parameter if port is specified
      if (debugPort && command) {
        command = `${command} --port ${debugPort}`;
      }
      
      const response = await fetch('/api/debug-with-terminal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          port: debugPort,
          path: projectRoot
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.url) {
        // Set webUrl and directly create a new tab for the web page
        const url = data.url;
        
        // Create new tab for web page
        const webTab: Tab = {
          id: `web-${Date.now()}`,
          type: 'web',
          title: url.replace(/^https?:\/\//, '').split('/')[0],
          url: url
        };
        
        // Create new tab for console output
        const consoleTab: Tab = {
          id: `console-${Date.now()}`,
          type: 'console',
          title: `Console Port ${debugPort}`,
          url: url,
          port: parseInt(debugPort)
        };
        
        setTabs(prev => [...prev, webTab, consoleTab]);
        setActiveTabId(consoleTab.id);
        setShowDebugModal(false); // Close modal after successful run
        if (isMobile) {
         setIsIdeCollapsed(false);
        }
      } else {
        console.error('Failed to run debug command:', data.error);
      }
    } catch (error) {
      console.error('Error running debug command:', error);
    }
  };

  const handleOpenDebugModal = () => {
    setShowDebugModal(true);
  };

  const handleCloseDebugModal = () => {
    setShowDebugModal(false);
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
    // 在移动端，如果IDE处于折叠状态，先展开IDE
    if (isMobile && isIdeCollapsed) {
      setIsIdeCollapsed(false);
    }
    setShowWebViewer(true);
  };

  const openGitTool = () => {
    // 在移动端，如果IDE处于折叠状态，先展开IDE
    if (isMobile && isIdeCollapsed) {
      setIsIdeCollapsed(false);
    }
    
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
      const closedTab = prev.find(tab => tab.id === tabId);
      const newTabs = prev.filter(tab => tab.id !== tabId);
      
      // Clear console cache if closing a console tab
      if (closedTab?.type === 'console' && closedTab.port) {
        consoleContentCache.current.delete(closedTab.port);
      }
      
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
    // 在移动端，如果IDE处于折叠状态，先展开IDE
    if (isMobile && isIdeCollapsed) {
      setIsIdeCollapsed(false);
    }
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

  const handleScrollToBottom = () => {
    if (terminal.current) {
      terminal.current.scrollToBottom();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <h1 className="text-lg sm:text-xl font-bold">AIWebStudio</h1>
          <span className="text-sm text-gray-400 truncate max-w-[100px] sm:max-w-none">
            Welcome, {user?.username}
          </span>
        </div>
        <div className="flex space-x-2">
          <button 
            onClick={handleOpenDebugModal}
            className="hidden sm:block bg-blue-600 hover:bg-blue-700 text-white py-1 px-3 rounded text-sm"
          >
            Debug
          </button>
          <button 
            onClick={toggleTheme}
            className="hidden sm:block bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Theme
          </button>
          <button 
            onClick={handleGoHome}
            className="hidden sm:block bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Home
          </button>
          <button 
            onClick={logout}
            className="hidden sm:block bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded text-sm"
          >
            Logout
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Sidebar */}
      <div className={`fixed inset-0 z-50 sm:hidden ${mobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className={`fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileMenuOpen(false)}></div>
        <div className={`fixed right-0 top-0 h-full w-64 bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Menu</h3>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Quick Actions</h4>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleOpenDebugModal();
                }}
                className="w-full text-left px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                Debug
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  toggleTheme();
                }}
                className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Theme
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openWebViewer();
                }}
                className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Open Web Page
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openGitTool();
                }}
                className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Git Tool
              </button>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Navigation</h4>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleGoHome();
                }}
                className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Home
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  toggleFileExplorer();
                }}
                className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                {showFileExplorer ? 'Hide Files' : 'Show Files'}
              </button>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Account</h4>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
              >
                Logout
              </button>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Open Tabs ({tabs.length})</h4>
              {tabs.slice(0, 5).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setActiveTabId(tab.id);
                  }}
                  className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm truncate"
                >
                  <span className="mr-2">{tab.type === 'file' ? '📄' : tab.type === 'web' ? '🌐' : tab.type === 'console' ? '🖥️' : 'Git'}</span>
                  {tab.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Debug Modal */}
      <DebugModal
        isOpen={showDebugModal}
        onClose={handleCloseDebugModal}
        projectCommand={projectCommand}
        setProjectCommand={setProjectCommand}
        debugPort={debugPort}
        setDebugPort={setDebugPort}
        availableScripts={availableScripts}
        onRunDebug={handleDebugCommand}
      />

      {isMobile ? (
        // Mobile layout - vertical stack with flex
        <div className="flex flex-col flex-1 overflow-auto" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)' }}>
          {/* Terminal Section - Top (always at top) */}
          <div className={`flex flex-col border-b border-gray-700 ${isIdeCollapsed ? 'flex-1' : 'h-1/3'}`} style={{ order: 1 }}>
            <div className="p-2 bg-gray-800 text-sm font-medium">
              Terminal
            </div>
            <div 
              ref={terminalRef} 
              className="flex-1 overflow-hidden p-2 terminal-container"
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
              <div className="flex space-x-3">
                <button 
                  onClick={handleArrowUp}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ↑
                </button>
                <button 
                  onClick={handleArrowDown}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ↓
                </button>
                <button 
                  onClick={handleEnter}
                  disabled={!isConnected || !sessionId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ⏎
                </button>
                <button 
                  onClick={handleScrollToBottom}
                  disabled={!isConnected || !sessionId}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                  title="Scroll to bottom"
                >
                  ↓↓
                </button>
                <button 
                  onClick={handleCtrlC}
                  disabled={!isConnected || !sessionId}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ⌃C
                </button>
              </div>
            </div>
          </div>

          {/* IDE Section - Bottom (always at bottom) */}
          <div className={`flex flex-col ${isIdeCollapsed ? 'h-auto' : 'h-2/3'}`} style={{ order: 2, minHeight: isIdeCollapsed ? '2.5rem' : 'auto' }}>
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
                        <span className="mr-2">{tab.type === 'file' ? '📄' : tab.type === 'web' ? '🌐' : tab.type === 'console' ? '🖥️' : 'Git'}</span>
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
                      ) : activeTab.type === 'console' && activeTab.port ? (
                        <ConsoleTab 
                          port={activeTab.port}
                          title={activeTab.title}
                          url={activeTab.url || ''}
                          initialContent={consoleContentCache.current.get(activeTab.port) || ''}
                          onContentChange={(content) => {
                            consoleContentCache.current.set(activeTab.port!, content);
                          }}
                        />
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
              className="flex-1 overflow-hidden p-2 terminal-container"
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
              <div className="flex space-x-3">
                <button 
                  onClick={handleArrowUp}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ↑
                </button>
                <button 
                  onClick={handleArrowDown}
                  disabled={!isConnected || !sessionId}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ↓
                </button>
                <button 
                  onClick={handleEnter}
                  disabled={!isConnected || !sessionId}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                >
                  ⏎
                </button>
                <button 
                  onClick={handleScrollToBottom}
                  disabled={!isConnected || !sessionId}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
                  title="Ctrl+End to scroll to bottom"
                >
                  ↓↓
                </button>
                <button 
                  onClick={handleCtrlC}
                  disabled={!isConnected || !sessionId}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white px-3 py-2 rounded text-sm"
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
                    <span className="mr-2">{tab.type === 'file' ? '📄' : tab.type === 'web' ? '🌐' : tab.type === 'console' ? '🖥️' : 'Git'}</span>
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
                    ) : activeTab.type === 'console' && activeTab.port ? (
                      <ConsoleTab 
                        port={activeTab.port}
                        title={activeTab.title}
                        url={activeTab.url || ''}
                        initialContent={consoleContentCache.current.get(activeTab.port) || ''}
                        onContentChange={(content) => {
                          consoleContentCache.current.set(activeTab.port!, content);
                        }}
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
    <AuthGuard>
      <Suspense fallback={<div>Loading...</div>}>
        <TerminalContent />
      </Suspense>
    </AuthGuard>
  );
}