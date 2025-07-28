import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// 获取项目根目录
const getProjectRoot = (projectId: string) => {
  // 这里应该根据projectId映射到实际的项目路径
  // 为了简化示例，我们使用当前工作目录
  return process.cwd();
};

// GET /api/files?projectId=xxx&path=yyy - 获取目录内容或文件内容
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const filePath = searchParams.get('path') || '';
    
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    
    const projectRoot = getProjectRoot(projectId);
    const fullPath = path.join(projectRoot, filePath);
    
    // 检查路径是否在项目目录内（安全检查）
    if (!fullPath.startsWith(projectRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    const stats = await fs.stat(fullPath);
    
    if (stats.isDirectory()) {
      // 返回目录内容
      const items = await fs.readdir(fullPath);
      const contents = await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(fullPath, item);
          const itemStats = await fs.stat(itemPath);
          return {
            name: item,
            isDirectory: itemStats.isDirectory(),
            size: itemStats.size,
            modified: itemStats.mtime
          };
        })
      );
      
      return NextResponse.json({ 
        path: filePath,
        isDirectory: true,
        contents 
      });
    } else {
      // 返回文件内容
      const content = await fs.readFile(fullPath, 'utf-8');
      return NextResponse.json({ 
        path: filePath,
        isDirectory: false,
        content 
      });
    }
  } catch (error) {
    console.error('Error fetching file/directory:', error);
    return NextResponse.json({ error: 'Failed to fetch file/directory' }, { status: 500 });
  }
}

// POST /api/files - 保存文件
export async function POST(request: Request) {
  try {
    const { projectId, path: filePath, content } = await request.json();
    
    if (!projectId || !filePath || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const projectRoot = getProjectRoot(projectId);
    const fullPath = path.join(projectRoot, filePath);
    
    // 检查路径是否在项目目录内（安全检查）
    if (!fullPath.startsWith(projectRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    // 确保目录存在
    const dirPath = path.dirname(fullPath);
    await fs.mkdir(dirPath, { recursive: true });
    
    // 写入文件
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving file:', error);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}

// DELETE /api/files - 删除文件或目录
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const filePath = searchParams.get('path');
    
    if (!projectId || !filePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const projectRoot = getProjectRoot(projectId);
    const fullPath = path.join(projectRoot, filePath);
    
    // 检查路径是否在项目目录内（安全检查）
    if (!fullPath.startsWith(projectRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    
    // 删除文件或目录
    await fs.rm(fullPath, { recursive: true, force: true });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file/directory:', error);
    return NextResponse.json({ error: 'Failed to delete file/directory' }, { status: 500 });
  }
}