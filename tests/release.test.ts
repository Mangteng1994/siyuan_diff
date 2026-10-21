import { describe, expect, it } from 'vitest';
import manifest from '../plugin.json';
import project from '../package.json';
import { existsSync, readFileSync } from 'node:fs';
describe('集市发布元数据',()=>{
  it('开源许可证随仓库提供',()=>{
    expect(existsSync('LICENSE')).toBe(true);
    expect(readFileSync('LICENSE','utf8')).toContain('MIT License');
  });
  it('仓库地址与内部包名一致',()=>{
    expect(manifest.url).toBe('https://github.com/Mangteng1994/siyuan_diff');
    expect(manifest.name).toBe('siyuan_diff');
    expect(project.name).toBe(manifest.name);
  });
  it('版本、作者和中文显示名正确',()=>{
    expect(manifest.version).toBe(project.version);
    expect(manifest.author).toBe('Mangteng1994');
    expect(manifest.displayName.default).toBe('文档Diff');
  });
  it('按已验收的桌面端范围发布',()=>{
    expect(manifest.frontends).toEqual(['desktop','desktop-window','browser-desktop']);
    expect(manifest.disabledInPublish).toBe(true);
  });
});
