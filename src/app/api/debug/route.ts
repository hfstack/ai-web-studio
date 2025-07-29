import { NextResponse } from 'next/server';
import { spawn } from 'node-pty';
import { networkInterfaces } from 'os';

export async function POST(request: Request) {
  try {
    const { command, port, path } = await request.json();
    
    // Validate inputs
    if (!command || !port) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing command or port' 
      }, { status: 400 });
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
    
    // Run the provided command
    bashProcess.write(`${command}\n`);
    
    // Return the URL to open
    return NextResponse.json({ 
      success: true,
      url: `http://${ipAddress}:${port}`
    });
  } catch (error) {
    console.error('Error running debug command:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}