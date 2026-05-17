import { youtube } from 'btch-downloader';
async function test() {
  try {
     const data = await youtube('https://youtube.com/watch?v=0SX5XiUWILo');
     console.log(data);
  } catch (e) { console.error(e); }
}
test();
