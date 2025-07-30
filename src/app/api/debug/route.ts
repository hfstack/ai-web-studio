import { NextResponse } from 'next/server';
import { spawn, IPty } from 'node-pty';
import { networkInterfaces } from 'os';
import { exec } from 'child_process';

// 进程超时时间（毫秒），默认30分钟
const PROCESS_TIMEOUT = 30 * 60 * 1000;

// 全局进程映射表，用于跟踪所有启动的进程和它们的计时器
interface ProcessInfo {
  process: IPty;
  timer: NodeJS.Timeout;
  startTime: number;
}

const processMap: Map<number, ProcessInfo> = new Map();

// 启动时检查并清理可能存在的僵尸进程
function cleanupZombieProcesses() {
  console.log('Checking for zombie processes...');
  exec('ps aux | grep node', (error, stdout) => {
    if (error) {
      console.error('Error checking processes:', error);
      return;
    }
    console.log('Current running processes:', stdout);
  });
}

export async function POST(request: Request) {
  try {
    const { command, port, path, timeout } = await request.json();
    
    // Validate inputs
    if (!command || !port) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing command or port' 
      }, { status: 400 });
    }
    
    // 自定义超时时间或使用默认值
    const processTimeout = timeout ? parseInt(timeout) : PROCESS_TIMEOUT;
    
    // 检查是否已有进程在使用该端口，如果有则关闭
    if (processMap.has(port)) {
      const existingProcessInfo = processMap.get(port);
      if (existingProcessInfo) {
        try {
          // 清除现有的计时器
          clearTimeout(existingProcessInfo.timer);
          // 关闭进程
          existingProcessInfo.process.kill();
          console.log(`Killed existing process on port ${port}`);
        } catch (err) {
          console.error(`Error killing process on port ${port}:`, err);
        }
        processMap.delete(port);
      }
    }
    
    // Get the current IP address
    const nets = networkInterfaces();
    let ipAddress = 'localhost';
    
    // Find the first non-internal IPv4 address
    outer: for (const name of Object.keys(nets)) {
      const net = nets[name];
      if (!net) continue;
      
      for (const iface of net) {
        if (!iface.internal && iface.family === 'IPv4') {
          ipAddress = iface.address;
          break outer;
        }
      }
    }
    
    // Create a new bash process
    const bashProcess = spawn('bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: path || process.cwd(),
      env: process.env
    });
    
    // 创建超时计时器
    const timer = setTimeout(() => {
      console.log(`Process on port ${port} timed out after ${processTimeout}ms`);
      if (processMap.has(port)) {
        const processInfo = processMap.get(port);
        if (processInfo) {
          try {
            processInfo.process.kill();
            console.log(`Auto-killed process on port ${port} due to timeout`);
          } catch (err) {
            console.error(`Error auto-killing process on port ${port}:`, err);
          }
          processMap.delete(port);
        }
      }
    }, processTimeout);
    
    // 将进程添加到映射表中
    processMap.set(port, {
      process: bashProcess,
      timer,
      startTime: Date.now()
    });
    
    // 监听进程退出事件，自动从映射表中移除
    bashProcess.onExit(() => {
      console.log(`Process on port ${port} exited`);
      if (processMap.has(port)) {
        const processInfo = processMap.get(port);
        if (processInfo) {
          clearTimeout(processInfo.timer);
        }
        processMap.delete(port);
      }
    });
    
    // Run the provided command
    bashProcess.write(`${command}\n`);
    
    // Return the URL to open
    return NextResponse.json({ 
      success: true,
      url: `http://${ipAddress}:${port}`,
      timeout: processTimeout,
      expiresAt: new Date(Date.now() + processTimeout).toISOString()
    });
  } catch (error) {
    console.error('Error running debug command:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// 获取当前所有活跃的进程信息
export async function GET() {
  try {
    const activeProcesses = Array.from(processMap.entries()).map(([port, info]) => {
      const runningTime = Date.now() - info.startTime;
      const remainingTime = Math.max(0, PROCESS_TIMEOUT - runningTime);
      
      return {
        port,
        startTime: new Date(info.startTime).toISOString(),
        runningTimeMs: runningTime,
        runningTimeFormatted: `${Math.floor(runningTime / 60000)}m ${Math.floor((runningTime % 60000) / 1000)}s`,
        remainingTimeMs: remainingTime,
        remainingTimeFormatted: `${Math.floor(remainingTime / 60000)}m ${Math.floor((remainingTime % 60000) / 1000)}s`,
        expiresAt: new Date(info.startTime + PROCESS_TIMEOUT).toISOString()
      };
    });
    
    return NextResponse.json({ 
      success: true, 
      activeProcesses,
      count: activeProcesses.length
    });
  } catch (error) {
    console.error('Error in GET request:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

// 添加DELETE端点用于关闭特定端口的进程
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const port = parseInt(url.searchParams.get('port') || '0');
    
    if (!port) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing port parameter' 
      }, { status: 400 });
    }
    
    if (!processMap.has(port)) {
      return NextResponse.json({ 
        success: false, 
        error: `No process found on port ${port}` 
      }, { status: 404 });
    }
    
    const processInfo = processMap.get(port);
    if (processInfo) {
      try {
        // 清除计时器
        clearTimeout(processInfo.timer);
        // 关闭进程
        processInfo.process.kill();
        console.log(`Killed process on port ${port}`);
        processMap.delete(port);
        return NextResponse.json({ 
          success: true, 
          message: `Process on port ${port} terminated` 
        });
      } catch (err) {
        console.error(`Error killing process on port ${port}:`, err);
        return NextResponse.json({ 
          success: false, 
          error: `Failed to kill process on port ${port}` 
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Unknown error' 
    }, { status: 500 });
  } catch (error) {
    console.error('Error in DELETE request:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}