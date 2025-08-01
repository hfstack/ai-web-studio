// 全局进程映射表，用于跟踪所有启动的进程和它们的计时器
import { IPty } from 'node-pty';
import { Server as ServerIO } from 'socket.io';

export interface ProcessInfo {
  process: IPty;
  timer: NodeJS.Timeout;
  startTime: number;
  socket: ServerIO | null;
  outputBuffer: string[]; // Buffer to store output until socket is connected
}

// 导出processMap以便其他模块访问
export const processMap: Map<number, ProcessInfo> = new Map();

// 全局消息队列，用于存储待发送的消息
export const messageQueue: Map<number, Array<{data: string, timestamp: string}>> = new Map();