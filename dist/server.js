"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var next_1 = require("next");
var http_1 = require("http");
var socket_io_1 = require("socket.io");
var terminal_server_1 = require("./src/lib/terminal-server");
var process_db_1 = require("./src/lib/process-db");
var dev = process.env.NODE_ENV !== 'production';
var app = (0, next_1.default)({ dev: dev });
var handle = app.getRequestHandler();
app.prepare().then(function () {
    var server = (0, http_1.createServer)(function (req, res) {
        // Forward requests to Next.js
        handle(req, res);
    });
    // Initialize Socket.IO with proper path configuration
    var io = new socket_io_1.Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        path: "/api/socket", // Custom path for socket.io
        transports: ["websocket", "polling"] // Enable both transports
    });
    console.log('Socket.IO server initialized with path: /api/socket');
    // Create terminal server instance
    var terminalServer = new terminal_server_1.TerminalServer();
    // Store socket-session mappings
    var socketToSessionMap = new Map();
    // Handle terminal session creation through Socket.IO
    io.on('connection', function (socket) {
        socket.on('create-terminal-session', function (data) {
            try {
                var projectId = data.projectId, path = data.path;
                // Check if there's already a session for this socket
                var existingSessionId = socketToSessionMap.get(socket.id);
                if (existingSessionId) {
                    // If there's an existing session, destroy it first
                    terminalServer.destroySession(existingSessionId);
                    socketToSessionMap.delete(socket.id);
                }
                var sessionId = terminalServer.createSession(projectId, path).sessionId;
                // Map socket to session
                socketToSessionMap.set(socket.id, sessionId);
                // Get the session and set up data listener
                var session = terminalServer.getSession(sessionId);
                if (session) {
                    var lastData_1 = '';
                    session.process.onData(function (data) {
                        // Check if current data includes lastData to avoid duplicates
                        if (!lastData_1 || !data.includes(lastData_1)) {
                            // Send terminal output to the specific client
                            socket.emit('terminal-output', data);
                            lastData_1 = data;
                        }
                    });
                }
                socket.emit('terminal-session-created', {
                    success: true,
                    sessionId: sessionId
                });
            }
            catch (error) {
                console.error('Error creating terminal session:', error);
                socket.emit('terminal-session-created', {
                    success: false,
                    error: 'Failed to create terminal session: ' + error.message
                });
            }
        });
        // Handle terminal input
        socket.on('terminal-input', function (data) {
            var sessionId = socketToSessionMap.get(socket.id);
            if (sessionId) {
                var success = terminalServer.writeToSession(sessionId, data);
                // If writing fails, it means the session is dead, so notify the client
                if (!success) {
                    socket.emit('session-error', {
                        message: 'Terminal session has ended. Please refresh the page.'
                    });
                }
            }
            else {
                socket.emit('session-error', {
                    message: 'No active terminal session. Please refresh the page.'
                });
            }
        });
        // Handle session cleanup
        socket.on('cleanup-session', function (data) {
            var sessionId = data.sessionId;
            if (sessionId) {
                terminalServer.destroySession(sessionId);
                // Clean up the mapping
                for (var _i = 0, _a = socketToSessionMap.entries(); _i < _a.length; _i++) {
                    var _b = _a[_i], sockId = _b[0], sessId = _b[1];
                    if (sessId === sessionId) {
                        socketToSessionMap.delete(sockId);
                        break;
                    }
                }
            }
        });
        socket.on('disconnect', function () {
            console.log('Client disconnected:', socket.id);
            // Clean up terminal session when client disconnects
            var sessionId = socketToSessionMap.get(socket.id);
            if (sessionId) {
                terminalServer.destroySession(sessionId);
                socketToSessionMap.delete(socket.id);
            }
        });
    });
    // 定时清理过期进程数据的任务
    function startCleanupTask() {
        // 每5分钟清理一次过期进程
        setInterval(function () {
            var deletedCount = (0, process_db_1.deleteExpiredProcesses)();
            if (deletedCount > 0) {
                console.log("Cleaned up ".concat(deletedCount, " expired processes"));
            }
        }, 5 * 60 * 1000); // 5分钟
    }
    var port = process.env.PORT || 3010;
    server.listen(port, function () {
        console.log("> Ready on http://localhost:".concat(port));
        startCleanupTask(); // 启动定时清理任务
    });
});
