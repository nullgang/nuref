import type { NormalizedItem } from './types.js';

const WPM_ENGLISH = 238;
const WPM_FAST = 300;
const WPM_SLOW = 183;
const IMAGES_PER_MINUTE = 12;
const AVERAGE_IMAGE_TIME = 14;

export interface ReadTimeResult {
  minutes: number;
  words: number;
  characters: number;
  images: number;
  formatted: string;
}

export function estimateReadTime(text: string, options: { wpm?: number; includeImages?: boolean } = {}): ReadTimeResult {
  const wpm = options.wpm || WPM_ENGLISH;
  const words = countWords(text);
  const minutes = Math.ceil(words / wpm);

  const images = options.includeImages !== false ? countImages(text) : 0;
  const imageTime = Math.ceil(images / IMAGES_PER_MINUTE);
  const totalMinutes = minutes + imageTime;

  const characters = text.length;

  const formatted = formatTime(totalMinutes);

  return {
    minutes: totalMinutes,
    words,
    characters,
    images,
    formatted,
  };
}

export function estimateItemReadTime(item: NormalizedItem): ReadTimeResult {
  const text = `${item.title} ${item.description} ${item.content}`;
  return estimateReadTime(text, { includeImages: true });
}

export function estimateItemsReadTime(items: NormalizedItem[]): { total: ReadTimeResult; perItem: ReadTimeResult[] } {
  const perItem = items.map(item => estimateItemReadTime(item));
  const totalMinutes = perItem.reduce((sum, r) => sum + r.minutes, 0);
  const totalWords = perItem.reduce((sum, r) => sum + r.words, 0);
  const totalChars = perItem.reduce((sum, r) => sum + r.characters, 0);
  const totalImages = perItem.reduce((sum, r) => sum + r.images, 0);

  return {
    total: {
      minutes: totalMinutes,
      words: totalWords,
      characters: totalChars,
      images: totalImages,
      formatted: formatTime(totalMinutes),
    },
    perItem,
  };
}

export function formatReadTime(minutes: number): string {
  return formatTime(minutes);
}

function countWords(text: string): number {
  const cleaned = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').length;
}

function countImages(text: string): number {
  const imgTags = text.match(/<img[^>]+>/gi);
  return imgTags ? imgTags.length : 0;
}

function formatTime(minutes: number): string {
  if (minutes < 1) return 'Less than 1 min read';
  if (minutes === 1) return '1 min read';
  if (minutes < 60) return `${minutes} min read`;

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h read`;
  return `${hours}h ${remaining}m read`;
}
