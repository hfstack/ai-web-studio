import { spawn } from 'node-pty';

type TerminalSession = {
  id: string;
  process: ReturnType<typeof spawn>;
  projectId: string;
  lastActivity: number;
  isPersistent: boolean;
};

export class TerminalServer {
  private sessions: Map<string, TerminalSession> = new Map();
  private sessionTimeoutMs: number = 30 * 60 * 1000; // 30 minutes timeout
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTask();
  }

  createSession(projectId: string, path?: string, persistent: boolean = true): { sessionId: string } {
    const sessionId = Math.random().toString(36).substring(2, 15);
    // 创建 PTY 终端会话
    const bashProcess = spawn('bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: path || process.cwd(),
      env: process.env
    });
    this.sessions.set(sessionId, {
      id: sessionId,
      process: bashProcess,
      projectId,
      lastActivity: Date.now(),
      isPersistent: persistent,
    });

    // 清理资源
    const onExit = () => {
      this.sessions.delete(sessionId);
    };
    
    // node-pty 使用 onExit 方法处理进程退出
    bashProcess.onExit(onExit);

    return { sessionId };
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.process.kill();
      } catch (error) {
        console.error('Error killing terminal process:', error);
      }
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  // Force destroy session (for immediate cleanup)
  forceDestroySession(sessionId: string): boolean {
    return this.destroySession(sessionId);
  }

  // Get all persistent sessions for a project
  getPersistentSessions(projectId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.projectId === projectId && session.isPersistent
    );
  }

  // Clean up inactive sessions
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isPersistent && (now - session.lastActivity) > this.sessionTimeoutMs) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.destroySession(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} inactive terminal sessions`);
    }
  }

  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  // Cleanup method for server shutdown
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Destroy all sessions
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }
  }
  
  // Write data to a terminal session
  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        console.log('Writing to terminal process:', data)
        session.process.write(data);
        // Update activity timestamp
        session.lastActivity = Date.now();
        return true;
      } catch (error) {
        console.error('Error writing to terminal process:', error);
        // If writing fails, the session might be dead, so clean it up
        this.destroySession(sessionId);
        return false;
      }
    }
    return false;
  }
}