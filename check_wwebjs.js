
const { Client } = require('whatsapp-web.js');
console.log('Checking Client prototype...');
const props = Object.getOwnPropertyNames(Client.prototype);
console.log('createLabel exists:', props.includes('createLabel'));
console.log('getLabels exists:', props.includes('getLabels'));

// Also check if we can instantiate and see
try {
    const client = new Client();
    console.log('Instance createLabel:', !!client.createLabel);
} catch (e) {
    console.log('Error instantiating:', e);
}
