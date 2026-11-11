import { mkdir, cp, stat, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root,'public/models'), { recursive:true });
await mkdir(path.join(root,'public/mediapipe/wasm'), { recursive:true });
await cp(path.join(root,'node_modules/@mediapipe/tasks-vision/wasm'), path.join(root,'public/mediapipe/wasm'), { recursive:true });
for (const spec of [
  ['pose_landmarker_full.task','https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task','5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'],
  ['face_landmarker.task','https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task','64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
]) {
  const [name,url,expected] = spec;
  const model=path.join(root,'public/models',name);
  const exists=await stat(model).then(value=>value.size>1000).catch(()=>false);
  if (!exists) {
    const response=await fetch(url);
    if (!response.ok) throw new Error('Model download failed: '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex')!==expected) throw new Error('Downloaded model checksum mismatch: '+name);
    await writeFile(model,bytes);
  }
  if (createHash('sha256').update(await readFile(model)).digest('hex')!==expected) throw new Error('Model checksum mismatch: '+name);
}
console.log('Local MediaPipe model and WASM assets are ready.');

