import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

async function testEmbed() {
    try {
        const postId = 'C3B_xIeA-H_';
        const url = 'https://www.instagram.com/p/' + postId + '/embed/captioned/';
        const html = await axios.get(url, {
            headers: {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        });
        const $ = cheerio.load(html.data);
        
        let found = false;
        $('script').each((i, el) => {
           let txt = $(el).text();
           if (txt.includes('edge_media_to_caption') || txt.includes('caption')) {
               fs.writeFileSync('script_dump.txt', txt);
               found = true;
           }
        });
        console.log("Dumped script", found);
    } catch(e) {
        console.error(e.message);
    }
}
testEmbed();
