// api/enrich.js

module.exports = async (req, res) => {
  // Setup CORS headers for development/testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { provider, apiKey, linkedinUrls } = req.body;

  if (!provider || !apiKey || !linkedinUrls || !Array.isArray(linkedinUrls)) {
    return res.status(400).json({ error: 'Invalid request payload. Required: provider, apiKey, linkedinUrls[]' });
  }

  try {
    const results = [];

    for (const url of linkedinUrls) {
      if (provider === 'apollo') {
        const apolloResponse = await fetch('https://api.apollo.io/v1/people/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({
            api_key: apiKey,
            linkedin_url: url
          })
        });

        if (apolloResponse.ok) {
          const data = await apolloResponse.json();
          if (data.person) {
            const p = data.person;
            // Get first phone number
            const phone = p.phone_numbers && p.phone_numbers[0] ? p.phone_numbers[0].raw_number : (p.phone_number || '');
            
            results.push({
              name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
              linkedinUrl: p.linkedin_url || url,
              occupation: p.title || 'No Title',
              currentCompany: p.organization ? p.organization.name : 'No Company',
              email: p.email || '',
              phone: phone,
              location: p.city ? `${p.city}, ${p.state || ''}, ${p.country || ''}`.trim() : 'N/A',
              about: p.headline || '',
              skills: []
            });
          } else {
            results.push({ 
              name: 'Not Found', 
              linkedinUrl: url, 
              occupation: 'N/A',
              currentCompany: 'N/A',
              email: '',
              phone: '',
              location: 'N/A',
              about: 'No matching person found in Apollo database',
              skills: [] 
            });
          }
        } else {
          const errText = await apolloResponse.text();
          results.push({ 
            name: 'API Error', 
            linkedinUrl: url, 
            occupation: 'N/A',
            currentCompany: 'N/A',
            email: '',
            phone: '',
            location: 'N/A',
            about: `Apollo API returned status ${apolloResponse.status}: ${errText.substring(0, 100)}`,
            skills: [] 
          });
        }
      } else if (provider === 'lusha') {
        const lushaResponse = await fetch(`https://api.lusha.com/v1/person?linkedinUrl=${encodeURIComponent(url)}`, {
          method: 'GET',
          headers: {
            'api-key': apiKey,
            'Accept': 'application/json'
          }
        });

        if (lushaResponse.ok) {
          const data = await lushaResponse.json();
          if (data.data) {
            const d = data.data;
            const email = d.emails && d.emails[0] ? d.emails[0].email : '';
            const phone = d.phoneNumbers && d.phoneNumbers[0] ? d.phoneNumbers[0].internationalFormat : '';
            
            results.push({
              name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown',
              linkedinUrl: url,
              occupation: d.title || 'No Title',
              currentCompany: d.company ? d.company.name : 'No Company',
              email: email,
              phone: phone,
              location: d.location ? d.location.country : 'N/A',
              about: '',
              skills: []
            });
          } else {
            results.push({ 
              name: 'Not Found', 
              linkedinUrl: url, 
              occupation: 'N/A',
              currentCompany: 'N/A',
              email: '',
              phone: '',
              location: 'N/A',
              about: 'No matching person found in Lusha database',
              skills: [] 
            });
          }
        } else {
          const errText = await lushaResponse.text();
          results.push({ 
            name: 'API Error', 
            linkedinUrl: url, 
            occupation: 'N/A',
            currentCompany: 'N/A',
            email: '',
            phone: '',
            location: 'N/A',
            about: `Lusha API returned status ${lushaResponse.status}: ${errText.substring(0, 100)}`,
            skills: [] 
          });
        }
      }
    }

    return res.status(200).json(results);
  } catch (error) {
    return res.status(500).json({ error: `Serverless proxy failed: ${error.message}` });
  }
};
