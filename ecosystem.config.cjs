module.exports = {
  apps: [
    {
      name: "catdai-redis",
      script: "bash",
      args:
        "-lc \"mkdir -p .redis && exec redis-server --bind 127.0.0.1 --port 6379 --dir .redis --appendonly yes --daemonize no\"",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
    },
    {
      name: "catdai",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
