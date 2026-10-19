import { credentialTestReadHandler, renderCredentialTestRead } from '../lib/credential-test-read.mjs';

const check = credentialTestReadHandler();
export default function handler(req, res) {
  res.json = result => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    return res.end(renderCredentialTestRead(result));
  };
  return check(req, res);
}
