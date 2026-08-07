#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const jobId = process.argv[2] || 'demo';
const style = process.argv[3] || 'oneword';
const outDir = path.join(process.cwd(), 'public', 'clips', jobId);
fs.mkdirSync(outDir, { recursive: true });

const color = style === 'oneword' ? '#22C55E' : '#FFFFFF';
const bgColor = '#0a0a0f';

// Generate 3 demo clips using ffmpeg if available, otherwise create a simple HTML player page
for (let i = 1; i <= 3; i++) {
  const dur = 10;
  
  // Create a simple valid MP4 using the smallest possible approach
  // We'll use a data blob approach - create a minimal webm first then convert
  const outBase = path.join(outDir, `clip_${i}`);
  
  try {
    // Try ffmpeg first
    execSync(`ffmpeg -y -f lavfi -i "color=c=${bgColor.replace('#','0x')}:s=1080x1920:d=${dur}:r=24" -f lavfi -i "anullsrc=r=44100:cl=stereo" -shortest -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart "${outBase}.mp4" 2>/dev/null`, { timeout: 15000 });
  } catch {
    try {
      // Try with drawtext
      execSync(`ffmpeg -y -f lavfi -i "color=${bgColor.replace('#','0x')}:1080x1920:d=10:r=24,drawtext=text='Clip ${i}:fontsize=60:fontcolor=${color.replace('#','0x')}:x=(w-text_w)/2:y=(h-text_h)/2" -f lavfi -i "anullsrc=r=44100:cl=stereo" -shortest -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart "${outBase}.mp4" 2>/dev/null`, { timeout: 15000 });
    } catch {
      // Just copy a very small file - UI will show fallback
      console.log(`Creating placeholder for clip ${i}`);
      fs.writeFileSync(`${outBase}.mp4`, Buffer.alloc(100));
    }
  }
  
  // Captioned version = same clip (in demo mode they're identical)
  try {
    fs.copyFileSync(`${outBase}.mp4`, `${outBase}_captioned.mp4`);
  } catch {
    fs.writeFileSync(`${outBase}_captioned.mp4`, Buffer.alloc(100));
  }
}

console.log('Demo clips ready!');
