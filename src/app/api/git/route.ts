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
        // Get all changes (staged and unstaged)
        result = await execPromise('git status --porcelain', { cwd: projectPath });
        const allFiles = result.stdout.trim().split('\n').filter(line => line).map(line => {
          const status = line.substring(0, 2);
          const filePath = line.substring(3).trim();
          return { status, path: filePath };
        });
        
        // Separate staged and unstaged files
        const stagedFiles = allFiles.filter(file => 
          file.status.startsWith('A') || 
          file.status.startsWith('M') || 
          file.status.startsWith('D')
        );
        
        const unstagedFiles = allFiles.filter(file => 
          file.status.endsWith('A') || 
          file.status.endsWith('M') || 
          file.status.endsWith('D') || 
          file.status.includes('?')
        );
        
        return NextResponse.json({ allFiles, stagedFiles, unstagedFiles });
        
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
  } catch (error: unknown) {
    console.error('Git operation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while executing git command';
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
}

// Commit changes, stage files, or reset files
export async function POST(request: Request) {
  try {
    // Check if git is available
    if (!(await isGitAvailable())) {
      return NextResponse.json({ error: 'Git is not available on this system' }, { status: 500 });
    }
    
    const { projectId, projectRoot, message, files, action = 'commit' } = await request.json();
    
    if (!projectId || !projectRoot) {
      return NextResponse.json({ error: 'Project ID and project root are required' }, { status: 400 });
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
    
    // Handle staging action
    if (action === 'stage') {
      if (files && files.length > 0) {
        const addCommand = `git add ${files.map((f: string) => `"${f}"`).join(' ')}`;
        await execPromise(addCommand, { cwd: projectPath });
      } else {
        // Add all changes
        await execPromise('git add .', { cwd: projectPath });
      }
      return NextResponse.json({ success: true, action: 'stage' });
    }
    
    // Handle unstage action
    if (action === 'unstage') {
      if (files && files.length > 0) {
        // Use git reset to unstage specific files
        const resetCommand = `git reset HEAD ${files.map((f: string) => `"${f}"`).join(' ')}`;
        await execPromise(resetCommand, { cwd: projectPath });
      } else {
        // Unstage all files
        await execPromise('git reset HEAD .', { cwd: projectPath });
      }
      return NextResponse.json({ success: true, action: 'unstage' });
    }
    
    // Handle reset action
    if (action === 'reset') {
      if (files && files.length > 0) {
        // Handle different file statuses:
        // 1. For modified tracked files, use git checkout HEAD
        // 2. For untracked files (status ?), use fs.unlinkSync to delete them
        for (const file of files) {
          const fullPath = path.join(projectPath, file);
          // Check if file exists and if it's tracked by git
          try {
            await execPromise(`git ls-files --error-unmatch "${file}"`, { cwd: projectPath });
            // File is tracked, use git checkout
            await execPromise(`git checkout HEAD -- "${file}"`, { cwd: projectPath });
          } catch (error) {
            // File is not tracked, delete it directly
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          }
        }
      } else {
        return NextResponse.json({ error: 'Files are required for reset action' }, { status: 400 });
      }
      return NextResponse.json({ success: true, action: 'reset' });
    }
    
    // Handle commit action (default)
    if (!message) {
      return NextResponse.json({ error: 'Commit message is required for commit action' }, { status: 400 });
    }
    
    // Add files to git (this ensures they are staged before commit)
    if (files && files.length > 0) {
      const addCommand = `git add ${files.map((f: string) => `"${f}"`).join(' ')}`;
      await execPromise(addCommand, { cwd: projectPath });
    } else {
      // Add all changes
      await execPromise('git add .', { cwd: projectPath });
    }
    
    // Commit changes
    await execPromise(`git commit -m "${message}"`, { cwd: projectPath });
    
    return NextResponse.json({ success: true, action: 'commit' });
  } catch (error: unknown) {
    console.error('Git operation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while executing git operation';
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
}