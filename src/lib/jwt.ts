import jwt from 'jsonwebtoken';
import { AuthDatabase, User, Session } from './auth-db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JwtPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

export class JwtService {
  // Generate JWT token
  static generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }
  
  // Verify JWT token
  static verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }
  
  // Extract token from request header
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
  
  // Validate user session
  static async validateSession(token: string): Promise<{ user: User; session: Session } | null> {
    const payload = this.verifyToken(token);
    if (!payload) {
      return null;
    }
    
    const session = AuthDatabase.getSessionByToken(token);
    if (!session) {
      return null;
    }
    
    // Check if session has expired
    if (new Date(session.expires_at) < new Date()) {
      AuthDatabase.deleteSession(token);
      return null;
    }
    
    const user = AuthDatabase.getUserById(payload.userId);
    if (!user) {
      return null;
    }
    
    return { user, session };
  }
  
  // Create user session and return token
  static async createUserSession(userId: number, username: string): Promise<{ token: string; expiresAt: Date }> {
    const payload = { userId, username };
    const token = this.generateToken(payload);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expires after 24 hours
    
    AuthDatabase.createSession(userId, token, expiresAt);
    
    return { token, expiresAt };
  }
  
  // Logout user session
  static async logout(token: string): Promise<boolean> {
    return AuthDatabase.deleteSession(token);
  }
}