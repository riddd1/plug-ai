const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

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
    // Write each frame as a JPEG file
    const framePaths = frames.map((f, i) => {
      const p = path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.jpg`);
      fs.writeFileSync(p, base64ToBuffer(f.data));
      return p;
    });

    // Build a concat file with per-frame durations
    const concatFile = path.join(tmpDir, 'concat.txt');
    const concatLines = framePaths.map((p, i) =>
      `file '${p}'\nduration ${frames[i].duration}`
    );
    // ffmpeg concat demuxer needs the last file listed twice
    concatLines.push(`file '${framePaths[framePaths.length - 1]}'`);
    fs.writeFileSync(concatFile, concatLines.join('\n'));

    // Write audio file if present
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
        const hasStart = audio.start > 0;
        const hasEnd = audio.end > 0 && audio.end > audio.start;

        cmd = cmd.input(audioPath);

        if (hasStart) cmd = cmd.inputOptions([`-ss`, `${audio.start}`]);
        if (hasEnd) cmd = cmd.inputOptions([`-to`, `${audio.end}`]);

        cmd = cmd.outputOptions(['-shortest', '-map', '0:v:0', '-map', '1:a:0']);
        cmd = cmd.audioCodec('aac').audioBitrate('192k');
      }

      cmd
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="ig-dm-slideshow.mp4"');
    fs.createReadStream(outputPath).pipe(res);

    res.on('finish', () => fs.rmSync(tmpDir, { recursive: true, force: true }));
  } catch (err) {
    console.error('Video render error:', err.message);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).send('Video render failed: ' + err.message);
  }
});

module.exports = router;
