import axios from "axios";

async function testFetch() {
    try {
        const url = 'https://api.microlink.io/?url=' + encodeURIComponent('https://www.instagram.com/reel/C3B_xIeA-H_/');
        const res = await axios.get(url);
        console.log("RESULT", JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error(e.message);
    }
}
testFetch();
