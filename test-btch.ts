import { ytmp4 } from 'btch-downloader'; // checking if ytmp4 exists
async function test() {
  try {
     console.log(Object.keys(await import('btch-downloader')));
     // try one of our links:
     const data = await (await import('btch-downloader')).ytdl('https://youtube.com/watch?v=0SX5XiUWILo');
     console.log(data);
  } catch (e) { console.error(e); }
}
test();
