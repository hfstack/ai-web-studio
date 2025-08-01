import Database from 'better-sqlite3';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IPty } from 'node-pty';
import path from 'path';

// 数据库文件路径
const DB_PATH = path.join(process.cwd(), '.data', 'processes.db');

// 创建数据库连接
const db = new Database(DB_PATH);

// 初始化数据库表
export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS processes (
      port INTEGER PRIMARY KEY,
      command TEXT NOT NULL,
      path TEXT,
      pid INTEGER,
      start_time INTEGER NOT NULL,
      timeout INTEGER NOT NULL,
      timer_id INTEGER
    )
  `);
  
  // 添加索引以提高查询性能
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_start_time ON processes(start_time);
  `);
}

// 保存进程信息
export function saveProcess(port: number, command: string, cwd: string | undefined, pid: number, startTime: number, timeout: number) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO processes (port, command, path, pid, start_time, timeout) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(port, command, cwd, pid, startTime, timeout);
}

// 更新进程的定时器 ID
export function updateProcessTimerId(port: number, timerId: number) {
  const stmt = db.prepare('UPDATE processes SET timer_id = ? WHERE port = ?');
  stmt.run(timerId, port);
}

// 获取所有进程信息
export function getAllProcesses(): Array<{
  port: number;
  command: string;
  path: string | null;
  pid: number | null;
  start_time: number;
  timeout: number;
  timer_id: number | null;
}> {
  const stmt = db.prepare('SELECT * FROM processes');
  return stmt.all() as Array<{
    port: number;
    command: string;
    path: string | null;
    pid: number | null;
    start_time: number;
    timeout: number;
    timer_id: number | null;
  }>;
}

// 根据端口获取进程信息
export function getProcessByPort(port: number): {
  port: number;
  command: string;
  path: string | null;
  pid: number | null;
  start_time: number;
  timeout: number;
  timer_id: number | null;
} | null {
  const stmt = db.prepare('SELECT * FROM processes WHERE port = ?');
  return stmt.get(port) as {
    port: number;
    command: string;
    path: string | null;
    pid: number | null;
    start_time: number;
    timeout: number;
    timer_id: number | null;
  } | null;
}

// 删除进程信息
export function deleteProcess(port: number) {
  const stmt = db.prepare('DELETE FROM processes WHERE port = ?');
  console.log(`Deleting process on port ${port}`);
  stmt.run(port);
}

// 删除过期的进程信息
export function deleteExpiredProcesses() {
  const now = Date.now();
  const stmt = db.prepare('DELETE FROM processes WHERE start_time + timeout < ?');
  const result = stmt.run(now);
  console.log(`Deleted ${result.changes} expired processes`);
  return result.changes; // 返回删除的行数
}

// 清理所有进程数据
export function clearAllProcesses() {
  const stmt = db.prepare('DELETE FROM processes');
  console.log(`Cleared all processes`);
  stmt.run();
}

// 导出数据库实例（用于测试或其他用途）
export { db };