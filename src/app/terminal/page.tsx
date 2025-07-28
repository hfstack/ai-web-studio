'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import socketIOClient from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: Date;
}

function TerminalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [socket, setSocket] = useState<ReturnType<typeof socketIOClient> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          content: data,
          sender: 'system',
          timestamp: new Date()
        }
      ]);
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

  const handleSendMessage = () => {
    if (inputValue.trim() && socket) {
      // Add user message to chat
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          content: inputValue,
          sender: 'user',
          timestamp: new Date()
        }
      ]);
      
      // Send command to terminal
      console.log('Sending terminal input:', inputValue);
      socket.emit('terminal-input', inputValue + '\n');
      
      // Clear input
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

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
        {/* Chat-like Terminal Interface */}
        <div className="flex-1 flex flex-col">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
            {connectionError && (
              <div className="bg-red-900 text-red-200 p-3 rounded">
                {connectionError}
              </div>
            )}
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-4xl rounded-lg p-3 ${
                    message.sender === 'user' 
                      ? 'bg-blue-600 rounded-br-none' 
                      : 'bg-gray-800 rounded-bl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-700 p-4">
            <div className="flex items-center">
              <span className="text-green-400 mr-2">$</span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isConnected ? "Type a command..." : "Connecting..."}
                disabled={!isConnected}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || !isConnected}
                className={`ml-2 bg-blue-600 px-6 py-2 rounded-lg font-medium ${
                  inputValue.trim() && isConnected
                    ? 'hover:bg-blue-700'
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                Send
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {!isConnected && !connectionError && "Connecting to terminal..."}
              {connectionError && connectionError}
            </div>
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