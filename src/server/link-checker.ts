import dns from 'node:dns/promises';
import net from 'node:net';
import type { LinkDiagnostic } from '../shared/types.js';

function isPrivateIp(address: string): boolean {
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (net.isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

async function assertPublic(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Somente HTTP(S) pode ser consultado.');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) throw new Error('Endereço local bloqueado.');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateIp(item.address))) throw new Error('Endereço privado ou não resolvido bloqueado.');
}

async function request(url: URL, redirects = 0): Promise<Response> {
  if (redirects > 3) throw new Error('Limite de redirecionamentos excedido.');
  await assertPublic(url);
  let response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  if ([405, 501].includes(response.status)) {
    response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return response;
    return request(new URL(location, url), redirects + 1);
  }
  return response;
}

export async function checkLink(rawUrl: string): Promise<LinkDiagnostic> {
  try {
    const url = new URL(rawUrl);
    const response = await request(url);
    return { url: rawUrl, ok: response.ok, status: response.status, message: response.ok ? 'Recurso acessível.' : `Resposta HTTP ${response.status}.` };
  } catch (error) {
    return { url: rawUrl, ok: false, message: error instanceof Error ? error.message : 'Falha na consulta.' };
  }
}
