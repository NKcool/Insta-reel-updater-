import axios from "axios";

async function dumpHtml() {
    const postId = 'C3B_xIeA-H_';
    const url = 'https://www.instagram.com/p/' + postId + '/embed/captioned/';
    const html = await axios.get(url, {
        headers: {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    });
    console.log(html.data.substring(0, 1000));
    
    import('fs').then(fs => {
        fs.writeFileSync('embed_html.html', html.data);
    });
}
dumpHtml();
