
export type Model = 'gemini' | 'imagen' | 'nano-banana';
export type AspectRatio = '1:1' | '16:9' | '9:16';
export type Style = 'none' | 'photorealistic' | 'anime' | 'impressionism' | 'cyberpunk';

export type HistoryItem = {
  imageUrl: string;
  prompt: string;
  timestamp: string; // ISO date string
  style?: Style;
  model?: Model;
  aspectRatio?: AspectRatio;
  quality?: 'standard' | 'high'; // For backward compatibility
  seed?: number;
};

export type UploadedImage = {
  id: string;
  previewUrl: string;
  base64: string;
  mimeType: string;
};
