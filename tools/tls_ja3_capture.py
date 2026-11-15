"""
Capture TLS ClientHello packets and print JA3 + JA3 hash. Standard library only.

The tool is a raw TCP listener, not a TLS server: it reads the ClientHello,
prints the fingerprint, and closes the connection before the handshake
completes. That is enough to fingerprint any client (Chrome, requests,
curl_cffi, ...) without installing a certificate or packet-capture driver.

Usage:
    python tools/tls_ja3_capture.py --port 8443
    # then, from another terminal:
    curl -k https://127.0.0.1:8443
    python tools/tls_probe.py --impersonate chrome110

    # machine-readable output
    python tools/tls_ja3_capture.py --port 8443 --json

JA3 spec: https://github.com/salesforce/ja3
Fields: TLSVersion,CipherSuites,Extensions,SupportedGroups,ECPointFormats
GREASE values are excluded, matching common JA3 implementations.
"""

import argparse
import hashlib
import json
import socket
import struct
import sys
import threading
import time


GREASE = {
    0x0A0A, 0x1A1A, 0x2A2A, 0x3A3A, 0x4A4A, 0x5A5A, 0x6A6A, 0x7A7A,
    0x8A8A, 0x9A9A, 0xAAAA, 0xBABA, 0xCACA, 0xDADA, 0xEAEA, 0xFAFA,
}

TLS_VERSIONS = {
    0x0300: "SSL3.0",
    0x0301: "TLS1.0",
    0x0302: "TLS1.1",
    0x0303: "TLS1.2",
    0x0304: "TLS1.3",
}


def u16(data, offset):
    return struct.unpack("!H", data[offset:offset + 2])[0]


def u24(data, offset):
    return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]


def recv_exact(sock, size, limit=262144):
    if size <= 0 or size > limit:
        raise ValueError("invalid TLS record size")
    buf = b""
    while len(buf) < size:
        chunk = sock.recv(size - len(buf))
        if not chunk:
            raise ConnectionError("connection closed")
        buf += chunk
    return buf


def read_client_hello(sock):
    """Read one or more handshake records until a complete ClientHello is present."""
    payload = b""
    for _ in range(16):
        header = recv_exact(sock, 5)
        record_type, _version, length = struct.unpack("!BHH", header)
        data = recv_exact(sock, length)
        if record_type != 22:
            # Ignore non-handshake records (unusual before ClientHello).
            continue
        payload += data
        if len(payload) >= 4:
            handshake_len = u24(payload, 1)
            if len(payload) >= 4 + handshake_len:
                if payload[0] != 1:
                    raise ValueError("first handshake message is not ClientHello")
                return payload[:4 + handshake_len]
    raise ValueError("ClientHello did not arrive in time")


def parse_client_hello(body):
    offset = 4
    legacy_version = u16(body, offset)
    offset += 2 + 32  # version + random

    session_len = body[offset]
    offset += 1 + session_len

    cipher_len = u16(body, offset)
    offset += 2
    ciphers = [u16(body, offset + i) for i in range(0, cipher_len, 2)]
    offset += cipher_len

    compression_len = body[offset]
    offset += 1 + compression_len

    extensions = []
    groups = []
    ec_formats = []
    supported_versions = []
    sni = None
    alpn = []

    if offset + 2 <= len(body):
        extensions_len = u16(body, offset)
        offset += 2
        end = min(offset + extensions_len, len(body))
        while offset + 4 <= end:
            ext_type = u16(body, offset)
            ext_len = u16(body, offset + 2)
            data = body[offset + 4:offset + 4 + ext_len]
            extensions.append(ext_type)
            offset += 4 + ext_len
            try:
                if ext_type == 0x0000:  # server_name
                    p = 2
                    name_type = data[p]
                    p += 1
                    name_len = u16(data, p)
                    p += 2
                    if name_type == 0:
                        sni = data[p:p + name_len].decode("idna", "ignore")
                elif ext_type == 0x000A:  # supported_groups
                    group_len = u16(data, 0)
                    groups = [u16(data, 2 + i) for i in range(0, group_len, 2)]
                elif ext_type == 0x000B:  # ec_point_formats
                    format_len = data[0]
                    ec_formats = list(data[1:1 + format_len])
                elif ext_type == 0x0010:  # ALPN
                    p = 2
                    while p < len(data):
                        proto_len = data[p]
                        p += 1
                        alpn.append(data[p:p + proto_len].decode("ascii", "replace"))
                        p += proto_len
                elif ext_type == 0x002B:  # supported_versions
                    version_len = data[0]
                    supported_versions = [
                        u16(data, 1 + i) for i in range(0, version_len, 2)
                    ]
            except (IndexError, struct.error, UnicodeError):
                continue

    return {
        "legacy_version": legacy_version,
        "ciphers": ciphers,
        "extensions": extensions,
        "groups": groups,
        "ec_formats": ec_formats,
        "supported_versions": supported_versions,
        "sni": sni,
        "alpn": alpn,
    }


