"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeDatabase = initializeDatabase;
exports.saveProcess = saveProcess;
exports.updateProcessTimerId = updateProcessTimerId;
exports.getAllProcesses = getAllProcesses;
exports.getProcessByPort = getProcessByPort;
exports.deleteProcess = deleteProcess;
exports.deleteExpiredProcesses = deleteExpiredProcesses;
exports.clearAllProcesses = clearAllProcesses;
var better_sqlite3_1 = require("better-sqlite3");
var path_1 = require("path");
// 数据库文件路径
var DB_PATH = path_1.default.join(process.cwd(), '.data', 'processes.db');
// 创建数据库连接
var db = new better_sqlite3_1.default(DB_PATH);
exports.db = db;
// 初始化数据库表
function initializeDatabase() {
    db.exec("\n    CREATE TABLE IF NOT EXISTS processes (\n      port INTEGER PRIMARY KEY,\n      command TEXT NOT NULL,\n      path TEXT,\n      pid INTEGER,\n      start_time INTEGER NOT NULL,\n      timeout INTEGER NOT NULL,\n      timer_id INTEGER\n    )\n  ");
    // 添加索引以提高查询性能
    db.exec("\n    CREATE INDEX IF NOT EXISTS idx_start_time ON processes(start_time);\n  ");
}
// 保存进程信息
function saveProcess(port, command, cwd, pid, startTime, timeout) {
    var stmt = db.prepare('INSERT OR REPLACE INTO processes (port, command, path, pid, start_time, timeout) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(port, command, cwd, pid, startTime, timeout);
}
// 更新进程的定时器 ID
function updateProcessTimerId(port, timerId) {
    var stmt = db.prepare('UPDATE processes SET timer_id = ? WHERE port = ?');
    stmt.run(timerId, port);
}
// 获取所有进程信息
function getAllProcesses() {
    var stmt = db.prepare('SELECT * FROM processes');
    return stmt.all();
}
// 根据端口获取进程信息
function getProcessByPort(port) {
    var stmt = db.prepare('SELECT * FROM processes WHERE port = ?');
    return stmt.get(port);
}
// 删除进程信息
function deleteProcess(port) {
    var stmt = db.prepare('DELETE FROM processes WHERE port = ?');
    console.log("Deleting process on port ".concat(port));
    stmt.run(port);
}
// 删除过期的进程信息
function deleteExpiredProcesses() {
    var now = Date.now();
    var stmt = db.prepare('DELETE FROM processes WHERE start_time + timeout < ?');
    var result = stmt.run(now);
    console.log("Deleted ".concat(result.changes, " expired processes"));
    return result.changes; // 返回删除的行数
}
// 清理所有进程数据
function clearAllProcesses() {
    var stmt = db.prepare('DELETE FROM processes');
    console.log("Cleared all processes");
    stmt.run();
}
