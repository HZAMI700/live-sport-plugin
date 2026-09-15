const { spawn } = require('child_process');

const proc = spawn('ssh', [
  '-p', '443',
  '-R0:127.0.0.1:7000',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=30',
  'wMcV8BjZmdg@free.pinggy.io'
], { stdio: ['ignore', 'pipe', 'pipe'] });

proc.stdout.on('data', data => console.log('[STDOUT]: ' + data.toString()));
proc.stderr.on('data', data => console.log('[STDERR]: ' + data.toString()));
proc.on('close', code => console.log('[CLOSED]: ' + code));

setTimeout(() => {
  console.log('Timeout reached. Exiting...');
  proc.kill();
  process.exit(0);
}, 10000);
