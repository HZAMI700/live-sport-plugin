const http = require('http');

http.get('http://127.0.0.1:7000/api/matches', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const matches = JSON.parse(data);
      const providers = new Set();
      
      matches.forEach(m => {
        if (m.sources) {
          m.sources.forEach(s => {
             providers.add(s.source || s.name);
          });
        }
      });
      
      console.log(`\nAvailable Providers in Cache:\n`);
      console.log(Array.from(providers));
    } catch(e) {
      console.error("Parse error:", e);
    }
  });
}).on('error', console.error);
