import { igdl } from 'btch-downloader';

async function testExtraction() {
    const data = await igdl('https://www.instagram.com/reel/CxPqR_uOfTj/');
    console.log(JSON.stringify(data, null, 2));
}

testExtraction();
