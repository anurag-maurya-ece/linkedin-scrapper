// app.js

// State management
let currentRunId = null;
let pollInterval = null;
let extractedData = [];
let targetType = 'profiles'; // 'profiles' or 'companies'

// DOM Elements
const apiTokenInput = document.getElementById('api-token');
const toggleTokenBtn = document.getElementById('toggle-token-btn');
const targetProfilesDiv = document.getElementById('target-profiles');
const targetCompaniesDiv = document.getElementById('target-companies');
const profileModeGroup = document.getElementById('profile-mode-group');
const profileModeSelect = document.getElementById('profile-mode');
const urlsList = document.getElementById('urls-list');
const urlsLabel = document.getElementById('urls-label');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const logBox = document.getElementById('log-box');
const resultsCount = document.getElementById('results-count');
const exportActions = document.getElementById('export-actions');
const downloadJsonBtn = document.getElementById('download-json-btn');
const downloadCsvBtn = document.getElementById('download-csv-btn');
const profilesTable = document.getElementById('profiles-table');
const profilesTbody = document.getElementById('profiles-tbody');
const companiesTable = document.getElementById('companies-table');
const companiesTbody = document.getElementById('companies-tbody');
const emptyState = document.getElementById('empty-state');

// Toggle API Token visibility
toggleTokenBtn.addEventListener('click', () => {
  if (apiTokenInput.type === 'password') {
    apiTokenInput.type = 'text';
    toggleTokenBtn.textContent = 'Hide';
  } else {
    apiTokenInput.type = 'password';
    toggleTokenBtn.textContent = 'Show';
  }
});

// Switch Extraction Target Type
targetProfilesDiv.addEventListener('click', () => {
  setTargetType('profiles');
});

targetCompaniesDiv.addEventListener('click', () => {
  setTargetType('companies');
});

function setTargetType(type) {
  targetType = type;
  
  if (type === 'profiles') {
    targetProfilesDiv.classList.add('selected');
    targetCompaniesDiv.classList.remove('selected');
    profileModeGroup.style.display = 'flex';
    urlsLabel.textContent = 'LinkedIn Profile URLs (One per line)';
    urlsList.placeholder = 'https://www.linkedin.com/in/williamhgates\nhttps://www.linkedin.com/in/example-profile';
    profilesTable.style.display = 'table';
    companiesTable.style.display = 'none';
  } else {
    targetProfilesDiv.classList.remove('selected');
    targetCompaniesDiv.classList.add('selected');
    profileModeGroup.style.display = 'none';
    urlsLabel.textContent = 'LinkedIn Company URLs (One per line)';
    urlsList.placeholder = 'https://www.linkedin.com/company/thorogood/\nhttps://www.linkedin.com/company/google';
    profilesTable.style.display = 'none';
    companiesTable.style.display = 'table';
  }
  
  // Clear previous outputs if we switch tabs
  clearResults();
}

function clearResults() {
  profilesTbody.innerHTML = '';
  companiesTbody.innerHTML = '';
  extractedData = [];
  resultsCount.textContent = '0';
  emptyState.style.display = 'flex';
  exportActions.style.display = 'none';
}

