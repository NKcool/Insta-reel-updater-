import fs from 'fs'; 
const txt = fs.readFileSync('script_dump.txt', 'utf8'); 
const parts = txt.split('"text":');
if (parts.length > 1) {
    console.log("TEXT FOUND:", parts[1].substring(0, 150));
} else {
    console.log("C NOT FOUND");
}
