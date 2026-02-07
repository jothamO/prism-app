const { spawn } = require('child_process');

const ip = '20.169.18.172';
const user = 'vpsuser';
const password = 'asdf:lkj@123';
const command = process.argv[2] || 'ls -l';

console.log(`🚀 DEBUG EXECUTION on ${user}@${ip}: ${command}`);

const ssh = spawn('C:\\Program Files\\Git\\usr\\bin\\ssh.exe', [
    '-v',
    '-o', 'StrictHostKeyChecking=no',
    `${user}@${ip}`,
    command
]);

// Reactive password sending
ssh.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('[STDOUT]', output);
    if (output.toLowerCase().includes('password')) {
        console.log('🔑 Sending password (from STDOUT)...');
        ssh.stdin.write(password + '\n');
    }
});

ssh.stderr.on('data', (data) => {
    const output = data.toString();
    console.error('[STDERR]', output);
    if (output.toLowerCase().includes('password')) {
        console.log('🔑 Sending password (from STDERR)...');
        ssh.stdin.write(password + '\n');
    }
});

ssh.on('close', (code) => {
    console.log(`✅ Process exited with code ${code}`);
});
