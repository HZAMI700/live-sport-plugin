const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'providers');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir);
  for (const file of files) {
    if (file.endsWith('.wasm') || file.endsWith('.js')) {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(distDir, file);
      fs.copyFileSync(srcFile, destFile);
    }
  }
}
console.log('[Assets] Provider assets copied to dist successfully.');
