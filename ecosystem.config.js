module.exports = {
    apps: [
        {
            name: 'prism-gateway',
            cwd: './gateway',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
                PORT: 18789
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G'
        },
        {
            name: 'prism-api',
            cwd: './prism-api',
            script: 'dist/server.js',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },
            instances: 2,
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G'
        },
        {
            name: 'prism-workers',
            cwd: './prism-api',
            script: 'dist/server.js',
            // The API server also starts workers in its current implementation, 
            // but in a mature VPS setup we might split them. 
            // For now, prism-api cluster handles both.
            env: {
                NODE_ENV: 'production',
                PORT: 3001 // Not used by workers but avoids conflict if they were separate
            },
            instances: 1,
            autorestart: true
        },

        // ============== STAGING ENVIRONMENT ==============
        {
            name: 'prism-api-staging',
            script: 'dist/server.js',
            cwd: '/var/www/prism-staging/prism-api',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'staging',
                PORT: 3001
            }
        },
        {
            name: 'prism-gateway-staging',
            script: 'dist/index.js',
            cwd: '/var/www/prism-staging/gateway',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'staging',
                PORT: 18790,
                ALLOW_SELF_IMPROVEMENT: 'false'
            }
        },

        // ============== OWNER LAB ENVIRONMENT ==============
        {
            name: 'prism-api-lab',
            script: 'dist/server.js',
            cwd: '/var/www/prism-lab/prism-api',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'lab',
                PORT: 3002
            }
        },
        {
            name: 'prism-gateway-lab',
            script: 'dist/index.js',
            cwd: '/var/www/prism-lab/gateway',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'lab',
                PORT: 18791,
                ALLOW_SELF_IMPROVEMENT: 'true'  // OpenClaw can modify lab
            }
        }
    ]
};
