const fs = require('fs');
const wasm = fs.readFileSync('lock.wasm');
// Let's use webassembly to parse it if we can
console.log('WASM length:', wasm.length);
