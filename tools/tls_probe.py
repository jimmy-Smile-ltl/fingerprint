"""
Trigger a TLS ClientHello against the local JA3 capture server.

The capture server closes the connection after reading ClientHello, so the
client will report a connection error. That is expected: the fingerprint has
already been printed by tools/tls_ja3_capture.py.

Usage:
    python tools/tls_probe.py --client requests
    python tools/tls_probe.py --client curl_cffi --impersonate chrome110
    python tools/tls_probe.py --url https://127.0.0.1:8443 --client curl_cffi
"""

import argparse
import sys
import warnings


def main():
    parser = argparse.ArgumentParser(description="Send a TLS ClientHello to the local capture server")
    parser.add_argument("--url", default="https://127.0.0.1:8443", help="capture server URL")
    parser.add_argument("--client", choices=("requests", "curl_cffi"), default="curl_cffi")
    parser.add_argument("--impersonate", default="chrome110", help="curl_cffi browser profile")
    parser.add_argument("--timeout", type=float, default=3.0)
    args = parser.parse_args()

    warnings.filterwarnings("ignore")
    try:
        if args.client == "curl_cffi":
            from curl_cffi import requests
            requests.get(
                args.url,
                impersonate=args.impersonate,
                verify=False,
                timeout=args.timeout,
            )
        else:
            import requests
            requests.get(args.url, verify=False, timeout=args.timeout)
    except Exception as exc:  # noqa: BLE001 - the capture server intentionally closes early
        print("[probe] %s: %s" % (type(exc).__name__, exc))
        print("[probe] ClientHello was sent; check the capture server output above.")
    else:
        print("[probe] request completed (the capture server usually closes early).")


if __name__ == "__main__":
    sys.exit(main())
