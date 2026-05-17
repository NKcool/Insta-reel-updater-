import yts from 'yt-search';

async function run() {
  const r = await yts('cats #shorts');
  const videos = r.videos.slice(0, 5);
  videos.forEach(function (v) {
    const views = String(v.views).padStart(10, ' ');
    console.log(`${views} | ${v.title} (${v.timestamp}) | ${v.author.name} | ${v.url}`);
  });
}
run();
