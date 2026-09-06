module.exports = {
  apps: [
    {
      name: 'mimilini-be',
      script: 'pnpm',
      args: 'run dev',
      interpreter: 'none',

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
