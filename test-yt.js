const youtubedl = require('youtube-dl-exec');

async function test() {
  try {
    const url = 'https://www.instagram.com/p/DB1-kF6yU6f/?hl=en'; // Public react/node meme or random reel
    console.log('Fetching:', url);
    const output = await youtubedl(url, {
      dumpJson: true,
      noWarnings: true,
    });
    console.log('Success! Extracted URL:', output.url.substring(0, 50) + '...');
  } catch (e) {
    console.error('Failed:', e.message);
  }
}
test();