// Logging helper
function logMessage(message, isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}\n`;
  logBox.style.display = 'block';
  if (isError) {
    logBox.innerHTML += `<span style="color: #ef4444;">${line}</span>`;
  } else {
    logBox.innerHTML += line;
  }
  logBox.scrollTop = logBox.scrollHeight;
}

// Start Scraper logic
startBtn.addEventListener('click', async () => {
  const token = apiTokenInput.value.trim();
  const urlsText = urlsList.value.trim();
  
  if (!token) {
    alert('Please enter your Apify API Token!');
    return;
  }
  
  if (!urlsText) {
    alert('Please enter at least one LinkedIn URL!');
    return;
  }
  
  const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
  if (urls.length === 0) {
    alert('No valid URLs found!');
    return;
  }

  // UI Updates for active scraping
  startBtn.disabled = true;
  stopBtn.style.display = 'inline-flex';
  apiTokenInput.disabled = true;
  urlsList.disabled = true;
  profileModeSelect.disabled = true;
  progressContainer.style.display = 'block';
  logBox.innerHTML = '';
  
  updateStatus('running', 'Initializing run...');
  clearResults();

  try {
    let actorId, payload;

    if (targetType === 'profiles') {
      actorId = 'harvestapi~linkedin-profile-scraper';
      const modeText = profileModeSelect.value === 'with-email' 
        ? 'Profile details + email search ($10 per 1k)' 
        : 'Profile details no email ($4 per 1k)';
      
      payload = {
        profileScraperMode: modeText,
        queries: urls
      };
      logMessage(`Selected: LinkedIn Profile Scraper`);
      logMessage(`Mode: ${modeText}`);
    } else {
      actorId = 'harvestapi~linkedin-company';
      payload = {
        companies: urls
      };
      logMessage(`Selected: LinkedIn Company Details Scraper`);
    }

    logMessage(`Triggering Apify actor run with ${urls.length} target URLs...`);
    
    // Call Apify API to start the run
    const triggerUrl = `https://api.apify.com/v2/actors/${actorId}/runs?token=${token}`;
    const response = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Apify trigger failed: ${response.status}`;
      if (response.status === 402 || errText.toLowerCase().includes('credit') || errText.toLowerCase().includes('limit') || errText.toLowerCase().includes('payment')) {
        errorMsg = `❌ Apify API Limit Reached: Insufficient credits or usage limit exceeded. Please check your Apify Billing/Plan (Tip: Apify gives a free $5 credit monthly).`;
      } else if (response.status === 401) {
        errorMsg = `❌ Invalid Token: The Apify API Token you entered is invalid or inactive.`;
      } else {
        errorMsg += ` - ${errText}`;
      }
      throw new Error(errorMsg);
    }

    const runData = await response.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;
    currentRunId = runId;

    logMessage(`Run started successfully! Run ID: ${runId}`);
    logMessage(`Dataset ID: ${datasetId}`);
    updateStatus('running', `Scraping in progress...`);

    // Poll for status
    pollInterval = setInterval(async () => {
      try {
        const statusUrl = `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`;
        const statusResponse = await fetch(statusUrl);
        if (!statusResponse.ok) {
          if (statusResponse.status === 402) {
            clearInterval(pollInterval);
            logMessage(`❌ Apify API Limit Reached: Insufficient credits during run.`, true);
            resetUI('error', 'API Limit Reached');
          }
          return;
        }

        const statusData = await statusResponse.json();
        const runStatus = statusData.data.status;
        
        logMessage(`Current run status: ${runStatus}`);

        if (runStatus === 'SUCCEEDED') {
          clearInterval(pollInterval);
          logMessage('Apify job finished successfully! Fetching dataset items...');
          await fetchDatasetResults(datasetId, token);
        } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
          clearInterval(pollInterval);
          logMessage(`Run finished with terminal failure status: ${runStatus}`, true);
          
          let failureMsg = `Extraction failed (${runStatus})`;
          if (statusData.data.errorMessage && (statusData.data.errorMessage.toLowerCase().includes('credit') || statusData.data.errorMessage.toLowerCase().includes('limit'))) {
            failureMsg = "API Limit Reached";
            logMessage(`❌ Reason: Credits or limit exhausted on Apify.`, true);
          }
          resetUI('error', failureMsg);
        }
      } catch (pollErr) {
        logMessage(`Error checking status: ${pollErr.message}`, true);
      }
    }, 5000);

  } catch (err) {
    logMessage(err.message, true);
    resetUI('error', 'Setup failed. Check console.');
  }
});

// Abort scraping run
stopBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  const token = apiTokenInput.value.trim();
  
  logMessage('Stopping the Apify run, please wait...', true);
  stopBtn.disabled = true;

  try {
    const abortUrl = `https://api.apify.com/v2/actor-runs/${currentRunId}/abort?token=${token}`;
    const response = await fetch(abortUrl, { method: 'POST' });
    
    if (response.ok) {
      logMessage('Scraping run aborted successfully.', true);
    } else {
      logMessage('Failed to abort run on Apify console (it might have already finished).', true);
    }
  } catch (err) {
    logMessage(`Abort error: ${err.message}`, true);
  } finally {
    if (pollInterval) clearInterval(pollInterval);
    resetUI('idle', 'Scraping stopped.');
  }
});

