import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MessageSender } from './message-sender.js';
import type { Logger } from '../utils/logger.js';

/**
 * Extract local image paths from markdown text.
 * Returns array of { original: string, isRelative: boolean } to distinguish uploadable vs text-only paths.
 */
export function extractLocalImagePaths(text: string): Array<{ original: string; isRelative: boolean }> {
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const paths: Array<{ original: string; isRelative: boolean }> = [];
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const url = match[1];
    if (url.startsWith('http://') || url.startsWith('https://')) continue;
    
    let imgPath = url;
    if (imgPath.startsWith('file://')) {
      imgPath = imgPath.slice(7);
      if (imgPath.startsWith('/') && /^[A-Za-z]:/.test(imgPath.slice(1))) {
        imgPath = imgPath.slice(1);
      }
    }
    
    const isRelative = !path.isAbsolute(imgPath);
    paths.push({ original: imgPath, isRelative });
  }
  
  return paths;
}

/**
 * Upload local images to Feishu and replace markdown image syntax with image_key.
 * - Relative paths: remove syntax, keep text (cannot upload)
 * - Absolute paths: upload and replace with image_key
 * Returns the modified text.
 */
export async function replaceLocalImagesWithKeys(
  text: string,
  sender: MessageSender,
): Promise<string> {
  const localPaths = extractLocalImagePaths(text);
  if (localPaths.length === 0) {
    return text;
  }

  let modifiedText = text;

  for (const { original, isRelative } of localPaths) {
    try {
      // Relative paths: cannot upload, just remove syntax and keep text
      if (isRelative) {
        modifiedText = removeImageMarkdown(modifiedText, original);
        continue;
      }

      // Absolute paths: attempt upload
      // Verify file exists before uploading
      if (!fs.existsSync(original)) {
        modifiedText = removeImageMarkdown(modifiedText, original);
        continue;
      }

      // Upload to Feishu
      const imageKey = await sender.uploadImage(original);
      if (!imageKey) {
        modifiedText = removeImageMarkdown(modifiedText, original);
        continue;
      }

      // Replace in text
      const beforeReplace = modifiedText;
      modifiedText = replaceImagePath(modifiedText, original, imageKey);
      
      if (modifiedText === beforeReplace) {
        modifiedText = removeImageMarkdown(modifiedText, original);
      }
    } catch (err) {
      modifiedText = removeImageMarkdown(modifiedText, original);
    }
  }
  
  return modifiedText;
}

/**
 * Replace a specific image path in markdown with Feishu image_key format.
 */
function replaceImagePath(text: string, originalPath: string, imageKey: string): string {
  const variants = [
    originalPath,
    originalPath.replace(/\\/g, '/'),
    `file:///${originalPath.replace(/\\/g, '/')}`,
    `file:///${originalPath.replace(/\\/g, '/').toLowerCase()}`,
  ];

  let result = text;
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`, 'g');
    const newResult = result.replace(pattern, `![$1](${imageKey})`);
    if (newResult !== result) {
      return newResult;
    }
  }
  
  return text;
}

/**
 * Remove markdown image syntax but keep the path as plain text for visibility.
 * Used for relative paths that cannot be uploaded.
 */
function removeImageMarkdown(text: string, imgPath: string): string {
  const escaped = imgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variants = [
    escaped,
    escaped.replace(/\\/g, '/'),
    `file:///${escaped.replace(/\\/g, '/')}`,
  ];
  
  // Also try basename for relative paths
  const basename = path.basename(imgPath);
  if (basename && basename !== imgPath) {
    const basenameEscaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    variants.push(basenameEscaped);
  }
  
  let result = text;
  for (const variant of variants) {
    // Replace ![](path) with just the path text (keep visible)
    const pattern = new RegExp(`!\\[[^\\]]*\\]\\(${variant}\\)`, 'g');
    result = result.replace(pattern, variant);
  }
  
  return result;
}

/**
 * Process images during streaming: remove ALL local image markdown syntax and keep as plain text.
 * This avoids Feishu API errors "card contains images but no imagekey".
 */
export function processImagesForStreaming(text: string): string {
  const paths = extractLocalImagePaths(text);
  if (paths.length === 0) {
    return text;
  }
  
  let result = text;
  for (const { original } of paths) {
    result = removeImageMarkdown(result, original);
  }
  
  return result;
}
