module.exports = {
  apps: [{
    name: 'edit-studio',
    script: 'build/server.js',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
    }
  }],
  deploy: {
    production: {
      predeploy: 'npm run build && npm run build:server',
    }
  }
};