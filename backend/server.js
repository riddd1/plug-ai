const express = require('express');
const path = require('path');

const aiRoute = require('./routes/ai');
const videoRoute = require('./routes/video');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '150mb' }));

// API routes
app.use('/ai', aiRoute);
app.use('/api', videoRoute);

// Serve static frontend files
const staticDir = path.join(__dirname, '../');
app.use(express.static(staticDir, { index: false }));

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
app.get('/scriptmaker', (req, res) => res.sendFile(path.join(staticDir, 'scriptmaker.html')));

// Global error handler — ensures all errors return a readable body
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (!res.headersSent) {
    res.status(err.status || 500).send(err.message || 'Internal server error');
  }
});

app.listen(PORT, () => console.log(`DM Studio running on port ${PORT}`));
