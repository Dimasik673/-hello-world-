export interface Source {
  title: string;
  uri: string;
}

export type GenerationType = 'text' | 'image';
export type GenerationStatus = 'pending' | 'completed' | 'error';

export interface Generation {
  id: string;
  prompt: string;
  type: GenerationType;
  status: GenerationStatus;
  inputImageUrls?: string[];
  resultText?: string;
  resultImageUrls?: string[];
  sources?: Source[];
  errorMessage?: string;
  imagePlaceholders?: string[];
}

export interface Settings {
  // Text settings
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  temperature: number;
  maxOutputTokens: number;
  
  // Image settings
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageModel: 'gemini-2.5-flash-image' | 'imagen-4.0-generate-001';
  numberOfImages: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  resolution: 'standard' | 'hd';
  artStyle: 'none' | 'photorealistic' | 'anime' | 'oil-painting' | 'cyberpunk' | 'fantasy';
}