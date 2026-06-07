const db = require('./database');

db.prepare('DELETE FROM queues').run();

console.log('Banco limpo!');