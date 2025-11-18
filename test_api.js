// Simple test script to verify API endpoints
const fetch = require('node-fetch');

async function testEndpoints() {
  try {
    console.log('Testing filter-options endpoint...');
    const filterResponse = await fetch('http://localhost:5000/api/filter-options?from_date=2024-01-01&to_date=2024-12-31');
    const filterData = await filterResponse.json();
    console.log('Filter options response:', filterData);

    console.log('\nTesting cotton-mixing-summary endpoint...');
    const summaryResponse = await fetch('http://localhost:5000/api/cotton-mixing-summary?from_date=2024-01-01&to_date=2024-12-31&unit=["5"]&line=["1"]&export_all=true');
    const summaryData = await summaryResponse.json();
    console.log('Summary response length:', summaryData.length);
    if (summaryData.length > 0) {
      console.log('First item:', summaryData[0]);
    }

  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testEndpoints();