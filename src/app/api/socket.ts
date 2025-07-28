import { Server as NetServer } from "http";
import { NextApiRequest, NextApiResponse } from "next";
import { Server as ServerIO } from "socket.io";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponse) => {
  // Check if Socket.IO is already initialized
  // @ts-expect-error - res.socket.server is not typed correctly in Next.js
  if (!res.socket.server.io) {
    console.log("Initializing Socket.IO server");
    
    // Get the HTTP server instance
    // @ts-expect-error - res.socket.server is not typed correctly in Next.js
    const httpServer: NetServer = res.socket.server;
    
    // Initialize Socket.IO
    const io = new ServerIO(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
    });

    // Handle connections
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });
    });

    // Attach the Socket.IO instance to the HTTP server
    // @ts-expect-error - res.socket.server is not typed correctly in Next.js
    res.socket.server.io = io;
  }
  
  res.end();
};

export default ioHandler;