// Fetch dataset items
async function fetchDatasetResults(datasetId, token) {
  try {
    const itemsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
    const response = await fetch(itemsUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset items: ${response.statusText}`);
    }

    extractedData = await response.json();
    logMessage(`Successfully fetched ${extractedData.length} records.`);
    
    populateResultsTable();
    resetUI('success', `Completed. Found ${extractedData.length} entries.`);
  } catch (err) {
    logMessage(`Dataset retrieval failed: ${err.message}`, true);
    resetUI('error', 'Retrieved failed. Try again.');
  }
}

// Populate UI results tables
function populateResultsTable() {
  emptyState.style.display = 'none';
  resultsCount.textContent = extractedData.length;
  
  if (extractedData.length > 0) {
    exportActions.style.display = 'flex';
  }

  if (targetType === 'profiles') {
    profilesTbody.innerHTML = '';
    extractedData.forEach(item => {
      // Find values safely (attributes can change based on APIs)
      const name = item.name || item.fullName || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Unknown';
      const title = item.occupation || item.headline || 'No Title';
      const company = item.currentCompany || (item.experience && item.experience[0] && item.experience[0].companyName) || 'No Company';
      const location = item.locationName || item.location || 'N/A';
      const avatar = item.profilePicUrl || item.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
      
      // Contact Info display
      let contactHtml = '';
      if (item.email) {
        contactHtml += `<div style="margin-bottom: 4px;"><span class="badge badge-email">📧 ${item.email}</span></div>`;
      }
      const phoneNumber = (item.phone && item.phone.number) ? item.phone.number : (item.phone || null);
      if (phoneNumber) {
        contactHtml += `<div style="font-size: 0.8rem; color: var(--text-primary);">📞 ${phoneNumber}</div>`;
      }
      if (!contactHtml) {
        contactHtml = '<span style="color: var(--text-secondary);">None found</span>';
      }

      // About & Skills display
      let aboutPreview = item.about || item.summary || '';
      let skillsHtml = '';
      if (item.skills && Array.isArray(item.skills)) {
        skillsHtml = item.skills.slice(0, 3).map(s => {
          const sName = typeof s === 'string' ? s : (s.name || '');
          return sName ? `<span class="badge badge-skill">${sName}</span>` : '';
        }).join('');
      }

      let aboutHtml = '';
      if (aboutPreview) {
        aboutHtml = `<div class="truncate-text" title="${aboutPreview.replace(/"/g, '&quot;')}">${aboutPreview}</div>`;
      }
      if (skillsHtml) {
        aboutHtml += `<div style="margin-top: 4px; display: flex; flex-wrap: wrap;">${skillsHtml}</div>`;
      }
      if (!aboutHtml) {
        aboutHtml = '<span style="color: var(--text-secondary); font-size: 0.8rem;">N/A</span>';
      }

      const linkedin = item.linkedinUrl || item.url || '#';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="profile-meta-cell">
            <img class="profile-avatar" src="${avatar}" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'" alt="avatar" />
            <strong>${name}</strong>
          </div>
        </td>
        <td>
          <div style="font-weight: 500;">${title}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${company}</div>
        </td>
        <td>${location}</td>
        <td>${contactHtml}</td>
        <td>${aboutHtml}</td>
        <td><a class="btn export-btn" href="${linkedin}" target="_blank">View 🔗</a></td>
      `;
      profilesTbody.appendChild(tr);
    });
  } else {
    companiesTbody.innerHTML = '';
    extractedData.forEach(item => {
      const name = item.name || 'Unknown Company';
      const tagline = item.tagline || 'No Tagline';
      const website = item.website || 'No website';
      const phone = (item.phone && item.phone.number) ? item.phone.number : (item.phone || 'No phone');
      
      const employeeCount = item.employeeCount || (item.employeeCountRange ? `${item.employeeCountRange.start}-${item.employeeCountRange.end}` : 'N/A');
      const followerCount = item.followerCount ? `${item.followerCount.toLocaleString()} followers` : 'N/A';
      const foundedYear = item.foundedOn ? (item.foundedOn.year || item.foundedOn) : null;
      
      const logo = item.logo || 'https://media.licdn.com/dms/image/v2/C4E0BAQHezipI1sPADg/company-logo_400_400/company-logo_400_400/0/1674655694728/thorogood_logo';

      // HQ Location Parsing
      let hq = 'N/A';
      if (item.locations && Array.isArray(item.locations)) {
        const hqLoc = item.locations.find(l => l.headquarter) || item.locations[0];
        if (hqLoc) {
          hq = hqLoc.parsed ? hqLoc.parsed.text : `${hqLoc.city || ''}, ${hqLoc.country || ''}`.trim() || 'N/A';
        }
      }

      // Specialties
      let specsHtml = '';
      if (item.specialities && Array.isArray(item.specialities)) {
        specsHtml = item.specialities.slice(0, 3).map(s => `<span class="badge badge-spec">${s}</span>`).join('');
      }
      if (!specsHtml) {
        specsHtml = '<span style="color: var(--text-secondary); font-size: 0.8rem;">N/A</span>';
      }

      const linkedin = item.linkedinUrl || item.url || '#';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="profile-meta-cell">
            <img class="company-logo" src="${logo}" onerror="this.style.display='none'" alt="logo" />
            <div>
              <strong>${name}</strong>
              <div style="font-size: 0.75rem; color: var(--text-secondary);" class="truncate-text" title="${tagline.replace(/"/g, '&quot;')}">${tagline}</div>
            </div>
          </div>
        </td>
        <td>
          <div>${website !== 'No website' ? `<a href="${website}" target="_blank">${website.replace('http://', '').replace('https://', '')}</a>` : website}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">📞 ${phone}</div>
        </td>
        <td>
          <div style="font-weight: 500;">👥 ${employeeCount} emps</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${followerCount}</div>
          ${foundedYear ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">Est. ${foundedYear}</div>` : ''}
        </td>
        <td>${hq}</td>
        <td>
          <div style="display: flex; flex-wrap: wrap; max-width: 200px;">${specsHtml}</div>
        </td>
        <td><a class="btn export-btn" href="${linkedin}" target="_blank">View 🔗</a></td>
      `;
      companiesTbody.appendChild(tr);
    });
  }
}

// Update running status UI
function updateStatus(type, text) {
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = `Status: ${text}`;
}

// Reset Form elements after run completes or fails
function resetUI(statusType, statusMsg) {
  startBtn.disabled = false;
  stopBtn.style.display = 'none';
  stopBtn.disabled = false;
  apiTokenInput.disabled = false;
  urlsList.disabled = false;
  profileModeSelect.disabled = false;
  progressContainer.style.display = 'none';
  
  updateStatus(statusType, statusMsg);
  currentRunId = null;
}

// Helper: Convert array of objects to CSV string
function convertToCSV(objArray) {
  if (objArray.length === 0) return '';
  
  // Extract all keys present in any of the objects
  const keys = [...new Set(objArray.flatMap(o => Object.keys(o)))];
  
  const csvRows = [];
  csvRows.push(keys.map(key => `"${key.replace(/"/g, '""')}"`).join(','));
  
  for (const obj of objArray) {
    const values = keys.map(key => {
      let val = obj[key];
      if (val === undefined || val === null) {
        val = '';
      } else if (typeof val === 'object') {
        // Flatten object properties (e.g. phone details or lists)
        val = JSON.stringify(val);
      } else {
        val = String(val);
      }
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

// Download JSON functionality
downloadJsonBtn.addEventListener('click', () => {
  if (extractedData.length === 0) return;
  
  const filename = `linkedin_${targetType}_${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([JSON.stringify(extractedData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Download CSV functionality
downloadCsvBtn.addEventListener('click', () => {
  if (extractedData.length === 0) return;
  
  const filename = `linkedin_${targetType}_${new Date().toISOString().split('T')[0]}.csv`;
  const csvContent = convertToCSV(extractedData);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Set default layout
setTargetType('profiles');
urlsList.value = 'https://www.linkedin.com/in/williamhgates';
