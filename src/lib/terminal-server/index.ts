import { spawn } from 'node-pty';

type TerminalSession = {
  id: string;
  process: ReturnType<typeof spawn>;
  projectId: string;
};

export class TerminalServer {
  private sessions: Map<string, TerminalSession> = new Map();

  createSession(projectId: string, path?: string): { sessionId: string } {
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
  
  // Write data to a terminal session
  writeToSession(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        console.log('Writing to terminal process:', data)
        session.process.write(data);
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