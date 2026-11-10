#!/usr/bin/env node
/**
 * Icon Generator for Dokkan Fan Guide
 * Generates all required icon sizes for Tauri (desktop), Android, iOS, and Windows Store
 * from a single source image.
 *
 * Usage: node generate-icons.mjs <source-image-path>
 * Example: node generate-icons.mjs ../source-icon.png
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node generate-icons.mjs <source-image-path>');
  console.error('Example: node generate-icons.mjs ../source-icon.png');
  process.exit(1);
}

const sourcePath = path.resolve(args[0]);
const iconsDir = path.resolve('src-tauri/icons');

if (!fs.existsSync(sourcePath)) {
  console.error(`Source image not found: ${sourcePath}`);
  process.exit(1);
}

console.log(`Generating icons from: ${sourcePath}`);
console.log(`Output directory: ${iconsDir}`);

// Ensure output directories exist
const dirs = [
  iconsDir,
  path.join(iconsDir, 'android', 'mipmap-mdpi'),
  path.join(iconsDir, 'android', 'mipmap-hdpi'),
  path.join(iconsDir, 'android', 'mipmap-xhdpi'),
  path.join(iconsDir, 'android', 'mipmap-xxhdpi'),
  path.join(iconsDir, 'android', 'mipmap-xxxhdpi'),
  path.join(iconsDir, 'android', 'mipmap-anydpi-v26'),
  path.join(iconsDir, 'android', 'values'),
  path.join(iconsDir, 'ios'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

async function generateIcons() {
  try {
    const image = sharp(sourcePath);
    const metadata = await image.metadata();
    console.log(`Source image: ${metadata.width}x${metadata.height} ${metadata.format}`);

    // Resize helper
    const resize = (width, height, outputPath, options = {}) => {
      return sharp(sourcePath)
        .resize(width, height, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          ...options
        })
        .png()
        .toFile(outputPath);
    };

    // ============ DESKTOP ICONS (Tauri) ============
    console.log('\n--- Generating Desktop Icons ---');

    // 32x32.png
    await resize(32, 32, path.join(iconsDir, '32x32.png'));
    console.log('✓ 32x32.png');

    // 128x128.png
    await resize(128, 128, path.join(iconsDir, '128x128.png'));
    console.log('✓ 128x128.png');

    // 128x128@2x.png (256x256)
    await resize(256, 256, path.join(iconsDir, '128x128@2x.png'));
    console.log('✓ 128x128@2x.png');

    // icon.png (512x512 - standard for Tauri)
    await resize(512, 512, path.join(iconsDir, 'icon.png'));
    console.log('✓ icon.png');

    // icon-1024.png (for high-res displays)
    await resize(1024, 1024, path.join(iconsDir, 'icon-1024.png'));
    console.log('✓ icon-1024.png');

    // icon.ico (Windows - multiple sizes embedded)
    await sharp(sourcePath)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
      .then(pngBuffer => sharp(pngBuffer).toFile(path.join(iconsDir, 'icon.ico')));
    console.log('✓ icon.ico');

    // For icon.icns (macOS), we'd need iconutil which is macOS-only
    // We'll generate the iconset folder instead
    const iconsetDir = path.join(iconsDir, 'icon.iconset');
    if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir);

    const icnsSizes = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' },
    ];

    for (const { size, name } of icnsSizes) {
      await resize(size, size, path.join(iconsetDir, name));
    }
    console.log('✓ icon.iconset (for macOS .icns - run "iconutil -c icns icon.iconset" on macOS)');

    // ============ ANDROID ICONS ============
    console.log('\n--- Generating Android Icons ---');

    // Adaptive icon foreground (should be 432x432 with safe zone 288x288)
    // We'll generate a larger version and let Android handle it
    const foregroundSize = 432;

    const androidConfigs = [
      { dpi: 'mdpi', launcher: 48, round: 48, foreground: 48 }, // baseline
      { dpi: 'hdpi', launcher: 72, round: 72, foreground: 72 }, // 1.5x
      { dpi: 'xhdpi', launcher: 96, round: 96, foreground: 96 }, // 2x
      { dpi: 'xxhdpi', launcher: 144, round: 144, foreground: 144 }, // 3x
      { dpi: 'xxxhdpi', launcher: 192, round: 192, foreground: 192 }, // 4x
    ];

    for (const { dpi, launcher, round, foreground } of androidConfigs) {
      const mipmapDir = path.join(iconsDir, 'android', `mipmap-${dpi}`);

      // ic_launcher.png
      await resize(launcher, launcher, path.join(mipmapDir, 'ic_launcher.png'));
      // ic_launcher_round.png
      await resize(round, round, path.join(mipmapDir, 'ic_launcher_round.png'));
      // ic_launcher_foreground.png (for adaptive icons)
      await resize(foreground, foreground, path.join(mipmapDir, 'ic_launcher_foreground.png'));

      console.log(`✓ mipmap-${dpi}: ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png`);
    }

    // ic_launcher.xml (adaptive icon config)
    const icLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;
    fs.writeFileSync(path.join(iconsDir, 'android', 'mipmap-anydpi-v26', 'ic_launcher.xml'), icLauncherXml);
    fs.writeFileSync(path.join(iconsDir, 'android', 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), icLauncherXml);
    console.log('✓ mipmap-anydpi-v26/ic_launcher.xml and ic_launcher_round.xml');

    // ic_launcher_background.xml (color background)
    const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1E1E1E</color>
</resources>`;
    fs.writeFileSync(path.join(iconsDir, 'android', 'values', 'ic_launcher_background.xml'), bgXml);
    console.log('✓ values/ic_launcher_background.xml');

    // ============ iOS ICONS ============
    console.log('\n--- Generating iOS Icons ---');

    const iosIcons = [
      // iPhone
      { size: 20, scale: 1, name: 'AppIcon-20x20@1x.png' },
      { size: 20, scale: 2, name: 'AppIcon-20x20@2x.png' },
      { size: 20, scale: 3, name: 'AppIcon-20x20@3x.png' },
      { size: 29, scale: 1, name: 'AppIcon-29x29@1x.png' },
      { size: 29, scale: 2, name: 'AppIcon-29x29@2x.png' },
      { size: 29, scale: 3, name: 'AppIcon-29x29@3x.png' },
      { size: 40, scale: 1, name: 'AppIcon-40x40@1x.png' },
      { size: 40, scale: 2, name: 'AppIcon-40x40@2x.png' },
      { size: 40, scale: 3, name: 'AppIcon-40x40@3x.png' },
      { size: 60, scale: 2, name: 'AppIcon-60x60@2x.png' },
      { size: 60, scale: 3, name: 'AppIcon-60x60@3x.png' },
      // iPad
      { size: 20, scale: 1, name: 'AppIcon-20x20@1x-ipad.png' },
      { size: 20, scale: 2, name: 'AppIcon-20x20@2x-ipad.png' },
      { size: 29, scale: 1, name: 'AppIcon-29x29@1x-ipad.png' },
      { size: 29, scale: 2, name: 'AppIcon-29x29@2x-ipad.png' },
      { size: 40, scale: 1, name: 'AppIcon-40x40@1x-ipad.png' },
      { size: 40, scale: 2, name: 'AppIcon-40x40@2x-ipad.png' },
      { size: 76, scale: 1, name: 'AppIcon-76x76@1x.png' },
      { size: 76, scale: 2, name: 'AppIcon-76x76@2x.png' },
      { size: 83.5, scale: 2, name: 'AppIcon-83.5x83.5@2x.png' },
      // App Store
      { size: 1024, scale: 1, name: 'AppIcon-1024x1024@1x.png' },
    ];

    for (const { size, scale, name } of iosIcons) {
      const pixelSize = Math.round(size * scale);
      await resize(pixelSize, pixelSize, path.join(iconsDir, 'ios', name));
      console.log(`✓ ios/${name} (${pixelSize}x${pixelSize})`);
    }

    // ============ WINDOWS STORE LOGOS ============
    console.log('\n--- Generating Windows Store Logos ---');

    const winLogos = [
      { size: 30, name: 'Square30x30Logo.png' },
      { size: 44, name: 'Square44x44Logo.png' },
      { size: 71, name: 'Square71x71Logo.png' },
      { size: 89, name: 'Square89x89Logo.png' },
      { size: 107, name: 'Square107x107Logo.png' },
      { size: 142, name: 'Square142x142Logo.png' },
      { size: 150, name: 'Square150x150Logo.png' },
      { size: 284, name: 'Square284x284Logo.png' },
      { size: 310, name: 'Square310x310Logo.png' },
      { size: 50, name: 'StoreLogo.png' },
    ];

    for (const { size, name } of winLogos) {
      await resize(size, size, path.join(iconsDir, name));
      console.log(`✓ ${name} (${size}x${size})`);
    }

    // ============ SPLASH SCREENS (Android) ============
    console.log('\n--- Generating Android Splash Screens ---');

    // Generate splash screens for different densities and orientations
    // These are in the Capacitor Android project, not Tauri icons
    const splashDir = path.resolve('android', 'app', 'src', 'main', 'res');
    if (fs.existsSync(splashDir)) {
      const splashConfigs = [
        { dir: 'drawable-port-mdpi', width: 320, height: 480 },
        { dir: 'drawable-port-hdpi', width: 480, height: 800 },
        { dir: 'drawable-port-xhdpi', width: 720, height: 1280 },
        { dir: 'drawable-port-xxhdpi', width: 1080, height: 1920 },
        { dir: 'drawable-port-xxxhdpi', width: 1440, height: 2560 },
        { dir: 'drawable-land-mdpi', width: 480, height: 320 },
        { dir: 'drawable-land-hdpi', width: 800, height: 480 },
        { dir: 'drawable-land-xhdpi', width: 1280, height: 720 },
        { dir: 'drawable-land-xxhdpi', width: 1920, height: 1080 },
        { dir: 'drawable-land-xxxhdpi', width: 2560, height: 1440 },
      ];

      for (const { dir, width, height } of splashConfigs) {
        const outDir = path.join(splashDir, dir);
        if (fs.existsSync(outDir)) {
          await sharp(sourcePath)
            .resize(width, height, { fit: 'cover', position: 'center' })
            .png()
            .toFile(path.join(outDir, 'splash.png'));
          console.log(`✓ ${dir}/splash.png (${width}x${height})`);
        }
      }
    } else {
      console.log('⚠ Android splash directory not found, skipping splash screens');
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('\nNote: For macOS .icns, run on macOS:');
    console.log(`  iconutil -c icns "${path.join(iconsDir, 'icon.iconset')}" -o "${path.join(iconsDir, 'icon.icns')}"`);
    console.log('\nFor Windows .ico with multiple sizes, consider using a dedicated tool like:');
    console.log('  https://icoconvert.com/ or ImageMagick on Windows');

  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();