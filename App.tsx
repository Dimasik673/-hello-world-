
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Generation, Settings, Source, GenerationType } from './types';
import SettingsPanel from './components/SettingsPanel';
import GenerationResult from './components/GenerationResult';
import { GrokIcon, TrashIcon, PaperclipIcon, CloseIcon, EditIcon } from './components/Icons';
import ExamplePrompts from './components/ExamplePrompts';
import { getPlaceholderImages } from './components/placeholders';
import ImageEditorModal from './components/ImageEditorModal';

const App: React.FC = () => {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [prompt, setPrompt] = useState('');
  const [inputImages, setInputImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<{ index: number; src: string } | null>(null);

  const [settings, setSettings] = useState<Settings>({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 8192,
    aspectRatio: '1:1',
    imageModel: 'imagen-4.0-generate-001',
    numberOfImages: 1,
    resolution: 'standard',
    artStyle: 'none',
  });

  const aiRef = useRef<GoogleGenAI | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (!process.env.API_KEY) {
        throw new Error("Переменная окружения API_KEY не установлена.");
      }
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка инициализации AI.');
    }
  }, []);

  useEffect(() => {
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTop = 0;
    }
  }, [generations]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
        const filePromises = Array.from(files).map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        Promise.all(filePromises).then(base64Images => {
            setInputImages(prev => [...prev, ...base64Images]);
        }).catch(error => {
            console.error("Error reading files:", error);
            setError("Ошибка при чтении файлов.");
        });
    }
    if (event.target) {
        event.target.value = '';
    }
  };

  const handleGenerate = async (type: GenerationType) => {
    if (isLoading || (!prompt.trim() && inputImages.length === 0)) return;

    setIsLoading(true);
    setError(null);

    const newGeneration: Generation = {
      id: Date.now().toString(),
      prompt: prompt,
      type: type,
      status: 'pending',
      inputImageUrls: inputImages,
      ...(type === 'image' && { imagePlaceholders: getPlaceholderImages() }),
    };

    setGenerations(prev => [newGeneration, ...prev]);
    setPrompt('');
    setInputImages([]);

    if (!aiRef.current) {
      setError("AI клиент не инициализирован.");
      setIsLoading(false);
      setGenerations(prev => prev.map(g => g.id === newGeneration.id ? { ...g, status: 'error', errorMessage: "AI клиент не инициализирован." } : g));
      return;
    }

    try {
      const imageParts = inputImages.map(imgDataUrl => {
        const mimeType = imgDataUrl.substring(imgDataUrl.indexOf(":") + 1, imgDataUrl.indexOf(";"));
        const data = imgDataUrl.split(',')[1];
        return { inlineData: { mimeType, data } };
      });

      if (type === 'image') {
        let imageUrls: string[] = [];
        let finalImagePrompt = newGeneration.prompt;

        if (settings.artStyle !== 'none' && finalImagePrompt.trim()) {
            const styleMap = {'photorealistic':'фотореализм','anime':'аниме','oil-painting':'масляная живопись','cyberpunk':'киберпанк','fantasy':'фэнтези'};
            finalImagePrompt = `${finalImagePrompt}, в стиле ${styleMap[settings.artStyle]}`;
        }
        
        if (inputImages.length > 0) {
            // FIX: The `contents` parameter should be a single Content object for multimodal input.
            const response = await aiRef.current.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: finalImagePrompt }, ...imageParts] },
                config: { responseModalities: [Modality.IMAGE] },
            });
            const base64Image = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (base64Image) {
                imageUrls.push(`data:image/png;base64,${base64Image}`);
            }
        } else {
            if (settings.imageModel === 'imagen-4.0-generate-001') {
                if (settings.resolution === 'hd') finalImagePrompt = `${finalImagePrompt}, high detail, photorealistic, 4k`;
                const response = await aiRef.current.models.generateImages({
                    model: settings.imageModel, prompt: finalImagePrompt, config: { numberOfImages: settings.numberOfImages, aspectRatio: settings.aspectRatio }
                });
                const base64Images = response.generatedImages.map(img => img.image.imageBytes);
                imageUrls = base64Images.map(b64 => `data:image/png;base64,${b64}`);
            } else {
                // FIX: The `contents` parameter should be a single Content object.
                const response = await aiRef.current.models.generateContent({
                    model: settings.imageModel, contents: { parts: [{ text: finalImagePrompt }] }, config: { responseModalities: [Modality.IMAGE] }
                });
                const base64Image = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
                 if (base64Image) {
                    imageUrls.push(`data:image/png;base64,${base64Image}`);
                }
            }
        }
        
        if (imageUrls.length > 0) {
            setGenerations(prev => prev.map(g => g.id === newGeneration.id ? { ...g, status: 'completed', resultImageUrls: imageUrls } : g));
        } else {
            throw new Error("Ответ API не содержал данных изображения.");
        }

      } else {
        let stream;
        if (inputImages.length > 0) {
            // FIX: The `contents` parameter should be a single Content object for multimodal input.
            stream = await aiRef.current.models.generateContentStream({
              model: 'gemini-2.5-flash', contents: { parts: [{ text: newGeneration.prompt }, ...imageParts] }
            });
        } else {
            stream = await aiRef.current.models.generateContentStream({
                model: settings.model,
                contents: newGeneration.prompt,
                config: { temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens, tools: [{ googleSearch: {} }] }
            });
        }

        let fullResponseText = '';
        let allSources: Source[] = [];
        for await (const chunk of stream) {
            fullResponseText += chunk.text;
            const newSources = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((gc: any) => gc.web).filter(Boolean) as Source[] || [];
            newSources.forEach(ns => { if (!allSources.some(es => es.uri === ns.uri)) allSources.push(ns); });
            setGenerations(prev => prev.map(g => g.id === newGeneration.id ? { ...g, status: 'completed', resultText: fullResponseText, sources: allSources.length > 0 ? allSources : undefined } : g));
        }
      }
    } catch (e) {
      console.error(e);
      let errorMessage = 'Произошла непредвиденная ошибка.';
      if (e instanceof Error) {
        try {
          const errorObj = JSON.parse(e.message);
          if (errorObj.error) {
            if (errorObj.error.status === 'RESOURCE_EXHAUSTED') {
              errorMessage = 'Вы превысили свою текущую квоту. Пожалуйста, проверьте ваш тарифный план и платежные данные. Подробнее: https://ai.google.dev/gemini-api/docs/rate-limits';
            } else {
              errorMessage = errorObj.error.message || e.message;
            }
          } else {
            errorMessage = e.message;
          }
        } catch (jsonParseError) {
          errorMessage = e.message;
        }
      }
    
      setError(errorMessage);
      setGenerations(prev => prev.map(g => g.id === newGeneration.id ? { ...g, status: 'error', errorMessage } : g));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-black text-gray-200 font-sans">
      {/* Left Panel: Controls */}
      <div className="flex flex-col w-[350px] lg:w-[400px] bg-gray-900/50 border-r border-gray-800 p-4 space-y-4">
        <header className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Gemini Studio
          </h1>
          <button
            onClick={() => setGenerations([])}
            className="p-2 text-gray-400 hover:text-white transition-colors disabled:text-gray-600"
            disabled={generations.length === 0}
            aria-label="Очистить историю"
          >
            <TrashIcon />
          </button>
        </header>
        
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-2">
            {/* Prompt Input */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-400 mb-2">Ваш запрос</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Напишите текст или опишите изображение..."
                rows={5}
                className="w-full bg-gray-800 text-gray-200 border border-gray-700 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
            </div>
            {/* Image Upload */}
            <div>
                <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" multiple/>
                {inputImages.length > 0 && (
                    <div className="mb-2">
                        <label className="text-sm font-medium text-gray-400 mb-2 block">Загруженные изображения</label>
                        <div className="grid grid-cols-3 gap-2">
                            {inputImages.map((image, index) => (
                                <div key={index} className="relative group aspect-square">
                                    <img src={image} alt={`Предпросмотр ${index + 1}`} className="rounded-lg w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button onClick={() => { setEditingImage({ index, src: image }); setIsEditorOpen(true); }} className="text-white p-1 rounded-full hover:bg-white/20"><EditIcon /></button>
                                        <button onClick={() => setInputImages(prev => prev.filter((_, i) => i !== index))} className="text-white p-1 rounded-full hover:bg-white/20"><CloseIcon /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                 <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors">
                    <PaperclipIcon /> <span>{inputImages.length > 0 ? 'Добавить еще' : 'Загрузить изображение(я)'}</span>
                </button>
            </div>
            {/* Actions */}
            <div className="flex gap-2">
                <button onClick={() => handleGenerate('text')} disabled={isLoading || (!prompt.trim() && inputImages.length === 0)} className="flex-1 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-500 disabled:bg-gray-600">Сгенерировать текст</button>
                <button onClick={() => handleGenerate('image')} disabled={isLoading || (!prompt.trim() && inputImages.length === 0)} className="flex-1 bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-500 disabled:bg-gray-600">Сгенерировать изображение</button>
            </div>
            
            {/* Settings */}
            <SettingsPanel settings={settings} onSettingsChange={setSettings} disabled={isLoading} />
        </div>
      </div>

      {/* Right Panel: Results */}
      <main ref={resultsContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto w-full">
          {generations.length === 0 ? (
            <div className="text-center text-gray-500 mt-20">
              <h2 className="text-3xl font-bold mb-2">Ваша творческая студия</h2>
              <p className="mb-6">Введите запрос слева, чтобы начать генерацию.</p>
              <ExamplePrompts onPromptClick={(p) => setPrompt(p)} />
            </div>
          ) : (
            <div className="space-y-6">
              {generations.map(gen => <GenerationResult key={gen.id} generation={gen} />)}
            </div>
          )}
        </div>
      </main>

      <ImageEditorModal 
        isOpen={isEditorOpen} 
        imageSrc={editingImage?.src || null} 
        onClose={() => { setIsEditorOpen(false); setEditingImage(null); }} 
        onSave={(editedImg) => {
            if (editingImage !== null) {
                setInputImages(prev => {
                    const newImages = [...prev];
                    newImages[editingImage.index] = editedImg;
                    return newImages;
                });
            }
            setIsEditorOpen(false);
            setEditingImage(null);
        }} 
      />
    </div>
  );
};

export default App;
