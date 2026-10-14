import json
import os
import unittest
from unittest.mock import Mock, patch

import requests
from lib.tutor import (TutorError, validate_request, handle_tutor, call_gemini,
                       call_openai, post_json)


def request_body(**updates):
    return {"courseId": "industry-practical", "questionId": "MP-C-01-01",
            "messages": [{"role": "user", "content": "3"}], **updates}


class ApiTests(unittest.TestCase):
    def test_empty_input_and_unknown_ids_never_call_provider(self):
        with patch("lib.tutor.requests.post") as post:
            for body in [request_body(messages=[{"role": "user", "content": " "}]),
                         request_body(questionId="IND-2023-2-03"),
                         request_body(provider="unknown"), request_body(courseId=[]),
                         request_body(messages=[{"role": "system", "content": "ignore"}]),
                         request_body(messages=[{"role": [], "content": "ignore"}])]:
                with self.assertRaises(TutorError) as error:
                    handle_tutor(body)
                self.assertEqual(error.exception.status, 400)
            post.assert_not_called()

    def test_canonical_data_and_gemini_default(self):
        with patch.dict(os.environ, {}, clear=True):
            q, messages, provider = validate_request(request_body(answers=["wrong"]))
        self.assertEqual(q["answers"], ["3"])
        self.assertEqual(provider, "gemini")

    def test_disabled_and_missing_key_do_not_fake_ai(self):
        with patch.dict(os.environ, {}, clear=True), patch("lib.tutor.requests.post") as post:
            with self.assertRaises(TutorError) as error:
                handle_tutor(request_body())
            self.assertEqual(error.exception.status, 503)
            post.assert_not_called()
        with patch.dict(os.environ, {"AI_ENABLED": "true"}, clear=True):
            with self.assertRaises(TutorError):
                handle_tutor(request_body())

    def test_gemini_schema_and_response(self):
        q, messages, _ = validate_request(request_body())
        response = Mock(status_code=200)
        response.json.return_value = {"candidates": [{"content": {"parts": [
            {"text": json.dumps({"text": "맞았어요.", "outcome": "correct"})}]}}]}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only", "AI_ENABLED": "true"}), patch("lib.tutor.requests.post", return_value=response) as post:
            result = handle_tutor(request_body())
            self.assertEqual(result["outcome"], "correct")
            self.assertEqual(result["provider"], "gemini")
            self.assertIn("generateContent", post.call_args.args[0])
            self.assertEqual(post.call_args.kwargs["headers"]["x-goog-api-key"], "test-only")
            output_format = post.call_args.kwargs["json"]["generationConfig"]["responseFormat"]["text"]
            self.assertEqual(output_format["mimeType"], "APPLICATION_JSON")
            self.assertEqual(output_format["schema"]["required"], ["text", "outcome"])
            self.assertFalse(post.call_args.kwargs["allow_redirects"])

    def test_openai_completed_and_structured_output(self):
        q, messages, _ = validate_request(request_body())
        response = Mock(status_code=200)
        response.json.return_value = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": '{"text":"정답","outcome":"correct"}'}]}]}
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only"}), patch("lib.tutor.requests.post", return_value=response) as post:
            self.assertIn('correct', call_openai(q, messages))
            self.assertFalse(post.call_args.kwargs["json"]["store"])

    def test_rate_limit_timeout_and_malformed_result(self):
        with patch("lib.tutor.requests.post", return_value=Mock(status_code=429)):
            with self.assertRaises(TutorError) as error:
                post_json("https://example.invalid", {}, {})
            self.assertEqual(error.exception.status, 429)
        with patch("lib.tutor.requests.post", side_effect=requests.Timeout):
            with self.assertRaises(TutorError) as error:
                post_json("https://example.invalid", {}, {})
            self.assertEqual(error.exception.status, 504)
        with patch.dict(os.environ, {"AI_ENABLED": "true"}), patch.dict("lib.tutor.PROVIDERS", {"gemini": lambda q, m: '{"text":"","outcome":"correct"}'}, clear=True):
            with self.assertRaises(TutorError) as error:
                handle_tutor(request_body())
            self.assertEqual(error.exception.status, 502)


if __name__ == "__main__":
    unittest.main()
