'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface ConsoleTabProps {
  port: number;
  title: string;
  url: string;
  initialContent?: string;
  onContentChange?: (content: string) => void;
}

export default function ConsoleTab({ port, title, url, initialContent, onContentChange }: ConsoleTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [hasOutput, setHasOutput] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const terminalContent = useRef<string>(initialContent || ''); // 保存terminal内容

  useEffect(() => {
    let isMounted = true;

    const initTerminal = async () => {
      if (!terminalRef.current) return;

      // Dynamic imports for client-side only
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      if (!isMounted) return;

      // Get CSS variable values for terminal theme
      const getTerminalTheme = () => {
        const styles = getComputedStyle(document.documentElement);
        return {
          background: styles.getPropertyValue('--terminal-bg').trim() || '#1a202c',
          foreground: styles.getPropertyValue('--terminal-text').trim() || '#e2e8f0',
        };
      };

      // Create terminal instance if it doesn't exist
      if (!terminal.current) {
        terminal.current = new Terminal({
          rows: 24,
          theme: getTerminalTheme(),
        });

        // Add fit addon
        fitAddon.current = new FitAddon();
        terminal.current.loadAddon(fitAddon.current);
      }

      // Open terminal in container if not already opened
      if (!terminal.current.element) {
        terminal.current.open(terminalRef.current!);
        
        // 恢复之前的内容
        if (terminalContent.current) {
          terminal.current.write(terminalContent.current);
        }
      }

      // Fit terminal to container
      if (fitAddon.current) {
        fitAddon.current.fit();
      }

      // Handle terminal resizing
      const handleResize = () => {
        if (fitAddon.current && terminal.current) {
          setTimeout(() => {
            try {
              fitAddon.current?.fit();
            } catch (e) {
              console.warn('Failed to resize terminal:', e);
            }
          }, 100);
        }
      };

      window.addEventListener('resize', handleResize);
      
      // Update terminal theme when theme changes
      const handleThemeChange = () => {
        if (terminal.current) {
          terminal.current.options.theme = getTerminalTheme();
        }
      };

      window.addEventListener('theme-change', handleThemeChange);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('theme-change', handleThemeChange);
        
        // 清理terminal实例但不删除内容
        if (terminal.current) {
          terminal.current.dispose();
          terminal.current = null;
        }
      };
    };

    initTerminal();

    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize message polling for debug output
  useEffect(() => {
    let isMounted = true;
    let pollingInterval: NodeJS.Timeout;
    let lastTimestamp = '';
    let emptyMessageCount = 0;

    const pollMessages = async () => {
      try {
        const url = lastTimestamp 
          ? `/api/debug-messages?port=${port}&lastTimestamp=${encodeURIComponent(lastTimestamp)}`
          : `/api/debug-messages?port=${port}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.messages && data.messages.length > 0) {
          console.log(`Received ${data.messages.length} new messages for port ${port}`);
          
          if (terminal.current && isMounted) {
            data.messages.forEach((msg: any) => {
              terminal.current?.write(msg.data);
              // 保存到terminal内容中
              terminalContent.current += msg.data;
              // 通知父组件内容变化
              onContentChange?.(terminalContent.current);
              // 更新最后读取的时间戳
              if (msg.timestamp > lastTimestamp) {
                lastTimestamp = msg.timestamp;
              }
            });
            setHasOutput(true);
            emptyMessageCount = 0; // 重置空消息计数器
          }
        } else {
          // 没有新消息，增加计数器
          emptyMessageCount++;
          console.log(`No new messages for port ${port}, empty count: ${emptyMessageCount}`);
          
          // 如果连续10次都没有消息，停止轮询
          if (emptyMessageCount >= 10) {
            console.log(`Stopping polling for port ${port} after 10 empty responses`);
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null as any;
              setIsPolling(false);
            }
          }
        }
      } catch (error) {
        console.error('Error polling debug messages:', error);
      }
    };

    // Start polling
    pollingInterval = setInterval(pollMessages, 2000); // Poll every 2 seconds

    return () => {
      isMounted = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      
      // 清理terminal实例但不删除内容
      if (terminal.current) {
        terminal.current.dispose();
        terminal.current = null;
      }
    };
  }, [port]);

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col">
      <div className="bg-gray-800 p-2 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="text-green-400 text-sm">●</span>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-gray-400">Port: {port}</span>
          <span className={`text-xs ${isPolling ? 'text-blue-400' : 'text-gray-400'}`}>
            {isPolling ? 'Polling' : 'Polling stopped'}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {hasOutput ? 'Output received' : 'Waiting for output...'}
        </div>
      </div>
      <div 
        ref={terminalRef} 
        className="flex-1 overflow-hidden"
        style={{ minHeight: '300px' }}
      />
    </div>
  );
}