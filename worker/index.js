/**
 * Cloudflare Worker entry: static assets + /api/tls edge metadata.
 *
 * Browser JavaScript cannot read the TLS handshake. When this project is
 * deployed on Workers, Cloudflare's edge does see the negotiated connection
 * and exposes transport details via `request.cf`. JA3/JA4 are only available
 * when Cloudflare Bot Management is enabled; otherwise use the local
 * ClientHello capture tool in tools/tls_ja3_capture.py.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Keep one canonical URL for search engines; the build keeps test_fp.html
    // for local development, but production should consolidate to `/`.
    if (url.pathname === '/test_fp.html') {
      const target = new URL('/', url);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }

    if (url.pathname === '/api/tls') {
      const cf = request.cf || {};
      const bm = cf.botManagement || {};
      const data = {
        observedAt: new Date().toISOString(),
        tlsVersion: cf.tlsVersion ?? null,
        tlsCipher: cf.tlsCipher ?? null,
        httpProtocol: cf.httpProtocol ?? null,
        clientTcpRtt: cf.clientTcpRtt ?? null,
        asn: cf.asn ?? null,
        asOrganization: cf.asOrganization ?? null,
        colo: cf.colo ?? null,
        country: cf.country ?? null,
        ja3Hash: bm.ja3Hash ?? null,
        ja4: bm.ja4 ?? null,
        note: bm.ja3Hash
          ? 'JA3/JA4 from Cloudflare Bot Management.'
          : 'JA3/JA4 is unavailable without Bot Management; use tools/tls_ja3_capture.py for full ClientHello parsing.'
      };
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
