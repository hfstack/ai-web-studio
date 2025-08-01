import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { currentPath } = await request.json();
    
    // Default to home directory if no path provided
    const startPath = currentPath || process.env.HOME || process.env.USERPROFILE || '/';
    
    // Security check - ensure path is within allowed bounds
    const resolvedPath = path.resolve(startPath);
    
    // Check if path exists and is accessible
    try {
      await fs.promises.access(resolvedPath);
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Path does not exist or is not accessible'
      }, { status: 400 });
    }
    
    // Get directory contents
    const items = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
    
    const contents = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(resolvedPath, item.name);
        let stats;
        
        try {
          stats = await fs.promises.stat(itemPath);
        } catch (error) {
          // Skip files that can't be accessed
          return null;
        }
        
        return {
          name: item.name,
          path: itemPath,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          size: stats.size,
          lastModified: stats.mtime,
          canRead: true
        };
      })
    );
    
    // Filter out null values (inaccessible items)
    const validContents = contents.filter(item => item !== null);
    
    // Sort: directories first, then files
    validContents.sort((a, b) => {
      if (a!.isDirectory && !b!.isDirectory) return -1;
      if (!a!.isDirectory && b!.isDirectory) return 1;
      return a!.name.localeCompare(b!.name);
    });
    
    // Get parent directory
    const parentPath = path.dirname(resolvedPath);
    const hasParent = parentPath !== resolvedPath;
    
    return NextResponse.json({
      success: true,
      currentPath: resolvedPath,
      parentPath: hasParent ? parentPath : null,
      contents: validContents
    });
    
  } catch (error) {
    console.error('Error browsing directory:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to browse directory'
    }, { status: 500 });
  }
}