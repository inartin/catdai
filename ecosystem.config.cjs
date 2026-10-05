module.exports = {
  apps: [
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
    {
      name: "catdai-maib-reconciliation",
      script: "scripts/reconcile-maib.mjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: { NODE_ENV: "production" },
    },
  ],
};
