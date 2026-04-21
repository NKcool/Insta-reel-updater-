import { igdl } from 'btch-downloader';

async function testIgdl() {
  const links = [
    'https://www.instagram.com/p/DB1qB_pysK_/', 
    'https://www.instagram.com/p/CZ2r-99P-5Q/',
    'https://www.instagram.com/reel/C-jIxgxI4_m/'
  ];
  for (const igLink of links) {
     console.log('Testing:', igLink);
     try {
       const data = await igdl(igLink);
       console.log(JSON.stringify(data, null, 2));
     } catch (error) {
       console.error('Error:', error);
     }
  }
}

testIgdl();
