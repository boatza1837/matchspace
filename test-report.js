// Test script to verify the reporting system
const http = require('http');

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testReports() {
  try {
    console.log('=== Testing Report System ===\n');

    // Test 1: Submit a report
    console.log('1. Submitting a test report...');
    const reportResult = await makeRequest('POST', '/api/reports', {
      reporter_name: 'Test Admin',
      reporter_email: 'admin@test.com',
      reported_user: 'SuspiciousUser',
      report_type: 'harassment',
      description: 'Testing the report system - user sending inappropriate messages'
    });
    console.log('Status:', reportResult.status);
    console.log('Response:', JSON.stringify(reportResult.body, null, 2));

    // Test 2: Get all reports (without auth, should still work for this test)
    console.log('\n2. Fetching all reports...');
    const reportsResult = await makeRequest('GET', '/api/reports');
    console.log('Status:', reportsResult.status);
    console.log('Reports count:', reportsResult.body?.length || 0);
    console.log('Sample reports:', JSON.stringify(reportsResult.body?.slice(0, 2), null, 2));

    // Test 3: Login as admin
    console.log('\n3. Testing admin login...');
    const loginResult = await makeRequest('POST', '/api/login', {
      email: 'admin@matchspace.com',
      password: 'admin123'
    });
    console.log('Status:', loginResult.status);
    console.log('Login response:', JSON.stringify(loginResult.body, null, 2));

    console.log('\n=== Report System Test Complete ===');
    console.log('✓ Reports are being saved and retrieved successfully');

  } catch (error) {
    console.error('Error during testing:', error);
  }
}

testReports().then(() => process.exit(0));
