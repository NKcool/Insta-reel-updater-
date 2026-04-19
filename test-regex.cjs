const fs = require('fs');

const dump = fs.readFileSync('script_dump.txt', 'utf8');

// The caption is inside the post translated text or edge_media_to_caption.
// In the recent graphql structure: 
// "edge_media_to_caption":{"edges":[{"node":{"text":"THIS IS THE CAPTION"}}]}
let match = dump.match(/"edge_media_to_caption":{"edges":\[{"node":{"text":"(.*?)"}}\]}/);
if (match) {
    console.log("MATCH 1:", match[1].substring(0, 200));
}

let match2 = dump.match(/"caption":{"text":"(.*?)"}/);
if (match2) {
    console.log("MATCH 2:", match2[1].substring(0, 200));
}

// look for plain text caption inside Relay
let idx = dump.indexOf('"edge_media_to_caption"');
if (idx > -1) {
    console.log("FOUND AT", idx, dump.substring(idx, idx + 150));
} else {
    let raw = dump.match(/"caption":\{[^\}]*"text":"([^"]+)"/);
    if (raw) console.log("RAW MATCH", raw[1]);
    
    // just regex "text":"..."
    let anyText = dump.matchAll(/"text":"([^"]+)"/g);
    let all = Array.from(anyText);
    all.slice(0, 20).forEach(a => console.log("ANYTEXT:", a[1].substring(0, 50)));
}
