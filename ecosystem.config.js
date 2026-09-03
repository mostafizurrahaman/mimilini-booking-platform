module.exports = {
  apps: [
    {
      name: 'memillennial-be',
      script: 'pnpm',
      args: 'run dev',

      instances: 1,
      exec_mode: 'cluster',

      watch: false,

      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}
