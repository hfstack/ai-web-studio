import next from 'next';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { TerminalServer } from './src/lib/terminal-server';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Forward requests to Next.js
    handle(req, res);
  });

  // Initialize Socket.IO with proper path configuration
  const io = new SocketServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/api/socket", // Custom path for socket.io
    transports: ["websocket", "polling"] // Enable both transports
  });

  console.log('Socket.IO server initialized with path: /api/socket');

  // Create terminal server instance
  const terminalServer = new TerminalServer();
  
  // Store socket-session mappings
  const socketToSessionMap = new Map<string, string>();
  
  // Handle terminal session creation through Socket.IO
  io.on('connection', (socket) => {
    
    socket.on('create-terminal-session', (data) => {
      try {
        const { projectId, path } = data;
        
        // Check if there's already a session for this socket
        const existingSessionId = socketToSessionMap.get(socket.id);
        if (existingSessionId) {
          // If there's an existing session, destroy it first
          terminalServer.destroySession(existingSessionId);
          socketToSessionMap.delete(socket.id);
        }
        
        const { sessionId } = terminalServer.createSession(projectId, path);
        
        // Map socket to session
        socketToSessionMap.set(socket.id, sessionId);
        
        // Get the session and set up data listener
        const session = terminalServer.getSession(sessionId);
        if (session) {
          session.process.onData((data) => {
            // Send terminal output to the specific client
            socket.emit('terminal-output', data);
          });
        }
        
        socket.emit('terminal-session-created', { 
          success: true, 
          sessionId 
        });
      } catch (error) {
        console.error('Error creating terminal session:', error);
        socket.emit('terminal-session-created', { 
          success: false, 
          error: 'Failed to create terminal session: ' + (error as Error).message
        });
      }
    });
    
    // Handle terminal input
    socket.on('terminal-input', (data) => {
      const sessionId = socketToSessionMap.get(socket.id);
      if (sessionId) {
        const success = terminalServer.writeToSession(sessionId, data);
        // If writing fails, it means the session is dead, so notify the client
        if (!success) {
          socket.emit('session-error', { 
            message: 'Terminal session has ended. Please refresh the page.' 
          });
        }
      } else {
        socket.emit('session-error', { 
          message: 'No active terminal session. Please refresh the page.' 
        });
      }
    });
    
    // Handle session cleanup
    socket.on('cleanup-session', (data) => {
      const { sessionId } = data;
      if (sessionId) {
        terminalServer.destroySession(sessionId);
        // Clean up the mapping
        for (const [sockId, sessId] of socketToSessionMap.entries()) {
          if (sessId === sessionId) {
            socketToSessionMap.delete(sockId);
            break;
          }
        }
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      // Clean up terminal session when client disconnects
      const sessionId = socketToSessionMap.get(socket.id);
      if (sessionId) {
        terminalServer.destroySession(sessionId);
        socketToSessionMap.delete(socket.id);
      }
    });
  });

  const port = process.env.PORT || 3010;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});