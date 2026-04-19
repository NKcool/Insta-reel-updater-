import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

async function testOEmbed() {
    try {
        const appId = process.env.VITE_INSTAGRAM_APP_ID;
        const appSecret = process.env.INSTAGRAM_APP_SECRET; // This is actually client token according to docs
        
        if (!appId || !appSecret) {
           console.log("NO APP INFO IN ENV", {appId, appSecret: !!appSecret});
           return;
        }

        const url = 'https://www.instagram.com/reel/C3B_xIeA-H_/';
        const oUrl = 'https://graph.facebook.com/v19.0/instagram_oembed?url=' + url + '&access_token=' + appId + '|' + appSecret;
        
        const res = await axios.get(oUrl);
        console.log("OEMBED RESPONSE:", res.data);
    } catch(e) {
        console.error("ERROR", e.response ? e.response.data : e.message);
    }
}
testOEmbed();