def without_grease(values):
    return [value for value in values if value not in GREASE]


def version_name(value):
    return TLS_VERSIONS.get(value, "0x%04x" % value)


def build_ja3(hello):
    ciphers = without_grease(hello["ciphers"])
    extensions = without_grease(hello["extensions"])
    groups = without_grease(hello["groups"])
    ja3 = ",".join([
        str(hello["legacy_version"]),
        "-".join(map(str, ciphers)),
        "-".join(map(str, extensions)),
        "-".join(map(str, groups)),
        "-".join(map(str, hello["ec_formats"])),
    ])
    ja3_hash = hashlib.md5(ja3.encode("ascii")).hexdigest()
    versions = hello["supported_versions"] or [hello["legacy_version"]]
    versions = [value for value in versions if value not in GREASE] or [hello["legacy_version"]]
    return {
        "ja3": ja3,
        "ja3_hash": ja3_hash,
        "sni": hello["sni"],
        "alpn": hello["alpn"],
        "supported_versions": [version_name(v) for v in versions],
        "cipher_count": len(ciphers),
        "extension_count": len(extensions),
        "group_count": len(groups),
    }


def handle_connection(sock, addr, args):
    sock.settimeout(args.timeout)
    remote = "%s:%s" % (addr[0], addr[1])
    try:
        body = read_client_hello(sock)
        fingerprint = build_ja3(parse_client_hello(body))
        result = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "remote": remote,
            **fingerprint,
        }
        if args.json:
            print(json.dumps(result, ensure_ascii=False, separators=(",", ":")), flush=True)
        else:
            print("", flush=True)
            print("[JA3] %s" % result["ja3_hash"], flush=True)
            print("      ja3: %s" % result["ja3"], flush=True)
            print("      sni: %s | alpn: %s | versions: %s" % (
                result["sni"] or "-",
                ",".join(result["alpn"]) or "-",
                ",".join(result["supported_versions"]) or "-",
            ), flush=True)
            print("      ciphers: %d | extensions: %d | groups: %d | remote: %s" % (
                result["cipher_count"], result["extension_count"],
                result["group_count"], remote,
            ), flush=True)
    except Exception as exc:  # noqa: BLE001 - diagnostics for arbitrary clients
        print("[capture] %s: %s: %s" % (remote, type(exc).__name__, exc), flush=True)
    finally:
        try:
            sock.close()
        except OSError:
            pass


def serve(args):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((args.host, args.port))
    server.listen(50)
    print("[capture] listening on %s:%d (Ctrl+C to stop)" % (args.host, args.port), flush=True)
    print("[capture] this only reads ClientHello; the TLS handshake is not completed", flush=True)
    print("[capture] try: curl -k https://127.0.0.1:%d" % args.port, flush=True)
    print("[capture] try: python tools/tls_probe.py --impersonate chrome110", flush=True)

    try:
        if args.once:
            conn, addr = server.accept()
            handle_connection(conn, addr, args)
            return
        while True:
            conn, addr = server.accept()
            threading.Thread(
                target=handle_connection, args=(conn, addr, args), daemon=True
            ).start()
    except KeyboardInterrupt:
        print("\n[capture] stopped", flush=True)
    finally:
        server.close()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Capture TLS ClientHello and print JA3")
    parser.add_argument("--host", default="127.0.0.1", help="listen address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8443, help="listen port (default 8443)")
    parser.add_argument("--timeout", type=float, default=5.0, help="client read timeout seconds")
    parser.add_argument("--once", action="store_true", help="exit after the first connection")
    parser.add_argument("--json", action="store_true", help="print one JSON object per connection")
    serve(parser.parse_args())


if __name__ == "__main__":
    main()
