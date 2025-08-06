import { NextResponse } from 'next/server';
import { messageQueue } from '@/lib/process-map';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const port = parseInt(url.searchParams.get('port') || '0');
    
    if (!port) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing port parameter' 
      }, { status: 400 });
    }
    
    // 获取该端口的消息队列
    const messages = messageQueue.get(String(port)) || [];
    console.log('Returning messages for port:', port, 'message count:', messages.length);
    
    // 获取客户端传递的最后读取时间戳
    const lastTimestamp = url.searchParams.get('lastTimestamp');
    
    let messagesToReturn = messages;
    
    // 如果有最后读取时间戳，只返回该时间戳之后的消息
    if (lastTimestamp) {
      messagesToReturn = messages.filter(msg => msg.timestamp > lastTimestamp);
    }
    
    return NextResponse.json({
      success: true,
      messages: messagesToReturn,
      count: messagesToReturn.length
    });
  } catch (error) {
    console.error('Error in debug-messages API:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}