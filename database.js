const Database = require('better-sqlite3');

const db = new Database('queues.db');

console.log(db.name);

db.prepare(`
CREATE TABLE IF NOT EXISTS queues (
    messageId TEXT,
    channelId TEXT,
    userId TEXT,
    username TEXT,
    value TEXT,
    mode TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS mediators (
    discordId TEXT PRIMARY KEY,
    pix TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS matches (
    channelId TEXT PRIMARY KEY,
    mediatorId TEXT
)
`).run();

module.exports = db;