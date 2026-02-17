// Test POST to /triage endpoint
import http from 'http';

console.log('Testing POST to /triage endpoint...');

const payload = JSON.stringify({
    symptoms: "headache and fever",
    duration: "2 days",
    comorbidities: "none"
});

const options = {
    hostname: 'localhost',
    port: 8000,
    path: '/triage',
    method: 'POST',
    timeout: 120000, // 2 minutes for slow model
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

console.log('Sending request (may take 60-90 seconds for model inference)...');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('SUCCESS! Status:', res.statusCode);
        console.log('Response:', data);
    });
});

req.on('error', (e) => {
    console.log('FAILED:', e.message);
});

req.on('timeout', () => {
    console.log('TIMEOUT - request took too long (>2 min)');
    req.destroy();
});

req.write(payload);
req.end();
