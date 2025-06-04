const io = require('socket.io-client');

// Connect to the backend
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('🌐 Connected to backend');
  
  // Start a session
  socket.emit('start_session', {
    config: {
      provider: 'openai',
      model: 'gpt-4o',
      approvalMode: 'auto'
    }
  });
});

socket.on('session_created', (data) => {
  console.log('✅ Session created:', data);
  
  // Send a message that would trigger a shell command
  socket.emit('user_input', {
    message: 'List the files in the current directory',
    sessionId: data.sessionId
  });
});

socket.on('agent_event', (event) => {
  console.log('🔥 Agent event received:', JSON.stringify(event, null, 2));
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
});

socket.on('disconnect', () => {
  console.log('🌐 Disconnected from backend');
});

// Keep the script running
setTimeout(() => {
  console.log('Test completed');
  process.exit(0);
}, 30000);
