"""Serve the vanilla frontend and the same Python handler used on Vercel."""
import argparse
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# .env is local-only. Values are never printed, sent to the client, or committed.
env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

from api.chat import handler as ApiHandler


class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    reply = ApiHandler.reply

    def do_POST(self):
        if urlsplit(self.path).path == "/api/chat":
            return ApiHandler.do_POST(self)
        self.reply(404, {"error": "지원하지 않는 요청입니다."})

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/api/chat":
            return ApiHandler.do_GET(self)
        # Serve only public assets; never expose .env, backend, or documentation.
        if path != "/" and path != "/index.html" and not path.startswith(("/css/", "/js/", "/images/", "/data/")):
            self.send_error(404)
            return
        if ".." in Path(path).parts or any(p.startswith(".") for p in Path(path).parts):
            self.send_error(404)
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(404)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=43125)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), LocalHandler)
    print(f"Local: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
