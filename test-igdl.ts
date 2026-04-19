import { instagramGetUrl } from 'instagram-url-direct';

async function testIg() {
    try {
        const url = 'https://www.instagram.com/reel/C3B_xIeA-H_/';
        const res = await instagramGetUrl(url);
        console.log("RESULT", res);
    } catch (e) {
        console.error("ERROR", e.message);
    }
}
testIg();
