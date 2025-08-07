import next from 'next';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { TerminalServer } from './src/lib/terminal-server/index';
import { deleteExpiredProcesses } from './src/lib/process-db';

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
 console.log('Initializing Socket.IO server');
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
          let lastData = '';
          session.process.onData((data) => {
            // 如果新的data包含上一次的data，则跳过上一次的data发送
            if (lastData && data.includes(lastData)) {
              const newData = data.replace(lastData, '');
              if (newData) {
                socket.emit('terminal-output', newData);
              }
            } else {
              socket.emit('terminal-output', data);
            }
            lastData = data;
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

    // Handle session restore for reconnection
    socket.on('restore-terminal-session', (data) => {
      try {
        const { projectId, sessionId } = data;
        
        // Check if the session exists and is persistent
        const session = terminalServer.getSession(sessionId);
        if (session && session.projectId === projectId) {
          // Update activity and remap to new socket
          terminalServer.updateSessionActivity(sessionId);
          socketToSessionMap.set(socket.id, sessionId);
          
          // Set up data listener for the restored session
          let lastData = '';
          session.process.onData((data) => {
            if (lastData && data.includes(lastData)) {
              const newData = data.replace(lastData, '');
              if (newData) {
                socket.emit('terminal-output', newData);
              }
            } else {
              socket.emit('terminal-output', data);
            }
            lastData = data;
          });
          
          socket.emit('terminal-session-restored', { 
            success: true, 
            sessionId 
          });
        } else {
          socket.emit('terminal-session-restored', { 
            success: false, 
            error: 'Session not found or expired'
          });
        }
      } catch (error) {
        console.error('Error restoring terminal session:', error);
        socket.emit('terminal-session-restored', { 
          success: false, 
          error: 'Failed to restore terminal session: ' + (error as Error).message
        });
      }
    });

    // Handle heartbeat
    socket.on('terminal-heartbeat', (data) => {
      const { sessionId } = data;
      if (sessionId) {
        terminalServer.updateSessionActivity(sessionId);
      }
      socket.emit('terminal-heartbeat-ack', { timestamp: Date.now() });
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
        terminalServer.forceDestroySession(sessionId);
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
      // Don't immediately destroy session - keep it for potential reconnection
      // Just remove the socket mapping, session will be cleaned up by inactivity timeout
      socketToSessionMap.delete(socket.id);
    });
  });

  // 定时清理过期进程数据的任务
function startCleanupTask() {
  // 每5分钟清理一次过期进程
  setInterval(() => {
    const deletedCount = deleteExpiredProcesses();
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired processes`);
    }
  }, 5 * 60 * 1000); // 5分钟
}

const port = process.env.PORT || 3010;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    startCleanupTask(); // 启动定时清理任务
  });
});