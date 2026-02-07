const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ip = '20.169.18.172';
const user = 'vpsuser';
const password = 'asdf:lkj@123';
const command = process.argv[2] || 'ls -l';

// Create a temp askpass script (must be a shell script for Git Bash)
const askpassPath = path.join(process.cwd(), 'scripts', 'askpass.sh');
fs.writeFileSync(askpassPath, `#!/bin/sh\necho "${password}"`);
// Make it executable (for Git Bash env)
try { fs.chmodSync(askpassPath, '755'); } catch (e) { }

// Convert Windows path to MinGW path (C:\path -> /c/path)
const mingwPath = askpassPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (match, drive) => `/${drive.toLowerCase()}`);

console.log(`🚀 ASKPASS EXECUTION on ${user}@${ip}: ${command}`);

const ssh = spawn('C:\\Program Files\\Git\\usr\\bin\\ssh.exe', [
    '-v',
    '-o', 'StrictHostKeyChecking=no',
    `${user}@${ip}`,
    command
], {
    env: {
        ...process.env,
        SSH_ASKPASS: mingwPath,
        SSH_ASKPASS_REQUIRE: 'force',
        DISPLAY: ':0'
    }
});

ssh.stdout.on('data', (data) => console.log(data.toString()));
ssh.stderr.on('data', (data) => console.error(data.toString()));

ssh.on('close', (code) => {
    console.log(`✅ Process exited with code ${code}`);
    // Clean up
    if (fs.existsSync(askpassPath)) fs.unlinkSync(askpassPath);
});
