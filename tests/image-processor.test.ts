import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractLocalImagePaths } from '../src/feishu/image-processor.js';

describe('image-processor', () => {
  describe('extractLocalImagePaths', () => {
    it('extracts file:// protocol paths as absolute', () => {
      const text = 'Text ![QR](file:///C:/Users/test/qr.png) more';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toBe('C:/Users/test/qr.png');
      expect(paths[0].isRelative).toBe(false);
    });

    it('extracts Windows absolute paths', () => {
      const text = 'Before ![img](C:\\temp\\image.png) after';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toBe('C:\\temp\\image.png');
      expect(paths[0].isRelative).toBe(false);
    });

    it('extracts Unix absolute paths', () => {
      const text = 'Start ![pic](/home/user/pic.jpg) end';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toBe('/home/user/pic.jpg');
      expect(paths[0].isRelative).toBe(false);
    });

    it('extracts multiple images', () => {
      const text = '![First](file:///tmp/1.png) middle ![Second](C:\\temp\\2.png)';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(2);
      expect(paths[0].original).toBe('/tmp/1.png');
      expect(paths[0].isRelative).toBe(false);
      expect(paths[1].original).toBe('C:\\temp\\2.png');
      expect(paths[1].isRelative).toBe(false);
    });

    it('ignores HTTP/HTTPS URLs', () => {
      const text = '![Web](https://example.com/img.png) local ![Local](C:\\img.png)';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toBe('C:\\img.png');
      expect(paths[0].isRelative).toBe(false);
    });

    it('handles complex Feishu auth QR path', () => {
      const text = `授权链接: https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=xxx

![飞书授权二维码](file:///C:/Users/yi.ye/AppData/Local/Temp/metabot-outputs-yi.ye/oc_7688c05e8c8f0f65d0513711646cdf00/feishu_auth_qr.png)`;
      
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toContain('feishu_auth_qr.png');
      expect(paths[0].isRelative).toBe(false);
    });

    it('returns empty array when no local images', () => {
      const text = 'Just text with [link](https://example.com)';
      const paths = extractLocalImagePaths(text);
      expect(paths).toEqual([]);
    });

    it('marks relative paths as isRelative=true', () => {
      const text = '![Relative](qr.png)';
      const paths = extractLocalImagePaths(text);
      expect(paths).toHaveLength(1);
      expect(paths[0].original).toBe('qr.png');
      expect(paths[0].isRelative).toBe(true);
    });
  });
});
