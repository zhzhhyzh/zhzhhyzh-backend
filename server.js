const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Serve static files from the root directory
app.use(express.static('.'));

// Ensure the directory exists
const csvDir = path.join(__dirname, 'assets', 'pnc');
if (!fs.existsSync(csvDir)) {
  fs.mkdirSync(csvDir, { recursive: true });
}

const csvFile = path.join(csvDir, 'index.csv');

// Initialize CSV if it doesn't exist
if (!fs.existsSync(csvFile)) {
  fs.writeFileSync(csvFile, 'IP,Region,DateTime,longLat\n');
}

// Endpoint to capture visitor data
app.post('/capture', (req, res) => {
  const { ip, region, dateTime, longLat } = req.body;
  if (!ip || !region || !dateTime || !longLat) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const currentDate = dateTime.split('T')[0];

  // Read the CSV to check for duplicates on the same day
  fs.readFile(csvFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV:', err);
      return res.status(500).json({ error: 'Failed to read data' });
    }

    const lines = data.trim().split('\n');
    const isDuplicate = lines.slice(1).some(line => { // Skip header
      const [existingIp, , existingDateTime] = line.split(',');
      const existingDate = existingDateTime.split('T')[0];
      return existingIp === ip && existingDate === currentDate;
    });

    if (isDuplicate) {
      return res.json({ success: true, message: 'Data already exists for today' });
    }

    // Append new data
    const line = `${ip},${region},${dateTime},${longLat}\n`;
    fs.appendFile(csvFile, line, (appendErr) => {
      if (appendErr) {
        console.error('Error writing to CSV:', appendErr);
        return res.status(500).json({ error: 'Failed to save data' });
      }
      res.json({ success: true });
    });
  });
});

app.get('/fetchRecord', (req, res) => {
  fs.readFile(csvFile, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading CSV:', err);
      return res.status(500).json({ error: 'Failed to read data' });
    }

    const lines = data.trim().split('\n');
    const records = lines.slice(1).map(line => {
      const [ip, region, dateTime, longLat] = line.split(',');
      return { ip, region, dateTime, longLat };
    });
    res.json(records);
  });
});

app.get('/download', (req, res) => {
  res.download(csvFile, 'index.csv', (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'API not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Cron job to delete records older than 30 days daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Running cleanup job...');
  try {
    const data = fs.readFileSync(csvFile, 'utf8');
    const lines = data.trim().split('\n');
    if (lines.length <= 1) return; // No data to clean

    const header = lines[0];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const filteredLines = lines.slice(1).filter(line => {
      const parts = line.split(',');
      if (parts.length < 3) return false;
      const dateTime = parts[2];
      const recordDate = new Date(dateTime);
      return !isNaN(recordDate.getTime()) && recordDate >= thirtyDaysAgo;
    });

    const newData = header + '\n' + filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : '');
    fs.writeFileSync(csvFile, newData);
    console.log('Cleanup job completed.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
});

module.exports = app; 