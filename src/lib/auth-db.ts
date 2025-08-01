import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('./auth.db');

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

export interface User {
  id: number;
  username: string;
  password: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export class AuthDatabase {
  // Create user
  static async createUser(username: string, password: string, email?: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, password, email)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(username, hashedPassword, email || null);
    
    const user = this.getUserById(result.lastInsertRowid as number);
    return user!;
  }
  
  // Get user by username
  static getUserByUsername(username: string): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  }
  
  // Get user by ID
  static getUserById(id: number): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  }
  
  // Verify password
  static async verifyPassword(username: string, password: string): Promise<User | null> {
    const user = this.getUserByUsername(username);
    if (!user) {
      return null;
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }
    
    return user;
  }
  
  // Create session
  static createSession(userId: number, token: string, expiresAt: Date): Session {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(userId, token, expiresAt.toISOString());
    
    return {
      id: result.lastInsertRowid as number,
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    };
  }
  
  // Get session by token
  static getSessionByToken(token: string): Session | undefined {
    const stmt = db.prepare('SELECT * FROM sessions WHERE token = ?');
    return stmt.get(token) as Session | undefined;
  }
  
  // Delete session
  static deleteSession(token: string): boolean {
    const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
    const result = stmt.run(token);
    return result.changes > 0;
  }
  
  // Clean up expired sessions
  static cleanupExpiredSessions(): number {
    const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
    const result = stmt.run(new Date().toISOString());
    return result.changes;
  }
}

// Initialize default admin user
async function initializeDefaultUser() {
  const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
  
  const adminExists = AuthDatabase.getUserByUsername(defaultUsername);
  if (!adminExists) {
    await AuthDatabase.createUser(defaultUsername, defaultPassword, defaultEmail);
    console.log(`Default admin user created: username=${defaultUsername}, password=${defaultPassword}`);
  }
}

initializeDefaultUser().catch(console.error);