// Unit checks for the session-token encryption. Run: npm run test:crypto
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../src/services/sessionStore.ts';

const k = randomBytes(32), k2 = randomBytes(32);
const blob = encrypt('header.payload.sig', '101', k);
let failed = 0;
const r = (name: string, ok: boolean) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

r('round-trips with the right key and client', decrypt(blob, '101', k) === 'header.payload.sig');
r('wrong key -> null', decrypt(blob, '101', k2) === null);
r('same blob moved to another client -> null (AAD)', decrypt(blob, '91', k) === null);
r('ciphertext bit-flip -> null', decrypt(blob.slice(0, -2) + (blob.endsWith('A') ? 'B' : 'A') + blob.slice(-1), '101', k) === null);
r('truncated / garbage blobs -> null', decrypt('AAAA.BBBB.CCCC', '101', k) === null && decrypt('', '101', k) === null);
r('different IV each time', encrypt('x', '1', k) !== encrypt('x', '1', k));
r('plaintext not present in the blob', !blob.includes('header.payload'));
process.exit(failed ? 1 : 0);
