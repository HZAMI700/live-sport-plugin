const { addonBuilder } = require('stremio-addon-sdk'); 
const builder = new addonBuilder({
  id: 'test', version: '1.0.0', name: 'test', resources: ['catalog'], types: ['tv'], 
  catalogs: [{type: 'tv', id: 'test'}], 
  config: [
    {key: 'timezone', type: 'select', options: ['UTC', 'Asia/Kolkata', 'Asia/Dhaka']}
  ]
}); 
builder.defineCatalogHandler(async (args) => { 
  console.log("HANDLER ARGS:", args); 
  return {metas: []}; 
}); 
const router = require('stremio-addon-sdk').getRouter(builder.getInterface()); 
const express = require('express'); 
const app = express(); 
app.use(router); 
const server = app.listen(0, () => { 
  const port = server.address().port; 
  // Send URL-encoded JSON
  const conf = JSON.stringify({timezone: 'Asia/Kolkata', sources: 'none'});
  require('http').get('http://localhost:' + port + '/' + encodeURIComponent(conf) + '/catalog/tv/test.json', res => { 
    res.on('data', d => process.stdout.write(d)); 
    setTimeout(() => process.exit(0), 100); 
  }); 
});
