import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const root=process.env.PRIVATE_STORAGE_DIR||path.join(process.cwd(),'.private-storage');
export async function putPrivateFile(bytes:Buffer,extension:string){const key=`${crypto.randomUUID()}-${crypto.randomBytes(12).toString('hex')}.${extension.replace(/[^a-z0-9]/gi,'').toLowerCase()}`;await mkdir(root,{recursive:true});await writeFile(path.join(root,key),bytes,{flag:'wx'});return key;}
export async function getPrivateFile(key:string){if(!key||key.includes('/')||key.includes('\\')||key.includes('..'))throw new Error('Invalid storage key');return readFile(path.join(root,path.basename(key)));}
export async function removePrivateFile(key:string){if(!key||key.includes('/')||key.includes('\\')||key.includes('..'))return;try{await unlink(path.join(root,path.basename(key)))}catch{/* orphan cleanup is best effort */}}
