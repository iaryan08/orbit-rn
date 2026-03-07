
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'lib', 'push-server.ts');
let content = fs.readFileSync(p, 'utf8');
content = content.replace(
  'if (error) {\\r\\n            console.error(\\'Error fetching subscriptions:\\', error);\\r\\n            return { success: false, error: \\'Database error\\' };\\r\\n        }',
  'if (error) {\\r\\n            console.error(\\'Error fetching subscriptions:\\', error);\\r\\n            if (error.code === \\'22P02\\') return { success: true, sent: 0, message: \\'Push skipped: UUID error\\' };\\r\\n            return { success: false, error: \\'Database error\\' };\\r\\n        }'
);
content = content.replace(
  'if (error) {\\n            console.error(\\'Error fetching subscriptions:\\', error);\\n            return { success: false, error: \\'Database error\\' };\\n        }',
  'if (error) {\\n            console.error(\\'Error fetching subscriptions:\\', error);\\n            if (error.code === \\'22P02\\') return { success: true, sent: 0, message: \\'Push skipped: UUID error\\' };\\n            return { success: false, error: \\'Database error\\' };\\n        }'
);
fs.writeFileSync(p, content);
console.log('Done');

