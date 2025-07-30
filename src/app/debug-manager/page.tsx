'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './styles.module.css';

interface ProcessInfo {
  port: number;
  startTime: string;
  runningTimeMs: number;
  runningTimeFormatted: string;
  remainingTimeMs: number;
  remainingTimeFormatted: string;
  expiresAt: string;
}

interface ApiResponse {
  success: boolean;
  activeProcesses: ProcessInfo[];
  count: number;
  error?: string;
}

export default function DebugManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const router = useRouter();

  // 获取所有活跃进程
  const fetchProcesses = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/debug', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data: ApiResponse = await response.json();
      
      if (data.success) {
        setProcesses(data.activeProcesses);
        setError(null);
      } else {
        setError(data.error || '获取进程列表失败');
      }
    } catch (err) {
      setError('获取进程列表时发生错误');
      console.error('Error fetching processes:', err);
    } finally {
      setLoading(false);
    }
  };

  // 终止指定端口的进程
  const terminateProcess = async (port: number) => {
    try {
      const response = await fetch(`/api/debug?port=${port}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        // 重新获取进程列表
        fetchProcesses();
      } else {
        setError(data.error || `终止端口 ${port} 的进程失败`);
      }
    } catch (err) {
      setError(`终止端口 ${port} 的进程时发生错误`);
      console.error(`Error terminating process on port ${port}:`, err);
    }
  };

  // 访问指定端口的应用
  const openProcess = (port: number) => {
    // 获取当前主机名
    const hostname = window.location.hostname;
    window.open(`http://${hostname}:${port}`, '_blank');
  };

  // 定期刷新进程列表
  useEffect(() => {
    fetchProcesses();
    
    const intervalId = setInterval(() => {
      fetchProcesses();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Debug 进程管理器</h1>
      
      <div className={styles.controls}>
        <button 
          onClick={fetchProcesses} 
          className={styles.refreshButton}
          disabled={loading}
        >
          {loading ? '刷新中...' : '刷新列表'}
        </button>
        
        <div className={styles.refreshControl}>
          <label htmlFor="refreshInterval">自动刷新间隔 (毫秒):</label>
          <input
            id="refreshInterval"
            type="number"
            min="1000"
            step="1000"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className={styles.input}
          />
        </div>
      </div>
      
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => setError(null)} className={styles.closeButton}>
            关闭
          </button>
        </div>
      )}
      
      {processes.length === 0 ? (
        <div className={styles.emptyState}>
          {loading ? '加载中...' : '当前没有运行中的 Debug 进程'}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.processTable}>
            <thead>
              <tr>
                <th>端口</th>
                <th>启动时间</th>
                <th>已运行时间</th>
                <th>剩余时间</th>
                <th>过期时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((process) => (
                <tr key={process.port}>
                  <td>{process.port}</td>
                  <td>{new Date(process.startTime).toLocaleString()}</td>
                  <td>{process.runningTimeFormatted}</td>
                  <td>{process.remainingTimeFormatted}</td>
                  <td>{new Date(process.expiresAt).toLocaleString()}</td>
                  <td className={styles.actions}>
                    <button
                      onClick={() => openProcess(process.port)}
                      className={styles.openButton}
                    >
                      访问
                    </button>
                    <button
                      onClick={() => terminateProcess(process.port)}
                      className={styles.terminateButton}
                    >
                      终止
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}