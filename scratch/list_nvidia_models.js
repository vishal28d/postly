const https = require('https');

const apiKey = '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';
const url = "https://integrate.api.nvidia.com/v1/models";

const options = {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      const models = json.data.map(m => m.id);
      console.log('Available Models:', models.filter(id => id.includes('gemma')));
    } catch (e) {
      console.log('Error parsing:', data);
    }
  });
}).on('error', (err) => console.error(err));
