const fs = require('fs');

const dump = fs.readFileSync('embed_html.html', 'utf8');

// Looking for the contextJSON which contains gql_data or media data
const regex = /"contextJSON":"(.*?)"\}]/g;
let match = regex.exec(dump);
if (match) {
   let raw = match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
   console.log("Found contextJSON:", raw.substring(0, 500));
}

let plain = dump.match(/"caption":"(.*?)"/);
if (plain) {
   console.log("Found plain caption:", plain[1]);
}

let text = dump.matchAll(/"text":\\"(.*?)\\"/g);
for (const t of text) {
    if (t[1].length > 10) console.log("TEXT MATCH:", t[1]);
}
