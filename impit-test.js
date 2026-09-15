const { Impit } = require('impit');
const impit = new Impit();
async function test() {
  try {
    const res = await impit.fetch('https://streamed.pk/api/stream/admin/fox-cricket', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36' }
    });
    console.log(await res.text());
  } catch(e) { console.error('Error:', e.message); }
}
test();
