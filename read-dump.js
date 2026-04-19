const fs = require('fs'); 
const txt = fs.readFileSync('script_dump.txt', 'utf8'); 
const c = txt.match(/"text":"(.*?)"/);
if (c) console.log("TEXT FOUND:", c[1].substring(0, 50));
else console.log("C NOT FOUND");
