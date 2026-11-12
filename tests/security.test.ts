import {describe,expect,it} from 'vitest';
import {safeDownloadFilename,hasPrefix} from '../src/lib/security';
describe('security helpers',()=>{
  it('neutralizes path traversal and header control characters',()=>{expect(safeDownloadFilename('../private\r\n.zip')).toBe('.._private__.zip');});
  it('checks binary signatures',()=>{expect(hasPrefix(new Uint8Array([0x89,0x50,0x4e,0x47]),[0x89,0x50,0x4e,0x47])).toBe(true);expect(hasPrefix(new Uint8Array([0x25,0x50]),[0x89,0x50])).toBe(false);});
});
