"""Vercel Python Serverless Function: POST /api/chat."""
import json
from http.server import BaseHTTPRequestHandler

from lib.tutor import TutorError, handle_tutor


class handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                return self.reply(403, {"error": "학습실 안에서 질문을 보내 주세요."})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.reply(415, {"error": "올바른 질문 형식으로 보내 주세요."})
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 65536:
                return self.reply(413, {"error": "대화가 너무 길어요. 짧게 나눠 질문해 주세요."})
            body = json.loads(self.rfile.read(size))
            self.reply(200, handle_tutor(body))
        except TutorError as error:
            self.reply(error.status, {"error": error.message})
        except (ValueError, UnicodeDecodeError):
            self.reply(400, {"error": "올바른 질문을 보내 주세요."})
        except Exception:
            # Never expose upstream responses, keys, or server details.
            self.reply(500, {"error": "질문을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."})

    def do_GET(self):
        self.reply(405, {"error": "질문은 입력창에서 보내 주세요."})

    def log_message(self, *args):
        pass
