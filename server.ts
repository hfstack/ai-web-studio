import next from 'next';
import { createServer } from 'http';
import { parse } from 'url';
import { join } from 'path';
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
  
  // Handle terminal session creation through Socket.IO
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('create-terminal-session', (data) => {
      try {
        const { projectId } = data;
        const { sessionId } = terminalServer.createSession(projectId);
        
        socket.emit('terminal-session-created', { 
          success: true, 
          sessionId 
        });
      } catch (error) {
        socket.emit('terminal-session-created', { 
          success: false, 
          error: 'Failed to create terminal session' 
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  const port = process.env.PORT || 3010;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});