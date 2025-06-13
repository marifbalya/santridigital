
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from './components/Editor';
import { initialHtml, initialCss, initialJs, DEFAULT_PROJECT_NAME } from './constants';

type ActiveTab = 'html' | 'css' | 'js';
type MobileView = 'code' | 'preview';
type ActiveAppView = 'editor' | 'savedProjects';

interface SavedProject {
  id: string;
  name: string;
  htmlCode: string;
  cssCode: string;
  jsCode: string;
  timestamp: string;
}

const MAX_UNDO_STACK_SIZE = 50;
const LOCAL_STORAGE_PROJECTS_KEY = 'liveCodeEditor_projects';

const App: React.FC = () => {
  const [htmlCode, setHtmlCode] = useState<string>(initialHtml);
  const [cssCode, setCssCode] = useState<string>(initialCss);
  const [jsCode, setJsCode] = useState<string>(initialJs);
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('html');
  const [mobileView, setMobileView] = useState<MobileView>('code');
  
  const [activeAppView, setActiveAppView] = useState<ActiveAppView>('editor');
  const [isBurgerMenuOpen, setIsBurgerMenuOpen] = useState<boolean>(false);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [projectNameInput, setProjectNameInput] = useState<string>(DEFAULT_PROJECT_NAME);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ indices: number[], currentResultIndex: number }>({ indices: [], currentResultIndex: -1 });
  const [lastSearchedTerm, setLastSearchedTerm] = useState<string>('');

  const [htmlUndoStack, setHtmlUndoStack] = useState<string[]>([]);
  const [cssUndoStack, setCssUndoStack] = useState<string[]>([]);
  const [jsUndoStack, setJsUndoStack] = useState<string[]>([]);
  const [htmlRedoStack, setHtmlRedoStack] = useState<string[]>([]);
  const [cssRedoStack, setCssRedoStack] = useState<string[]>([]);
  const [jsRedoStack, setJsRedoStack] = useState<string[]>([]);
  
  const [editorUpdateKey, setEditorUpdateKey] = useState<number>(0);


  const htmlEditorRef = useRef<HTMLDivElement>(null); 
  const cssEditorRef = useRef<HTMLDivElement>(null);  
  const jsEditorRef = useRef<HTMLDivElement>(null);   
  const burgerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedProjects = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
      if (storedProjects) {
        setSavedProjects(JSON.parse(storedProjects));
      }
    } catch (error) {
      console.error("Error loading projects from localStorage:", error);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSrcDoc(`
        <html>
          <head>
            <style id="project-css">${cssCode}</style>
          </head>
          <body>
            <div id="project-html-content">${htmlCode}</div>
            <script id="project-js" type="text/javascript">${jsCode}<\/script>
          </body>
        </html>
      `);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [htmlCode, cssCode, jsCode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (burgerMenuRef.current && !burgerMenuRef.current.contains(event.target as Node)) {
        setIsBurgerMenuOpen(false);
      }
    };
    if (isBurgerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isBurgerMenuOpen]);

  const clearAllUndoRedoStacks = useCallback(() => {
    setHtmlUndoStack([]);
    setCssUndoStack([]);
    setJsUndoStack([]);
    setHtmlRedoStack([]);
    setCssRedoStack([]);
    setJsRedoStack([]);
  }, []);
  
  const pushToUndoStackInternal = useCallback((
    currentCodeValue: string,
    stack: string[],
    stackSetter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (stack.length > 0 && stack[0] === currentCodeValue) return;
    const newStack = [currentCodeValue, ...stack];
    stackSetter(newStack.length > MAX_UNDO_STACK_SIZE ? newStack.slice(0, MAX_UNDO_STACK_SIZE) : newStack);
  }, []);


  const handleHtmlChange = useCallback((value: string) => {
    if (value !== htmlCode) {
        pushToUndoStackInternal(htmlCode, htmlUndoStack, setHtmlUndoStack);
        setHtmlCode(value);
        setHtmlRedoStack([]); 
    }
  }, [htmlCode, htmlUndoStack, pushToUndoStackInternal]);

  const handleCssChange = useCallback((value: string) => {
    if (value !== cssCode) {
        pushToUndoStackInternal(cssCode, cssUndoStack, setCssUndoStack);
        setCssCode(value);
        setCssRedoStack([]); 
    }
  }, [cssCode, cssUndoStack, pushToUndoStackInternal]);

  const handleJsChange = useCallback((value: string) => {
    if (value !== jsCode) {
        pushToUndoStackInternal(jsCode, jsUndoStack, setJsUndoStack);
        setJsCode(value);
        setJsRedoStack([]);
    }
  }, [jsCode, jsUndoStack, pushToUndoStackInternal]);


  const editorPanelId = (tabName: ActiveTab) => `editor-panel-${tabName}`;
  const editorTabId = (tabName: ActiveTab) => `editor-tab-${tabName}`;

  const getCurrentEditorRef = useCallback(() => {
    if (activeAppView !== 'editor') return null;
    switch (activeTab) {
      case 'html': return htmlEditorRef;
      case 'css': return cssEditorRef;
      case 'js': return jsEditorRef;
      default: return null;
    }
  }, [activeTab, activeAppView]);

  const getCurrentCode = useCallback(() => {
    if (activeAppView !== 'editor') return '';
    switch (activeTab) {
      case 'html': return htmlCode;
      case 'css': return cssCode;
      case 'js': return jsCode;
      default: return '';
    }
  }, [activeTab, htmlCode, cssCode, jsCode, activeAppView]);
  
  const handleSearch = useCallback((navigation?: 'next' | 'prev') => {
    const currentCode = getCurrentCode(); 
    const editorRef = getCurrentEditorRef();
    const actualEditorElement = editorRef?.current; 

    if (!actualEditorElement || !currentCode) {
      setSearchResults({ indices: [], currentResultIndex: -1 });
      return;
    }
    if (!searchTerm.trim()) {
      setSearchResults({ indices: [], currentResultIndex: -1 });
      return;
    }

    let newIndices: number[] = searchResults.indices;
    let newCurrentResultIndex = searchResults.currentResultIndex;

    if (searchTerm !== lastSearchedTerm || !navigation) {
      const term = searchTerm.toLowerCase();
      const codeToSearch = currentCode.toLowerCase(); 
      newIndices = [];
      let i = -1;
      while ((i = codeToSearch.indexOf(term, i + 1)) !== -1) {
        newIndices.push(i);
      }
      newCurrentResultIndex = newIndices.length > 0 ? 0 : -1;
      setLastSearchedTerm(searchTerm);
    } else if (navigation && newIndices.length > 0) {
      if (navigation === 'next') {
        newCurrentResultIndex = (newCurrentResultIndex + 1) % newIndices.length;
      } else { 
        newCurrentResultIndex = (newCurrentResultIndex - 1 + newIndices.length) % newIndices.length;
      }
    }
    
    setSearchResults({ indices: newIndices, currentResultIndex: newCurrentResultIndex });

    if (newCurrentResultIndex !== -1 && newIndices[newCurrentResultIndex] !== undefined) {
      actualEditorElement.focus();
      try {
        const startIndex = newIndices[newCurrentResultIndex];
        const textToSelection = currentCode.substring(0, startIndex);
        const lines = textToSelection.split('\n').length;
        
        const tempSpan = document.createElement('span');
        tempSpan.innerHTML = 'Mg<br>Mg'; 
        tempSpan.style.font = getComputedStyle(actualEditorElement).font;
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        actualEditorElement.appendChild(tempSpan);
        const twoLinesHeight = tempSpan.offsetHeight;
        actualEditorElement.removeChild(tempSpan);
        const avgLineHeight = twoLinesHeight / 2 || 15;

        const scrollTopToLine = (lines - 1) * avgLineHeight;
        const desiredScrollTop = scrollTopToLine - (actualEditorElement.clientHeight / 3);
        actualEditorElement.scrollTop = Math.max(0, desiredScrollTop);

      } catch (e) {
          console.warn("Error calculating scroll for search:", e);
      }
    }
  }, [getCurrentCode, getCurrentEditorRef, searchTerm, searchResults, lastSearchedTerm]);

  const renderEditor = () => {
    const commonProps = { 
        placeholder: "Write code here...",
        forceUpdateKey: editorUpdateKey
    };
    switch (activeTab) {
      case 'html':
        return <Editor language="html" value={htmlCode} onChange={handleHtmlChange} {...commonProps} editorRef={htmlEditorRef} />;
      case 'css':
        return <Editor language="css" value={cssCode} onChange={handleCssChange} {...commonProps} editorRef={cssEditorRef} />;
      case 'js':
        return <Editor language="javascript" value={jsCode} onChange={handleJsChange} {...commonProps} editorRef={jsEditorRef} />;
      default:
        return null;
    }
  };

  const getTabClassName = (tabName: ActiveTab) =>
    `px-3 py-2.5 text-xs sm:text-sm font-medium focus:outline-none transition-colors duration-150 flex-1 sm:flex-initial sm:min-w-[60px] text-center
     ${activeTab === tabName
       ? 'bg-slate-700 text-sky-300 border-b-2 border-sky-400'
       : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'}`;

  const handleDownloadProject = () => {
    const fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Code Project</title>
  <style id="project-css">
${cssCode}
  </style>
</head>
<body>
  <div id="project-html-content">
${htmlCode}
  </div>
  <script id="project-js" type="text/javascript">
${jsCode}
  <\/script>
</body>
</html>`;
    const blob = new Blob([fileContent], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'live_project.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    setIsBurgerMenuOpen(false);
  };

  const handleImportProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const fileContent = event.target?.result as string;
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(fileContent, 'text/html');
            
            const importedHtml = doc.getElementById('project-html-content')?.innerHTML || '';
            const importedCss = doc.getElementById('project-css')?.textContent || '';
            const importedJs = doc.getElementById('project-js')?.textContent || '';

            clearAllUndoRedoStacks();
            setHtmlCode(importedHtml);
            setCssCode(importedCss);
            setJsCode(importedJs);
            setActiveTab('html'); 
            setActiveAppView('editor');
            setEditorUpdateKey(prev => prev + 1);
            alert('Project imported successfully!');
          } catch (error) {
            console.error('Error importing project:', error);
            alert('Failed to import project. Make sure it is a valid project file.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
    setIsBurgerMenuOpen(false);
  };

  const handleUndo = useCallback(() => {
    let stack: string[], code: string, redoStack: string[];
    let codeSetter: (value: string) => void;
    let stackSetter: React.Dispatch<React.SetStateAction<string[]>>;
    let redoStackSetter: React.Dispatch<React.SetStateAction<string[]>>;
    
    switch (activeTab) {
      case 'html': stack = htmlUndoStack; code = htmlCode; redoStack = htmlRedoStack; codeSetter = setHtmlCode; stackSetter = setHtmlUndoStack; redoStackSetter = setHtmlRedoStack; break;
      case 'css': stack = cssUndoStack; code = cssCode; redoStack = cssRedoStack; codeSetter = setCssCode; stackSetter = setCssUndoStack; redoStackSetter = setCssRedoStack; break;
      case 'js': stack = jsUndoStack; code = jsCode; redoStack = jsRedoStack; codeSetter = setJsCode; stackSetter = setJsUndoStack; redoStackSetter = setJsRedoStack; break;
      default: return;
    }

    if (stack.length > 0) {
      const [lastState, ...restOfStack] = stack;
      redoStackSetter([code, ...redoStack].slice(0, MAX_UNDO_STACK_SIZE)); 
      codeSetter(lastState); 
      stackSetter(restOfStack);
      setEditorUpdateKey(prev => prev + 1); 
    }
  }, [activeTab, htmlUndoStack, cssUndoStack, jsUndoStack, htmlCode, cssCode, jsCode, htmlRedoStack, cssRedoStack, jsRedoStack]);

  const handleRedo = useCallback(() => {
    let stack: string[], code: string, undoStack: string[];
    let codeSetter: (value: string) => void;
    let stackSetter: React.Dispatch<React.SetStateAction<string[]>>;
    let undoStackSetter: React.Dispatch<React.SetStateAction<string[]>>;

    switch (activeTab) {
      case 'html': stack = htmlRedoStack; code = htmlCode; undoStack = htmlUndoStack; codeSetter = setHtmlCode; stackSetter = setHtmlRedoStack; undoStackSetter = setHtmlUndoStack; break;
      case 'css': stack = cssRedoStack; code = cssCode; undoStack = cssUndoStack; codeSetter = setCssCode; stackSetter = setCssRedoStack; undoStackSetter = setCssUndoStack; break;
      case 'js': stack = jsRedoStack; code = jsCode; undoStack = jsUndoStack; codeSetter = setJsCode; stackSetter = setJsRedoStack; undoStackSetter = setJsUndoStack; break;
      default: return;
    }

    if (stack.length > 0) {
      const [nextState, ...restOfStack] = stack;
      undoStackSetter([code, ...undoStack].slice(0, MAX_UNDO_STACK_SIZE)); 
      codeSetter(nextState);
      stackSetter(restOfStack);
      setEditorUpdateKey(prev => prev + 1); 
    }
  }, [activeTab, htmlRedoStack, cssRedoStack, jsRedoStack, htmlCode, cssCode, jsCode, htmlUndoStack, cssUndoStack, jsUndoStack]);
  
  const handleSaveToLocalStart = () => {
    setProjectNameInput(DEFAULT_PROJECT_NAME + ' ' + (savedProjects.length + 1));
    setShowSaveModal(true);
    setIsBurgerMenuOpen(false);
  };

  const handleConfirmSaveToLocal = () => {
    if (!projectNameInput.trim()) {
      alert("Project name cannot be empty.");
      return;
    }
    const newProject: SavedProject = {
      id: Date.now().toString(),
      name: projectNameInput.trim(),
      htmlCode,
      cssCode,
      jsCode,
      timestamp: new Date().toISOString(),
    };
    const updatedProjects = [newProject, ...savedProjects];
    setSavedProjects(updatedProjects);
    localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedProjects));
    setShowSaveModal(false);
    alert(`Project "${newProject.name}" saved locally!`);
  };

  const handleLoadProjectFromLocal = (projectId: string) => {
    const projectToLoad = savedProjects.find(p => p.id === projectId);
    if (projectToLoad) {
      clearAllUndoRedoStacks();
      setHtmlCode(projectToLoad.htmlCode);
      setCssCode(projectToLoad.cssCode);
      setJsCode(projectToLoad.jsCode);
      setActiveTab('html');
      setActiveAppView('editor');
      setIsBurgerMenuOpen(false); 
      setEditorUpdateKey(prev => prev + 1); 
      alert(`Project "${projectToLoad.name}" loaded.`);
    }
  };

  const handleDeleteProjectFromLocal = (projectId: string) => {
    if (window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) {
      const updatedProjects = savedProjects.filter(p => p.id !== projectId);
      setSavedProjects(updatedProjects);
      localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedProjects));
      alert("Project deleted.");
    }
  };


  const headerButtonClass = "p-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center";
  const editorControlButtonClass = "p-1.5 sm:p-2 text-xs sm:text-sm bg-slate-600 hover:bg-slate-500 text-slate-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
  const burgerMenuItemClass = "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50";
  
  useEffect(() => {
    if(activeAppView === 'editor') { 
        setSearchResults({ indices: [], currentResultIndex: -1 });
    }
  }, [activeTab, activeAppView]);


  const isUndoDisabled = activeAppView !== 'editor' ||
    (activeTab === 'html' && htmlUndoStack.length === 0) ||
    (activeTab === 'css' && cssUndoStack.length === 0) ||
    (activeTab === 'js' && jsUndoStack.length === 0);

  const isRedoDisabled = activeAppView !== 'editor' ||
    (activeTab === 'html' && htmlRedoStack.length === 0) ||
    (activeTab === 'css' && cssRedoStack.length === 0) ||
    (activeTab === 'js' && jsRedoStack.length === 0);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">
      <header className="p-3 bg-slate-800 shadow-md flex-none border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-semibold text-sky-400">Live Code Editor</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setMobileView(mobileView === 'code' ? 'preview' : 'code')}
            className={`${headerButtonClass} md:hidden px-3 h-9`}
            aria-live="polite"
            disabled={activeAppView !== 'editor'}
          >
            {mobileView === 'code' ? 'Lihat Preview' : 'Lihat Kode'}
          </button>

          <div className="relative" ref={burgerMenuRef}>
            <button 
              onClick={() => setIsBurgerMenuOpen(!isBurgerMenuOpen)}
              className={`${headerButtonClass} w-9 h-9`}
              aria-label="Open menu"
              title="Menu"
            >
              <span role="img" aria-label="Menu">☰</span>
            </button>
            {isBurgerMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-slate-700 rounded-md shadow-lg py-1 z-50">
                <button onClick={handleSaveToLocalStart} className={burgerMenuItemClass} disabled={activeAppView !== 'editor'}>Simpan ke Lokal</button>
                <button onClick={() => { setActiveAppView('savedProjects'); setIsBurgerMenuOpen(false); }} className={burgerMenuItemClass}>Kode Tersimpan</button>
                <hr className="border-slate-600 my-1"/>
                <button onClick={handleDownloadProject} className={burgerMenuItemClass} disabled={activeAppView !== 'editor'}>Download Proyek</button>
                <button onClick={handleImportProject} className={burgerMenuItemClass}>Impor Proyek</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {activeAppView === 'editor' && (
        <main className="flex flex-col md:flex-row flex-grow overflow-hidden">
          <div
            className={`flex flex-col md:w-1/2 overflow-hidden p-1 sm:p-2 
                        ${mobileView === 'preview' ? 'hidden md:flex' : 'flex'} 
                        h-full md:h-auto`}
          >
            <div className="p-2 bg-slate-800 flex items-center justify-start space-x-1 sm:space-x-2 flex-wrap border-b border-slate-700">
              <button 
                onClick={handleUndo} 
                className={`${editorControlButtonClass} w-8 h-8 sm:w-9 sm:h-9`}
                disabled={isUndoDisabled}
                aria-label={`Undo last change in ${activeTab.toUpperCase()} editor`}
                title={`Undo (${(activeTab === 'html' ? htmlUndoStack.length : activeTab === 'css' ? cssUndoStack.length : jsUndoStack.length)} left)`}
              >
                <span role="img" aria-label="Undo">↺</span>
              </button>
              <button 
                onClick={handleRedo} 
                className={`${editorControlButtonClass} w-8 h-8 sm:w-9 sm:h-9`}
                disabled={isRedoDisabled}
                aria-label={`Redo last change in ${activeTab.toUpperCase()} editor`}
                title={`Redo (${(activeTab === 'html' ? htmlRedoStack.length : activeTab === 'css' ? cssRedoStack.length : jsRedoStack.length)} available)`}
              >
                <span role="img" aria-label="Redo" className="inline-block transform scale-x-[-1]">↪</span>
              </button>
              
              <div className="flex items-center space-x-1 sm:space-x-2 min-w-[200px] sm:min-w-[250px] flex-grow md:flex-grow-0">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch();}}}
                    placeholder="Cari..."
                    aria-label="Search code"
                    className="flex-grow p-1.5 text-xs sm:text-sm bg-slate-700 text-slate-200 rounded-md focus:ring-1 focus:ring-sky-500 focus:outline-none min-w-0"
                  />
                  <button onClick={() => handleSearch()} className={`${editorControlButtonClass} px-2.5 sm:px-3`} aria-label="Search or find first match">
                    Cari
                  </button>
                  <button 
                    onClick={() => handleSearch('prev')} 
                    className={`${editorControlButtonClass} w-7 h-7 flex items-center justify-center`}
                    disabled={searchResults.indices.length === 0}
                    aria-label="Previous match"
                    title="Previous match"
                  >
                    <span role="img" aria-label="Previous">←</span>
                  </button>
                  <button 
                    onClick={() => handleSearch('next')} 
                    className={`${editorControlButtonClass} w-7 h-7 flex items-center justify-center`}
                    disabled={searchResults.indices.length === 0}
                    aria-label="Next match"
                    title="Next match"
                  >
                    <span role="img" aria-label="Next">→</span>
                  </button>
              </div>
               {searchResults.indices.length > 0 && searchResults.currentResultIndex !== -1 && (
                <span className="text-xs text-slate-400 whitespace-nowrap ml-1 sm:ml-2">
                  {searchResults.currentResultIndex + 1} / {searchResults.indices.length}
                </span>
              )}
               {searchResults.indices.length === 0 && searchTerm && lastSearchedTerm === searchTerm && (
                <span className="text-xs text-amber-400 whitespace-nowrap ml-1 sm:ml-2">
                  Not found
                </span>
              )}
            </div>

            <div className="flex flex-col bg-slate-800 rounded-lg shadow-md overflow-hidden flex-1 min-h-0">
              <div role="tablist" aria-label="Code Editors" className="flex-none flex border-b border-slate-700">
                {(['html', 'css', 'js'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    id={editorTabId(tab)}
                    role="tab"
                    aria-selected={activeTab === tab}
                    aria-controls={editorPanelId(tab)}
                    onClick={() => {
                        setActiveTab(tab);
                        setSearchResults({ indices: [], currentResultIndex: -1 });
                        setLastSearchedTerm(''); 
                    }}
                    className={getTabClassName(tab)}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
              
              <div
                role="tabpanel"
                id={editorPanelId(activeTab)}
                aria-labelledby={editorTabId(activeTab)}
                className="flex-grow overflow-auto relative bg-slate-900" 
              >
                {renderEditor()}
              </div>
            </div>
          </div>

          <div
            className={`flex flex-col md:w-1/2 overflow-hidden p-1 sm:p-2 
                        ${mobileView === 'code' ? 'hidden md:flex' : 'flex'} 
                        h-full md:h-auto`}
          >
            <div className="flex flex-col bg-slate-800 rounded-lg shadow-md overflow-hidden flex-1 min-h-0">
              <div className="p-2 bg-slate-700 text-sm font-medium text-slate-300 flex-none">
                Live Preview
              </div>
              <div className="bg-white h-full w-full border-t border-slate-700 flex-grow">
                <iframe
                  srcDoc={srcDoc}
                  title="Live Preview"
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                  className="w-full h-full border-0"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </main>
      )}

      {activeAppView === 'savedProjects' && (
        <main className="flex-grow overflow-auto p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-sky-400">Kode Tersimpan</h2>
            <button 
              onClick={() => setActiveAppView('editor')}
              className={headerButtonClass}
            >
              Kembali ke Editor
            </button>
          </div>
          {savedProjects.length === 0 ? (
            <p className="text-slate-400">Belum ada proyek yang disimpan secara lokal.</p>
          ) : (
            <ul className="space-y-3">
              {savedProjects.map(project => (
                <li key={project.id} className="bg-slate-800 p-4 rounded-lg shadow flex flex-col sm:flex-row justify-between items-start sm:items-center">
                  <div>
                    <h3 className="text-lg font-medium text-sky-300">{project.name}</h3>
                    <p className="text-xs text-slate-500">Disimpan: {new Date(project.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="flex space-x-2 mt-3 sm:mt-0">
                    <button 
                      onClick={() => handleLoadProjectFromLocal(project.id)} 
                      className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded"
                    >
                      Muat
                    </button>
                    <button 
                      onClick={() => handleDeleteProjectFromLocal(project.id)} 
                      className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-sky-300">Simpan Proyek ke Lokal</h3>
            <input 
              type="text"
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              placeholder="Nama Proyek"
              className="w-full p-2 mb-4 bg-slate-700 text-slate-200 rounded-md focus:ring-1 focus:ring-sky-500 focus:outline-none"
            />
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 rounded-md">
                Batal
              </button>
              <button onClick={handleConfirmSaveToLocal} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="p-3 bg-slate-800 flex-none border-t border-slate-700 text-center">
        <div className="text-xs text-slate-500">
          Powered by React & TailwindCSS. Inspired by Acode.
        </div>
      </footer>
    </div>
  );
};

export default App;
