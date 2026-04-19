import { instagram } from '@bochilteam/scraper-instagram';
async function testScraper() {
    try {
        const url = 'https://www.instagram.com/reel/C3B_xIeA-H_/';
        const res = await instagram(url);
        console.log("RESULT", res);
    } catch(e) {
        console.error("ERROR", e.message);
    }
}
testScraper();
