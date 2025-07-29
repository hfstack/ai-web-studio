import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { githubUrl, clonePath, projectId } = await request.json();
    
    if (!githubUrl || !clonePath || !projectId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 });
    }
    
    // 提取仓库名称
    const repoName = githubUrl.split('/').pop()?.replace('.git', '') || 'project';
    const fullClonePath = path.join(clonePath, repoName);
    
    // 确保目标目录存在
    await fs.mkdir(clonePath, { recursive: true });
    
    // 检查目标目录是否已存在
    try {
      await fs.access(fullClonePath);
      // 如果目录存在，返回错误
      return NextResponse.json({ 
        success: false, 
        error: `Directory ${repoName} already exists in ${clonePath}` 
      }, { status: 400 });
    } catch (error) {
      // 目录不存在，可以继续
    }
    
    // 执行git clone命令
    const { stdout, stderr } = await execAsync(`git clone ${githubUrl} ${fullClonePath}`);
    
    if (stderr && !stderr.includes('Cloning into')) {
      // Git可能会在stderr中输出一些非错误信息，如"Cloning into..."
      console.error('Git clone error:', stderr);
      return NextResponse.json({ 
        success: false, 
        error: stderr 
      }, { status: 500 });
    }
    
    // 克隆成功
    return NextResponse.json({ 
      success: true, 
      path: fullClonePath,
      message: `Successfully cloned ${githubUrl} to ${fullClonePath}`,
      projectId
    });
    
  } catch (error) {
    console.error('Error cloning repository:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}