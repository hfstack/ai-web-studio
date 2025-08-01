import { Server as NetServer } from "http";
import { NextApiRequest, NextApiResponse } from "next";
import { Server as ServerIO } from "socket.io";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponse) => {
  // Check if Socket.IO is already initialized globally
  if (!(global as any).socketIO) {
    console.log("Initializing Socket.IO server globally");
    
    // Get the HTTP server instance
    // @ts-expect-error - res.socket.server is not typed correctly in Next.js
    const httpServer: NetServer = res.socket.server;
    
    // Initialize Socket.IO
    const io = new ServerIO(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Handle connections
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      // Handle joining debug rooms
      socket.on("join-debug-room", (data) => {
        const { port } = data;
        const roomName = `debug-${port}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined room ${roomName}`);
        
        // Store socket reference in debug process map
        const { processMap } = require('./debug-with-terminal/route');
        console.log(`Looking for process in map for port ${port}, map exists:`, !!processMap, 'has port:', processMap?.has(port));
        if (processMap && processMap.has(port)) {
          const processInfo = processMap.get(port);
          if (processInfo) {
            // Update socket reference if needed
            if (!processInfo.socket) {
              processInfo.socket = io;
              console.log(`Socket reference stored for port ${port}, socket instance:`, !!io);
            }
            
            // Send any buffered output
            if (processInfo.outputBuffer && processInfo.outputBuffer.length > 0) {
              console.log(`Sending ${processInfo.outputBuffer.length} buffered messages for port ${port}`);
              processInfo.outputBuffer.forEach((bufferedData: string) => {
                io.to(roomName).emit('debug-output', {
                  port,
                  data: bufferedData,
                  timestamp: new Date().toISOString()
                });
              });
              // Clear the buffer after sending
              processInfo.outputBuffer = [];
            }
          }
        } else {
          console.log(`No process found in map for port ${port} when joining debug room`);
        }
      });

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        // Note: We don't clear the socket reference from processMap here
        // because multiple clients might be connected to the same debug room
        // The socket reference will be cleared when the process exits or times out
      });
    });

    // Store Socket.IO instance globally and on the server
    // @ts-expect-error - res.socket.server is not typed correctly in Next.js
    res.socket.server.io = io;
    (global as any).socketIO = io;
    
    // Return socket id for client to use
    res.status(200).json({ 
      success: true, 
      message: "Socket.IO server initialized",
      socketId: "server-initialized"
    });
  } else {
    console.log("Socket.IO already initialized");
    // Return existing socket info
    res.status(200).json({ 
      success: true, 
      message: "Socket.IO server already initialized",
      socketId: "server-already-initialized"
    });
  }
};

export default ioHandler;