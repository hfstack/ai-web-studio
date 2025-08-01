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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();

  // Fetch all active processes
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
        setError(data.error || 'Failed to fetch process list');
      }
    } catch (err) {
      setError('Error occurred while fetching process list');
      console.error('Error fetching processes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Terminate process on specified port
  const terminateProcess = async (port: number) => {
    try {
      const response = await fetch(`/api/debug?port=${port}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        // Refresh process list
        fetchProcesses();
      } else {
        setError(data.error || `Failed to terminate process on port ${port}`);
      }
    } catch (err) {
      setError(`Error occurred while terminating process on port ${port}`);
      console.error(`Error terminating process on port ${port}:`, err);
    }
  };

  // Open application on specified port
  const openProcess = (port: number) => {
    // Get current hostname
    const hostname = window.location.hostname;
    window.open(`http://${hostname}:${port}`, '_blank');
  };

  // Periodically refresh process list
  useEffect(() => {
    fetchProcesses();
    
    const intervalId = setInterval(() => {
      fetchProcesses();
    }, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Debug Process Manager</h1>
      
      <div className={styles.controls}>
        <button 
          onClick={fetchProcesses} 
          className={styles.refreshButton}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh List'}
        </button>
        
        <div className={styles.refreshControl}>
          <label htmlFor="refreshInterval">Auto-refresh Interval (ms):</label>
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
            Close
          </button>
        </div>
      )}
      
      {processes.length === 0 ? (
        <div className={styles.emptyState}>
          {loading ? 'Loading...' : 'No debug processes currently running'}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.processTable}>
            <thead>
              <tr>
                <th>Port</th>
                <th>Start Time</th>
                <th>Running Time</th>
                <th>Remaining Time</th>
                <th>Expires At</th>
                <th>Actions</th>
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
                      Open
                    </button>
                    <button
                      onClick={() => terminateProcess(process.port)}
                      className={styles.terminateButton}
                    >
                      Terminate
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