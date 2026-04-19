const { igdl } = require('btch-downloader')

async function test() {
  try {
    const data = await igdl('https://www.instagram.com/reel/DAFksE2Sy_b/');
    console.log(data);
  } catch (e) {
    console.error(e)
  }
}
test()
