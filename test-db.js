const db = require('./database');

db.prepare(`
INSERT INTO queues (channelId, userId, username)
VALUES (?, ?, ?)
`).run(
    "123",
    "456",
    "Teste"
);

const rows = db.prepare(
    "SELECT * FROM queues"
).all();

console.log(rows);