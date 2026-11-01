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
  it('集市图标和预览图随仓库提供，尺寸正确',()=>{
    const size=(name:string)=>{const png=readFileSync(name);return [png.readUInt32BE(16),png.readUInt32BE(20)];};
    expect(size('icon.png')).toEqual([160,160]);
    expect(size('preview.png')).toEqual([1024,768]);
  });
  it('最低版本不低于实测过文件历史接口的版本',()=>{
    expect(manifest.minAppVersion).toBe('3.8.9');
  });
  it('按已验收的桌面端范围发布',()=>{
    expect(manifest.frontends).toEqual(['desktop','desktop-window','browser-desktop']);
    expect(manifest.disabledInPublish).toBe(true);
  });
});
