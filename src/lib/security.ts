export function safeDownloadFilename(input:string,fallback='download.bin'){
  const cleaned=input.replace(/[\r\n\\/\0]/g,'_').replace(/[^a-zA-Z0-9._ -]/g,'_').trim();
  return cleaned.slice(0,180)||fallback;
}

export function hasPrefix(bytes:Uint8Array,signature:number[]){return signature.every((value,index)=>bytes[index]===value);}
