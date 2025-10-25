const fs = require('fs');
const path = require('path');
//Checking
//
// Load environment variables from the env file
const envPath = path.join(process.env.HOME, 'imaginecalendar-env', 'env');
const envConfig = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        // Remove quotes if present and join value parts
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        envConfig[key.trim()] = value;
      }
    }
  });
}

module.exports = {
  apps: [
    {
      name: 'imaginecalendar-user',
      cwd: path.join(process.env.HOME, 'imaginecalendar', 'apps', 'user-portal'),
      script: 'bun',
      args: ['run', 'start'],  // FIXED: Array of arguments
      exec_mode: 'fork',  // EXPLICITLY SET FORK MODE
      instances: 1,       // SINGLE INSTANCE
      env: {
        ...envConfig,
        PORT: 3000,
      },
      error_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-user-error.log'),
      out_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-user-out.log'),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'imaginecalendar-admin',
      cwd: path.join(process.env.HOME, 'imaginecalendar', 'apps', 'admin-portal'),
      script: 'bun',
      args: ['run', 'start'],  // FIXED: Array of arguments
      exec_mode: 'fork',  // EXPLICITLY SET FORK MODE
      instances: 1,       // SINGLE INSTANCE
      env: {
        ...envConfig,
        PORT: 3001,
      },
      error_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-admin-error.log'),
      out_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-admin-out.log'),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'imaginecalendar-api',
      cwd: path.join(process.env.HOME, 'imaginecalendar', 'apps', 'api'),
      script: 'bun',
      args: ['run', 'start'],  // FIXED: Array of arguments
      exec_mode: 'fork',  // EXPLICITLY SET FORK MODE
      instances: 1,       // SINGLE INSTANCE
      env: {
        ...envConfig,
        PORT: 3002,
      },
      error_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-api-error.log'),
      out_file: path.join(process.env.HOME, '.pm2', 'logs', 'imaginecalendar-api-out.log'),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};