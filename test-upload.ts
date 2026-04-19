import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

async function test() {
  fs.writeFileSync('test.mp4', 'dummy video data');
  const form = new FormData();
  form.append('file', fs.createReadStream('test.mp4'));
  
  try {
    const res = await axios.post('https://file.io', form, {
      headers: { ...form.getHeaders() }
    });
    console.log('Success:', res.data);
  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  }
}
test();
