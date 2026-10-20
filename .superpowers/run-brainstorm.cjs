const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env, {
  BRAINSTORM_DIR: 'd:\\online-exam-front\\.superpowers\\brainstorm\\session-1',
  BRAINSTORM_OPEN: '1',
  BRAINSTORM_PORT_FILE: 'd:\\online-exam-front\\.superpowers\\brainstorm\\.last-port',
  BRAINSTORM_TOKEN_FILE: 'd:\\online-exam-front\\.superpowers\\brainstorm\\.last-token'
});

const child = spawn(process.execPath, [
  'C:\\Users\\Acer\\.gemini\\config\\plugins\\superpowers\\skills\\brainstorming\\scripts\\server.cjs'
], { env, stdio: 'inherit' });

child.on('exit', (code) => process.exit(code || 0));
