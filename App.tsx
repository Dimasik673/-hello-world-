
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { generateImage } from './services/geminiService';
import PostDisplay from './components/PostDisplay';
import Loader from './components/Loader';
import { Model, AspectRatio, HistoryItem, Style, UploadedImage } from './types';

const SearchIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const NotFoundIcon: React.FC = () => (
     <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
);

const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);


const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [model, setModel] = useState<Model>('gemini');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [style, setStyle] = useState<Style>('none');
  const [numberOfImages, setNumberOfImages] = useState<number>(1);
  const [seed, setSeed] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Refs for drag and drop
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const savedHistory = localStorage.getItem('imageHistory');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as HistoryItem[];
        if (Array.isArray(parsed)) {
          // Backward compatibility: Map old items with 'quality' to new items with 'model'.
          return parsed.map(item => {
            if (item.quality && !item.model) {
              item.model = item.quality === 'high' ? 'imagen' : 'gemini';
            }
            return item;
          });
        }
      }
      return [];
    } catch (e) {
      console.error("Failed to parse history from localStorage", e);
      return [];
    }
  });

  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [filterDate, setFilterDate] = useState<'all' | 'today' | 'week'>('all');

  const saveHistory = useCallback((newHistory: HistoryItem[]) => {
    let historyStr = JSON.stringify(newHistory);
    // Attempt to save, if it fails due to quota, prune the history
    try {
      localStorage.setItem('imageHistory', historyStr);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn("Quota exceeded. Pruning history.");
        let prunedHistory = newHistory.slice(1); // Start by removing the oldest item
        while(prunedHistory.length > 0) {
           try {
              localStorage.setItem('imageHistory', JSON.stringify(prunedHistory));
              // Update state with the successfully saved pruned history
              setHistory(prunedHistory); 
              return; // Exit after successful save
           } catch (e2) {
              prunedHistory = prunedHistory.slice(1);
           }
        }
        // If all else fails (e.g., single item is too large), clear history
        localStorage.removeItem('imageHistory');
        setHistory([]);
      } else {
        console.error("Failed to save history to localStorage", e);
      }
    }
  }, []);

  useEffect(() => {
    saveHistory(history);
  }, [history, saveHistory]);

  useEffect(() => {
    if (model === 'gemini' || model === 'nano-banana' || uploadedImages.length > 0) {
      setNumberOfImages(1);
    }
    if (uploadedImages.length > 0 && model === 'imagen') {
        setModel('gemini');
    }
  }, [model, uploadedImages]);


  const examplePrompts = [
    'Сияющий кристальный лис в волшебном лесу',
    'Киберпанк-город ночью под дождем',
    'Астронавт на луне, смотрит на Землю',
    'Сюрреалистический пейзаж с летающими островами',
    'Фотореалистичный портрет кота в очках',
  ];

  const handleExampleClick = (example: string) => {
    setPrompt(example);
  };
  
    const styleOptions: { value: Style; label: string; previewImage?: string }[] = [
    { value: 'none', label: 'Без стиля' },
    { 
      value: 'photorealistic', 
      label: 'Фотореализм',
      previewImage: 'https://images.pexels.com/photos/1036623/pexels-photo-1036623.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=150&h=100'
    },
    { 
      value: 'anime', 
      label: 'Аниме',
      previewImage: 'https://images.pexels.com/photos/7862655/pexels-photo-7862655.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=150&h=100'
    },
    { 
      value: 'impressionism', 
      label: 'Импрессионизм',
      previewImage: 'https://images.pexels.com/photos/161154/water-lilies-monet-oil-on-canvas-161154.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=150&h=100'
    },
    { 
      value: 'cyberpunk', 
      label: 'Киберпанк',
      previewImage: 'https://images.pexels.com/photos/5774147/pexels-photo-5774147.jpeg?auto=compress&cs=tinysrgb&dpr=1&w=150&h=100'
    },
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const filePromises = Array.from(files).map((file: File) => {
          return new Promise<UploadedImage | null>((resolve) => {
            if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                resolve({
                  id: `${file.name}-${file.lastModified}-${Math.random()}`,
                  previewUrl: URL.createObjectURL(file),
                  base64: base64String,
                  mimeType: file.type,
                });
              };
              reader.readAsDataURL(file);
            } else {
              resolve(null);
            }
          });
        });

        Promise.all(filePromises).then(resolvedImages => {
          const validImages = resolvedImages.filter((img): img is UploadedImage => img !== null);
          setUploadedImages(prevImages => [...prevImages, ...validImages]);
          if(validImages.length > 0) {
            setPrompt(''); // Clear main prompt on image upload
          }
        });
      }
      // Reset file input value to allow re-uploading the same file
      event.target.value = '';
    };

    const handleRemoveImage = (indexToRemove: number) => {
        const imageToRemove = uploadedImages[indexToRemove];
        if (imageToRemove) {
            URL.revokeObjectURL(imageToRemove.previewUrl);
        }
        setUploadedImages(prevImages => prevImages.filter((_, index) => index !== indexToRemove));
        if (uploadedImages.length === 1) { // If we are removing the last image
            setImagePrompt(''); // Clear image-specific prompt
        }
    };

    // Clean up object URLs on component unmount
    useEffect(() => {
        return () => {
            uploadedImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
        };
    }, [uploadedImages]);

  const handleGenerateImage = useCallback(async () => {
    if (uploadedImages.length === 0 && !prompt.trim()) {
      setError('Пожалуйста, введите описание.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);
    
    const styleText = styleOptions.find(opt => opt.value === style)?.label;
    const finalApiPrompt = uploadedImages.length > 0 
      ? imagePrompt 
      : (style !== 'none' && styleText ? `${prompt}, в стиле ${styleText}` : prompt);
    
    const historyPrompt = uploadedImages.length > 0 
        ? (imagePrompt.trim() ? imagePrompt : "Вариация изображения")
        : prompt;


    try {
      const imageCount = (model === 'imagen' && uploadedImages.length === 0) ? numberOfImages : 1;
      const imageUrls = await generateImage(finalApiPrompt, model, aspectRatio, imageCount, uploadedImages, seed);
      const newHistoryItems: HistoryItem[] = imageUrls.map(imageUrl => ({
        imageUrl,
        prompt: historyPrompt,
        timestamp: new Date().toISOString(),
        style,
        model,
        aspectRatio,
        seed: seed ?? undefined,
      }));

      setGeneratedImages(imageUrls);
      setHistory(prevHistory => {
        const newHistory = [...newHistoryItems, ...prevHistory];
        // Keep history limited, e.g., to 20 items, to prevent excessive storage use
        return newHistory.slice(0, 20); 
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, imagePrompt, model, aspectRatio, style, numberOfImages, uploadedImages, saveHistory, seed]);

  const filteredHistory = useMemo(() => {
    const now = new Date();
    // Set time to 00:00:00 to get the start of the current day
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return history.filter(item => {
      // Keyword filter
      const keywordMatch = item.prompt.toLowerCase().includes(filterKeyword.toLowerCase());
      if (!keywordMatch) return false;

      // Date filter
      const itemDate = new Date(item.timestamp);
      if (filterDate === 'today') {
        return itemDate >= today;
      }
      if (filterDate === 'week') {
        return itemDate >= lastWeek;
      }
      
      return true; // 'all' case
    });
  }, [history, filterKeyword, filterDate]);

  const modelOptions: { value: Model; label: string }[] = [
    { value: 'gemini', label: 'Gemini (Быстро)' },
    { value: 'imagen', label: 'Imagen (Качество)' },
    { value: 'nano-banana', label: 'Nano Banana' },
  ];

  const aspectRatioOptions: { value: AspectRatio; label: string }[] = [
    { value: '1:1', label: 'Квадрат (1:1)' },
    { value: '16:9', label: 'Широкий (16:9)' },
    { value: '9:16', label: 'Портрет (9:16)' },
  ];
  
  const dateFilterOptions: { value: typeof filterDate; label: string}[] = [
    { value: 'all', label: 'Все время' },
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
  ]
  
  const modelPreviews = {
    gemini: {
      description: "Идеально для быстрой генерации и экспериментов. Поддерживает загрузку изображений.",
      speed: 90,
      quality: 60,
    },
    imagen: {
      description: "Создает изображения высокого качества с большей детализацией. Требует больше времени.",
      speed: 40,
      quality: 95,
    },
    'nano-banana': {
      description: "Быстрая и эффективная модель Gemini Flash Image, также известная как Nano Banana. Поддерживает загрузку изображений.",
      speed: 90,
      quality: 60,
    },
  };

  const selectedModelPreview = modelPreviews[model];
  
  const handleHistoryClick = (item: HistoryItem) => {
    setGeneratedImages([item.imageUrl]);
    setPrompt(item.prompt);
    if (item.model) setModel(item.model);
    if (item.aspectRatio) setAspectRatio(item.aspectRatio);
    if (item.style) setStyle(item.style);
    setSeed(item.seed ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Drag and Drop handlers
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (position: number) => {
    dragItem.current = position;
    setDraggedIndex(position);
  };

  const handleDragEnter = (position: number) => {
    dragOverItem.current = position;
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newImages = [...uploadedImages];
    const dragItemContent = newImages[dragItem.current];
    newImages.splice(dragItem.current, 1);
    newImages.splice(dragOverItem.current, 0, dragItemContent);
    setUploadedImages(newImages);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggedIndex(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Генератор изображений
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            Превратите ваши идеи в уникальные изображения с помощью ИИ.
          </p>
        </header>

        <main className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-sm border border-gray-700">
          <div className="space-y-6">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                Что вы хотите создать?
              </label>
              <textarea
                id="prompt"
                rows={3}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition duration-200 resize-none placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Например, сияющий кристальный лис в волшебном лесу"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={uploadedImages.length > 0}
              />
               <div className="mt-4">
                  <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                      multiple
                  />
                  <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center w-full sm:w-auto bg-gray-700/50 border border-gray-600 text-gray-300 text-sm font-medium py-2 px-4 rounded-lg transition-all duration-200 ease-in-out hover:bg-purple-600/40 hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                      <UploadIcon />
                      {uploadedImages.length > 0 ? 'Добавить изображения' : 'Загрузить изображения'}
                  </button>

                  {uploadedImages.length > 0 && (
                     <div className="mt-4 space-y-4">
                        <div 
                          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4"
                          onDrop={handleDrop}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnd={handleDragEnd}
                        >
                            {uploadedImages.map((image, index) => (
                                <div 
                                    key={image.id} 
                                    className={`relative w-full aspect-square cursor-grab transition-opacity duration-300 ${draggedIndex === index ? 'opacity-30' : 'opacity-100'}`}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragEnter={() => handleDragEnter(index)}
                                >
                                    <img src={image.previewUrl} alt={`Uploaded preview ${index+1}`} className="rounded-lg object-cover w-full h-full pointer-events-none" />
                                    <button
                                        onClick={() => handleRemoveImage(index)}
                                        className="absolute -top-2 -right-2 p-1 rounded-full bg-gray-800 text-white hover:bg-red-500 transition-colors duration-200"
                                        aria-label={`Удалить изображение ${index+1}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div>
                           <label htmlFor="imagePrompt" className="block text-sm font-medium text-gray-300 mb-2">
                                Что сделать с изображениями?
                            </label>
                            <textarea
                                id="imagePrompt"
                                rows={2}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition duration-200 resize-none placeholder-gray-500"
                                placeholder="Необязательно: добавь пиратскую шляпу ко всем"
                                value={imagePrompt}
                                onChange={(e) => setImagePrompt(e.target.value)}
                            />
                        </div>
                    </div>
                  )}
              </div>

              {uploadedImages.length === 0 && <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Или попробуйте пример:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(example)}
                      className="bg-gray-700/50 border border-gray-600 text-gray-300 text-xs font-medium py-1.5 px-3 rounded-full transition-all duration-200 ease-in-out transform hover:scale-105 hover:bg-purple-600/40 hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>}
            </div>
            
            <div className="pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Модель</label>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-900 p-1">
                {modelOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setModel(value)}
                    disabled={value === 'imagen' && uploadedImages.length > 0}
                    className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-500 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 ${
                      model === value ? 'bg-pink-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {selectedModelPreview && (
                <div className="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-700 space-y-3 animate-fadeIn text-sm">
                    <p className="text-gray-400">{selectedModelPreview.description}</p>
                    <div className="space-y-2">
                        <div>
                            <div className="flex justify-between mb-1 text-xs font-medium text-gray-300">
                                <span>Скорость</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div className="bg-purple-500 h-2 rounded-full transition-all duration-500" style={{ width: `${selectedModelPreview.speed}%` }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-1 text-xs font-medium text-gray-300">
                                <span>Качество</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div className="bg-pink-500 h-2 rounded-full transition-all duration-500" style={{ width: `${selectedModelPreview.quality}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-700/50 pt-4">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="w-full flex justify-between items-center text-left text-base font-medium text-gray-300 hover:text-white transition-colors duration-200"
                aria-expanded={isSettingsOpen}
              >
                <span>Дополнительные настройки</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${isSettingsOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isSettingsOpen ? 'max-h-[42rem] pt-6' : 'max-h-0'}`}>
                <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Соотношение сторон</label>
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-900 p-1">
                        {aspectRatioOptions.map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={() => setAspectRatio(value)}
                            className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-500 transform hover:scale-105 ${
                              aspectRatio === value ? 'bg-pink-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                  {model === 'imagen' && uploadedImages.length === 0 && (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Количество изображений</label>
                          <div className="grid grid-cols-5 gap-2 rounded-lg bg-gray-900 p-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                onClick={() => setNumberOfImages(n)}
                                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-500 transform hover:scale-105 ${
                                  numberOfImages === n ? 'bg-pink-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-2">
                            Seed (для повторения)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              id="seed"
                              type="number"
                              min="0"
                              className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition duration-200 placeholder-gray-500"
                              placeholder="Случайный"
                              value={seed === null ? '' : seed}
                              onChange={(e) => {
                                const value = e.target.value;
                                const intValue = parseInt(value, 10);
                                setSeed(value === '' ? null : (isNaN(intValue) ? null : intValue));
                              }}
                            />
                            <button 
                              onClick={() => setSeed(Math.floor(Math.random() * 2147483647))} 
                              className="p-2.5 bg-gray-700 rounded-lg hover:bg-purple-600/40 transition-colors"
                              title="Сгенерировать случайный Seed"
                            >
                              🎲
                            </button>
                            <button 
                              onClick={() => setSeed(null)} 
                              className="p-2.5 bg-gray-700 rounded-lg hover:bg-red-500/40 transition-colors"
                              title="Очистить Seed"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                  )}

                   <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Стиль</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {styleOptions.map(({ value, label, previewImage }) => (
                          <div
                            key={value}
                            onClick={() => setStyle(value)}
                            className={`relative cursor-pointer rounded-lg overflow-hidden transition-all duration-200 transform hover:scale-105 focus:outline-none ring-2 ${
                              style === value ? 'ring-pink-500' : 'ring-gray-700 hover:ring-gray-500'
                            }`}
                          >
                            {previewImage ? (
                              <img src={previewImage} alt={label} className="w-full h-20 object-cover" />
                            ) : (
                              <div className="w-full h-20 bg-gray-700 flex items-center justify-center">
                                <span className="text-gray-400 text-sm">{label}</span>
                              </div>
                            )}
                            <div className={`absolute bottom-0 left-0 right-0 p-1.5 text-center text-xs font-semibold text-white transition-colors duration-200 ${style === value ? 'bg-pink-600' : 'bg-black bg-opacity-60'}`}>
                              {label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleGenerateImage}
                disabled={isLoading}
                className="w-full flex justify-center items-center bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {isLoading ? (
                  <>
                    <Loader />
                    Генерация...
                  </>
                ) : (
                  'Сгенерировать изображение'
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-900/50 border border-red-500 text-red-300 rounded-lg space-y-1">
              <p className="font-bold">Не удалось сгенерировать изображение</p>
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {generatedImages.length > 0 && !isLoading && (
            <div className="mt-8 animate-fadeIn">
              <h2 className="text-xl font-semibold mb-4 text-gray-200 text-center">
                {generatedImages.length > 1 ? 'Ваши сгенерированные изображения' : 'Ваше сгенерированное изображение'}
              </h2>
              {generatedImages.length > 1 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {generatedImages.map((imageUrl, index) => (
                    <PostDisplay key={index} imageUrl={imageUrl} />
                  ))}
                </div>
              ) : (
                <div className="max-w-full sm:max-w-lg mx-auto">
                   <PostDisplay imageUrl={generatedImages[0]} />
                </div>
              )}
            </div>
          )}
        </main>
        
        {history.length > 0 && (
          <section className="w-full max-w-2xl mx-auto mt-12">
            <h2 className="text-3xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 text-center">
                История генераций
            </h2>
            
            <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-grow w-full">
                         <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <SearchIcon />
                        </span>
                        <input 
                            type="text"
                            value={filterKeyword}
                            onChange={(e) => setFilterKeyword(e.target.value)}
                            placeholder="Фильтр по ключевому слову..."
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition duration-200 placeholder-gray-500"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-900 p-1 shrink-0">
                      {dateFilterOptions.map(({ value, label }) => (
                        <button
                          key={value}
                          onClick={() => setFilterDate(value)}
                          className={`px-3 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-pink-500 transform hover:scale-105 ${
                            filterDate === value ? 'bg-pink-600 text-white' : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredHistory.map((item, index) => (
                <div 
                  key={`${item.timestamp}-${index}`} 
                  className="relative group cursor-pointer aspect-square" 
                  onClick={() => handleHistoryClick(item)}
                  aria-label={`Просмотреть: ${item.prompt}`}
                >
                  <img src={item.imageUrl} alt={item.prompt} className="rounded-lg object-cover w-full h-full transition-transform duration-300 group-hover:scale-105" />
                   <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all duration-300 flex items-center justify-center rounded-lg">
                      <p className="text-white text-center text-xs p-1 font-bold opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">Показать</p>
                   </div>
                </div>
              ))}
            </div>
             {filteredHistory.length === 0 && (
                <div className="text-center py-12 px-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-600">
                    <NotFoundIcon />
                    <h3 className="mt-4 text-lg font-semibold text-gray-300">Изображения не найдены</h3>
                    <p className="mt-1 text-sm text-gray-400">Попробуйте изменить фильтры или ключевые слова.</p>
                </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
