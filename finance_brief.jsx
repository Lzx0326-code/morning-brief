// Finance Brief — rebuilt with full error visibility
import { useState, useEffect } from "react";

const SECTIONS = [
  { key: "markets", label: "Markets & Equities", short: "Markets" },
  { key: "macro",   label: "Macro & Central Banks", short: "Macro" },
  { key: "ma",      label: "M&A & Strategy", short: "M&A" },
];

const SYSTEM_PROMPT = `You are a financial news analyst. Search the web for today's most important finance news (last 24 hours) across three categories: Markets & Equities, Macroeconomics & Central Banks, and M&A & Corporate Strategy.

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
Source exclusively from these official outlets: BBC News (bbc.com/news), Financial Times (ft.com), Reuters (reuters.com), Bloomberg (bloomberg.com), The Wall Street Journal (wsj.com), The Guardian Business (theguardian.com/business), Sky News Business (news.sky.com/business), or official central bank websites (bankofengland.co.uk, federalreserve.gov, ecb.europa.eu). Do not use aggregators, blogs, or secondary sources. Include the outlet name in the source field. Return ONLY the JSON object.`;

const ANALYSIS_SYSTEM_PROMPT = `You are a senior financial analyst providing a deep educational breakdown of a news story.

Return ONLY a valid JSON object — no markdown, no backticks, no preamble:
{
  "what":        "Precisely what happened and the key figures involved. 2 sentences.",
  "why":         "The underlying causes and context that drove this. 2 sentences.",
  "expected":    "Whether markets anticipated this or were caught off guard, and why. 2 sentences.",
  "benefits":    "Who gains from this development and the specific mechanism. 2 sentences.",
  "hurt":        "Who is disadvantaged, and how. 2 sentences.",
  "immediate":   "Immediate impact on prices, sentiment, or volatility. 2 sentences.",
  "longterm":    "Structural or long-term implications for markets or the economy. 2 sentences.",
  "client":      "Actionable framing you would give a client — what to watch or consider. 2 sentences.",
  "assumptions": "Key consensus assumptions embedded in this story that could prove wrong. 2 sentences."
}
Return ONLY the JSON object.`;

const QUESTIONS = [
  { key: "what",        label: "What happened",                  bg: "#EFF6FF", border: "#BFDBFE", label_color: "#1D4ED8" },
  { key: "why",         label: "Why did it happen",              bg: "#EFF6FF", border: "#BFDBFE", label_color: "#1D4ED8" },
  { key: "expected",    label: "Was it expected",                bg: "#F0FDF4", border: "#BBF7D0", label_color: "#15803D" },
  { key: "benefits",    label: "Who benefits",                   bg: "#F0FDF4", border: "#BBF7D0", label_color: "#15803D" },
  { key: "hurt",        label: "Who is hurt",                    bg: "#FFF7ED", border: "#FED7AA", label_color: "#C2410C" },
  { key: "immediate",   label: "Immediate market impact",        bg: "#F5F3FF", border: "#DDD6FE", label_color: "#7C3AED" },
  { key: "longterm",    label: "Long-term implications",         bg: "#F5F3FF", border: "#DDD6FE", label_color: "#7C3AED" },
  { key: "client",      label: "If advising a client",           bg: "#0D1E3D", border: "#0D1E3D", label_color: "#C9962C", dark: true },
  { key: "assumptions", label: "Assumptions that might be wrong", bg: "#FFF1F2", border: "#FECDD3", label_color: "#BE123C" },
];

const MAX_TOKENS = 2000;

const NAVY   = "#0D1E3D";
const GOLD   = "#C9962C";
const BG     = "#F2F1EE";
const CARD   = "#FFFFFF";
const TEXT   = "#1A2332";
const MUTED  = "#6B7280";
const BORDER = "#DDD9D0";

const font = {
  sans: "'Inter', system-ui, sans-serif",
  serif: "'Playfair Display', Georgia, serif",
};

