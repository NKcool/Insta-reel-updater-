import youtubedl from 'youtube-dl-exec';

async function testSearch() {
  try {
    const output = await youtubedl('ytsearch2:cats shorts', {
      dumpJson: true,
      noWarnings: true,
    });
    console.log(output);
  } catch (e) {
    console.error('Failed:', e.message);
  }
}
testSearch();
