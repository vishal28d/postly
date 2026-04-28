import https from 'https';

const key = 'AIzaSyBQy_sUekCtjfjTYUks1UhMc4YK4qGA0z4';
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Body:', data);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
