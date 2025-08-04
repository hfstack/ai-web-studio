"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalServer = void 0;
var node_pty_1 = require("node-pty");
var TerminalServer = /** @class */ (function () {
    function TerminalServer() {
        this.sessions = new Map();
    }
    TerminalServer.prototype.createSession = function (projectId, path) {
        var _this = this;
        var sessionId = Math.random().toString(36).substring(2, 15);
        // 创建 PTY 终端会话
        var bashProcess = (0, node_pty_1.spawn)('zsh', [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 30,
            cwd: path || process.cwd(),
            env: process.env
        });
        this.sessions.set(sessionId, {
            id: sessionId,
            process: bashProcess,
            projectId: projectId,
        });
        // 清理资源
        var onExit = function () {
            _this.sessions.delete(sessionId);
        };
        // node-pty 使用 onExit 方法处理进程退出
        bashProcess.onExit(onExit);
        return { sessionId: sessionId };
    };
    TerminalServer.prototype.getSession = function (sessionId) {
        return this.sessions.get(sessionId);
    };
    TerminalServer.prototype.destroySession = function (sessionId) {
        var session = this.sessions.get(sessionId);
        if (session) {
            try {
                session.process.kill();
            }
            catch (error) {
                console.error('Error killing terminal process:', error);
            }
            this.sessions.delete(sessionId);
            return true;
        }
        return false;
    };
    // Write data to a terminal session
    TerminalServer.prototype.writeToSession = function (sessionId, data) {
        var session = this.sessions.get(sessionId);
        if (session) {
            try {
                console.log('Writing to terminal process:', data);
                session.process.write(data);
                return true;
            }
            catch (error) {
                console.error('Error writing to terminal process:', error);
                // If writing fails, the session might be dead, so clean it up
                this.destroySession(sessionId);
                return false;
            }
        }
        return false;
    };
    return TerminalServer;
}());
exports.TerminalServer = TerminalServer;
