import anthropic
import json
import re
import sys
from datetime import datetime, timezone

SYSTEM_PROMPT = """You are a financial news analyst. Search the web for today's most important finance news (last 24 hours) across three categories: Markets & Equities, Macroeconomics & Central Banks, and M&A & Corporate Strategy.

Return ONLY a valid JSON object — no markdown, no backticks, no preamble:
{
  "date": "formatted date string",
  "markets": {
    "headline": "One sentence overview of markets today",
    "stories": [
      {"title": "Story title", "summary": "One sentence with key data.", "source": "Outlet"},
      {"title": "...", "summary": "...", "source": "..."},
      {"title": "...", "summary": "...", "source": "..."}
    ]
  },
  "macro": {
    "headline": "One sentence macro overview",
    "stories": [
      {"title": "...", "summary": "...", "source": "..."},
      {"title": "...", "summary": "...", "source": "..."},
      {"title": "...", "summary": "...", "source": "..."}
    ]
  },
  "ma": {
    "headline": "One sentence M&A overview",
    "stories": [
      {"title": "...", "summary": "...", "source": "..."},
      {"title": "...", "summary": "...", "source": "..."},
      {"title": "...", "summary": "...", "source": "..."}
    ]
  }
}
Source from FT, Bloomberg, Reuters, WSJ. Return ONLY the JSON object."""

def fetch_brief():
    client = anthropic.Anthropic()
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%A, %-d %B %Y")
    print(f"Fetching brief for {date_str}...")
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        tools=[{"type": "web_search_20250305", "name": "web_search"}],
        messages=[{
            "role": "user",
            "content": f"Search for today's ({date_str}) top finance news. Return only the JSON object."
        }]
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    if not text:
        raise ValueError(f"No text in response. Stop reason: {response.stop_reason}")
    cleaned = re.sub(r"```json|```", "", text).strip()
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        raise ValueError(f"No JSON found. Text preview: {text[:300]}")
    brief = json.loads(match.group(0))
    for key in ("markets", "macro", "ma"):
        if key not in brief:
            raise ValueError(f"JSON missing '{key}'")
    output = {
        "brief": brief,
        "fetchedAt": now.strftime("%H:%M"),
        "fetchedDate": now.strftime("%Y-%m-%d"),
    }
    with open("brief.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Done — brief.json written successfully")

if __name__ == "__main__":
    try:
        fetch_brief()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
