const https = require('https');

const key = 'AIzaSyBQy_sUekCtjfjTYUks1UhMc4YK4qGA0z4';
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const response = JSON.parse(data);
    const flashModels = response.models.filter(m => m.name.includes('flash'));
    console.log('Flash Models:', flashModels.map(m => m.name));
    
    const allModels = response.models.map(m => m.name);
    console.log('All Models Count:', allModels.length);
    console.log('Sample Models:', allModels.slice(0, 10));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
