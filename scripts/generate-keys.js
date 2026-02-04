const crypto = require('crypto');
const fs = require('fs');

// Generate RSA key pair (2048-bit)
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Save keys
fs.writeFileSync('public-key.pem', publicKey);
fs.writeFileSync('private-key.pem', privateKey);

console.log('========================================');
console.log('RSA keys generated successfully!');
console.log('========================================\n');

console.log('Public Key (upload to WhatsApp):');
console.log(publicKey);
console.log('\n========================================\n');

console.log('Private Key (add to Vercel env as PRIVATE_KEY):');
console.log(privateKey);
console.log('\n========================================');
console.log('Files saved:');
console.log('- public-key.pem');
console.log('- private-key.pem');
console.log('========================================');
