import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

// Helper function to check if git is available
async function isGitAvailable() {
  try {
    await execPromise('git --version');
    return true;
  } catch {
    return false;
  }
}

// Helper function to check if a directory is a git repository
async function isGitRepository(projectPath: string) {
  try {
    await execPromise('git rev-parse --git-dir', { cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

// Get git status
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const projectRoot = searchParams.get('projectRoot');
  const action = searchParams.get('action') || 'status';
  
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
  }
  
  if (!projectRoot) {
    return NextResponse.json({ error: 'Project root is required' }, { status: 400 });
  }
  
  // Check if git is available
  if (!(await isGitAvailable())) {
    return NextResponse.json({ error: 'Git is not available on this system' }, { status: 500 });
  }
  
  try {
    const projectPath = projectRoot;
    
    // Check if project directory exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Project directory not found' }, { status: 404 });
    }
    
    // Check if it's a git repository
    if (!(await isGitRepository(projectPath))) {
      return NextResponse.json({ error: 'Project is not a git repository' }, { status: 400 });
    }
    
    let result;
    
    switch (action) {
      case 'status':
        result = await execPromise('git status --porcelain', { cwd: projectPath });
        const files = result.stdout.trim().split('\n').filter(line => line).map(line => {
          console.log(line)
          const status = line.trim().substring(0, 1).trim();
          const filePath = line.trim().substring(2);
          return { status, path: filePath };
        });
        return NextResponse.json({ files });
        
      case 'diff':
        const filePath = searchParams.get('filePath');
        if (!filePath) {
          return NextResponse.json({ error: 'File path is required for diff' }, { status: 400 });
        }
        result = await execPromise(`git diff HEAD -- "${filePath}"`, { cwd: projectPath });
        return NextResponse.json({ diff: result.stdout });
        
      case 'log':
        result = await execPromise('git log --oneline -10', { cwd: projectPath });
        const commits = result.stdout.trim().split('\n').filter(line => line).map(line => {
          const [hash, ...messageParts] = line.split(' ');
          return { hash, message: messageParts.join(' ') };
        });
        return NextResponse.json({ commits });
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Git operation error:', error);
    return NextResponse.json({ 
      error: error.message || 'An error occurred while executing git command',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
}

// Commit changes
export async function POST(request: Request) {
  try {
    // Check if git is available
    if (!(await isGitAvailable())) {
      return NextResponse.json({ error: 'Git is not available on this system' }, { status: 500 });
    }
    
    const { projectId, projectRoot, message, files } = await request.json();
    
    if (!projectId || !projectRoot || !message) {
      return NextResponse.json({ error: 'Project ID, project root, and commit message are required' }, { status: 400 });
    }
    
    const projectPath = projectRoot;
    
    // Check if project directory exists
    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({ error: 'Project directory not found' }, { status: 404 });
    }
    
    // Check if it's a git repository
    if (!(await isGitRepository(projectPath))) {
      return NextResponse.json({ error: 'Project is not a git repository' }, { status: 400 });
    }
    
    // Add files to git
    if (files && files.length > 0) {
      const addCommand = `git add ${files.map((f: string) => `"${f}"`).join(' ')}`;
      await execPromise(addCommand, { cwd: projectPath });
    } else {
      // Add all changes
      await execPromise('git add .', { cwd: projectPath });
    }
    
    // Commit changes
    await execPromise(`git commit -m "${message}"`, { cwd: projectPath });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Git commit error:', error);
    return NextResponse.json({ 
      error: error.message || 'An error occurred while committing changes',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
}