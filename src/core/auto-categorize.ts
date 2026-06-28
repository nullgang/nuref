import type { NormalizedItem } from './types.js';

const CATEGORIES: Record<string, string[]> = {
  technology: ['programming', 'software', 'hardware', 'ai', 'machine learning', 'code', 'developer', 'tech', 'api', 'database', 'cloud', 'devops', 'linux', 'javascript', 'python', 'rust', 'typescript', 'web', 'mobile', 'security', 'cyber', 'blockchain', 'crypto', 'nft', 'startup', 'saas'],
  science: ['research', 'study', 'experiment', 'physics', 'chemistry', 'biology', 'astronomy', 'space', 'climate', 'environment', 'genetics', 'quantum', 'neuroscience', 'medicine', 'health'],
  business: ['finance', 'economy', 'market', 'stock', 'invest', 'company', 'startup', 'ceo', 'revenue', 'profit', 'acquisition', 'ipo', 'funding', 'venture', 'capital', 'trade', 'banking', 'fintech'],
  politics: ['election', 'government', 'president', 'congress', 'policy', 'law', 'regulation', 'vote', 'democrat', 'republican', 'senate', 'legislation', 'diplomacy', 'geopolitics'],
  sports: ['football', 'basketball', 'soccer', 'tennis', 'nba', 'nfl', 'mlb', 'f1', 'olympics', 'championship', 'tournament', 'athlete', 'coach', 'match', 'game'],
  entertainment: ['movie', 'film', 'music', 'album', 'concert', 'tv', 'series', 'netflix', 'streaming', 'gaming', 'game', 'celebrity', 'award', 'review'],
  health: ['medical', 'doctor', 'hospital', 'disease', 'treatment', 'therapy', 'vaccine', 'mental health', 'diet', 'exercise', 'nutrition', 'wellness', 'covid', 'pandemic'],
  education: ['university', 'college', 'school', 'student', 'teacher', 'course', 'learning', 'research', 'academic', 'paper', 'study', 'degree'],
  world: ['international', 'global', 'war', 'conflict', 'peace', 'refugee', 'humanitarian', 'nato', 'un', 'united nations', 'embassy', 'diplomacy'],
  lifestyle: ['travel', 'food', 'recipe', 'fashion', 'design', 'art', 'culture', 'relationship', 'family', 'home', 'garden', 'diy'],
};

export function categorizeItem(item: NormalizedItem): string[] {
  const text = `${item.title} ${item.description} ${item.content} ${item.tags.join(' ')}`.toLowerCase();
  const matches: { category: string; score: number }[] = [];

  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }
    if (score > 0) {
      matches.push({ category, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 3).map(m => m.category);
}

export function categorizeItems(items: NormalizedItem[]): Map<NormalizedItem, string[]> {
  const result = new Map<NormalizedItem, string[]>();
  for (const item of items) {
    result.set(item, categorizeItem(item));
  }
  return result;
}

export function getAvailableCategories(): string[] {
  return Object.keys(CATEGORIES);
}

export function getCategoryKeywords(category: string): string[] {
  return CATEGORIES[category] || [];
}
