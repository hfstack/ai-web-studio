module.exports = {
  apps: [{
    name: 'edit-studio',
    script: 'server.ts',
    interpreter: './node_modules/.bin/tsx',
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
  }]
};