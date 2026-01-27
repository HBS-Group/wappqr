
const { Client, Chat } = require('whatsapp-web.js');
console.log('Checking Chat prototype...');
const props = Object.getOwnPropertyNames(Chat.prototype);
console.log('addOrEditCustomerNote exists:', props.includes('addOrEditCustomerNote'));
console.log('getCustomerNote exists:', props.includes('getCustomerNote'));
