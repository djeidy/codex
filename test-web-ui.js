#!/usr/bin/env node

/**
 * Test script to verify the web UI is working
 */

const { spawn } = require('child_process');
const http = require('http');

console.log('Testing OpenAI Codex Web UI...\n');

// Start the web server
console.log('1. Starting Codex web server on port 3001...');
const webServer = spawn('node', ['codex-cli/dist/cli.js', '--web-server'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverStarted = false;

webServer.stdout.on('data', (data) => {
  const output = data.toString();
  if (!serverStarted && output.includes('Starting Codex Web Server')) {
    serverStarted = true;
    console.log('   ✓ Web server started successfully');
    
    // Test the server is responding
    setTimeout(() => {
      testServerHealth();
    }, 1000);
  }
});

webServer.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

function testServerHealth() {
  console.log('\n2. Testing server health...');
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/health',
    method: 'GET'
  };
  
  const req = http.request(options, (res) => {
    console.log(`   Status: ${res.statusCode}`);
    
    res.on('data', (chunk) => {
      console.log(`   Response: ${chunk}`);
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('   ✓ Server is healthy');
        testReactApp();
      } else {
        console.log('   ✗ Server returned non-200 status');
        cleanup();
      }
    });
  });
  
  req.on('error', (e) => {
    console.error(`   ✗ Server test failed: ${e.message}`);
    cleanup();
  });
  
  req.end();
}

function testReactApp() {
  console.log('\n3. Starting React development server...');
  
  const reactServer = spawn('pnpm', ['dev'], {
    cwd: __dirname + '/codex-web',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let reactStarted = false;
  
  reactServer.stdout.on('data', (data) => {
    const output = data.toString();
    if (!reactStarted && output.includes('Local:')) {
      reactStarted = true;
      console.log('   ✓ React dev server started successfully');
      
      setTimeout(() => {
        console.log('\n✅ Web UI is ready!');
        console.log('   - Web server: http://localhost:3001');
        console.log('   - React app: http://localhost:3000');
        console.log('\nPress Ctrl+C to stop both servers.');
      }, 1000);
    }
  });
  
  reactServer.stderr.on('data', (data) => {
    console.error('React error:', data.toString());
  });
  
  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\nShutting down servers...');
    reactServer.kill();
    cleanup();
  });
}

function cleanup() {
  webServer.kill();
  process.exit(0);
}

// Handle errors
webServer.on('error', (err) => {
  console.error('Failed to start web server:', err);
  process.exit(1);
});

// Give the server 10 seconds to start
setTimeout(() => {
  if (!serverStarted) {
    console.error('✗ Server failed to start within 10 seconds');
    cleanup();
  }
}, 10000);