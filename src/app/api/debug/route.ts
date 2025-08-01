import { NextResponse } from 'next/server';
import { spawn, IPty } from 'node-pty';
import { networkInterfaces } from 'os';
import { exec } from 'child_process';
import { 
  initializeDatabase, 
  saveProcess, 
  deleteProcess, 
  getAllProcesses, 
  getProcessByPort,
  deleteExpiredProcesses
} from '@/lib/process-db';

// 进程超时时间（毫秒），默认30分钟
const PROCESS_TIMEOUT = 30 * 60 * 1000;

// 全局进程映射表，用于跟踪所有启动的进程和它们的计时器
interface ProcessInfo {
  process: IPty;
  timer: NodeJS.Timeout;
  startTime: number;
}

const processMap: Map<number, ProcessInfo> = new Map();

// 初始化数据库
initializeDatabase();

// 启动时检查并清理可能存在的僵尸进程和过期数据
function cleanupZombieProcesses() {
  console.log('Checking for zombie processes...');
  exec('ps aux | grep node', (error, stdout) => {
    if (error) {
      console.error('Error checking processes:', error);
      return;
    }
    console.log('Current running processes:', stdout);
  });
  
  // 清理过期的进程数据
  const deletedCount = deleteExpiredProcesses();
  console.log(`Cleaned up ${deletedCount} expired processes from database`);
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
    
    // 检查数据库中是否已有进程在使用该端口，如果有则关闭
    const existingProcess = getProcessByPort(port);
    if (existingProcess) {
      // 如果内存中有对应的进程，先清理
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
      
      // 从数据库中删除旧记录
      deleteProcess(port);
    }
    
    // Get the current IP address
    const nets = networkInterfaces();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    
    const startTime = Date.now();
    
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
      // 从数据库中删除过期进程
      deleteProcess(port);
    }, processTimeout);
    
    // 将进程添加到映射表中
    processMap.set(port, {
      process: bashProcess,
      timer,
      startTime
    });
    // 保存进程信息到数据库
    saveProcess(port, command, path, bashProcess.pid, startTime, processTimeout);
    console.log('saved process to database', port, command)
    // 监听进程退出事件，自动从映射表中移除并从数据库中删除
    bashProcess.onExit(() => {
      console.log(`Process on port ${port} exited`);
      if (processMap.has(port)) {
        const processInfo = processMap.get(port);
        if (processInfo) {
          clearTimeout(processInfo.timer);
          // 只有当退出的进程是当前映射表中的进程时才删除数据库记录
          if (processInfo.process === bashProcess) {
            console.log(`Removing process on port ${port} from database`);
            processMap.delete(port);
            // 从数据库中删除已完成的进程
            deleteProcess(port);
          } else {
            console.log(`Process on port ${port} exited but a new process is running on this port`);
            processMap.delete(port);
          }
        }
      }
    });
    
    // Run the provided command
    bashProcess.write(`${command}\n`);
    
    // Return the URL to open
    return NextResponse.json({ 
      success: true,
      url: `http://localhost:${port}`,
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
    // 先清理过期的进程
    deleteExpiredProcesses();
    
    // 获取数据库中的所有进程
    const dbProcesses = getAllProcesses();
    
    const activeProcesses = dbProcesses.map(process => {
      const runningTime = Date.now() - process.start_time;
      const remainingTime = Math.max(0, process.timeout - runningTime);
      
      return {
        port: process.port,
        command: process.command,
        path: process.path || undefined,
        startTime: new Date(process.start_time).toISOString(),
        runningTimeMs: runningTime,
        runningTimeFormatted: `${Math.floor(runningTime / 60000)}m ${Math.floor((runningTime % 60000) / 1000)}s`,
        remainingTimeMs: remainingTime,
        remainingTimeFormatted: `${Math.floor(remainingTime / 60000)}m ${Math.floor((remainingTime % 60000) / 1000)}s`,
        expiresAt: new Date(process.start_time + process.timeout).toISOString()
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
    
    // 从数据库中查找进程
    const processEntry = getProcessByPort(port);
    if (!processEntry) {
      return NextResponse.json({ 
        success: false, 
        error: `No process found on port ${port}` 
      }, { status: 404 });
    }
    
    // 直接根据 processEntry 数据关闭进程
    try {
      // 使用 process.kill 发送终止信号给进程
      if (processEntry.pid) {
        process.kill(processEntry.pid);
      }
      console.log(`Killed process with PID ${processEntry.pid} on port ${port}`);
      
      // 如果进程也在内存映射表中，清理相关资源
      if (processMap.has(port)) {
        clearTimeout(processMap.get(port)?.timer);
        processMap.delete(port);
      }
    } catch (err) {
      console.error(`Error killing process on port ${port}:`, err);
    }
    
    // 从数据库中删除进程记录
    deleteProcess(port);
    
    return NextResponse.json({ 
      success: true, 
      message: `Process on port ${port} terminated` 
    });
  } catch (error) {
    console.error('Error in DELETE request:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}