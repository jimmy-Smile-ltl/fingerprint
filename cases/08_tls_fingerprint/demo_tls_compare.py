"""
TLS 指纹对比实验: requests vs curl_cffi (无/有 impersonate)

背景: 很多站点在 TLS 握手层拦截非浏览器客户端 (JA3/JA4 指纹)。
      headers/cookies 抄得再全也没用，换 curl_cffi 的 impersonate 立刻可用。

用法:
  python demo_tls_compare.py --url "https://目标站点"
  python demo_tls_compare.py --url "https://目标站点" --impersonate chrome120

依赖:
  pip install requests curl_cffi

注意: 请遵守目标站点服务条款，不要高频重试 (真实案例中高频采集导致整域名 IP 被封)。
"""
import argparse
import sys

import requests
from curl_cffi import requests as curl_requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def probe(name, fn):
    try:
        resp = fn()
        print(f"  [{name:42s}] status={resp.status_code}  len={len(resp.content)}")
        return resp
    except Exception as e:
        print(f"  [{name:42s}] EXCEPTION: {type(e).__name__}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="TLS 指纹对比实验")
    parser.add_argument("--url", required=True, help="目标 URL")
    parser.add_argument("--impersonate", default="chrome110",
                        help="curl_cffi 模拟的浏览器版本 (默认 chrome110, 可试 chrome120/chrome124)")
    args = parser.parse_args()

    print("=" * 70)
    print(f"  TLS 指纹对比实验: {args.url}")
    print("=" * 70)

    print("\n1. requests (Python 标准 TLS 栈, 最易被识别)")
    probe("requests.get()", lambda: requests.get(args.url, headers=HEADERS, timeout=15))

    print("\n2. curl_cffi 无 impersonate (curl 的 TLS 栈, 仍非浏览器指纹)")
    probe("curl_cffi 无 impersonate",
          lambda: curl_requests.get(args.url, headers=HEADERS, timeout=15))

    print(f"\n3. curl_cffi + impersonate={args.impersonate} (模拟浏览器 ClientHello)")
    probe(f"impersonate={args.impersonate}",
          lambda: curl_requests.get(args.url, headers=HEADERS, timeout=15,
                                    impersonate=args.impersonate))

    print("""
解读:
  - 1 失败、3 成功  → TLS 指纹问题，后续统一用 curl_cffi + impersonate
  - 2、3 都失败     → 不是(不只是) TLS 层，检查 headers/cookies/风控/行为
  - 3 时好时坏      → 风控联动 (cf_clearance 过期 / 频控)，注意控制频率与代理
  - 全失败          → IP 信誉问题或需要浏览器级环境 (参见案例 01/02 的补环境)
""")


if __name__ == "__main__":
    sys.exit(main())
