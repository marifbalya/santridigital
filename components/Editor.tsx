
import React, { useEffect, useRef, useCallback } from 'react';

interface EditorProps {
  language: 'html' | 'css' | 'javascript';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  editorRef?: React.RefObject<HTMLDivElement>; // Changed from HTMLTextAreaElement
  forceUpdateKey?: number; // To trigger re-highlighting
}

// Basic syntax highlighting colors (Tailwind classes)
const tokenColors = {
  comment: 'text-green-400',
  punctuation: 'text-slate-400',
  tag: 'text-red-400',
  attributeName: 'text-yellow-400',
  attributeValue: 'text-lime-300',
  string: 'text-lime-300',
  keyword: 'text-purple-400',
  selector: 'text-orange-400',
  propertyName: 'text-sky-300',
  cssValue: 'text-amber-300', // Different from attributeValue for distinction
  number: 'text-teal-300',
  functionName: 'text-blue-400',
  variable: 'text-indigo-300',
  operator: 'text-pink-400',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, function (match) {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return match;
    }
  });
}

const applySyntaxHighlighting = (text: string, language: EditorProps['language']): string => {
  if (!text) return '';
  let highlightedText = escapeHtml(text);

  const rules: { regex: RegExp; tokenClass: keyof typeof tokenColors }[] = [];

  // Common rules
  rules.push({ regex: /(\/\/.*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)/g, tokenClass: 'comment' }); // Comments (all)
  rules.push({ regex: /('.*?'|".*?"|`.*?`)/g, tokenClass: 'string' }); // Strings

  if (language === 'html') {
    rules.push({ regex: /(&lt;\/?[\w\d-]+)/g, tokenClass: 'tag' }); // HTML tags <tag /tag
    rules.push({ regex: /([\w\d-]+)(?=\s*=&quot;)/g, tokenClass: 'attributeName' }); // Attribute names simple
    rules.push({ regex: /(&gt;)/g, tokenClass: 'tag' }); // HTML tags >
  } else if (language === 'css') {
    rules.push({ regex: /(?:^|[\s{};])([\w\d\*\.#\[\]:"'\-\s>+~]+?)(?=\s*\{)/g, tokenClass: 'selector' }); // Selectors
    rules.push({ regex: /([\w\d-]+)\s*:/g, tokenClass: 'propertyName' }); // Property names
    rules.push({ regex: /:\s*([^;\}]+)/g, tokenClass: 'cssValue'}); // CSS values (simplified)
    rules.push({ regex: /([{}();,])/g, tokenClass: 'punctuation' });
  } else if (language === 'javascript') {
    rules.push({ regex: /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|this|import|export|default|class|extends|super|try|catch|finally|typeof|instanceof|delete|void|async|await|true|false|null|undefined)\b/g, tokenClass: 'keyword' });
    rules.push({ regex: /\b([A-Z_][A-Z0-9_]*)\b/g, tokenClass: 'variable' }); // Constants
    rules.push({ regex: /\b([a-zA-Z_]\w*)\s*(?=\()/g, tokenClass: 'functionName'}); // Function calls
    rules.push({ regex: /\b\d+(\.\d+)?\b/g, tokenClass: 'number' }); // Numbers
    rules.push({ regex: /([{}();,.:?])/g, tokenClass: 'punctuation' });
    rules.push({ regex: /([+\-*/%=&|<>!^~])/g, tokenClass: 'operator' });
  }
  
  // Apply rules. This is a very basic sequential application.
  // More robust highlighters use a state machine or more complex parsing.
  for (const rule of rules) {
    highlightedText = highlightedText.replace(rule.regex, (match) => {
      // Avoid re-highlighting spans
      if (match.startsWith('<span') || match.includes('</span>')) return match;
      return `<span class="${tokenColors[rule.tokenClass]}">${match}</span>`;
    });
  }
  return highlightedText.replace(/\n/g, '<br>'); // Keep line breaks
};


const Editor: React.FC<EditorProps> = ({ language, value, onChange, placeholder, editorRef, forceUpdateKey }) => {
  const localRef = useRef<HTMLDivElement>(null);
  const currentEditorRef = editorRef || localRef;
  const lastValueRef = useRef(value); // To track changes and cursor position
  const isComposingRef = useRef(false); // For IME composition

  const setEditorContent = useCallback((newText: string) => {
    if (currentEditorRef.current) {
      const highlighted = applySyntaxHighlighting(newText, language);
      currentEditorRef.current.innerHTML = highlighted;
      lastValueRef.current = newText;
    }
  }, [language, currentEditorRef]);

  useEffect(() => {
    // This effect handles external value changes (like undo/redo, load project)
    // and forceUpdateKey changes.
    // It compares with lastValueRef to avoid re-highlighting and cursor jumps
    // if the change originated from this editor's onInput.
    if (value !== lastValueRef.current) {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      let startOffset = range?.startOffset ?? 0;
      let startContainer = range?.startContainer ?? null;

      setEditorContent(value);

      // Try to restore cursor. This is very tricky with contentEditable and innerHTML changes.
      // This basic attempt might not always work perfectly.
      if (currentEditorRef.current && selection && startContainer) {
        try {
          const newRange = document.createRange();
          // Attempt to find the equivalent text node or a close one
          // This is a common challenge with contentEditable + syntax highlighting
          let newStartContainer: Node | null = null;
          
          const findTextNode = (node: Node, text: string | null): Node | null => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes(text || '')) return node;
            for (let i = 0; i < node.childNodes.length; i++) {
                const found = findTextNode(node.childNodes[i], text);
                if (found) return found;
            }
            return null;
          };

          if (startContainer.nodeType === Node.TEXT_NODE) {
            newStartContainer = findTextNode(currentEditorRef.current, startContainer.textContent);
          }
          
          if (newStartContainer && newStartContainer.nodeValue) {
            const newOffset = Math.min(startOffset, newStartContainer.nodeValue.length);
            newRange.setStart(newStartContainer, newOffset);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else if (currentEditorRef.current.firstChild) {
            // Fallback: place cursor at start or end
            newRange.selectNodeContents(currentEditorRef.current.firstChild);
            newRange.collapse(startOffset > 0); // true for end, false for start
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (e) {
          console.warn("Could not restore selection after highlight:", e);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, forceUpdateKey, setEditorContent]); // `language` should trigger re-highlight if it changes, `setEditorContent` has `language` dep
  

  useEffect(() => {
    // Initialize content on mount or language change if value is already there
    setEditorContent(value);
  }, [language, setEditorContent, value]);


  const handleInput = (event: React.FormEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;
    const newText = event.currentTarget.textContent || '';
    lastValueRef.current = newText; // Update ref before calling onChange
    onChange(newText);
    // Note: Highlighting is now primarily handled by the useEffect watching `value`
    // to better manage cursor position and external updates.
    // If we highlight directly here, the cursor position is lost immediately.
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Allow default tab behavior for accessibility (moving focus)
    // If you want to insert tabs, more complex logic is needed for contentEditable
    if (event.key === 'Enter') {
        // Basic Enter handling: insert newline and maintain cursor
        // More sophisticated handling would preserve surrounding span structure
        event.preventDefault();
        document.execCommand('insertLineBreak');
    }
    // Handle paste as plain text
    if (event.ctrlKey && event.key === 'v' || event.metaKey && event.key === 'v') {
        event.preventDefault();
        navigator.clipboard.readText().then(text => {
            document.execCommand('insertText', false, text);
        }).catch(err => console.error('Failed to read clipboard contents: ', err));
    }
  };

  return (
    <div
      ref={currentEditorRef}
      contentEditable="true"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => isComposingRef.current = true}
      onCompositionEnd={(event: React.CompositionEvent<HTMLDivElement>) => {
        isComposingRef.current = false;
        handleInput(event as unknown as React.FormEvent<HTMLDivElement>); // Trigger input after composition
      }}
      data-placeholder={placeholder}
      spellCheck="false"
      aria-label={`${language} code editor`}
      className="w-full h-full p-3 bg-slate-900 text-slate-200 font-mono text-sm resize-none outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 overflow-auto whitespace-pre-wrap"
      style={{ whiteSpace: 'pre-wrap', MozTabSize: '2', OTabSize: '2', tabSize: '2' }} // For tab rendering, not insertion
    />
  );
};

export default Editor;
