import yts from 'yt-search';

async function test() {
  try {
    const videoId = '0SX5XiUWILo';
    const r = await yts({ videoId });
    console.log(r);
  } catch (e) {
    console.error(e);
  }
}
test();
