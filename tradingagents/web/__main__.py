"""Start the workbench: ``python -m tradingagents.web [--port 8765] [--no-browser] [--dev]``."""

from __future__ import annotations

import argparse
import sys
import threading
import webbrowser


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tradingagents.web",
                                     description="TradingAgents local research workbench")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser window")
    parser.add_argument("--dev", action="store_true",
                        help="API only, for the Vite dev server on :5173; enables /api/docs")
    args = parser.parse_args(argv)

    try:
        import uvicorn
    except ImportError:
        print('The workbench needs its extra: pip install "tradingagents[web]"', file=sys.stderr)
        return 1

    from tradingagents.web.app import create_app

    app = create_app(port=args.port, dev=args.dev)
    url = f"http://127.0.0.1:{5173 if args.dev else args.port}/"
    print(f"TradingAgents workbench: {url}  (local only; Ctrl+C to stop)")
    if not args.no_browser and not args.dev:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    # Loopback only: the API handles keys and holdings and has no login of its own.
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
