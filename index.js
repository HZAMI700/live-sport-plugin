// Root entry point for Node.js environments (GoDaddy / Passenger fallback)
const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, 'dist', 'index.js');
if (fs.existsSync(distPath)) {
  require('./dist/index.js');
} else {
  require('./src/index.js');
}
