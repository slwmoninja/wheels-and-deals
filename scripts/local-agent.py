#!/usr/bin/env python3
"""
Local search agent for WheelsAndDeals.

Runs alongside serve.ps1/serve.sh and lets the "Connect Claude" button in the
app trigger a real search with one click, instead of copy-pasting a prompt or
a terminal command by hand: the browser POSTs the search fields to this
process, which runs `claude -p` (headless Claude Code, your existing login --
not a separate API key) and writes the result straight into data/ and
data/snapshots-index.json, same as scripts/new-search.ps1 does from the
command line.

Security note: this process can trigger real Claude Code runs and file writes
on your machine, so it only accepts requests whose Origin header is this
app's own known origins (localhost dev server or the published GitHub Pages
site) -- not "Access-Control-Allow-Origin: *" -- and only binds to
127.0.0.1, never a public interface. That combination stops both a random
website you visit from silently triggering it, and anyone else on your
network from reaching it.

Usage:
  python scripts/local-agent.py            (or python3 on Mac/Linux)
  python scripts/local-agent.py --port 8792
"""
import json
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_ORIGINS = {
    "http://localhost:8791",
    "http://127.0.0.1:8791",
    "https://slwmoninja.github.io",
}


def slugify(s):
    return (s or "").strip().lower()


def build_prompt(make, model, trim, max_mileage, max_price, zip_code, hours):
    data_file = f"{slugify(make)}-{slugify(model)}-{zip_code}.json"
    return (
        "Using WebFetch/WebSearch (not a scripted HTTP request -- these sites block plain "
        "curl/requests-style scraping, but Claude's WebFetch tool gets through), search current "
        f"used-vehicle listings for a {make} {trim} {model}, under {max_mileage} miles, under "
        f"${max_price}, within a {hours}-hour drive of ZIP {zip_code}. "
        "For each result: (1) WebSearch a KBB Fair Purchase Price anchor for that model year/trim "
        "and estimate the delta vs. asking price; "
        "(2) fetch that specific vehicle's own listing detail page (VDP), confirm price/mileage "
        "match, and save that URL as the listingUrl field -- never substitute a generic "
        "search-results link; only omit listingUrl if that page truly cannot be found; "
        "(3) from that same VDP, save the direct URL of that vehicle's own primary photo as the "
        "photoUrl field (verify it's a real photo of that vehicle, not a placeholder/logo); only "
        "omit photoUrl if none is found. "
        "For the top 5 best-value results, also WebFetch/WebSearch a real, named "
        "pre-purchase-inspection shop actually serving that listing's city (phone/address/price if "
        "published) for the inspection field -- never invent a business. "
        "Sort results by best value first (most under book). "
        "Save the results as JSON matching the exact schema in data/jeep-wrangler-23185.json, write "
        f"it to data/{data_file}, and add an entry "
        f'{{"make": "{slugify(make)}", "model": "{slugify(model)}", "zip": "{zip_code}", '
        f'"file": "{data_file}"}} to data/snapshots-index.json if one is not already there for '
        "this make/model/zip."
    )


class Handler(BaseHTTPRequestHandler):
    def _origin(self):
        origin = self.headers.get("Origin", "")
        return origin if origin in ALLOWED_ORIGINS else None

    def _send_cors(self, origin):
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        origin = self._origin()
        self.send_response(204 if origin else 403)
        self._send_cors(origin)
        self.end_headers()

    def do_GET(self):
        origin = self._origin()
        if self.path != "/health":
            self.send_response(404)
            self._send_cors(origin)
            self.end_headers()
            return
        self.send_response(200)
        self._send_cors(origin)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def do_POST(self):
        origin = self._origin()
        if not origin:
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b'{"success":false,"error":"origin not allowed"}')
            return
        if self.path != "/search":
            self.send_response(404)
            self._send_cors(origin)
            self.end_headers()
            return
        if "application/json" not in self.headers.get("Content-Type", ""):
            self.send_response(415)
            self._send_cors(origin)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
            make, model, zip_code = body["make"], body["model"], body["zip"]
            trim = body.get("trim", "")
            max_mileage = int(body.get("maxMileage", 80000))
            max_price = int(body.get("maxPrice", 40000))
            hours = int(body.get("hours", 2))
            if not re.match(r"^\d{5}$", str(zip_code)):
                raise ValueError("zip must be 5 digits")
        except Exception as e:
            self.send_response(400)
            self._send_cors(origin)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode())
            return

        prompt = build_prompt(make, model, trim, max_mileage, max_price, zip_code, hours)
        data_file_name = f"{slugify(make)}-{slugify(model)}-{zip_code}.json"
        data_path = ROOT / "data" / data_file_name

        print(f"Searching {make} {trim} {model} near {zip_code} ...")
        try:
            result = subprocess.run(
                ["claude", "-p", prompt, "--allowedTools", "WebFetch,WebSearch,Read,Edit,Write",
                 "--permission-mode", "acceptEdits"],
                cwd=ROOT, capture_output=True, text=True,
            )
        except FileNotFoundError:
            self.send_response(200)
            self._send_cors(origin)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "error": "claude command not found -- install/log in to Claude Code first",
            }).encode())
            return

        self.send_response(200)
        self._send_cors(origin)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        if data_path.exists():
            self.wfile.write(json.dumps({"success": True, "file": data_file_name}).encode())
            print(f"Saved: data/{data_file_name}")
        else:
            err = (result.stderr or result.stdout or "no data file was created")[-2000:]
            self.wfile.write(json.dumps({"success": False, "error": err}).encode())
            print("No data file was created -- see error above.")

    def log_message(self, fmt, *args):
        pass  # keep console output limited to our own prints above


def main():
    port = 8792
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"WheelsAndDeals local search agent listening at http://127.0.0.1:{port}")
    print("Only requests from this app's own known origins are accepted. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
