module.exports = {
  apps: [
    {
      name: 'memillennial-be',
      script: 'pnpm',
      args: 'run dev',
      interpreter: 'none',

      cwd: '/home/ubuntu/funraisingit/apps/server',

      instances: 1,
      exec_mode: 'fork',

      watch: false,
      autorestart: true,
      max_restarts: 10,

      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}
