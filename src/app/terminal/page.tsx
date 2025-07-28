'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import socketIOClient from 'socket.io-client';

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<any>(null);
  const fitAddon = useRef<any>(null);

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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Project Studio Terminal</h1>
        <div className="flex space-x-2">
          <button 
            onClick={handleGoHome}
            className="bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded text-sm"
          >
            Home
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* XTerm.js Terminal */}
        <div className="flex-1 flex flex-col">
          <div 
            ref={terminalRef} 
            className="flex-1 overflow-hidden"
          />
          
          {/* Connection status */}
          <div className="border-t border-gray-700 p-2 text-xs text-gray-500">
            {!isConnected && !connectionError && "Connecting to terminal..."}
            {connectionError && (
              <div className="bg-red-900 text-red-200 p-2 rounded">
                {connectionError}
              </div>
            )}
          </div>
        </div>
      </div>
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