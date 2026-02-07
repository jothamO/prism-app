const { spawn } = require('child_process');

const ip = '20.169.18.172';
const user = 'vpsuser';
const password = 'asdf:lkj@123';
const command = process.argv[2] || 'ls -l';

console.log(`🚀 Executing on ${user}@${ip}: ${command}`);

const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    `${user}@${ip}`,
    command
]);

ssh.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(output);
    checkPrompt(output);
});

ssh.stderr.on('data', (data) => {
    const output = data.toString();
    console.error(output);
    checkPrompt(output);
});

function checkPrompt(output) {
    if (output.toLowerCase().includes('password')) {
        console.log('🔑 Sending password...');
        ssh.stdin.write(password + '\n');
    }
}

ssh.on('close', (code) => {
    console.log(`✅ Process exited with code ${code}`);
});
