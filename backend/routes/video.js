const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const router = express.Router();

// Find ffmpeg binary — works on Railway (apt install) and local
function getFfmpegPath() {
  const candidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const p of candidates) {
    try { execSync(`${p} -version`, { stdio: 'ignore' }); return p; } catch (_) {}
  }
  return 'ffmpeg';
}
ffmpeg.setFfmpegPath(getFfmpegPath());

function base64ToBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  return Buffer.from(base64, 'base64');
}

router.post('/render-video', async (req, res) => {
  const { frames, audio } = req.body;
  if (!frames || frames.length === 0) return res.status(400).send('no frames');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmstudio-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    const framePaths = frames.map((f, i) => {
      const p = path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.jpg`);
      fs.writeFileSync(p, base64ToBuffer(f.data));
      return p;
    });

    const concatFile = path.join(tmpDir, 'concat.txt');
    const concatLines = framePaths.map((p, i) =>
      `file '${p}'\nduration ${frames[i].duration}`
    );
    concatLines.push(`file '${framePaths[framePaths.length - 1]}'`);
    fs.writeFileSync(concatFile, concatLines.join('\n'));

    let audioPath = null;
    if (audio && audio.data) {
      const ext = audio.mime?.includes('mp4') || audio.mime?.includes('aac') ? 'aac' : 'mp3';
      audioPath = path.join(tmpDir, `audio.${ext}`);
      fs.writeFileSync(audioPath, base64ToBuffer(audio.data));
    }

    await new Promise((resolve, reject) => {
      let cmd = ffmpeg()
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-crf', '23',
          '-preset', 'fast',
        ]);

      if (audioPath) {
        cmd = cmd.input(audioPath);
        if (audio.start > 0) cmd = cmd.inputOptions(['-ss', `${audio.start}`]);
        if (audio.end > 0 && audio.end > audio.start) cmd = cmd.inputOptions(['-to', `${audio.end}`]);
        cmd = cmd
          .outputOptions(['-shortest', '-map', '0:v:0', '-map', '1:a:0'])
          .audioCodec('aac')
          .audioBitrate('192k');
      }

      cmd
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => reject(new Error(stderr || err.message)))
        .run();
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="ig-dm-slideshow.mp4"');
    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => fs.rmSync(tmpDir, { recursive: true, force: true }));
  } catch (err) {
    console.error('Video render error:', err.message);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    if (!res.headersSent) res.status(500).send('Video render failed: ' + err.message);
  }
});

module.exports = router;
