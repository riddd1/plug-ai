const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const aiRoute = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '150mb' }));

// API routes
app.use('/ai', aiRoute);

// Server-side video renderer (ffmpeg-static — no system install needed)
app.post('/api/render-video', async (req, res) => {
  const { frames, audio } = req.body;
  if (!frames || !frames.length) return res.status(400).json({ error: 'No frames' });

  const id = crypto.randomBytes(8).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `render_${id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const concatLines = ['ffconcat version 1.0'];
    let totalDur = 0;
    for (let i = 0; i < frames.length; i++) {
      const { data, duration } = frames[i];
      const ext = data.startsWith('data:image/jpeg') ? 'jpg' : 'png';
      const fname = `frame_${String(i).padStart(4, '0')}.${ext}`;
      const base64 = data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(tmpDir, fname), Buffer.from(base64, 'base64'));
      concatLines.push(`file '${fname}'`, `duration ${duration}`);
      totalDur += parseFloat(duration);
    }
    fs.writeFileSync(path.join(tmpDir, 'concat.txt'), concatLines.join('\n'));

    let audioPath = null;
    let aStart = 0, aEnd = 0;
    if (audio && audio.data) {
      const audioBase64 = audio.data.replace(/^data:[^;]+;base64,/, '');
      const audioExt = (audio.mime || '').includes('mp4') || (audio.mime || '').includes('m4a') ? 'm4a'
                     : (audio.mime || '').includes('ogg') ? 'ogg' : 'mp3';
      audioPath = path.join(tmpDir, `audio.${audioExt}`);
      fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));
      aStart = parseFloat(audio.start) || 0;
      aEnd   = parseFloat(audio.end)   || 0;
    }

    const outputPath = path.join(tmpDir, 'output.mp4');

    const ffArgs = [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', path.join(tmpDir, 'concat.txt'),
    ];

    if (audioPath) {
      if (aStart > 0) ffArgs.push('-ss', String(aStart));
      if (aEnd > aStart) ffArgs.push('-t', String(aEnd - aStart));
      ffArgs.push('-i', audioPath);
      ffArgs.push('-map', '0:v', '-map', '1:a');
    }

    ffArgs.push(
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-t', String(totalDur)
    );

    if (audioPath) {
      ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
    }

    ffArgs.push('-movflags', 'faststart', outputPath);

    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, ffArgs, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="ig-dm-slideshow.mp4"');
    res.send(fs.readFileSync(outputPath));

  } catch (err) {
    console.error('render-video error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

// Serve static frontend files
const staticDir = path.join(__dirname, '../');
app.use(express.static(staticDir, { index: false }));

app.get('/', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
app.get('/scriptmaker', (req, res) => res.sendFile(path.join(staticDir, 'scriptmaker.html')));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (!res.headersSent) res.status(err.status || 500).send(err.message || 'Internal server error');
});

app.listen(PORT, () => console.log(`DM Studio running on port ${PORT}`));
