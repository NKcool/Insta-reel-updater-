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
        const caption = $('.Caption').text(); // Or maybe .CaptionText
        console.log("CAPTION HTML:", caption.substring(0, 100));
        
        let ctext = $('.CaptionText, .Caption, .caption').text();
        console.log("ALL TEXT:", ctext.substring(0, 500));
        
        const script = $('script').filter((i, el) => {
           return $(el).text().includes('caption');
        }).html();
        if (script) {
           console.log("FOUND SCRIPT WITH CAPTION", script.length);
        }
    } catch(e) {
        console.error(e.message);
    }
}
testEmbed();
