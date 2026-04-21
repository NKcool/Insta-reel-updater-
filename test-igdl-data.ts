import { igdl } from 'btch-downloader';

async function testIgdl() {
  const igLink = 'https://www.instagram.com/reel/C3B_xIeA-H_/';
  try {
    const data = await igdl(igLink);
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testIgdl();
