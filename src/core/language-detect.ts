const LANGUAGE_PATTERNS: Record<string, { words: RegExp[]; weight: number }> = {
  en: { words: [/\b(the|is|are|was|were|have|has|been|will|would|could|should|may|might|can|shall|do|does|did)\b/gi], weight: 3 },
  es: { words: [/\b(el|la|los|las|es|son|está|están|tiene|tienen|ser|estar|hacer|poder|decir|haber|por|para|con|sin|sobre)\b/gi], weight: 3 },
  pt: { words: [/\b(o|a|os|as|é|são|está|estão|tem|têm|ser|estar|fazer|poder|dizer|haver|por|para|com|sem|sobre)\b/gi], weight: 3 },
  fr: { words: [/\b(le|la|les|est|sont|a|ont|être|avoir|faire|pouvoir|dire|pour|avec|sans|sur|dans|mais|ou|donc)\b/gi], weight: 3 },
  de: { words: [/\b(der|die|das|ist|sind|hat|haben|sein|werden|können|sollen|müssen|mit|für|auf|von|bei|nach|aus|über)\b/gi], weight: 3 },
  it: { words: [/\b(il|lo|la|gli|le|è|sono|ha|hanno|essere|avere|fare|potere|dire|per|con|senza|su|dal|nel|che|non)\b/gi], weight: 3 },
  nl: { words: [/\b(de|het|een|is|zijn|heeft|hebben|zijn|worden|kunnen|moeten|met|voor|op|van|uit|over|maar|ook|niet|dat)\b/gi], weight: 3 },
  ja: { words: [/[\u3040-\u309F\u30A0-\u30FF]/g, /[\u4E00-\u9FAF]/g], weight: 5 },
  zh: { words: [/[\u4E00-\u9FAF]/g, /[\u3000-\u303F]/g], weight: 5 },
  ko: { words: [/[\uAC00-\uD7AF]/g, /[\u1100-\u11FF]/g], weight: 5 },
  ar: { words: [/[\u0600-\u06FF]/g], weight: 5 },
  hi: { words: [/[\u0900-\u097F]/g], weight: 5 },
  ru: { words: [/[\u0400-\u04FF]/g], weight: 5 },
};

export function detectLanguage(text: string): { language: string; confidence: number } {
  if (!text || text.length < 10) {
    return { language: 'unknown', confidence: 0 };
  }

  const scores: Record<string, number> = {};

  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    let score = 0;
    for (const regex of pattern.words) {
      const matches = text.match(regex);
      if (matches) {
        score += matches.length * pattern.weight;
      }
    }
    if (score > 0) {
      scores[lang] = score;
    }
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return { language: 'unknown', confidence: 0 };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [lang, score] = sorted[0];
  const confidence = score / total;

  return { language: lang, confidence: Math.round(confidence * 100) / 100 };
}

export function detectLanguageFromMeta(item: { title: string; description: string; content?: string }): string {
  const text = `${item.title} ${item.description} ${item.content || ''}`;
  return detectLanguage(text).language;
}
