const { instagramGetUrl } = require("instagram-url-direct")

async function test() {
  try {
    let links = await instagramGetUrl('https://www.instagram.com/reels/DAFksE2Sy_b/');
    console.log(links);
  } catch (e) {
    console.error(e)
  }
}
test()
