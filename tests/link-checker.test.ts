import dns from 'node:dns/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLink } from '../src/server/link-checker.js';

describe('verificador de links', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tenta GET quando o servidor recusa HEAD com 403', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }));

    const diagnostic = await checkLink('https://example.com/observation/1');

    expect(diagnostic).toMatchObject({ ok: true, status: 206, message: 'Recurso acessível.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'HEAD', redirect: 'manual' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      headers: expect.objectContaining({ Range: 'bytes=0-0', 'User-Agent': expect.any(String) })
    });
  });

  it('mantém como falha quando HEAD e GET são recusados', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const diagnostic = await checkLink('https://example.com/observation/2');

    expect(diagnostic).toMatchObject({ ok: false, status: 403, message: 'Resposta HTTP 403.' });
  });

  it('confirma observações do iNaturalist pela representação JSON quando a página bloqueia o servidor', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const diagnostic = await checkLink('https://www.inaturalist.org/observations/359554235');

    expect(diagnostic).toMatchObject({ ok: true, status: 200, message: 'Recurso acessível.' });
    expect(fetchMock.mock.calls[2]?.[0]).toEqual(new URL('https://www.inaturalist.org/observations/359554235.json'));
  });
});
