#!/usr/bin/env node

// Test registration and verify it saves to the database
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'matchspace.db');
const testDb = new DatabaseSync(dbPath);

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
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testRegistration() {
  try {
    console.log('=== Testing Registration System ===\n');

    const testEmail = 'newuser' + Date.now() + '@test.com';
    const testUser = {
      name: 'New Test User',
      email: testEmail,
      password: 'TestPass123',
      major: 'Computer Science',
      year: 'ปี 2',
      interests: 'หนัง, เพลง',
      bio: 'Test user for registration'
    };

    // Test 1: Register a new user
    console.log('1. Registering new user...');
    console.log('   Email:', testEmail);
    const registerResult = await makeRequest('POST', '/api/register', testUser);
    console.log('   Status:', registerResult.status);
    console.log('   Response:', JSON.stringify(registerResult.body, null, 2));

    // Test 2: Check if user was saved to database
    console.log('\n2. Checking database for saved user...');
    const savedUser = testDb.prepare('SELECT * FROM users WHERE email = ?').get(testEmail);
    if (savedUser) {
      console.log('   ✓ User found in database!');
      console.log('   ID:', savedUser.id);
      console.log('   Name:', savedUser.name);
      console.log('   Email:', savedUser.email);
      console.log('   Interests:', savedUser.interests);
    } else {
      console.log('   ✗ User NOT found in database!');
    }

    // Test 3: Try to login with the new user
    console.log('\n3. Testing login with new user...');
    const loginResult = await makeRequest('POST', '/api/login', {
      email: testEmail,
      password: 'TestPass123'
    });
    console.log('   Status:', loginResult.status);
    console.log('   Response:', JSON.stringify(loginResult.body, null, 2));

    // Test 4: Submit a report
    console.log('\n4. Testing report submission...');
    const reportResult = await makeRequest('POST', '/api/reports', {
      reporter_name: 'Test Reporter',
      reporter_email: 'reporter@test.com',
      reported_user: 'SuspiciousUser',
      report_type: 'spam',
      description: 'User is sending spam messages'
    });
    console.log('   Status:', reportResult.status);
    console.log('   Response:', JSON.stringify(reportResult.body, null, 2));

    // Test 5: Check if report was saved
    console.log('\n5. Checking database for saved report...');
    const savedReport = testDb.prepare('SELECT * FROM reports WHERE reporter_name = ?').get('Test Reporter');
    if (savedReport) {
      console.log('   ✓ Report found in database!');
      console.log('   ID:', savedReport.id);
      console.log('   Status:', savedReport.status);
      console.log('   Description:', savedReport.description);
    } else {
      console.log('   ✗ Report NOT found in database!');
    }

    console.log('\n=== Test Complete ===');

  } catch (error) {
    console.error('Error during testing:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

testRegistration();