export default function FinanceBrief() {
  const [brief, setBrief]               = useState(null);
  const [loading, setLoading]           = useState(false);
  const [checking, setChecking]         = useState(true);
  const [error, setError]               = useState(null);
  const [debugInfo, setDebugInfo]       = useState(null);
  const [lastFetched, setLastFetched]   = useState(null);
  const [activeSection, setActiveSection] = useState("markets");
  const [expandedCard, setExpandedCard] = useState(null);
  const [analysisCache, setAnalysisCache]   = useState({});   // cardKey → analysis obj
  const [loadingAnalysis, setLoadingAnalysis] = useState({}); // cardKey → bool

  const now     = new Date();
  const today   = now.toISOString().split("T")[0];
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(`brief:${today}`);
        if (result) {
          const data = JSON.parse(result.value);
          setBrief(data.brief);
          setLastFetched(data.fetchedAt);
        }
      } catch (_) {}
      setChecking(false);
    })();
  }, []);

  async function fetchBrief() {
    setLoading(true);
    setError(null);
    setDebugInfo(null);
    try {
      // ── 1. Call API ──────────────────────────────────────────
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Search for today's (${dateStr}) top finance news. Return only the JSON object.`,
          }],
        }),
      });

      // ── 2. Check HTTP status ─────────────────────────────────
      if (!res.ok) {
        let body = "";
        try { body = JSON.stringify(await res.json()); } catch (_) { body = await res.text(); }
        throw new Error(`HTTP ${res.status} — ${body.slice(0, 300)}`);
      }

      const data = await res.json();

      // ── 3. Guard API-level errors ────────────────────────────
      if (data.type === "error") {
        throw new Error(`API error: ${data.error?.message || JSON.stringify(data.error)}`);
      }

      // ── 4. Debug: log what we got ────────────────────────────
      const contentTypes = (data.content || []).map(b => b.type).join(", ");
      setDebugInfo(`stop_reason: ${data.stop_reason} | blocks: [${contentTypes}]`);

      // ── 5. Extract text blocks ───────────────────────────────
      const texts = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (!texts) {
        throw new Error(`No text block in response. stop_reason=${data.stop_reason}, types=[${contentTypes}]`);
      }

      // ── 6. Parse JSON ────────────────────────────────────────
      const cleaned = texts.replace(/```json|```/g, "").trim();
      const match   = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(`No JSON found in response. Text: "${texts.slice(0, 250)}"`);
      }
      const parsed = JSON.parse(match[0]);

      // ── 7. Validate structure ────────────────────────────────
      if (!parsed.markets || !parsed.macro || !parsed.ma) {
        throw new Error(`JSON missing sections. Keys found: ${Object.keys(parsed).join(", ")}`);
      }

      // ── 8. Save & display ────────────────────────────────────
      const fetchedAt = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      await window.storage.set(`brief:${today}`, JSON.stringify({ brief: parsed, fetchedAt }));
      setBrief(parsed);
      setLastFetched(fetchedAt);
      setDebugInfo(null); // clear on success

    } catch (err) {
      setError(err.message);   // show the REAL error
      console.error("FinanceBrief:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnalysis(story, cardKey) {
    if (analysisCache[cardKey] || loadingAnalysis[cardKey]) return;
    setLoadingAnalysis(prev => ({ ...prev, [cardKey]: true }));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Story: "${story.title}"\nContext: ${story.summary}\nSource: ${story.source}\n\nProvide the 9-point analysis as JSON.`,
          }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const match = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in analysis response");
      const analysis = JSON.parse(match[0]);
      setAnalysisCache(prev => ({ ...prev, [cardKey]: analysis }));
    } catch (err) {
      setAnalysisCache(prev => ({ ...prev, [cardKey]: { error: err.message } }));
    } finally {
      setLoadingAnalysis(prev => ({ ...prev, [cardKey]: false }));
    }
  }

  const sec     = brief?.[activeSection];
  const secMeta = SECTIONS.find(s => s.key === activeSection);

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: font.sans }}>
      {/* Google Fonts */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <header style={{ background: NAVY, padding: "22px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: GOLD, fontWeight: 700, marginBottom: 6 }}>MORNING BRIEF</div>
            <div style={{ fontFamily: font.serif, fontSize: 26, fontWeight: 700, color: "#FFF", lineHeight: 1.2 }}>Financial Intelligence</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 5, letterSpacing: 0.4 }}>{dateStr}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {lastFetched && (
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 9, letterSpacing: 0.4 }}>Updated {lastFetched}</div>
            )}
            <button
              onClick={fetchBrief}
              disabled={loading}
              style={{
                background: loading ? "#334155" : GOLD,
                color: "#FFF", border: "none", padding: "10px 22px",
                fontFamily: font.sans, fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, cursor: loading ? "not-allowed" : "pointer",
                borderRadius: 3, transition: "background 0.2s",
              }}
            >
              {loading ? "FETCHING..." : brief ? "REFRESH" : "GET TODAY'S BRIEF"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 32px" }}>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "14px 18px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>⚠ Fetch failed — error detail:</div>
            <div style={{ fontSize: 12, color: "#991B1B", fontFamily: "monospace", wordBreak: "break-word", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        )}
        {debugInfo && !error && (
          <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 4, padding: "9px 14px", marginBottom: 16, fontSize: 11, color: "#0369A1", fontFamily: "monospace" }}>
            {debugInfo}
          </div>
        )}

        {/* Checking cache */}
        {checking && (
          <div style={{ textAlign: "center", padding: "80px 20px", color: MUTED, fontSize: 13 }}>Loading…</div>
        )}

        {/* Empty state */}
        {!checking && !brief && !loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontFamily: font.serif, fontSize: 22, color: NAVY, marginBottom: 10 }}>Good morning, Sophia.</div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 32, lineHeight: 1.7 }}>
              Your daily brief covers Markets, Macro &amp; Central Banks,<br />and M&amp;A &amp; Corporate Strategy.
            </div>
            <button
              onClick={fetchBrief}
              style={{
                background: NAVY, color: "#FFF", border: "none", padding: "13px 30px",
                fontFamily: font.sans, fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, cursor: "pointer", borderRadius: 3,
              }}
            >
              GET TODAY'S BRIEF
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ width: 38, height: 38, border: `3px solid #E2E8F0`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 18px" }} />
            <div style={{ fontSize: 13, color: MUTED }}>Searching today's financial news…</div>
          </div>
        )}

        {/* Brief */}
        {brief && !loading && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `2px solid ${BORDER}`, marginBottom: 26 }}>
              {SECTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setActiveSection(s.key); setExpandedCard(null); }}
                  style={{
                    background: "none", border: "none",
                    borderBottom: `2.5px solid ${activeSection === s.key ? GOLD : "transparent"}`,
                    padding: "9px 20px", fontFamily: font.sans, fontSize: 11,
                    fontWeight: 700, letterSpacing: 1, cursor: "pointer",
                    color: activeSection === s.key ? NAVY : "#94A3B8",
                    marginBottom: -2, textTransform: "uppercase", transition: "color 0.15s",
                  }}
                >
                  {s.short}
                </button>
              ))}
            </div>

            {/* Section content */}
            {sec && (
              <>
                <div style={{ fontSize: 10, letterSpacing: 2.5, color: GOLD, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>
                  {secMeta?.label}
                </div>
                <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600, color: NAVY, lineHeight: 1.45, marginBottom: 24 }}>
                  {sec.headline}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(sec.stories || []).map((story, i) => {
                    const cardKey  = `${activeSection}-${i}`;
                    const isOpen   = expandedCard === cardKey;
                    const analysis = analysisCache[cardKey];
                    const isLoadingA = loadingAnalysis[cardKey];
                    return (
                      <div key={i} style={{ background: CARD, borderRadius: 6, overflow: "hidden", boxShadow: isOpen ? "0 2px 12px rgba(0,0,0,0.08)" : "none", border: `1px solid ${isOpen ? "#C9962C44" : BORDER}` }}>

                        {/* ── Card header ── */}
                        <div
                          onClick={() => {
                            const willOpen = expandedCard !== cardKey;
                            setExpandedCard(willOpen ? cardKey : null);
                            if (willOpen) fetchAnalysis(story, cardKey);
                          }}
                          style={{ padding: "18px 22px", borderLeft: `3px solid ${GOLD}`, cursor: "pointer", userSelect: "none" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 7 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, lineHeight: 1.35, flex: 1 }}>
                              {story.title}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                              <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
                                {story.source}
                              </div>
                              <div style={{ fontSize: 18, color: GOLD, fontWeight: 300, lineHeight: 1, width: 16, textAlign: "center" }}>
                                {isOpen ? "−" : "+"}
                              </div>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>{story.summary}</div>
                          {!isOpen && (
                            <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginTop: 9, letterSpacing: 0.3 }}>
                              Click for deep analysis ›
                            </div>
                          )}
                        </div>

                        {/* ── Expanded analysis panel ── */}
                        {isOpen && (
                          <div style={{ borderTop: `1px solid ${BORDER}`, padding: "20px 22px 22px" }}>
                            <div style={{ fontSize: 10, letterSpacing: 2, color: GOLD, fontWeight: 700, marginBottom: 16, textTransform: "uppercase" }}>
                              Deep Analysis
                            </div>

                            {/* Loading */}
                            {isLoadingA && (
                              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0", color: MUTED, fontSize: 13 }}>
                                <div style={{ width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: GOLD, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                                Generating analysis…
                              </div>
                            )}

                            {/* Error */}
                            {analysis?.error && (
                              <div style={{ fontSize: 12, color: "#DC2626", fontFamily: "monospace", padding: "8px 0" }}>
                                Analysis failed: {analysis.error}
                              </div>
                            )}

                            {/* Analysis grid */}
                            {analysis && !analysis.error && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                {QUESTIONS.map(q => (
                                  <div
                                    key={q.key}
                                    style={{
                                      background: q.bg, border: `1px solid ${q.border}`,
                                      borderRadius: 5, padding: "13px 15px",
                                      gridColumn: q.key === "client" ? "1 / -1" : undefined,
                                    }}
                                  >
                                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: q.label_color, textTransform: "uppercase", marginBottom: 6 }}>
                                      {q.label}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: q.dark ? "#E2E8F0" : "#1F2937", lineHeight: 1.65 }}>
                                      {analysis[q.key] || "—"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>3 stories · {brief.date || dateStr}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>
                    Powered by <span style={{ color: GOLD, fontWeight: 600 }}>Claude + Web Search</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
