import axios from "axios";
import * as cheerio from "cheerio";

async function testEmbed() {
    try {
        const postId = 'C3B_xIeA-H_';
        const url = 'https://www.instagram.com/p/' + postId + '/embed/captioned/';
        const html = await axios.get(url, {
            headers: {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        });
        const $ = cheerio.load(html.data);
        
        const script = $('script').filter((i, el) => {
           return $(el).text().includes('caption');
        }).html();
        
        if (script) {
           const match = script.match(/"caption":"(.*?)"(?:,"|})/);
           if (match) {
               console.log("CAPTION:", JSON.parse('"' + match[1] + '"'));
           } else {
               console.log("No regex match in script.");
           }
        }
    } catch(e) {
        console.error(e.message);
    }
}
testEmbed();
