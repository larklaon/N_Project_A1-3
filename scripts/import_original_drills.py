"""Read only the original drill JSON. Never execute or modify the source project."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ("id", "topic", "prompt", "answers", "code", "explanation", "hint",
          "mode", "kind", "unitId", "unitTitle", "supplement")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="창작 연습문제.json의 경로")
    args = parser.parse_args()
    raw = args.source.read_bytes()
    questions = json.loads(raw)
    if not questions or any(not re.fullmatch(r"(?:WB|MP)-[A-Z]+-[A-Z]*\d+(?:-\d+)*", q["id"])
                            or q.get("kind") not in {"micro", "checkpoint"}
                            for q in questions):
        raise ValueError("확인된 창작 문항 형식만 가져올 수 있습니다.")
    clean = [{key: q[key] for key in FIELDS if key in q} for q in questions]
    target = ROOT / "data/questions.json"
    target.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n")
    report = {"source": "개인 학습지의 창작 연습문제.json",
              "sourceSha256": hashlib.sha256(raw).hexdigest(),
              "total": len(clean), "micro": sum(q["kind"] == "micro" for q in clean),
              "checkpoint": sum(q["kind"] == "checkpoint" for q in clean),
              "retainedFields": list(FIELDS),
              "excluded": ["refs", "sources", "source_paths", "actual", "기출 원문",
                           "PDF", "기출 빈도 통계", "개인 학습 기록", "계정 정보"]}
    (ROOT / "docs/data-provenance.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"창작 문항 {len(clean)}개 추출 완료. 원본은 읽기만 했습니다.")


if __name__ == "__main__":
    main()
