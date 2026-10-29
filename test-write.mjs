import { writeFileSync } from 'node:fs';

writeFileSync('test-output.txt', 'Hello world');
console.log('File written successfully');