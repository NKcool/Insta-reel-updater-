import axios from "axios";
import * as cheerio from "cheerio";

async function testGoogle() {
    try {
        const postId = 'C3B_xIeA-H_';
        const url = 'https://html.duckduckgo.com/html/?q=site:instagram.com+"' + postId + '"';
        const html = await axios.get(url, {
            headers: {"User-Agent": "Mozilla/5.0"}
        });
        const $ = cheerio.load(html.data);
        const result = $('.result__snippet').first().text();
        console.log("DUCKDUCK:", result);
    } catch(e) {
        console.error(e.message);
    }
}
testGoogle();
